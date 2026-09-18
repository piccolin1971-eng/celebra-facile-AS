/**
 * Compieta dal salterio settimanale, già nell'APK.
 * Feste/solennità (e sabato/domenica) usano lo schema domenicale.
 * Triduo e ottava di Pasqua/Natale restano al CEI.
 */
import { addDays, localDateStr, parseLocalDate } from "../dateUtils";
import { computeEasterSunday } from "../liturgicalDates";
import { getMoveableFeastsForYear } from "../moveableFeasts";
import { getObservedSaintsForDate } from "../saintsCalendar";
import { isSolemnityVigilEvening } from "./titles";
import { marianAntiphonsForDate, scrubLoneParenLines, stripCeiMarianTail } from "./bundled";
import type { OreBlock, ParsedHour } from "./types";
import schemasData from "./data/complineSchemas.json";

export type ComplineSchemaId = "sun-i" | "sun-ii" | "mon" | "tue" | "wed" | "thu" | "fri";

type SchemaPack = { sourceDate: string; blocks: OreBlock[] };

const SCHEMAS = schemasData as Record<ComplineSchemaId, SchemaPack>;

const FEAST_RANKS = new Set(["festa", "solennita"]);

function normalizeRank(rank: string): string {
  return rank
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function dateUsesSundayCompline(date: Date): boolean {
  if (date.getDay() === 0) return true;
  if (getObservedSaintsForDate(date).some((s) => FEAST_RANKS.has(normalizeRank(s.rank)))) return true;
  const mov = getMoveableFeastsForYear(date.getFullYear()).get(localDateStr(date));
  if (!mov) return false;
  if (/ceneri/i.test(mov.title)) return false;
  return FEAST_RANKS.has(normalizeRank(mov.rank));
}

export function complineSchemaId(date: Date): ComplineSchemaId {
  if (isSolemnityVigilEvening(date) || date.getDay() === 6) return "sun-i";
  if (dateUsesSundayCompline(date)) return "sun-ii";
  const dow = date.getDay();
  if (dow === 1) return "mon";
  if (dow === 2) return "tue";
  if (dow === 3) return "wed";
  if (dow === 4) return "thu";
  return "fri";
}

export function complineNeedsCeiFetch(date: Date): boolean {
  const y = date.getFullYear();
  const easter = computeEasterSunday(y);
  const start = addDays(easter, -3);
  const octaveEnd = addDays(easter, 7);
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (t >= start.getTime() && t <= octaveEnd.getTime()) return true;
  const m = date.getMonth();
  const d = date.getDate();
  if (m === 11 && d >= 24) return true;
  if (m === 0 && d <= 1) return true;
  return false;
}

function withMarian(blocks: OreBlock[], date: Date): OreBlock[] {
  const cleaned = scrubLoneParenLines(stripCeiMarianTail(blocks));
  if (cleaned.some((b) => b.k === "marian")) return cleaned;
  return [
    ...cleaned,
    { k: "title", text: "ANTIFONE DELLA BEATA VERGINE MARIA" },
    { k: "marian", antiphons: marianAntiphonsForDate(date) },
  ];
}

export function getBundledCompline(dateISO: string): ParsedHour | null {
  const date = parseLocalDate(dateISO);
  if (complineNeedsCeiFetch(date)) return null;
  const pack = SCHEMAS[complineSchemaId(date)];
  if (!pack?.blocks?.length) return null;
  const blocks = withMarian(JSON.parse(JSON.stringify(pack.blocks)) as OreBlock[], date);
  return { hour: "compieta", blocks };
}
