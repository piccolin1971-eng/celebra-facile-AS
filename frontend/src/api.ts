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

import { fetchCeiHtml, resolveLiturgyFromCeiHtml, listCeiMassFormulaOptionsFromHtml, stripCeiMassFormulaFromTitle, type CeiMassFormula, type CeiMassFormulaOption } from "./liturgyScraper";

import {
  saveLiturgy,
  loadLiturgy,
  getLiturgyIndex,
} from "./offlineCache";
import { getOptionalSaintFullLiturgy } from "./optionalSaintLiturgy";
import { todayStr, parseLocalDate, italianDateLabel } from "./dateUtils";
import type { CelebrationMode } from "./massSession";
import { fillMissingFeastSecondReading } from "./saintLectionary";
import {
  eveningFestiveTitle,
  getMassEveningChoiceContext,
} from "./massEveningContext";
import {
  celebrationTitlesMatch,
  isVigilOrVespertineMass,
} from "./liturgicalColorUtils";

// ===== Types (compatibili con versione precedente) =====

export type Reading = {
  type: string;
  reference: string;
  title: string;
  subtitle?: string;
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
  const evening = getMassEveningChoiceContext(parseLocalDate(date));
  if (!evening) return true;
  const title = (raw.title || "").trim();
  if (!title) return false;
  const festive = eveningFestiveTitle(evening);
  if (mode === "vigil_proper") {
    return isVigilOrVespertineMass(title) || celebrationTitlesMatch(title, festive);
  }
  if (mode === "solemnity_day" || mode === "sunday_day") {
    return celebrationTitlesMatch(title, festive) && !isVigilOrVespertineMass(title);
  }
  return true;
}

function liturgyFromStorage(
  local: Awaited<ReturnType<typeof loadLiturgy>>,
  mode: CelebrationMode,
): Liturgy | null {
  if (!local || !Array.isArray(local.readings) || local.readings.length === 0) return null;
  const withMode = { ...local, celebrationMode: mode };
  return fillMissingFeastSecondReading({
    ...reconcileLiturgyColors(withMode),
    fromLocalCache: true,
    celebrationMode: mode,
  });
}

async function liturgyForDateCached(
  date: string,
  mode: CelebrationMode = "calendar_day",
  massFormula: CeiMassFormula = 1,
): Promise<Liturgy> {
  try {
    const raw = await loadLiturgy(date, mode, massFormula);
    if (raw && vigilCacheLooksValid(raw, mode, date)) {
      const cached = liturgyFromStorage(raw, mode);
      if (cached) return cached;
    }

    const data = await getFullLiturgyByDateStr(date, mode, massFormula);
    if (data && Array.isArray(data.readings) && data.readings.length > 0) {
      const reconciled = reconcileLiturgyColors({
        ...data,
        celebrationMode: mode,
        ...(massFormula !== 1 ? { ceiMassFormula: massFormula } : {}),
      });
      await saveLiturgy(date, reconciled, mode, massFormula);
      return { ...reconciled, fromLocalCache: false, celebrationMode: mode };
    }
    const fallback = liturgyFromStorage(await loadLiturgy(date, mode, massFormula), mode);
    if (fallback) return fallback;
    return { ...data, fromLocalCache: false, celebrationMode: mode };
  } catch (err) {
    const fallback = liturgyFromStorage(await loadLiturgy(date, mode, massFormula), mode);
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
  massFormula: CeiMassFormula = 1,
): Promise<string> {
  const d = parseLocalDate(date);
  const html = await fetchCeiHtml(d);
  if (!html) return reconciledCeiTitle(existing, date, mode);

  const resolved = resolveLiturgyFromCeiHtml(html, d, mode, massFormula);
  const stub: LocalLiturgy = {
    date,
    date_label: (existing?.date_label as string) || italianDateLabel(d),
    season: getLiturgicalSeason(d),
    saints: getSaintsForDate(d),
    readings: resolved.readings,
    title: resolved.title,
    liturgical_color: resolved.liturgical_color,
    celebrationMode: mode,
    ...(massFormula !== 1 ? { ceiMassFormula: massFormula } : {}),
  };
  const reconciled = reconcileLiturgyColors({ ...stub, celebrationMode: mode });
  const title = (reconciled.title || "").trim();
  void saveLiturgy(date, reconciled, mode, massFormula);
  return title;
}

export async function resolveCeiCelebrationTitle(
  date: string,
  mode: CelebrationMode = "calendar_day",
  massFormula: CeiMassFormula = 1,
): Promise<string> {
  const meta = await resolveCeiCelebrationStripMeta(date, mode, massFormula);
  return meta.title;
}

/** Titolo e colore CEI per striscia home (allineati alla liturgia in cache). */
export async function resolveCeiCelebrationStripMeta(
  date: string,
  mode: CelebrationMode = "calendar_day",
  massFormula: CeiMassFormula = 1,
): Promise<{ title: string; liturgicalColor: string }> {
  try {
    const raw = await loadLiturgy(date, mode, massFormula);
    if (raw && vigilCacheLooksValid(raw, mode, date)) {
      const reconciled = reconcileLiturgyColors({
        ...(raw as LocalLiturgy),
        date,
        celebrationMode: mode,
      });
      const title = stripCeiMassFormulaFromTitle((reconciled.title || "").trim());
      if (title) {
        return { title, liturgicalColor: (reconciled.liturgical_color || "").trim() };
      }
    }

    await scrapeAndCacheCeiTitle(date, mode, raw, massFormula);
    const cached = await loadLiturgy(date, mode, massFormula);
    const reconciled = cached
      ? reconcileLiturgyColors({
          ...(cached as LocalLiturgy),
          date,
          celebrationMode: mode,
        })
      : null;
    return {
      title: stripCeiMassFormulaFromTitle(reconciledCeiTitle(cached, date, mode)),
      liturgicalColor: (reconciled?.liturgical_color || "").trim(),
    };
  } catch {
    const raw = await loadLiturgy(date, mode, massFormula);
    const reconciled = raw
      ? reconcileLiturgyColors({
          ...(raw as LocalLiturgy),
          date,
          celebrationMode: mode,
        })
      : null;
    return {
      title: stripCeiMassFormulaFromTitle(reconciledCeiTitle(raw, date, mode)),
      liturgicalColor: (reconciled?.liturgical_color || "").trim(),
    };
  }
}

/** Messa N se la pagina CEI ne offre almeno due. */
export async function getCeiMassFormulaOptions(date: string): Promise<CeiMassFormulaOption[]> {
  try {
    const d = parseLocalDate(date);
    const html = await fetchCeiHtml(d);
    if (!html) return [];
    const opts = listCeiMassFormulaOptionsFromHtml(html);
    return opts.length >= 2 ? opts : [];
  } catch {
    return [];
  }
}

/** Salva in cache tutte le formule presenti sulla pagina CEI del giorno. */
export async function cacheAllCeiMassFormulasForDate(date: string): Promise<void> {
  const d = parseLocalDate(date);
  const html = await fetchCeiHtml(d);
  if (!html) return;
  const opts = listCeiMassFormulaOptionsFromHtml(html);
  if (opts.length < 2) return;
  await Promise.all(
    opts.map(async (o) => {
      const existing = await loadLiturgy(date, "calendar_day", o.formula);
      if (existing?.readings?.length) return;
      const data = await getFullLiturgyByDateStr(date, "calendar_day", o.formula);
      if (data?.readings?.length) {
        await saveLiturgy(date, data, "calendar_day", o.formula);
      }
    }),
  );
}

// ===== API pubblica (stesse signature della versione precedente) =====

export const api = {
  liturgyToday: (mode?: CelebrationMode, massFormula?: CeiMassFormula) =>
    liturgyForDateCached(todayStr(), mode ?? "calendar_day", massFormula ?? 1),
  liturgyForDate: (
    date: string,
    mode: CelebrationMode = "calendar_day",
    massFormula: CeiMassFormula = 1,
  ) => liturgyForDateCached(date, mode, massFormula),
  liturgyForOptionalSaint: (date: string, saintId: string) =>
    getOptionalSaintFullLiturgy(date, saintId),
  resolveCeiCelebrationTitle,
  resolveCeiCelebrationStripMeta,
  getCeiMassFormulaOptions,
  cacheAllCeiMassFormulasForDate,
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
