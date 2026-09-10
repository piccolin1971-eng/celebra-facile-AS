/**
 * Date liturgiche calcolabili senza chiesacattolica.it.
 * Quando la CEI pubblica il giorno, il titolo della pagina (es. «II DOMENICA DI AVVENTO - ANNO A»)
 * deve coincidere con numberedSeasonSundayTitle; se la pagina è ancora vuota, resta questo calcolo.
 */
import { addDays } from "./dateUtils";

const COLOR_MAP: Record<string, string> = {
  verde: "#1B5E20",
  viola: "#4A148C",
  bianco: "#D4AF37",
  rosso: "#B71C1C",
  rosa: "#AD1457",
};

const ROMAN = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
  "XXI",
  "XXII",
  "XXIII",
  "XXIV",
  "XXV",
  "XXVI",
  "XXVII",
  "XXVIII",
  "XXIX",
  "XXX",
  "XXXI",
  "XXXII",
  "XXXIII",
  "XXXIV",
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((b0 - a0) / 86_400_000);
}

/** Pasqua domenica (calendario gregoriano, stesso algoritmo del calendario mensile). */
export function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Prima domenica di Avvento: la domenica più vicina al 30 novembre (27 nov–3 dic). */
export function firstAdventSunday(year: number): Date {
  const nov30 = new Date(year, 10, 30);
  const dow = nov30.getDay();
  const delta = dow <= 3 ? -dow : 7 - dow;
  return addDays(nov30, delta);
}

/**
 * Ciclo A/B/C: dalla Prima di Avvento fino al Cristo Re successivo.
 * Advent 2025–Cristo Re 2026 = A; Advent 2026 = B; Advent 2024 = C.
 */
export function liturgicalYearLetter(d: Date): "A" | "B" | "C" {
  const day = startOfDay(d);
  const y = day.getFullYear();
  const adventYear = day.getTime() >= firstAdventSunday(y).getTime() ? y : y - 1;
  const rem = adventYear % 3;
  return rem === 0 ? "A" : rem === 1 ? "B" : "C";
}

export function getLiturgicalSeason(d: Date): { season: string; color: string; color_hex: string } {
  const day = startOfDay(d);
  const y = day.getFullYear();
  const m = day.getMonth() + 1;
  const dateNum = day.getDate();
  const t = day.getTime();
  const adventStart = firstAdventSunday(y).getTime();
  const christmas = new Date(y, 11, 25).getTime();
  if (t >= adventStart && t < christmas)
    return { season: "Avvento", color: "viola", color_hex: COLOR_MAP.viola };
  if (t >= christmas || (m === 1 && dateNum <= 13))
    return { season: "Natale", color: "bianco", color_hex: COLOR_MAP.bianco };

  const easter = computeEasterSunday(y);
  const ash = addDays(easter, -46).getTime();
  const pentecost = addDays(easter, 49).getTime();
  if (t >= ash && t < easter.getTime())
    return { season: "Quaresima", color: "viola", color_hex: COLOR_MAP.viola };
  if (t >= easter.getTime() && t <= pentecost)
    return { season: "Pasqua", color: "bianco", color_hex: COLOR_MAP.bianco };
  return { season: "Tempo Ordinario", color: "verde", color_hex: COLOR_MAP.verde };
}

function numberedSundayLine(week: number, rest: string, date: Date): string {
  const roman = ROMAN[week] || String(week);
  return `Domenica ${roman} ${rest} - Anno ${liturgicalYearLetter(date)}`;
}

/**
 * Domeniche numerate di Avvento (I–IV), Quaresima (I–V), Pasqua (II–VI).
 * Palme, Pasqua, Ascensione (in Italia la VII) e Pentecoste restano alle feste mobili.
 * Stesso schema dei titoli CEI («II DOMENICA DI AVVENTO - ANNO A»).
 */
export function numberedSeasonSundayTitle(d: Date): string | null {
  if (d.getDay() !== 0) return null;
  const day = startOfDay(d);
  const y = day.getFullYear();

  const advent = firstAdventSunday(y);
  const christmas = new Date(y, 11, 25);
  if (day.getTime() >= advent.getTime() && day.getTime() < christmas.getTime()) {
    const week = daysBetween(advent, day) / 7 + 1;
    if (week >= 1 && week <= 4) return numberedSundayLine(week, "di Avvento", day);
  }

  const easter = computeEasterSunday(y);
  const lent1 = addDays(easter, -42);
  const palm = addDays(easter, -7);
  if (day.getTime() >= lent1.getTime() && day.getTime() < palm.getTime()) {
    const week = daysBetween(lent1, day) / 7 + 1;
    if (week >= 1 && week <= 5) return numberedSundayLine(week, "di Quaresima", day);
  }

  const pentecost = addDays(easter, 49);
  const ascension = addDays(easter, 42);
  if (day.getTime() > easter.getTime() && day.getTime() < pentecost.getTime() && day.getTime() !== ascension.getTime()) {
    const week = daysBetween(easter, day) / 7 + 1;
    if (week === 2) {
      return numberedSundayLine(week, "di Pasqua o della Divina Misericordia", day);
    }
    if (week >= 3 && week <= 7) return numberedSundayLine(week, "di Pasqua", day);
  }

  return null;
}
