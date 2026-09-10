/**
 * Lezionario dei Santi (CEI) — dati pre-risolti a build time da saintLectionary.json.
 */
import lectionaryData from "./data/saintLectionary.json";
import type { Reading } from "./api";
import type { Liturgy } from "./localLiturgy";
import { parseLocalDate } from "./dateUtils";

export type SaintLectionaryReading = Reading;

export type SaintLectionaryEntry = {
  saintTitle: string;
  rank?: string;
  readings: SaintLectionaryReading[];
};

type LectionaryFile = {
  meta: Record<string, unknown>;
  entries: Record<string, Record<string, SaintLectionaryEntry>>;
};

const DATA = lectionaryData as LectionaryFile;

const READING_TYPES_TO_REPLACE = new Set([
  "prima_lettura",
  "salmo",
  "seconda_lettura",
  "sequenza",
  "acclamazione",
  "vangelo",
]);

export function normalizeSaintTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mmddFromDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeCompareText(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SAINT_PREFIX_RE = /^(santi|sante|san|santa|beati|beato|beata)\s+/;
const SAINT_SUFFIX_RE = /\s+(martiri|martire|vescovo|vergine|compagni|confessori|dottori)(\s|$)/g;

/** Solo memoria obbligatoria: feste/solennità hanno già tutto dallo scraper CEI. */
const MEMORIA_OBBLIGATORIA = "memoria_obbligatoria";

function isSubstantiveScriptureReading(r: SaintLectionaryReading): boolean {
  const t = (r.text || "").trim();
  if (t.length < 60) return false;
  if (/^dal comune\b/i.test(t)) return false;
  if (/^cf\.\s/i.test(t) && t.length < 120) return false;
  if (/^salmo\s+\d/i.test(t) && t.length < 120) return false;
  if (r.type === "vangelo") {
    const looksLikeCitationOnly =
      /^(Gv|Mc|Mt|Lc|Gesù)\s*\d/i.test(t) &&
      !/\bIn quel tempo\b|\bIn quei giorni\b/i.test(t) &&
      t.length < 220;
    if (looksLikeCitationOnly) return false;
  }
  return true;
}

/** Letture proprie inline nel lezionario (non riferimenti al Comune o citazioni vuote). */
export function hasInlineProperReadings(entry: SaintLectionaryEntry): boolean {
  const pl = entry.readings.find((r) => r.type === "prima_lettura");
  const vg = entry.readings.find((r) => r.type === "vangelo");
  if (!pl || !vg) return false;
  return isSubstantiveScriptureReading(pl) && isSubstantiveScriptureReading(vg);
}

/** Chiave di confronto titoli santo (ignora Santi/San, virgole, suffissi comuni). */
export function saintMatchKey(title: string): string {
  return normalizeSaintTitle(title)
    .replace(SAINT_PREFIX_RE, "")
    .replace(SAINT_SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findEntryForSaint(mmdd: string, saintTitle: string): SaintLectionaryEntry | null {
  const dayEntries = DATA.entries[mmdd];
  if (!dayEntries) return null;
  const key = normalizeSaintTitle(saintTitle);
  if (dayEntries[key]) return dayEntries[key];

  const matchKey = saintMatchKey(saintTitle);
  if (matchKey) {
    for (const [k, entry] of Object.entries(dayEntries)) {
      if (saintMatchKey(k) === matchKey || saintMatchKey(entry.saintTitle) === matchKey) {
        return entry;
      }
    }
    const fuzzy = Object.entries(dayEntries).find(([k, entry]) => {
      const mk = saintMatchKey(k);
      const emk = saintMatchKey(entry.saintTitle);
      return (
        (mk.length >= 8 && matchKey.length >= 8 && (mk.includes(matchKey) || matchKey.includes(mk))) ||
        (emk.length >= 8 && matchKey.length >= 8 && (emk.includes(matchKey) || matchKey.includes(emk)))
      );
    });
    if (fuzzy) return fuzzy[1];
  }

  const legacyFuzzy = Object.entries(dayEntries).find(([k]) => k.includes(key) || key.includes(k));
  return legacyFuzzy ? legacyFuzzy[1] : null;
}

export function getSaintLectionaryForDate(
  date: Date | string,
  saintTitle?: string,
): SaintLectionaryEntry[] {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  const mmdd = mmddFromDate(d);
  const dayEntries = DATA.entries[mmdd];
  if (!dayEntries) return [];

  if (saintTitle) {
    const one = findEntryForSaint(mmdd, saintTitle);
    return one ? [one] : [];
  }
  return Object.values(dayEntries);
}

function scraperHasSaintProperReadings(
  liturgy: Liturgy,
  saintTitle: string,
  entry: SaintLectionaryEntry,
): boolean {
  const normLiturgy = normalizeSaintTitle(liturgy.title || "");
  const saintCore = saintMatchKey(saintTitle).split(" ").find((w) => w.length >= 4);
  if (!saintCore) return false;
  if (!normLiturgy.includes(saintCore)) return false;

  const scraperV = liturgy.readings?.find((r) => r.type === "vangelo");
  const lecV = entry.readings.find((r) => r.type === "vangelo");
  if (!scraperV?.text || !lecV?.text) return false;

  const sv = normalizeCompareText(scraperV.text);
  const lv = normalizeCompareText(lecV.text);
  if (sv.length < 40 || lv.length < 40) return false;
  return sv.slice(0, 60) === lv.slice(0, 60) || sv.includes(lv.slice(0, 40)) || lv.includes(sv.slice(0, 40));
}

/** True when the Messa screen may offer "Letture proprie" from the lezionario. */
export function shouldOfferSaintProperToggle(liturgy: Liturgy | null | undefined): boolean {
  if (!liturgy?.date) return false;
  const d = parseLocalDate(liturgy.date);
  const mmdd = mmddFromDate(d);
  const dayEntries = DATA.entries[mmdd];
  if (!dayEntries) return false;

  const candidates = (liturgy.saints || []).filter((s) => s.rank === MEMORIA_OBBLIGATORIA);
  if (candidates.length === 0) return false;

  for (const saint of candidates) {
    const entry = findEntryForSaint(mmdd, saint.title);
    if (!entry || !hasInlineProperReadings(entry)) continue;
    if (scraperHasSaintProperReadings(liturgy, saint.title, entry)) continue;
    return true;
  }
  return false;
}

/** Replace reading blocks with lezionario propri when toggle is ON; keep antifone/colletta from scraper. */
export function mergeSaintReadingsIntoLiturgy(
  liturgy: Liturgy,
  useSaintProper: boolean,
): Liturgy {
  if (!useSaintProper || !liturgy.date) return liturgy;

  const d = parseLocalDate(liturgy.date);
  const mmdd = mmddFromDate(d);
  let entry: SaintLectionaryEntry | null = null;

  for (const saint of liturgy.saints || []) {
    if (saint.rank !== MEMORIA_OBBLIGATORIA) continue;
    const found = findEntryForSaint(mmdd, saint.title);
    if (found && hasInlineProperReadings(found)) {
      entry = found;
      break;
    }
  }
  if (!entry) return liturgy;

  const kept = (liturgy.readings || []).filter((r) => !READING_TYPES_TO_REPLACE.has(r.type));
  const merged = [...kept, ...entry.readings];
  const order = [
    "antifona_ingresso", "colletta", "prima_lettura", "salmo", "seconda_lettura",
    "sequenza", "acclamazione", "vangelo", "sulle_offerte", "antifona_comunione", "dopo_comunione",
  ];
  merged.sort((a, b) => {
    const ia = order.indexOf(a.type);
    const ib = order.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return { ...liturgy, readings: merged };
}

export function getSaintLectionaryMeta() {
  return DATA.meta;
}
