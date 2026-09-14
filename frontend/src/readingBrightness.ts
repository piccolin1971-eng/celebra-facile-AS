/**
 * Luminosità della finestra solo in Celebra / Ore.
 * All'uscita torna quella di sistema; all'ingresso si riapplica il livello salvato.
 * Non usa WRITE_SETTINGS (solo brightness dell'activity / schermo app).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY = "messale_reading_brightness_level";
export const BRIGHTNESS_MIN = 1;
export const BRIGHTNESS_MAX = 5;

const SUN_GLYPHS = ["·", "○", "◑", "◕", "☀"] as const;

export function clampBrightnessLevel(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, Math.round(n)));
}

export function brightnessLevelToValue(level: number): number {
  const t = (clampBrightnessLevel(level) - 1) / (BRIGHTNESS_MAX - 1);
  return 0.08 + t * 0.92;
}

export function brightnessValueToLevel(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  const t = (v - 0.08) / 0.92;
  return clampBrightnessLevel(1 + t * (BRIGHTNESS_MAX - 1));
}

export function brightnessSunGlyph(level: number): string {
  return SUN_GLYPHS[clampBrightnessLevel(level) - 1];
}

function brightnessMod(): typeof import("expo-brightness") | null {
  if (Platform.OS === "web") return null;
  try {
    // Lazy: stesso motivo di expo-keep-awake (TurboModule SDK 54).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-brightness");
  } catch {
    return null;
  }
}

export async function loadSavedBrightnessLevel(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null || raw === "") return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    if (n > BRIGHTNESS_MAX) {
      return clampBrightnessLevel(1 + ((n - 1) * (BRIGHTNESS_MAX - 1)) / 9);
    }
    return clampBrightnessLevel(n);
  } catch {
    return null;
  }
}

export async function saveBrightnessLevel(level: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(clampBrightnessLevel(level)));
  } catch (e) {
    console.log("saveBrightnessLevel:", e);
  }
}

export async function readCurrentBrightnessValue(): Promise<number | null> {
  if (Platform.OS !== "android") return null;
  const mod = brightnessMod();
  if (!mod?.getBrightnessAsync) return null;
  try {
    const v = await mod.getBrightnessAsync();
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  } catch {}
  return null;
}

export async function applyReadingBrightnessLevel(level: number): Promise<void> {
  if (Platform.OS !== "android") return;
  const mod = brightnessMod();
  if (!mod?.setBrightnessAsync) return;
  try {
    await mod.setBrightnessAsync(brightnessLevelToValue(level));
  } catch (e) {
    console.log("applyReadingBrightnessLevel:", e);
  }
}

/** Ripristina la luminosità di sistema di questa schermata Android. */
export async function restoreSystemReadingBrightness(): Promise<void> {
  if (Platform.OS !== "android") return;
  const mod = brightnessMod();
  if (!mod?.restoreSystemBrightnessAsync) return;
  try {
    await mod.restoreSystemBrightnessAsync();
  } catch (e) {
    console.log("restoreSystemReadingBrightness:", e);
  }
}
