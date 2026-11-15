import type { TextStyle, ViewStyle } from "react-native";
import type { UiStyle } from "./SettingsContext";
import { ACTION_RADIUS } from "./uiActionTokens";

export const UI_STYLE_CHOICES: { id: UiStyle; label: string; hint: string }[] = [
  { id: "classic", label: "Come ora", hint: "L’aspetto attuale" },
  { id: "aria", label: "Aria", hint: "Bordi sottili, più spazio" },
  { id: "libro", label: "Libro", hint: "Striscia laterale, linee pulite" },
  { id: "pieni", label: "Tasti pieni", hint: "Tasti colorati, scritte bianche" },
  { id: "fascia", label: "Fascia", hint: "Fascia colorata a sinistra" },
];

const PIENI_BASE = "#120e08";
/** Ultima sezione / ora aperta nei menu (Celebra, Ore, ecc.). */
export const UI_ACTIVE_BORDER = "#FFE566";
export const UI_ACTIVE_BG = "#121200";
/** @deprecated usa UI_ACTIVE_BORDER */
export const PIENI_ACTIVE_BORDER = UI_ACTIVE_BORDER;
const LIBRO_RULE = "#2c2c2c";
const FASCIA_PANEL = "#101010";

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "").trim();
  if (raw.length !== 6) return null;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function mixHex(a: string, b: string, ratio: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(ca[0] * t + cb[0] * (1 - t));
  const g = Math.round(ca[1] * t + cb[1] * (1 - t));
  const bch = Math.round(ca[2] * t + cb[2] * (1 - t));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bch.toString(16).padStart(2, "0")}`;
}

export function accentFillBackground(accent: string, ratio = 0.46): string {
  return mixHex(accent, PIENI_BASE, ratio);
}

export type UiChrome = {
  style: UiStyle;
  listGap: number;
  actionBorder: number;
  actionActiveBorder: number;
  actionRadius: number;
  outlineBorder: number;
  dayBorder: number;
  dayRadius: number;
  dayRowGap: number;
  dayHaloBorder: number;
  dayOuterRadius: number;
  flagPaddingV: number;
  flagRadius: number;
  flagLeftAsFull: boolean;
  dlBorder: number;
  dlRadius: number;
  indexBorder: number;
  indexRadius: number;
  indexActiveBorder: number;
  dayFrameBorder: number;
  dayFrameRadius: number;
  mode: "classic" | "aria" | "libro" | "pieni" | "fascia";
};

export function getUiChrome(uiStyle: UiStyle): UiChrome {
  switch (uiStyle) {
    case "aria":
      return {
        style: uiStyle,
        mode: "aria",
        listGap: 16,
        actionBorder: 1.5,
        actionActiveBorder: 2,
        actionRadius: 18,
        outlineBorder: 1.5,
        dayBorder: 1.5,
        dayRadius: 18,
        dayRowGap: 14,
        dayHaloBorder: 1.5,
        dayOuterRadius: 22,
        flagPaddingV: 18,
        flagRadius: 18,
        flagLeftAsFull: false,
        dlBorder: 1.5,
        dlRadius: 18,
        indexBorder: 1.5,
        indexRadius: 18,
        indexActiveBorder: 2,
        dayFrameBorder: 1.5,
        dayFrameRadius: 18,
      };
    case "libro":
      return {
        style: uiStyle,
        mode: "libro",
        listGap: 14,
        actionBorder: 0,
        actionActiveBorder: 0,
        actionRadius: 0,
        outlineBorder: 0,
        dayBorder: 0,
        dayRadius: 0,
        dayRowGap: 0,
        dayHaloBorder: 0,
        dayOuterRadius: 0,
        flagPaddingV: 14,
        flagRadius: 0,
        flagLeftAsFull: true,
        dlBorder: 0,
        dlRadius: 0,
        indexBorder: 0,
        indexRadius: 0,
        indexActiveBorder: 0,
        dayFrameBorder: 0,
        dayFrameRadius: 0,
      };
    case "pieni":
      return {
        style: uiStyle,
        mode: "pieni",
        listGap: 16,
        actionBorder: 3,
        actionActiveBorder: 3,
        actionRadius: 16,
        outlineBorder: 3,
        dayBorder: 0,
        dayRadius: 14,
        dayRowGap: 14,
        dayHaloBorder: 0,
        dayOuterRadius: 14,
        flagPaddingV: 18,
        flagRadius: 16,
        flagLeftAsFull: false,
        dlBorder: 3,
        dlRadius: 16,
        indexBorder: 3,
        indexRadius: 16,
        indexActiveBorder: 3,
        dayFrameBorder: 0,
        dayFrameRadius: 16,
      };
    case "fascia":
      return {
        style: uiStyle,
        mode: "fascia",
        listGap: 12,
        actionBorder: 0,
        actionActiveBorder: 0,
        actionRadius: 0,
        outlineBorder: 0,
        dayBorder: 0,
        dayRadius: 0,
        dayRowGap: 12,
        dayHaloBorder: 0,
        dayOuterRadius: 0,
        flagPaddingV: 14,
        flagRadius: 0,
        flagLeftAsFull: true,
        dlBorder: 0,
        dlRadius: 0,
        indexBorder: 0,
        indexRadius: 0,
        indexActiveBorder: 0,
        dayFrameBorder: 0,
        dayFrameRadius: 0,
      };
    default:
      return {
        style: "classic",
        mode: "classic",
        listGap: 12,
        actionBorder: 5,
        actionActiveBorder: 6,
        actionRadius: 14,
        outlineBorder: 4,
        dayBorder: 3,
        dayRadius: ACTION_RADIUS,
        dayRowGap: 10,
        dayHaloBorder: 3,
        dayOuterRadius: ACTION_RADIUS + 6,
        flagPaddingV: 16,
        flagRadius: 14,
        flagLeftAsFull: false,
        dlBorder: 3,
        dlRadius: ACTION_RADIUS,
        indexBorder: 5,
        indexRadius: 14,
        indexActiveBorder: 6,
        dayFrameBorder: 3,
        dayFrameRadius: 14,
      };
  }
}

export function uiAccentButtonStyle(
  chrome: UiChrome,
  accent: string,
  active?: boolean,
  activeBorderColor?: string,
): ViewStyle {
  if (chrome.mode === "pieni") {
    const border = active && activeBorderColor ? activeBorderColor : accent;
    return {
      backgroundColor: active ? UI_ACTIVE_BG : accentFillBackground(accent),
      borderColor: border,
      borderWidth: active ? chrome.indexActiveBorder : chrome.indexBorder,
      borderRadius: chrome.indexRadius,
    };
  }
  if (chrome.mode === "fascia") {
    return {
      backgroundColor: FASCIA_PANEL,
      borderWidth: 0,
      borderLeftWidth: 12,
      borderLeftColor: active && activeBorderColor ? activeBorderColor : accent,
      borderRadius: 0,
    };
  }
  if (chrome.mode === "libro") {
    return {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderLeftWidth: 4,
      borderLeftColor: accent,
      borderBottomWidth: 1,
      borderBottomColor: LIBRO_RULE,
      borderRadius: 0,
    };
  }
  return {
    borderColor: active && activeBorderColor ? activeBorderColor : accent,
    borderWidth: active ? chrome.actionActiveBorder : chrome.actionBorder,
    borderRadius: chrome.actionRadius,
  };
}

export function uiDayChipStyle(chrome: UiChrome, accent: string, isToday: boolean): ViewStyle {
  if (chrome.mode === "pieni") {
    return {
      borderWidth: isToday ? 0 : chrome.dayBorder,
      borderColor: accent,
      borderRadius: chrome.dayRadius,
      backgroundColor: accentFillBackground(accent, isToday ? 0.58 : 0.4),
    };
  }
  if (chrome.mode === "fascia") {
    return {
      borderWidth: 0,
      borderLeftWidth: 10,
      borderLeftColor: accent,
      borderRadius: 0,
      backgroundColor: isToday ? "#071407" : "#0e0e0e",
    };
  }
  if (chrome.mode === "libro") {
    return {
      borderWidth: 0,
      borderBottomWidth: 3,
      borderBottomColor: accent,
      borderRadius: 0,
      backgroundColor: "transparent",
    };
  }
  if (chrome.mode === "aria") {
    return {
      borderWidth: chrome.dayBorder,
      borderColor: accent,
      borderRadius: chrome.dayRadius,
    };
  }
  return {
    borderWidth: chrome.dayBorder,
    borderColor: accent,
    borderRadius: chrome.dayRadius,
  };
}

export function uiFlagButtonStyle(chrome: UiChrome, accent: string): ViewStyle {
  if (chrome.mode === "pieni") {
    return {
      backgroundColor: accentFillBackground(accent),
      borderColor: accent,
      borderWidth: 3,
      borderRadius: chrome.flagRadius,
      borderLeftWidth: 3,
    };
  }
  if (chrome.mode === "fascia") {
    return {
      backgroundColor: FASCIA_PANEL,
      borderWidth: 0,
      borderLeftWidth: 12,
      borderLeftColor: accent,
      borderRadius: 0,
    };
  }
  if (chrome.mode === "libro") {
    return {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderLeftWidth: 4,
      borderLeftColor: accent,
      borderBottomWidth: 1,
      borderBottomColor: LIBRO_RULE,
      borderRadius: 0,
    };
  }
  if (chrome.mode === "aria") {
    return {
      borderWidth: 1.5,
      borderLeftWidth: 1.5,
      borderRadius: chrome.flagRadius,
    };
  }
  return {};
}

export function uiOutlineActionStyle(chrome: UiChrome, accent: string): ViewStyle {
  if (chrome.mode === "pieni") {
    return {
      backgroundColor: accentFillBackground(accent),
      borderColor: accent,
      borderWidth: chrome.outlineBorder,
      borderRadius: chrome.actionRadius,
    };
  }
  if (chrome.mode === "fascia") {
    return {
      backgroundColor: FASCIA_PANEL,
      borderWidth: 0,
      borderLeftWidth: 12,
      borderLeftColor: accent,
      borderRadius: 0,
    };
  }
  if (chrome.mode === "libro") {
    return {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderLeftWidth: 4,
      borderLeftColor: accent,
      borderBottomWidth: 1,
      borderBottomColor: LIBRO_RULE,
      borderRadius: 0,
    };
  }
  return {
    backgroundColor: "transparent",
    borderWidth: chrome.outlineBorder,
    borderColor: accent,
    borderRadius: chrome.mode === "aria" ? chrome.actionRadius : ACTION_RADIUS,
  };
}

export function uiNavLinkStyle(chrome: UiChrome, accent: string): ViewStyle | null {
  if (chrome.mode === "classic") return null;
  if (chrome.mode === "aria") {
    return {
      borderWidth: 1.5,
      borderColor: accent,
      borderRadius: 18,
      paddingHorizontal: 22,
      paddingVertical: 14,
    };
  }
  if (chrome.mode === "libro") {
    return {
      borderWidth: 0,
      borderBottomWidth: 2,
      borderBottomColor: accent,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 12,
    };
  }
  if (chrome.mode === "pieni") {
    return {
      backgroundColor: accentFillBackground(accent, 0.55),
      borderColor: accent,
      borderWidth: 2,
      borderRadius: 16,
      paddingHorizontal: 20,
      paddingVertical: 12,
    };
  }
  return {
    backgroundColor: FASCIA_PANEL,
    borderWidth: 0,
    borderLeftWidth: 10,
    borderLeftColor: accent,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
  };
}

export function uiFilledLabelStyle(chrome: UiChrome, active?: boolean): TextStyle | false {
  if (chrome.mode !== "pieni") return false;
  if (active) return { color: UI_ACTIVE_BORDER };
  return { color: "#FFFFFF" };
}

/** @deprecated usa uiFilledLabelStyle */
export function uiNavLinkLabelStyle(chrome: UiChrome): TextStyle | null {
  return chrome.mode === "pieni" ? { color: "#FFFFFF" } : null;
}

export function uiDayFrameStyle(chrome: UiChrome, accent: string): ViewStyle {
  if (chrome.mode === "pieni") {
    return {
      borderWidth: 0,
      borderRadius: chrome.dayFrameRadius,
      backgroundColor: accentFillBackground(accent, 0.22),
    };
  }
  if (chrome.mode === "fascia") {
    return {
      borderWidth: 0,
      borderLeftWidth: 12,
      borderLeftColor: accent,
      borderRadius: 0,
      backgroundColor: FASCIA_PANEL,
    };
  }
  if (chrome.mode === "libro") {
    return {
      borderWidth: 0,
      borderLeftWidth: 4,
      borderLeftColor: accent,
      borderRadius: 0,
      backgroundColor: "transparent",
    };
  }
  return {
    borderWidth: chrome.dayFrameBorder,
    borderRadius: chrome.dayFrameRadius,
  };
}