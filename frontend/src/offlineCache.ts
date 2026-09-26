/**
 * Cache offline per letture liturgiche.
 * Salva su AsyncStorage le letture scaricate, così l'app funziona anche senza rete.
 *
 * Struttura in AsyncStorage:
 *   messale_liturgy_v4_<YYYY-MM-DD>    → JSON della liturgia completa
 *   messale_liturgy_index              → array di date cached + timestamp
 *   messale_static_cache               → { order, fixedParts, prefaces, eucharisticPrayers,
 *                                          mysteryAcclamations, solemnBlessings, votiveMasses, timestamp }
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDateStr } from "./dateUtils";
import type { CelebrationMode } from "./massSession";

const LITURGY_PREFIX = "messale_liturgy_v4_";
const INDEX_KEY = "messale_liturgy_index";
const STATIC_KEY = "messale_static_cache";

function liturgyStorageKey(date: string, mode: CelebrationMode = "calendar_day"): string {
  if (mode === "calendar_day") return `${LITURGY_PREFIX}${date}`;
  return `${LITURGY_PREFIX}${date}_${mode}`;
}

export type CachedLiturgyIndexEntry = {
  date: string;          // YYYY-MM-DD
  cachedAt: number;      // timestamp ms
  title?: string;
  date_label?: string;
};

export async function saveLiturgy(
  date: string,
  data: any,
  mode: CelebrationMode = "calendar_day",
): Promise<void> {
  try {
    const key = liturgyStorageKey(date, mode);
    await AsyncStorage.setItem(key, JSON.stringify({ ...data, celebrationMode: mode }));
    const index = await getLiturgyIndex();
    const indexId = mode === "calendar_day" ? date : `${date}:${mode}`;
    const next = index.filter((e) => e.date !== indexId);
    next.push({
      date: indexId,
      cachedAt: Date.now(),
      title: data?.title,
      date_label: data?.date_label,
    });
    next.sort((a, b) => a.date.localeCompare(b.date));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch (e) {
    console.log("saveLiturgy error:", e);
  }
}

export async function loadLiturgy(
  date: string,
  mode: CelebrationMode = "calendar_day",
): Promise<any | null> {
  try {
    let raw = await AsyncStorage.getItem(liturgyStorageKey(date, mode));
    if (!raw && mode === "calendar_day") {
      raw = await AsyncStorage.getItem(`${LITURGY_PREFIX}${date}`);
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.log("loadLiturgy error:", e);
    return null;
  }
}

export async function getLiturgyIndex(): Promise<CachedLiturgyIndexEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function removeLiturgy(date: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${LITURGY_PREFIX}${date}`);
    const index = await getLiturgyIndex();
    const next = index.filter((e) => e.date !== date);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch (e) {
    console.log("removeLiturgy error:", e);
  }
}

export async function clearAllLiturgies(): Promise<number> {
  const index = await getLiturgyIndex();
  let count = 0;
  for (const e of index) {
    await AsyncStorage.removeItem(`${LITURGY_PREFIX}${e.date}`);
    count++;
  }
  await AsyncStorage.removeItem(INDEX_KEY);
  return count;
}

// ===== Pulizia automatica: rimuovi letture più vecchie di N giorni =====
export async function pruneOldLiturgies(keepDaysBack = 3): Promise<number> {
  const index = await getLiturgyIndex();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() - keepDaysBack);
  const thresholdStr = localDateStr(threshold);

  let removed = 0;
  const next: CachedLiturgyIndexEntry[] = [];
  for (const e of index) {
    if (e.date < thresholdStr) {
      await AsyncStorage.removeItem(`${LITURGY_PREFIX}${e.date}`);
      removed++;
    } else {
      next.push(e);
    }
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
  return removed;
}

// ===== Cache testi statici (ordinario, prefazi, preghiere ecc.) =====
export type StaticCacheBundle = {
  order?: any;
  fixedParts?: any;
  prefaces?: any;
  eucharisticPrayers?: any;
  mysteryAcclamations?: any;
  solemnBlessings?: any;
  votiveMasses?: any;
  timestamp?: number;
};

export async function loadStaticCache(): Promise<StaticCacheBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(STATIC_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveStaticCache(partial: StaticCacheBundle): Promise<void> {
  try {
    const cur = (await loadStaticCache()) || {};
    const next = { ...cur, ...partial, timestamp: Date.now() };
    await AsyncStorage.setItem(STATIC_KEY, JSON.stringify(next));
  } catch (e) {
    console.log("saveStaticCache error:", e);
  }
}

// ===== Utility: elenco prossime N date =====
export function nextDates(days: number, startDate?: Date): string[] {
  const out: string[] = [];
  const d = startDate ? new Date(startDate) : new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const c = new Date(d);
    c.setDate(c.getDate() + i);
    out.push(localDateStr(c));
  }
  return out;
}
