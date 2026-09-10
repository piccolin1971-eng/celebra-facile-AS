import { getLiturgicalSeason } from "../liturgicalDates";
import { italianDateLabel, parseLocalDate } from "../dateUtils";
import { LITURGICAL_COLOR_HEX } from "../saintsCalendar";
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

function romanWeek(title: string): number | null {
  const m = title.match(/\b(X{0,3}(?:IX|IV|V?I{0,3}))\s+settimana/i);
  if (!m) return null;
  const n = ROMAN[m[1].toUpperCase()];
  return n || null;
}

export function hourHeadMeta(dateISO: string, ceiTitle = ""): DayHoursMeta {
  const d = parseLocalDate(dateISO);
  const dateLabel = italianDateLabel(d);
  const title = ceiTitle.trim();
  const week = romanWeek(title);
  let seasonLine = title
    .replace(/\s+/g, " ")
    .replace(/tempo ordinario/gi, "T.O.")
    .replace(/^.*?(\b[IVX]+\s+settimana\b.*)$/i, "$1");
  if (week && /T\.O\.|ordinario/i.test(title)) {
    seasonLine = `${Object.keys(ROMAN).find((k) => ROMAN[k] === week) || week} settimana T.O.`;
  } else if (!title) {
    const season = getLiturgicalSeason(d).season;
    seasonLine = season === "Tempo Ordinario" ? "Tempo Ordinario" : season;
  } else if (seasonLine.length > 80) {
    seasonLine = title.slice(0, 80);
  }
  let psalterLine = "";
  if (week) {
    const p = week % 4 === 0 ? 4 : week % 4;
    psalterLine = `${ROMAN_OUT[p]} settimana del salterio`;
  }
  const season = getLiturgicalSeason(d);
  const colorHex =
    season.season === "Tempo Ordinario"
      ? "#1b5e20"
      : LITURGICAL_COLOR_HEX[season.color] || season.color_hex;
  return { dateLabel, seasonLine, psalterLine, colorHex };
}
