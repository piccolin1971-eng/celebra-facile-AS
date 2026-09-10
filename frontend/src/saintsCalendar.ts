/**
 * Calendario santi e colore liturgico del giorno.
 * Foglia: non importa scraper, vigilie né il calendario mensile.
 */
import saintsCalendarArr from "./data/saintsCalendar.json";
import { liturgicalColorFromMoveableFeastTitle } from "./liturgicalColorUtils";
import { getLiturgicalSeason } from "./liturgicalDates";

export type SaintEntry = { title: string; rank: string; color: string; votive_mass?: string };

export const LITURGICAL_COLOR_HEX: Record<string, string> = {
  verde: "#1B5E20",
  viola: "#4A148C",
  bianco: "#D4AF37",
  rosso: "#B71C1C",
  rosa: "#AD1457",
};

/**
 * Feste del Signore (e Dedicazione Lateranense): di domenica prevalgono sulla
 * domenica del Tempo Ordinario / Natale. Le altre «feste» (santi, apostoli,
 * patroni d'Europa, ecc.) cedono alla domenica.
 */
export function isLordFeastTitle(title: string): boolean {
  const t = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    /presentazione del signore/.test(t) ||
    /trasfigurazione/.test(t) ||
    /esaltazione.*croce|santa croce/.test(t) ||
    /battesimo del signore/.test(t) ||
    /dedicazione.*lateran/.test(t)
  );
}

/** Una festa del calendario santi è visibile oggi (colore / banner)? */
export function isCalendarFeastObservedOnDate(
  entry: { title: string; rank: string },
  date: Date,
  seasonName: string,
): boolean {
  const isSunday = date.getDay() === 0;
  const isLentOrAdvent = seasonName === "Avvento" || seasonName === "Quaresima";

  if (entry.rank === "solennita") return true;
  if (entry.rank === "memoria_facoltativa") return false;
  if (entry.rank === "memoria_obbligatoria") {
    // In Avvento/Quaresima e di domenica la memoria obbligatoria non prevale.
    return !isSunday && !isLentOrAdvent;
  }
  if (entry.rank === "festa") {
    if (!isSunday) return true;
    return isLordFeastTitle(entry.title);
  }
  return false;
}

export function calculateLiturgicalColor(
  season: { season: string; color: string; color_hex: string },
  saints: SaintEntry[],
  celebrationTitle?: string,
  date?: Date,
): { color: string; color_hex: string } {
  const rankPriority: Record<string, number> = {
    solennita: 1,
    festa: 2,
    memoria_obbligatoria: 3,
    memoria_facoltativa: 4,
  };

  let best: SaintEntry | null = null;
  for (const s of saints) {
    if (!best || rankPriority[s.rank] < rankPriority[best.rank]) {
      best = s;
    }
  }

  const candidates: Array<{ color: string; rank: number }> = [
    { color: season.color, rank: 99 },
  ];

  if (best && date && isCalendarFeastObservedOnDate(best, date, season.season)) {
    candidates.push({ color: best.color, rank: rankPriority[best.rank] });
  } else if (best && !date && (best.rank === "solennita" || best.rank === "festa")) {
    // Senza data (casi rari): mantieni comportamento storico solennità/festa.
    candidates.push({ color: best.color, rank: rankPriority[best.rank] });
  }

  const moveableColor = liturgicalColorFromMoveableFeastTitle(celebrationTitle);
  if (moveableColor) {
    candidates.push({ color: moveableColor, rank: rankPriority.solennita });
  }

  const winner = candidates.reduce((a, b) => (a.rank < b.rank ? a : b));
  return {
    color: winner.color,
    color_hex: LITURGICAL_COLOR_HEX[winner.color] || season.color_hex,
  };
}

const SAINTS_MAP: Record<string, SaintEntry[]> = (() => {
  const out: Record<string, SaintEntry[]> = {};
  for (const e of saintsCalendarArr as Array<{ date: string; celebrations: SaintEntry[] }>) {
    out[e.date] = e.celebrations;
  }
  return out;
})();

export function getSaintsForDate(d: Date): SaintEntry[] {
  const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return SAINTS_MAP[key] || [];
}

/** Santi/feste del calendario effettivamente celebrabili in quella data (dopo precedenze). */
export function getObservedSaintsForDate(d: Date): SaintEntry[] {
  const season = getLiturgicalSeason(d);
  return getSaintsForDate(d).filter((s) => isCalendarFeastObservedOnDate(s, d, season.season));
}

export function getAllSaintsCalendar(): Array<{ date: string; celebrations: SaintEntry[] }> {
  return saintsCalendarArr as Array<{ date: string; celebrations: SaintEntry[] }>;
}
