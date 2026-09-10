/**
 * Giorni del mese per la schermata Calendario: tutti i giorni 1–31 con titolo, rank e colore.
 */
import { localDateStr, parseLocalDate } from "./dateUtils";
import {
  getLiturgicalSeason,
  numberedSeasonSundayTitle,
} from "./liturgicalDates";
import { normalizeScrapedLiturgicalColor } from "./liturgicalColorUtils";
import { shouldSuppressFacultativeMemory } from "./liturgicalCelebrationUtils";
import {
  calculateLiturgicalColor,
  getSaintsForDate,
  isCalendarFeastObservedOnDate,
} from "./saintsCalendar";
import { getMoveableFeastsForYear, type MoveableFeast } from "./moveableFeasts";

export { computeEasterSunday } from "./liturgicalDates";
export { getMoveableFeastsForYear } from "./moveableFeasts";

export type CalendarDayEntry = {
  dateISO: string;
  dayNum: number;
  weekdayShort: string;
  rankLabel: string;
  title: string;
  liturgicalColor: string;
};

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

const RANK_PRIORITY: Record<string, number> = {
  solennita: 1,
  festa: 2,
  memoria_obbligatoria: 3,
  memoria_facoltativa: 4,
};

export function rankLabelForRank(rank: string): string {
  switch (rank) {
    case "solennita":
      return "Solennità";
    case "festa":
      return "Festa";
    case "memoria_obbligatoria":
      return "Memoria";
    case "memoria_facoltativa":
      return "Mem. facoltativa";
    case "domenica":
      return "Domenica";
    case "feria":
      return "Feria";
    default:
      return rank;
  }
}

function pickBestSaint(saints: ReturnType<typeof getSaintsForDate>) {
  let best: (typeof saints)[0] | null = null;
  for (const s of saints) {
    if (!best || (RANK_PRIORITY[s.rank] ?? 99) < (RANK_PRIORITY[best.rank] ?? 99)) {
      best = s;
    }
  }
  return best;
}

function rankLabelFromTitle(title: string, fallback: string): string {
  const t = title.toLowerCase();
  if (t.includes("solennit")) return "Solennità";
  if (/\bfesta\b/.test(t)) return "Festa";
  if (t.includes("memoria")) return "Memoria";
  if (t.includes("domenica")) return "Domenica";
  return fallback;
}

/** Anno liturgico di riferimento per un mese (es. giugno già passato → anno prossimo). */
export function yearForMonthView(month: number, ref: Date = new Date()): number {
  const y = ref.getFullYear();
  if (month < ref.getMonth() + 1) return y + 1;
  return y;
}

export function buildCalendarDayEntry(d: Date, moveable: Map<string, MoveableFeast>): CalendarDayEntry {
  const dateISO = localDateStr(d);
  const season = getLiturgicalSeason(d);
  const saints = getSaintsForDate(d);
  const isSunday = d.getDay() === 0;
  const moveableFeast = moveable.get(dateISO);
  const bestSaint = pickBestSaint(saints);

  let rankLabel = "Feria";
  let title = season.season;
  let celebrationTitle = moveableFeast?.title;

  if (moveableFeast) {
    rankLabel = rankLabelForRank(moveableFeast.rank);
    title = moveableFeast.title;
  } else if (bestSaint && isCalendarFeastObservedOnDate(bestSaint, d, season.season)) {
    rankLabel = rankLabelForRank(bestSaint.rank);
    title = bestSaint.title;
    celebrationTitle = bestSaint.title;
  } else if (isSunday) {
    rankLabel = "Domenica";
    title =
      numberedSeasonSundayTitle(d) ||
      (season.season === "Tempo Ordinario"
        ? "Domenica del Tempo Ordinario"
        : `Domenica di ${season.season}`);
  }

  const { color } = calculateLiturgicalColor(season, saints, celebrationTitle, d);

  return {
    dateISO,
    dayNum: d.getDate(),
    weekdayShort: WEEKDAY_SHORT[d.getDay()],
    rankLabel,
    title,
    liturgicalColor: color,
  };
}

export function buildMonthCalendarDays(year: number, month: number): CalendarDayEntry[] {
  const moveable = getMoveableFeastsForYear(year);
  const daysInMonth = new Date(year, month, 0).getDate();
  const out: CalendarDayEntry[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    out.push(buildCalendarDayEntry(new Date(year, month - 1, day), moveable));
  }
  return out;
}

/** Arricchisce con titoli/colore da letture CEI in cache (se presenti). */
export async function enrichMonthFromCachedLiturgy(
  days: CalendarDayEntry[],
  loadCached: (dateISO: string) => Promise<{ title?: string; liturgical_color?: string } | null>,
): Promise<CalendarDayEntry[]> {
  return Promise.all(
    days.map(async (day) => {
      try {
        const cached = await loadCached(day.dateISO);
        if (!cached?.title?.trim() && !cached?.liturgical_color?.trim()) return day;
        const d = parseLocalDate(day.dateISO);
        const season = getLiturgicalSeason(d);
        const saints = getSaintsForDate(d);
        const ceiColorRaw = normalizeScrapedLiturgicalColor(cached?.liturgical_color);
        const suppressFacultative = cached?.title?.trim()
          ? shouldSuppressFacultativeMemory(cached.title, season.season, d)
          : false;
        const celebrationTitle = suppressFacultative ? undefined : cached?.title;
        const { color: fallbackColor } = calculateLiturgicalColor(
          season,
          saints,
          celebrationTitle,
          d,
        );
        const ceiColor = suppressFacultative ? null : ceiColorRaw;
        const title = cached?.title?.trim() ? cached.title : day.title;
        return {
          ...day,
          title,
          rankLabel: cached?.title?.trim()
            ? rankLabelFromTitle(cached.title, day.rankLabel)
            : day.rankLabel,
          liturgicalColor: ceiColor ?? fallbackColor,
        };
      } catch {
        return day;
      }
    }),
  );
}
