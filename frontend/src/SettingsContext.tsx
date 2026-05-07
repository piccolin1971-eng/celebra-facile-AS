import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontFamilyId, getFontFamilyString } from "./fontFamily";

type ThemeMode = "light" | "dark";
type ReadingMode = "scroll" | "tap";

interface SettingsState {
  theme: ThemeMode;
  fontSize: number; // reading text size in pt
  highContrast: boolean;
  readingMode: ReadingMode;
  // Tempo (in secondi) prima che parta l'auto-scroll dopo il cambio pagina (3..10)
  autoScrollDelaySec: number;
  // Velocità auto-scroll nelle Preghiere Eucaristiche, in pixel al secondo (2..15)
  autoScrollPxPerSec: number;
  // Famiglia di carattere scelta dall'utente per il testo della celebrazione
  fontFamilyId: FontFamilyId;
  // Stringa fontFamily da passare ai componenti Text (undefined per il sistema)
  fontFamily: string | undefined;
  setTheme: (t: ThemeMode) => void;
  setFontSize: (n: number) => void;
  setHighContrast: (v: boolean) => void;
  setReadingMode: (m: ReadingMode) => void;
  setAutoScrollDelaySec: (n: number) => void;
  setAutoScrollPxPerSec: (n: number) => void;
  setFontFamilyId: (id: FontFamilyId) => void;
  colors: ReturnType<typeof getColors>;
  scaledFont: (base: number) => number;
}

const getColors = (theme: ThemeMode, highContrast: boolean) => {
  if (theme === "dark") {
    return {
      // Sfondo NERO ASSOLUTO per risparmio energia su schermi OLED
      background: "#000000",
      surface: highContrast ? "#000000" : "#0A0A0A",
      textPrimary: highContrast ? "#FFFFFF" : "#F5F5F5",
      textSecondary: highContrast ? "#E0E0E0" : "#CCCCCC",
      border: highContrast ? "#FFFFFF" : "#333333",
      rubrics: "#FF6B6B",
      primary: "#4DA8DA",
      focus: "#FFC107",
      liturgicalGreen: "#4CAF50",
      liturgicalRed: "#E53935",
      liturgicalPurple: "#AB47BC",
      liturgicalWhite: "#FFE082",
      liturgicalRose: "#F48FB1",
    };
  }
  return {
    background: highContrast ? "#FFFFFF" : "#FDFBF7",
    surface: "#FFFFFF",
    textPrimary: highContrast ? "#000000" : "#111111",
    textSecondary: highContrast ? "#000000" : "#333333",
    border: highContrast ? "#000000" : "#D7D3C8",
    rubrics: "#B71C1C",
    primary: "#0056B3",
    focus: "#FF8F00",
    liturgicalGreen: "#1B5E20",
    liturgicalRed: "#B71C1C",
    liturgicalPurple: "#4A148C",
    liturgicalWhite: "#D4AF37",
    liturgicalRose: "#AD1457",
  };
};

const SettingsContext = createContext<SettingsState | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [fontSize, setFontSizeState] = useState(32);
  const [highContrast, setHighContrastState] = useState(false);
  const [readingMode, setReadingModeState] = useState<ReadingMode>("tap");
  const [autoScrollDelaySec, setAutoScrollDelaySecState] = useState<number>(7);
  const [autoScrollPxPerSec, setAutoScrollPxPerSecState] = useState<number>(6);
  const [fontFamilyId, setFontFamilyIdState] = useState<FontFamilyId>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("messale_settings");
        let migrationDoneV3 = false;
        let migrationDoneV4 = false;
        try {
          const flagV3 = await AsyncStorage.getItem("messale_settings_migrated_v3");
          migrationDoneV3 = flagV3 === "1";
          const flagV4 = await AsyncStorage.getItem("messale_settings_migrated_v4");
          migrationDoneV4 = flagV4 === "1";
        } catch {}
        if (saved) {
          const s = JSON.parse(saved);
          if (s.theme) setThemeState(s.theme);
          if (s.fontSize) setFontSizeState(s.fontSize);
          if (typeof s.highContrast === "boolean") setHighContrastState(s.highContrast);
          if (s.readingMode === "tap" || s.readingMode === "scroll") setReadingModeState(s.readingMode);
          // Migrazione v3: chi aveva i vecchi default (5s o 6s) viene aggiornato a 7s una sola volta.
          if (typeof s.autoScrollDelaySec === "number" && s.autoScrollDelaySec >= 3 && s.autoScrollDelaySec <= 10) {
            if (!migrationDoneV3 && (s.autoScrollDelaySec === 5 || s.autoScrollDelaySec === 6)) {
              setAutoScrollDelaySecState(7);
              const next = { ...s, autoScrollDelaySec: 7 };
              await AsyncStorage.setItem("messale_settings", JSON.stringify(next));
              s.autoScrollDelaySec = 7;
            } else {
              setAutoScrollDelaySecState(s.autoScrollDelaySec);
            }
          }
          // Migrazione v4: chi aveva il vecchio default 5 px/s viene aggiornato a 6 px/s una sola volta.
          if (typeof s.autoScrollPxPerSec === "number" && s.autoScrollPxPerSec >= 2 && s.autoScrollPxPerSec <= 15) {
            if (!migrationDoneV4 && s.autoScrollPxPerSec === 5) {
              setAutoScrollPxPerSecState(6);
              const next = { ...s, autoScrollPxPerSec: 6 };
              await AsyncStorage.setItem("messale_settings", JSON.stringify(next));
            } else {
              setAutoScrollPxPerSecState(s.autoScrollPxPerSec);
            }
          }
          // Carattere (font family) — opzionale, default "system".
          // I vecchi ID "garamond"/"cormorant" sono stati rimossi: chi li
          // aveva selezionati torna automaticamente a "system".
          if (
            s.fontFamilyId === "system" ||
            s.fontFamilyId === "atkinson" ||
            s.fontFamilyId === "lora" ||
            s.fontFamilyId === "varela" ||
            s.fontFamilyId === "patrick"
          ) {
            setFontFamilyIdState(s.fontFamilyId);
          }
        }
        if (!migrationDoneV3) {
          await AsyncStorage.setItem("messale_settings_migrated_v3", "1");
        }
        if (!migrationDoneV4) {
          await AsyncStorage.setItem("messale_settings_migrated_v4", "1");
        }
      } catch (e) {
        console.log("Impossibile caricare settings:", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (patch: Partial<{ theme: ThemeMode; fontSize: number; highContrast: boolean; readingMode: ReadingMode; autoScrollDelaySec: number; autoScrollPxPerSec: number; fontFamilyId: FontFamilyId }>) => {
    const next = { theme, fontSize, highContrast, readingMode, autoScrollDelaySec, autoScrollPxPerSec, fontFamilyId, ...patch };
    await AsyncStorage.setItem("messale_settings", JSON.stringify(next));
  };

  const setTheme = (t: ThemeMode) => { setThemeState(t); persist({ theme: t }); };
  const setFontSize = (n: number) => { setFontSizeState(n); persist({ fontSize: n }); };
  const setHighContrast = (v: boolean) => { setHighContrastState(v); persist({ highContrast: v }); };
  const setReadingMode = (m: ReadingMode) => { setReadingModeState(m); persist({ readingMode: m }); };
  const setAutoScrollDelaySec = (n: number) => {
    const clamped = Math.max(3, Math.min(10, Math.round(n)));
    setAutoScrollDelaySecState(clamped);
    persist({ autoScrollDelaySec: clamped });
  };
  const setAutoScrollPxPerSec = (n: number) => {
    const clamped = Math.max(2, Math.min(15, Math.round(n)));
    setAutoScrollPxPerSecState(clamped);
    persist({ autoScrollPxPerSec: clamped });
  };
  const setFontFamilyId = (id: FontFamilyId) => {
    setFontFamilyIdState(id);
    persist({ fontFamilyId: id });
  };

  const colors = getColors(theme, highContrast);
  const fontFamily = getFontFamilyString(fontFamilyId);
  // scaledFont: UI elements scale proportionally based on reading font
  const scaledFont = (base: number) => {
    const ratio = fontSize / 32; // 32 is default
    return Math.round(base * ratio);
  };

  if (!loaded) return null;

  return (
    <SettingsContext.Provider value={{ theme, fontSize, highContrast, readingMode, autoScrollDelaySec, autoScrollPxPerSec, fontFamilyId, fontFamily, setTheme, setFontSize, setHighContrast, setReadingMode, setAutoScrollDelaySec, setAutoScrollPxPerSec, setFontFamilyId, colors, scaledFont }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};
