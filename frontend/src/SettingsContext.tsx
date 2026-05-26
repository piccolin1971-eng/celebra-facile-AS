import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontFamilyId, getFontFamilyString } from "./fontFamily";

type ThemeMode = "light" | "dark" | "parchment";
type ReadingMode = "scroll" | "tap";

/** Regolazione tono pergamena: 35 (più chiaro) … 65 (più scuro), 50 = default. */
export const PARCHMENT_TONE_MIN = 35;
export const PARCHMENT_TONE_MAX = 65;
export const PARCHMENT_TONE_DEFAULT = 50;

interface SettingsState {
  theme: ThemeMode;
  fontSize: number; // reading text size in pt
  highContrast: boolean;
  readingMode: ReadingMode;
  /** Tono sfondo pergamena (solo con theme === "parchment"). */
  parchmentTone: number;
  // Tempo (in secondi) prima che parta l'auto-scroll dopo il cambio pagina (3..10)
  autoScrollDelaySec: number;
  // Velocità auto-scroll nelle Preghiere Eucaristiche, in pixel al secondo (2..15)
  autoScrollPxPerSec: number;
  // Famiglia di carattere scelta dall'utente per il testo della celebrazione
  fontFamilyId: FontFamilyId;
  // Stringa fontFamily da passare ai componenti Text (undefined per il sistema)
  fontFamily: string | undefined;
  isBold: boolean;
  setTheme: (t: ThemeMode) => void;
  setFontSize: (n: number) => void;
  setHighContrast: (v: boolean) => void;
  setIsBold: (v: boolean) => void;
  setReadingMode: (m: ReadingMode) => void;
  setAutoScrollDelaySec: (n: number) => void;
  setAutoScrollPxPerSec: (n: number) => void;
  setFontFamilyId: (id: FontFamilyId) => void;
  setParchmentTone: (n: number) => void;
  colors: ReturnType<typeof getColors>;
  scaledFont: (base: number) => number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function hexToHsl(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    const hex = v.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue = hh / 360;
  const toRgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const r = Math.round(toRgb(hue + 1 / 3) * 255);
  const g = Math.round(toRgb(hue) * 255);
  const b = Math.round(toRgb(hue - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Sposta la luminosità del colore base, con limiti per mantenere contrasto col testo nero. */
function shiftParchmentHex(hex: string, tone: number, minL: number, maxL: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, clamp(l + tone * 1.25, minL, maxL));
}

function parchmentToneToDelta(tone: number): number {
  const t = clamp(Math.round(tone), PARCHMENT_TONE_MIN, PARCHMENT_TONE_MAX);
  // 35 → -8, 50 → 0, 65 → +8 (shift luminosità massimo controllato)
  return ((t - PARCHMENT_TONE_DEFAULT) / 15) * 8;
}

/** Colori accento liturgici (titoli, PE, selettori): pastelli su scuro, scuri su pergamena. */
const ACCENT_DARK = {
  accentSection: "#4DA8DA",
  accentRito: "#FFC107",
  accentAntifona: "#FFB74D",
  accentReading: "#81C784",
  accentOrazione: "#CE93D8",
  accentTropario: "#FFA726",
  accentPe: "#66BB6A",
  accentPeConsecration: "#29B6F6",
  accentPeSelectorBorder: "#FFA000",
  accentPeSelectorLabel: "#FFB74D",
  accentPeSelectorValue: "#FFE0B2",
  accentPeModalBorder: "#FFA000",
  accentPeModalActiveBg: "#FFF3CD",
  accentPeModalActiveText: "#7B3F00",
  accentAutoScrollBorder: "#FFA000",
  accentAutoScrollText: "#FFB74D",
  onPrimary: "#FFFFFF",
};

const ACCENT_PARCHMENT = {
  accentSection: "#1565C0",
  accentRito: "#7A5C00",
  accentAntifona: "#B45309",
  accentReading: "#1B5E20",
  accentOrazione: "#4A148C",
  accentTropario: "#BF360C",
  accentPe: "#1B5E20",
  accentPeConsecration: "#0D47A1",
  accentPeSelectorBorder: "#8B6914",
  accentPeSelectorLabel: "#8B4513",
  accentPeSelectorValue: "#1A1A1A",
  accentPeModalBorder: "#8B6914",
  accentPeModalActiveBg: "#C8B89C",
  accentPeModalActiveText: "#1A1A1A",
  accentAutoScrollBorder: "#8B6914",
  accentAutoScrollText: "#8B4513",
  onPrimary: "#FFFFFF",
};

/** Accenti scuri per sfondo chiaro (tema Chiaro e Pergamena). */
const ACCENT_LIGHT = ACCENT_PARCHMENT;

function getParchmentColors(tone: number) {
  const delta = parchmentToneToDelta(tone);
  return {
    background: shiftParchmentHex("#E8DCC4", delta, 78, 92),
    surface: shiftParchmentHex("#F2E6D0", delta, 80, 94),
    bgSecondary: shiftParchmentHex("#D8C8A8", delta, 68, 82),
    border: shiftParchmentHex("#C8B89C", delta, 62, 76),
    textPrimary: "#000000",
    textSecondary: "#2C2C2C",
    rubrics: "#B71C1C",
    primary: "#8B4513",
    focus: "#CD853F",
    liturgicalGreen: "#1B5E20",
    liturgicalRed: "#B71C1C",
    liturgicalPurple: "#4A148C",
    liturgicalWhite: "#B8860B",
    liturgicalRose: "#AD1457",
    ...ACCENT_PARCHMENT,
  };
}

const getColors = (theme: ThemeMode, highContrast: boolean, parchmentTone = PARCHMENT_TONE_DEFAULT) => {
  if (theme === "dark") {
    return {
      // Sfondo NERO ASSOLUTO per risparmio energia su schermi OLED
      background: "#000000",
      surface: highContrast ? "#000000" : "#0A0A0A",
      bgSecondary: "#1A1A1A",
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
      ...ACCENT_DARK,
    };
  }
  if (theme === "parchment") {
    return getParchmentColors(parchmentTone);
  }
  return {
    background: highContrast ? "#FFFFFF" : "#FDFBF7",
    surface: "#FFFFFF",
    bgSecondary: "#F2F0E9",
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
    ...ACCENT_LIGHT,
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
  const [isBold, setIsBoldState] = useState(false);
  const [parchmentTone, setParchmentToneState] = useState(PARCHMENT_TONE_DEFAULT);
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
          if (s.theme === "light" || s.theme === "dark" || s.theme === "parchment") setThemeState(s.theme);
          if (s.fontSize) setFontSizeState(s.fontSize);
          if (typeof s.highContrast === "boolean") setHighContrastState(s.highContrast);
          if (typeof s.isBold === "boolean") setIsBoldState(s.isBold);
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
          // Carattere (font family) — migrazione da ID rimossi.
          let fontId = s.fontFamilyId;
          if (fontId === "varela") fontId = "sourgummy";
          else if (fontId === "patrick") fontId = "playpen";
          else if (fontId === "garamond" || fontId === "cormorant") fontId = "system";
          if (
            fontId === "system" ||
            fontId === "atkinson" ||
            fontId === "lora" ||
            fontId === "playpen" ||
            fontId === "sourgummy"
          ) {
            setFontFamilyIdState(fontId);
          }
          if (typeof s.parchmentTone === "number") {
            let t = Math.round(s.parchmentTone);
            // Migrazione dal vecchio formato -8…+8 al nuovo 35…65 (centro 50).
            if (t >= -8 && t <= 8) {
              t = clamp(50 + Math.round((t / 8) * 15), PARCHMENT_TONE_MIN, PARCHMENT_TONE_MAX);
            } else {
              t = clamp(t, PARCHMENT_TONE_MIN, PARCHMENT_TONE_MAX);
            }
            setParchmentToneState(t);
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

  const persist = async (patch: Partial<{ theme: ThemeMode; fontSize: number; highContrast: boolean; isBold: boolean; readingMode: ReadingMode; autoScrollDelaySec: number; autoScrollPxPerSec: number; fontFamilyId: FontFamilyId; parchmentTone: number }>) => {
    const next = { theme, fontSize, highContrast, isBold, readingMode, autoScrollDelaySec, autoScrollPxPerSec, fontFamilyId, parchmentTone, ...patch };
    await AsyncStorage.setItem("messale_settings", JSON.stringify(next));
  };

  const setTheme = (t: ThemeMode) => { setThemeState(t); persist({ theme: t }); };
  const setFontSize = (n: number) => { setFontSizeState(n); persist({ fontSize: n }); };
  const setHighContrast = (v: boolean) => { setHighContrastState(v); persist({ highContrast: v }); };
  const setIsBold = (v: boolean) => { setIsBoldState(v); persist({ isBold: v }); };
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
  const setParchmentTone = (n: number) => {
    const clamped = clamp(Math.round(n), PARCHMENT_TONE_MIN, PARCHMENT_TONE_MAX);
    setParchmentToneState(clamped);
    persist({ parchmentTone: clamped });
  };

  const colors = getColors(theme, highContrast, parchmentTone);
  const fontFamily = getFontFamilyString(fontFamilyId);
  // scaledFont: UI elements scale proportionally based on reading font
  const scaledFont = (base: number) => {
    const ratio = fontSize / 32; // 32 is default
    return Math.round(base * ratio);
  };

  if (!loaded) return null;

  return (
    <SettingsContext.Provider value={{ theme, fontSize, highContrast, isBold, readingMode, autoScrollDelaySec, autoScrollPxPerSec, fontFamilyId, fontFamily, parchmentTone, setTheme, setFontSize, setHighContrast, setIsBold, setReadingMode, setAutoScrollDelaySec, setAutoScrollPxPerSec, setFontFamilyId, setParchmentTone, colors, scaledFont }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};
