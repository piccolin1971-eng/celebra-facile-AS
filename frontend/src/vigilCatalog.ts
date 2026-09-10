/**
 * Vigilia vespertina delle solennità (Primi Vespri la sera precedente).
 * Catalogo per sapere quando offrire scelta liturgica (fasi successive).
 * Fase 1: usato per default «Messa del giorno» su CEI/scraper.
 */
import { addDays, localDateStr, parseLocalDate } from "./dateUtils";
import { getSaintsForDate } from "./saintsCalendar";
import { getMoveableFeastsForYear } from "./moveableFeasts";

export type VigilEveContext = {
  /** Data di calendario della vigilia (sera). */
  vigilDateISO: string;
  /** Data di calendario della solennità (giorno festivo). */
  solemnityDateISO: string;
  solemnityTitle: string;
  /** Messale: testi propri «Messa vespertina nella vigilia». */
  hasVigilProper: boolean;
};

/** Solennità con Messa vespertina propria nel Messale Romano. */
const VIGIL_PROPER_TITLE_KEYS: string[] = [
  "nativita del signore",
  "natale del signore",
  "epifania",
  "ascensione",
  "pentecoste",
  "giovanni battista",
  "pietro e paolo",
  "assunzione",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleHasVigilProper(solemnityTitle: string): boolean {
  const t = norm(solemnityTitle);
  return VIGIL_PROPER_TITLE_KEYS.some((k) => t.includes(k));
}

function solemnityOnDate(d: Date): { title: string } | null {
  const iso = localDateStr(d);
  const saints = getSaintsForDate(d);
  const sol = saints.find((s) => s.rank === "solennita");
  if (sol) return { title: sol.title };

  const moveable = getMoveableFeastsForYear(d.getFullYear()).get(iso);
  if (moveable?.rank === "solennita") return { title: moveable.title };

  return null;
}

/**
 * True se `dateISO` è la vigilia vespertina della solennità che inizia il giorno dopo.
 */
export function getVigilEveContext(date: Date): VigilEveContext | null {
  const tomorrow = addDays(date, 1);
  const solemnity = solemnityOnDate(tomorrow);
  if (!solemnity) return null;

  return {
    vigilDateISO: localDateStr(date),
    solemnityDateISO: localDateStr(tomorrow),
    solemnityTitle: solemnity.title,
    hasVigilProper: titleHasVigilProper(solemnity.title),
  };
}

export function getVigilEveContextForISO(dateISO: string): VigilEveContext | null {
  return getVigilEveContext(parseLocalDate(dateISO));
}

/** Breve testo per banner informativo in home (fase 1). */
export function vigilEveBannerMessage(ctx: VigilEveContext): string {
  if (ctx.hasVigilProper) {
    return `La sera del ${formatShortIt(ctx.vigilDateISO)} puoi celebrare la Messa vespertina nella vigilia di ${ctx.solemnityTitle}. Scegli la liturgia in «Scegli la liturgia».`;
  }
  return `La sera del ${formatShortIt(ctx.vigilDateISO)}, dopo i Primi Vespri, inizia ${ctx.solemnityTitle}. Puoi preparare la Messa del giorno o della solennità.`;
}

function formatShortIt(iso: string): string {
  const d = parseLocalDate(iso);
  const months = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
