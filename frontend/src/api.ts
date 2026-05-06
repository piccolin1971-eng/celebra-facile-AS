/**
 * API locale standalone per Messale Digitale.
 * Tutti i dati statici (ordinario, prefazi, preghiere eucaristiche, santi, benedizioni)
 * sono bundlati nell'APK. Le letture del giorno vengono scaricate direttamente
 * da chiesacattolica.it. Nessun backend intermedio richiesto.
 */
import {
  getFullLiturgy,
  getFullLiturgyByDateStr,
  getFixedParts,
  getMassOrder,
  getEucharisticPrayers,
  getMysteryAcclamations,
  getSolemnBlessings,
  getPrefaces,
  getVotiveMasses,
  getAllSaints,
  getSaintsForDateStr,
  Liturgy as LocalLiturgy,
} from "./localLiturgy";

import {
  saveLiturgy,
  loadLiturgy,
  getLiturgyIndex,
  nextDates,
} from "./offlineCache";
import { todayStr } from "./dateUtils";

// ===== Types (compatibili con versione precedente) =====

export type Reading = {
  type: string;
  reference: string;
  title: string;
  text: string;
};

export type Liturgy = LocalLiturgy;

export type Preface = { id: string; title: string; season: string; text: string };
export type EucharisticPrayer = { id: string; title: string; description: string; text: string };
export type VotiveMass = { id: string; title: string; color: string };
export type MysteryAcclamation = { id: string; label: string; celebrante: string; assemblea: string };
export type SolemnBlessing = {
  id: string;
  num?: number;
  season: string;
  title: string;
  rubric: string;
  invocations: { c: string; a: string }[];
  final: { c: string; a: string };
};

// ===== Utility =====
// La funzione todayStr è ora importata da dateUtils.ts (fix timezone Italia)

// ===== Liturgia (con cache + fallback offline) =====

async function liturgyForDateCached(date: string): Promise<Liturgy> {
  // 1) Prova scraping live da chiesacattolica.it
  try {
    const data = await getFullLiturgyByDateStr(date);
    if (data && Array.isArray(data.readings) && data.readings.length > 0) {
      await saveLiturgy(date, data);
      return { ...data, fromLocalCache: false };
    }
    // readings vuote (errore di rete o scraping fallito) → fallback cache
    const local = await loadLiturgy(date);
    if (local) return { ...local, fromLocalCache: true };
    return { ...data, fromLocalCache: false };
  } catch (err) {
    // Errore fatale → fallback cache
    const local = await loadLiturgy(date);
    if (local) return { ...local, fromLocalCache: true };
    throw err;
  }
}

// ===== Pre-download di N giorni in avanti =====

export type PrefetchProgress = {
  total: number;
  done: number;
  current?: string;
  failed: string[];
};

export async function prefetchLiturgies(
  days: number,
  onProgress?: (p: PrefetchProgress) => void,
): Promise<PrefetchProgress> {
  const dates = nextDates(days);
  const prog: PrefetchProgress = { total: dates.length, done: 0, failed: [] };
  for (const d of dates) {
    prog.current = d;
    onProgress?.(prog);
    try {
      const data = await getFullLiturgyByDateStr(d);
      if (data && Array.isArray(data.readings) && data.readings.length > 0) {
        await saveLiturgy(d, data);
      } else {
        prog.failed.push(d);
      }
    } catch (e) {
      console.log(`prefetch ${d} failed:`, e);
      prog.failed.push(d);
    }
    prog.done += 1;
    onProgress?.(prog);
  }
  return prog;
}

// I testi statici sono già nell'app: prefetchStatic è un no-op
export async function prefetchStatic(): Promise<void> {
  // Nulla da fare - tutti i testi statici sono bundlati nell'APK
  return;
}

// ===== API pubblica (stesse signature della versione precedente) =====

export const api = {
  liturgyToday: () => liturgyForDateCached(todayStr()),
  liturgyForDate: (date: string) => liturgyForDateCached(date),
  refreshLiturgy: async (date: string) => {
    // Forza nuovo scraping ignorando cache
    const data = await getFullLiturgyByDateStr(date);
    if (data && data.readings && data.readings.length > 0) {
      await saveLiturgy(date, data);
    }
    return { status: "refreshed", date, readings_count: data.readings?.length || 0 };
  },

  // Dati statici: ritorno sincrono wrappato in Promise per retrocompatibilità
  massOrder: async () => getMassOrder(),
  fixedParts: async () => getFixedParts(),
  prefaces: async (season?: string) => getPrefaces(season),
  eucharisticPrayers: async () => getEucharisticPrayers(true),
  mysteryAcclamations: async () => getMysteryAcclamations(),
  solemnBlessings: async () => getSolemnBlessings(),
  votiveMasses: async () => getVotiveMasses(),

  // Calendario santi
  saintsForDate: async (date: string) => getSaintsForDateStr(date),
  allSaints: async () => getAllSaints(),

  // Utility offline
  getCachedIndex: () => getLiturgyIndex(),
};
