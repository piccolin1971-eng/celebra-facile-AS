import { getLiturgicalSeason } from "../liturgicalDates";
import { italianDateLabel, parseLocalDate } from "../dateUtils";
import { calculateLiturgicalColor, getSaintsForDate, LITURGICAL_COLOR_HEX } from "../saintsCalendar";
import type { DayHoursMeta } from "./types";

const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
  XVI: 16,
  XVII: 17,
  XVIII: 18,
  XIX: 19,
  XX: 20,
  XXI: 21,
  XXII: 22,
  XXIII: 23,
  XXIV: 24,
  XXV: 25,
  XXVI: 26,
  XXVII: 27,
  XXVIII: 28,
  XXIX: 29,
  XXX: 30,
  XXXI: 31,
  XXXII: 32,
  XXXIII: 33,
  XXXIV: 34,
};

const ROMAN_OUT = ["", "I", "II", "III", "IV"];

const SMALL = new Set([
  "a",
  "ad",
  "al",
  "alla",
  "alle",
  "ai",
  "agli",
  "allo",
  "con",
  "da",
  "dal",
  "dalla",
  "dalle",
  "dai",
  "dagli",
  "dallo",
  "de",
  "dei",
  "del",
  "della",
  "delle",
  "dello",
  "degli",
  "di",
  "e",
  "ed",
  "il",
  "in",
  "i",
  "gli",
  "la",
  "le",
  "lo",
  "nel",
  "nella",
  "nelle",
  "nello",
  "nei",
  "negli",
  "o",
  "per",
  "propria",
  "su",
  "un",
  "una",
  "uno",
]);

function isRomanNumeral(w: string): boolean {
  return /^(X{0,3}(?:IX|IV|V?I{0,3}))$/i.test(w) && w.length >= 1 && w.length <= 6;
}

function capToken(w: string): string {
  return w.toLowerCase().replace(/(^|['’])([a-zàèéìíîòóùú])/g, (_m, a, c) => a + String(c).toUpperCase());
}

/** Titolo liturgico leggibile: niente T.O., niente tutto-maiuscolo CEI. */
export function formatHourHeadLine(s: string): string {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return t;
  t = t.replace(/\bT\.O\.?\s*$/i, "Tempo Ordinario");
  t = t.replace(/\b(settimana|domenica)\s+Tempo Ordinario\b/i, "$1 del Tempo Ordinario");
  return t
    .split(" ")
    .map((w, i) => {
      if (isRomanNumeral(w)) return w.toUpperCase();
      const low = w.toLowerCase();
      if (i > 0 && SMALL.has(low)) return low;
      return capToken(w);
    })
    .join(" ");
}

function romanOf(token: string): number | null {
  const n = ROMAN[token.toUpperCase()];
  return n || null;
}

function psalterFromText(text: string): string {
  const m = text.match(/\b(I{1,3}|IV)\s+settimana del salterio/i);
  if (m) return `${m[1].toUpperCase()} settimana del salterio`;
  if (/liturgia propria/i.test(text)) return "Liturgia propria";
  return "";
}

function ordinaryWeekFromText(text: string): { n: number; sunday: boolean } | null {
  const m = text.match(
    /\b(X{0,3}(?:IX|IV|V?I{0,3}))\s+(settimana|domenica) del tempo ordinario/i,
  );
  if (!m) return null;
  const n = romanOf(m[1]);
  if (!n) return null;
  return { n, sunday: /^domenica$/i.test(m[2]) };
}

function feastNameFromBanner(title: string): string {
  const parts = title.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  const head = parts[0] || title;
  if (/settimana/i.test(head)) return "";
  return head.replace(/\s+/g, " ").trim();
}

export function hourHeadMeta(dateISO: string, ceiTitle = "", hoursBanner = ""): DayHoursMeta {
  const d = parseLocalDate(dateISO);
  const dateLabel = italianDateLabel(d);
  const title = (hoursBanner || ceiTitle).trim();
  const feast = feastNameFromBanner(title);
  const ranked = /memoria|festa|solennit/i.test(title);
  const to = ordinaryWeekFromText(title);
  let seasonLine = "";
  let psalterLine = psalterFromText(title);

  if (ranked && feast) {
    seasonLine = feast;
  } else if (to) {
    const roman = Object.keys(ROMAN).find((k) => ROMAN[k] === to.n) || String(to.n);
    seasonLine = to.sunday
      ? `${roman} domenica del Tempo Ordinario`
      : `${roman} settimana del Tempo Ordinario`;
  } else if (title) {
    seasonLine = title.replace(/\s+/g, " ");
    if (seasonLine.length > 80) seasonLine = title.slice(0, 80);
  } else {
    const seasonName = getLiturgicalSeason(d).season;
    seasonLine = seasonName === "Tempo Ordinario" ? "Tempo Ordinario" : seasonName;
  }

  if (!psalterLine && to) {
    const p = to.n % 4 === 0 ? 4 : to.n % 4;
    psalterLine = `${ROMAN_OUT[p]} settimana del salterio`;
  }

  const season = getLiturgicalSeason(d);
  const color = calculateLiturgicalColor(season, getSaintsForDate(d), title || seasonLine, d);
  const colorHex = color.color_hex || LITURGICAL_COLOR_HEX[season.color] || season.color_hex;
  return {
    dateLabel,
    seasonLine: formatHourHeadLine(seasonLine),
    psalterLine: formatHourHeadLine(psalterLine),
    colorHex,
  };
}
