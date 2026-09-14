import { Preface } from "./api";
import feastMapData from "./data/prefaceFeastMap.json";
import { parseLocalDate } from "./dateUtils";
import { getObservedSaintsForDate, getLiturgicalSeason, getSaintsForDate, isCalendarFeastObservedOnDate } from "./localLiturgy";
import { getVigilEveContextForISO } from "./vigilCatalog";
import type { CelebrationMode } from "./massSession";

type LiturgyLike = {
  date?: string;
  title?: string;
  saints?: { title: string; rank: string }[];
  celebrationMode?: CelebrationMode;
};

type FeastMapEntry = {
  monthDay?: string;
  titlePatterns: string[];
  excludePatterns?: string[];
  prefaceIds: string[];
  kind?: string;
  note?: string;
};

type PrefaceFeastMap = {
  version: number;
  moveableFeasts: FeastMapEntry[];
  celebrations: FeastMapEntry[];
  seasonalFallback: Record<string, string[]>;
};

const feastMap = feastMapData as PrefaceFeastMap;

const CELEBRATION_RANKS = new Set(["solennita", "festa", "memoria_obbligatoria"]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatchesPatterns(title: string, patterns: string[], excludePatterns?: string[]): boolean {
  const t = normalizeTitle(title);
  if (excludePatterns?.some((ex) => t.includes(normalizeTitle(ex)))) return false;
  return patterns.some((pattern) => {
    const p = normalizeTitle(pattern);
    if (p.includes(".*")) {
      try {
        return new RegExp(p, "i").test(t);
      } catch {
        return t.includes(p.replace(/\.\*/g, ""));
      }
    }
    return t.includes(p);
  });
}

function prefacesByIds(prefaces: Preface[], ids: string[]): Preface[] {
  const byId = new Map(prefaces.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Preface => p != null);
}

function normalizeRank(rank: string): string {
  return rank
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isCelebrationRank(rank: string): boolean {
  return CELEBRATION_RANKS.has(normalizeRank(rank));
}

function collectCandidateTitles(liturgy: LiturgyLike | null | undefined): string[] {
  const titles: string[] = [];
  if (liturgy?.title?.trim()) titles.push(liturgy.title);
  const dated = !!(liturgy?.date && /^\d{4}-\d{2}-\d{2}$/.test(liturgy.date));
  const saints = dated
    ? getObservedSaintsForDate(parseLocalDate(liturgy!.date!))
    : (liturgy?.saints ?? []);
  for (const saint of saints) {
    if (isCelebrationRank(saint.rank) && saint.title?.trim() && !titles.includes(saint.title)) {
      titles.push(saint.title);
    }
  }
  return titles;
}

function monthDayIsObservedOnLiturgyDate(liturgy: LiturgyLike, monthDay: string): boolean {
  if (!liturgy.date || !/^\d{4}-\d{2}-\d{2}$/.test(liturgy.date)) return true;
  const candidates: Date[] = [parseLocalDate(liturgy.date)];
  if (liturgy.celebrationMode && liturgy.celebrationMode !== "calendar_day") {
    const vigil = getVigilEveContextForISO(liturgy.date);
    if (vigil) candidates.push(parseLocalDate(vigil.solemnityDateISO));
  }
  for (const d of candidates) {
    const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (md !== monthDay) continue;
    const season = getLiturgicalSeason(d);
    return getSaintsForDate(d).some((s) => isCalendarFeastObservedOnDate(s, d, season.season));
  }
  return false;
}

function monthDaysForLiturgy(liturgy: LiturgyLike): string[] {
  if (!liturgy.date || !/^\d{4}-\d{2}-\d{2}$/.test(liturgy.date)) return [];
  const days = [liturgy.date.slice(5)];
  if (liturgy.celebrationMode && liturgy.celebrationMode !== "calendar_day") {
    const vigil = getVigilEveContextForISO(liturgy.date);
    if (vigil) days.push(vigil.solemnityDateISO.slice(5));
  }
  return [...new Set(days)];
}

function matchFeastEntry(
  entry: FeastMapEntry,
  monthDays: string[],
  titles: string[],
  liturgy: LiturgyLike,
): boolean {
  if (entry.monthDay && monthDays.length > 0 && !monthDays.includes(entry.monthDay)) return false;
  // Prefazio proprio fisso: solo se la festa/solennità di quel giorno è davvero celebrata
  if (entry.kind === "proprio" && entry.monthDay && monthDays.includes(entry.monthDay)) {
    return monthDayIsObservedOnLiturgyDate(liturgy, entry.monthDay);
  }
  if (!titles.some((title) => titleMatchesPatterns(title, entry.titlePatterns, entry.excludePatterns))) {
    return false;
  }
  return true;
}

/**
 * Risolve i prefazi dalla tabella Messale 2020.
 * Restituisce null se nessuna voce corrisponde (il chiamante userà il fallback legacy).
 */
export function resolvePrefacesFromFeastMap(
  prefaces: Preface[],
  liturgy: LiturgyLike | null | undefined,
): Preface[] | null {
  if (!liturgy) return null;

  const monthDays = monthDaysForLiturgy(liturgy);
  const titles = collectCandidateTitles(liturgy);
  if (titles.length === 0 && monthDays.length === 0) return null;

  for (const entry of feastMap.celebrations) {
    if (!matchFeastEntry(entry, monthDays, titles, liturgy)) continue;
    const matched = prefacesByIds(prefaces, entry.prefaceIds);
    if (matched.length > 0) return matched;
  }

  for (const title of titles) {
    for (const entry of feastMap.moveableFeasts) {
      if (!titleMatchesPatterns(title, entry.titlePatterns, entry.excludePatterns)) continue;
      const matched = prefacesByIds(prefaces, entry.prefaceIds);
      if (matched.length > 0) return matched;
    }
  }

  return null;
}

export function resolveSeasonalPrefacesFromFeastMap(
  prefaces: Preface[],
  seasonKey: string,
  isSunday: boolean,
): Preface[] | null {
  const fb = feastMap.seasonalFallback;
  let ids: string[] | undefined;
  if (seasonKey === "ordinario") {
    ids = isSunday ? fb.ordinarioSunday : fb.ordinarioWeekday;
  } else {
    ids = fb[seasonKey];
  }
  if (!ids?.length) return null;
  const matched = prefacesByIds(prefaces, ids);
  return matched.length > 0 ? matched : null;
}

export function isSundayDate(dateStr?: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return parseLocalDate(dateStr).getDay() === 0;
}
