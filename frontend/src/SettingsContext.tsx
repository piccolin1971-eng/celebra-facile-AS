import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeMode = "light" | "dark";
type ReadingMode = "scroll" | "tap";

interface SettingsState {
  theme: ThemeMode;
  fontSize: number; // reading text size in pt
  highContrast: boolean;
  readingMode: ReadingMode;
  setTheme: (t: ThemeMode) => void;
  setFontSize: (n: number) => void;
  setHighContrast: (v: boolean) => void;
  setReadingMode: (m: ReadingMode) => void;
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("messale_settings");
        if (saved) {
          const s = JSON.parse(saved);
          if (s.theme) setThemeState(s.theme);
          if (s.fontSize) setFontSizeState(s.fontSize);
          if (typeof s.highContrast === "boolean") setHighContrastState(s.highContrast);
          if (s.readingMode === "tap" || s.readingMode === "scroll") setReadingModeState(s.readingMode);
        }
      } catch (e) {
        console.log("Impossibile caricare settings:", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (patch: Partial<{ theme: ThemeMode; fontSize: number; highContrast: boolean; readingMode: ReadingMode }>) => {
    const next = { theme, fontSize, highContrast, readingMode, ...patch };
    await AsyncStorage.setItem("messale_settings", JSON.stringify(next));
  };

  const setTheme = (t: ThemeMode) => { setThemeState(t); persist({ theme: t }); };
  const setFontSize = (n: number) => { setFontSizeState(n); persist({ fontSize: n }); };
  const setHighContrast = (v: boolean) => { setHighContrastState(v); persist({ highContrast: v }); };
  const setReadingMode = (m: ReadingMode) => { setReadingModeState(m); persist({ readingMode: m }); };

  const colors = getColors(theme, highContrast);
  // scaledFont: UI elements scale proportionally based on reading font
  const scaledFont = (base: number) => {
    const ratio = fontSize / 32; // 32 is default
    return Math.round(base * ratio);
  };

  if (!loaded) return null;

  return (
    <SettingsContext.Provider value={{ theme, fontSize, highContrast, readingMode, setTheme, setFontSize, setHighContrast, setReadingMode, colors, scaledFont }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};
