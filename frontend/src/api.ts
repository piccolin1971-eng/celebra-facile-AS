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
  getSaintsForDate,
  getLiturgicalSeason,
  reconcileLiturgyColors,
  Liturgy as LocalLiturgy,
} from "./localLiturgy";

import { fetchCeiHtml, resolveLiturgyFromCeiHtml } from "./liturgyScraper";

import {
  saveLiturgy,
  loadLiturgy,
  getLiturgyIndex,
  nextDates,
} from "./offlineCache";
import { todayStr, parseLocalDate, italianDateLabel } from "./dateUtils";
import type { CelebrationMode } from "./massSession";
import { getVigilEveContext } from "./vigilCatalog";
import {
  celebrationTitlesMatch,
  isVigilOrVespertineMass,
} from "./liturgicalColorUtils";

// ===== Types (compatibili con versione precedente) =====

export type Reading = {
  type: string;
  reference: string;
  title: string;
  text: string;
};

export type Liturgy = LocalLiturgy;

export type Preface = { id: string; title: string; season?: string; category?: string; sortOrder?: number; text: string };
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

function vigilCacheLooksValid(
  raw: Awaited<ReturnType<typeof loadLiturgy>>,
  mode: CelebrationMode,
  date: string,
): boolean {
  if (!raw || mode === "calendar_day") return true;
  const vigil = getVigilEveContext(parseLocalDate(date));
  if (!vigil) return true;
  const title = (raw.title || "").trim();
  if (!title) return false;
  if (mode === "vigil_proper") {
    return (
      isVigilOrVespertineMass(title) || celebrationTitlesMatch(title, vigil.solemnityTitle)
    );
  }
  if (mode === "solemnity_day") {
    return celebrationTitlesMatch(title, vigil.solemnityTitle) && !isVigilOrVespertineMass(title);
  }
  return true;
}

function liturgyFromStorage(
  local: Awaited<ReturnType<typeof loadLiturgy>>,
  mode: CelebrationMode,
): Liturgy | null {
  if (!local || !Array.isArray(local.readings) || local.readings.length === 0) return null;
  const withMode = { ...local, celebrationMode: mode };
  return { ...reconcileLiturgyColors(withMode), fromLocalCache: true, celebrationMode: mode };
}

async function liturgyForDateCached(
  date: string,
  mode: CelebrationMode = "calendar_day",
): Promise<Liturgy> {
  try {
    const raw = await loadLiturgy(date, mode);
    if (raw && vigilCacheLooksValid(raw, mode, date)) {
      const cached = liturgyFromStorage(raw, mode);
      if (cached) return cached;
    }

    const data = await getFullLiturgyByDateStr(date, mode);
    if (data && Array.isArray(data.readings) && data.readings.length > 0) {
      const reconciled = reconcileLiturgyColors({ ...data, celebrationMode: mode });
      await saveLiturgy(date, reconciled, mode);
      return { ...reconciled, fromLocalCache: false, celebrationMode: mode };
    }
    const fallback = liturgyFromStorage(await loadLiturgy(date, mode), mode);
    if (fallback) return fallback;
    return { ...data, fromLocalCache: false, celebrationMode: mode };
  } catch (err) {
    const fallback = liturgyFromStorage(await loadLiturgy(date, mode), mode);
    if (fallback) return fallback;
    throw err;
  }
}

/** Precarica in cache le altre modalità (stesso HTML CEI, nessun secondo download). */
export async function warmLiturgyModes(
  date: string,
  modes: CelebrationMode[],
): Promise<void> {
  await Promise.all(
    modes.map((mode) =>
      liturgyForDateCached(date, mode).catch((e) => {
        if (__DEV__) console.log(`warmLiturgyModes ${date} ${mode}:`, e);
      }),
    ),
  );
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

/** Titolo CEI per banner home: cache offline, altrimenti scrape leggero. */
function reconciledCeiTitle(
  raw: LocalLiturgy | Record<string, unknown> | null,
  date: string,
  mode: CelebrationMode,
): string {
  if (!raw) return "";
  const reconciled = reconcileLiturgyColors({
    ...(raw as LocalLiturgy),
    date,
    celebrationMode: mode,
  });
  return (reconciled.title || "").trim();
}

async function scrapeAndCacheCeiTitle(
  date: string,
  mode: CelebrationMode,
  existing: Awaited<ReturnType<typeof loadLiturgy>>,
): Promise<string> {
  const d = parseLocalDate(date);
  const html = await fetchCeiHtml(d);
  if (!html) return reconciledCeiTitle(existing, date, mode);

  const resolved = resolveLiturgyFromCeiHtml(html, d, mode);
  const stub: LocalLiturgy = {
    date,
    date_label: (existing?.date_label as string) || italianDateLabel(d),
    season: getLiturgicalSeason(d),
    saints: getSaintsForDate(d),
    readings: resolved.readings,
    title: resolved.title,
    liturgical_color: resolved.liturgical_color,
    celebrationMode: mode,
  };
  const reconciled = reconcileLiturgyColors({ ...stub, celebrationMode: mode });
  const title = (reconciled.title || "").trim();
  void saveLiturgy(date, reconciled, mode);
  return title;
}

export async function resolveCeiCelebrationTitle(
  date: string,
  mode: CelebrationMode = "calendar_day",
): Promise<string> {
  try {
    const raw = await loadLiturgy(date, mode);
    if (raw && vigilCacheLooksValid(raw, mode, date)) {
      const cached = reconciledCeiTitle(raw, date, mode);
      if (cached) return cached;
    }

    return await scrapeAndCacheCeiTitle(date, mode, raw);
  } catch {
    const raw = await loadLiturgy(date, mode);
    return reconciledCeiTitle(raw, date, mode);
  }
}

// ===== API pubblica (stesse signature della versione precedente) =====

export const api = {
  liturgyToday: (mode?: CelebrationMode) => liturgyForDateCached(todayStr(), mode ?? "calendar_day"),
  liturgyForDate: (date: string, mode: CelebrationMode = "calendar_day") =>
    liturgyForDateCached(date, mode),
  resolveCeiCelebrationTitle,
  warmLiturgyModes,
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
