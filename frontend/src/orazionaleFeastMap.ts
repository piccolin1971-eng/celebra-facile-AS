import feastMapData from "./data/orazionaleFeastMap.json";
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
  prayerId: string;
  kind?: string;
};

type OrazionaleFeastMap = {
  moveableFeasts: FeastMapEntry[];
  celebrations: FeastMapEntry[];
};

const feastMap = feastMapData as OrazionaleFeastMap;

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
  for (const saint of liturgy?.saints ?? []) {
    if (isCelebrationRank(saint.rank) && saint.title?.trim()) {
      titles.push(saint.title);
    }
  }
  if (liturgy?.date && /^\d{4}-\d{2}-\d{2}$/.test(liturgy.date)) {
    for (const saint of getObservedSaintsForDate(parseLocalDate(liturgy.date))) {
      if (isCelebrationRank(saint.rank) && saint.title?.trim() && !titles.includes(saint.title)) {
        titles.push(saint.title);
      }
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
  const days = [liturgy.date.slice(5, 10)];
  if (liturgy.celebrationMode && liturgy.celebrationMode !== "calendar_day") {
    const vigil = getVigilEveContextForISO(liturgy.date);
    if (vigil) days.push(vigil.solemnityDateISO.slice(5, 10));
  }
  return [...new Set(days)];
}

function entryMatches(entry: FeastMapEntry, monthDays: string[], titles: string[], liturgy: LiturgyLike): boolean {
  if (entry.monthDay && monthDays.length > 0 && !monthDays.includes(entry.monthDay)) return false;
  if (entry.kind === "proprio" && entry.monthDay && monthDays.includes(entry.monthDay)) {
    return monthDayIsObservedOnLiturgyDate(liturgy, entry.monthDay);
  }
  if (!titles.some((title) => titleMatchesPatterns(title, entry.titlePatterns, entry.excludePatterns))) {
    return false;
  }
  return true;
}

function rankEntry(entry: FeastMapEntry, monthDays: string[], titles: string[]): number {
  let score = 0;
  if (entry.monthDay && monthDays.includes(entry.monthDay)) score += 10;
  if (entry.kind === "proprio") score += 5;
  const titleHit = titles.some((t) => titleMatchesPatterns(t, entry.titlePatterns, entry.excludePatterns));
  if (titleHit) score += 3;
  return score;
}

/**
 * Risolve l'ID della preghiera universale dall'Orazionale CEI
 * in base a data e titolo della celebrazione.
 */
export function resolveOrazionalePrayerId(
  liturgy: LiturgyLike | null | undefined,
): string | undefined {
  if (!liturgy) return undefined;

  const monthDays = monthDaysForLiturgy(liturgy);
  const titles = collectCandidateTitles(liturgy);

  const candidates: FeastMapEntry[] = [];

  for (const entry of feastMap.moveableFeasts) {
    if (entryMatches(entry, monthDays, titles, liturgy)) candidates.push(entry);
  }
  for (const entry of feastMap.celebrations) {
    if (entryMatches(entry, monthDays, titles, liturgy)) candidates.push(entry);
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => rankEntry(b, monthDays, titles) - rankEntry(a, monthDays, titles));
  return candidates[0].prayerId;
}
