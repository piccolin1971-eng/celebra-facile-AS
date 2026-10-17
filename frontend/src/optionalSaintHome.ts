import { formatCelebrationTitle, parseBannerCelebration } from "./homeBannerUtils";
import { getLiturgicalSeason } from "./localLiturgy";
import { optionalSaintLiturgicalColor } from "./optionalSaintLiturgyBundles";
import type { OptionalSaintEntry } from "./optionalSaints";
import { getEnabledOptionalSaintForDate, optionalSaintBannerTitle } from "./optionalSaints";
import type { OptionalSaintLinePick } from "./optionalSaintLinePick";

export type OptionalSaintHomeResolution = {
  saint: OptionalSaintEntry | null;
  /** Liturgia effettiva per Celebra / banner principale. */
  activeLine: OptionalSaintLinePick;
  /** Mostra i due tasti CEI vs santo scelto. */
  showLineChoice: boolean;
  /** Titolo CEI di calendario (per scelta o fallback). */
  calendarBannerTitle: string;
  /** Titolo banner se linea = optional. */
  optionalBannerTitle: string;
};

const STRONG_RANKS = new Set(["Solennità", "Festa", "Memoria", "Domenica"]);

function calendarHasStrongCelebration(ceiTitle: string, date: Date): boolean {
  const season = getLiturgicalSeason(date).season;
  const parsed = parseBannerCelebration(ceiTitle, season, date);
  return STRONG_RANKS.has(parsed.rankLabel);
}

/**
 * Risolve banner e linea liturgica quando «Usa la mia selezione» è attiva.
 * Con switch spento o nessuno santo per il giorno → activeLine calendar, saint null.
 */
export function resolveOptionalSaintHome(
  args: {
    useSelection: boolean;
    selectedByMonthDay: Record<string, string>;
    date: Date;
    dateISO: string;
    calendarCeiTitle: string;
    savedLinePick: OptionalSaintLinePick | null;
  },
): OptionalSaintHomeResolution {
  const calendarBannerTitle = (args.calendarCeiTitle || "").trim();
  const optionalBannerTitle = "";
  const base: OptionalSaintHomeResolution = {
    saint: null,
    activeLine: "calendar",
    showLineChoice: false,
    calendarBannerTitle,
    optionalBannerTitle,
  };

  if (!args.useSelection) return base;

  const saint = getEnabledOptionalSaintForDate(args.date, args.selectedByMonthDay);
  if (!saint) return base;

  const optTitle = optionalSaintBannerTitle(saint);
  const conflict = calendarHasStrongCelebration(calendarBannerTitle, args.date);

  if (!conflict) {
    const activeLine: OptionalSaintLinePick = args.savedLinePick ?? "optional";
    return {
      saint,
      activeLine,
      showLineChoice: false,
      calendarBannerTitle,
      optionalBannerTitle: optTitle,
    };
  }

  const activeLine: OptionalSaintLinePick = args.savedLinePick ?? "calendar";
  return {
    saint,
    activeLine,
    showLineChoice: true,
    calendarBannerTitle,
    optionalBannerTitle: optTitle,
  };
}

export function homeBannerTitleFromResolution(res: OptionalSaintHomeResolution): string {
  if (res.activeLine === "optional" && res.saint) {
    return res.optionalBannerTitle;
  }
  return res.calendarBannerTitle;
}

/** Colore banner/striscia quando la linea attiva è il santo scelto in impostazioni. */
export function optionalSaintHomeLiturgicalColor(res: OptionalSaintHomeResolution): string | null {
  if (res.activeLine !== "optional" || !res.saint) return null;
  return optionalSaintLiturgicalColor(res.saint.id);
}

export type OptionalSaintStripOverlay = {
  liturgicalColor: string;
  subtitle: string;
};

function optionalSaintAppliesOnStrip(args: {
  useSelection: boolean;
  selectedByMonthDay: Record<string, string>;
  date: Date;
  calendarCeiTitle: string;
  savedLinePick: OptionalSaintLinePick | null;
  isSelectedDate: boolean;
}): OptionalSaintEntry | null {
  if (!args.useSelection) return null;
  const saint = getEnabledOptionalSaintForDate(args.date, args.selectedByMonthDay);
  if (!saint) return null;
  const conflict = calendarHasStrongCelebration(args.calendarCeiTitle, args.date);
  if (!conflict) {
    if (args.savedLinePick === "calendar") return null;
    return saint;
  }
  if (args.savedLinePick === "optional") return saint;
  return null;
}

/**
 * Colore e nome nella striscia giorni Home (santo senza conflitto CEI, o chip «Santo scelto»).
 */
export function optionalSaintStripOverlay(args: {
  useSelection: boolean;
  selectedByMonthDay: Record<string, string>;
  date: Date;
  calendarCeiTitle: string;
  savedLinePick: OptionalSaintLinePick | null;
  isSelectedDate: boolean;
}): OptionalSaintStripOverlay | null {
  const saint = optionalSaintAppliesOnStrip(args);
  if (!saint) return null;
  const color = optionalSaintLiturgicalColor(saint.id);
  if (!color) return null;
  return {
    liturgicalColor: color,
    subtitle: formatCelebrationTitle(saint.title),
  };
}

export function emptyOptionalSaintHomeResolution(calendarTitle: string): OptionalSaintHomeResolution {
  return {
    saint: null,
    activeLine: "calendar",
    showLineChoice: false,
    calendarBannerTitle: calendarTitle,
    optionalBannerTitle: "",
  };
}
