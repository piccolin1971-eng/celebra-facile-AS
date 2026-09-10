/**
 * Provider locale per tutti i dati liturgici.
 * Sostituisce completamente il backend FastAPI: i testi statici sono bundlati nell'APK
 * e le letture del giorno vengono scaricate direttamente da chiesacattolica.it.
 */
import { scrapeLiturgy } from "./liturgyScraper";
import type { CelebrationMode } from "./massSession";
import {
  normalizeScrapedLiturgicalColor,
  celebrationTitlesMatch,
  isVigilOrVespertineMass,
} from "./liturgicalColorUtils";
import { shouldSuppressFacultativeMemory } from "./liturgicalCelebrationUtils";
import { getVigilEveContext } from "./vigilCatalog";
import { localDateStr, italianDateLabel as italianDateLabelUtil, parseLocalDate } from "./dateUtils";

// Import dati statici bundlati nell'APK
import fixedParts from "./data/fixedParts.json";
import massOrder from "./data/massOrder.json";
import eucharisticPrayers from "./data/eucharisticPrayers.json";
import eucharisticPrayersChildren from "./data/eucharisticPrayersChildren.json";
import mysteryAcclamations from "./data/mysteryAcclamations.json";
import solemnBlessingsData from "./data/solemnBlessings.json";
import prefaces from "./data/prefaces.json";
import votiveMasses from "./data/votiveMasses.json";
import { getLiturgicalSeason } from "./liturgicalDates";
import {
  LITURGICAL_COLOR_HEX,
  calculateLiturgicalColor,
  getAllSaintsCalendar,
  getSaintsForDate,
  type SaintEntry,
} from "./saintsCalendar";

export { getLiturgicalSeason };
export {
  calculateLiturgicalColor,
  getObservedSaintsForDate,
  getSaintsForDate,
  isCalendarFeastObservedOnDate,
  isLordFeastTitle,
  type SaintEntry,
} from "./saintsCalendar";

// ===== Helpers date =====

const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function italianDateLabel(d: Date): string {
  const wd = (d.getDay() + 6) % 7; // 0=Lun
  return `${GIORNI[wd]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) throw new Error("Formato data non valido. Usare YYYY-MM-DD.");
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) throw new Error("Formato data non valido. Usare YYYY-MM-DD.");
  return dt;
}

/** Ricalcola colore liturgico (CEI primario; ignora bianco da memoria facoltativa alternativa). */
export function resolveLiturgicalColorForDay(
  date: Date,
  season: { season: string; color: string; color_hex: string },
  saints: SaintEntry[],
  ceiTitle?: string,
  scrapedColorRaw?: string,
): { color: string; color_hex: string } {
  const suppressFacultative = shouldSuppressFacultativeMemory(
    ceiTitle || "",
    season.season,
    date,
  );
  const celebrationTitle = suppressFacultative ? undefined : ceiTitle;
  const effective = calculateLiturgicalColor(season, saints, celebrationTitle, date);
  let scrapedColor = suppressFacultative
    ? null
    : normalizeScrapedLiturgicalColor(scrapedColorRaw);

  const ceiTitleLower = (ceiTitle || "").toLowerCase();
  const ceiIsSeasonOrOctaveDay =
    /\bdomenica\b/.test(ceiTitleLower) ||
    /\bottava\b/.test(ceiTitleLower) ||
    /fra l['’]ottava/.test(ceiTitleLower) ||
    /\bsettimana del tempo\b/.test(ceiTitleLower) ||
    /\bferia\b/.test(ceiTitleLower);

  // Cache vecchia: titolo feria/settimana ma colore bianco dal <title> CEI (memoria facoltativa).
  // Se il titolo CEI è già domenica/ottava/feria di stagione, il colore scrapato resta valido.
  if (
    scrapedColor &&
    scrapedColor !== effective.color &&
    !suppressFacultative &&
    !ceiIsSeasonOrOctaveDay
  ) {
    const t = ceiTitleLower;
    const ceiPrimaryWhite =
      (/\bmemoria\b/.test(t) && !/\bmemoria\s+facoltativa\b/.test(t)) ||
      t.includes("solennit") ||
      /\bfesta\b/.test(t) ||
      t.includes("cuore immacolato");
    if (!ceiPrimaryWhite) {
      scrapedColor = null;
    }
  }

  // CEI a volte indica bianco su memorie/feste di martiri (es. Kolbe 14/08).
  // Se il calendario locale dà rosso e il CEI un altro colore *sulla stessa
  // celebrazione*, preferiamo il rosso. Non correggere se il titolo CEI è
  // domenica/ottava/feria di stagione (lì prevale correttamente un altro colore).
  if (
    effective.color === "rosso" &&
    scrapedColor &&
    scrapedColor !== "rosso" &&
    !ceiIsSeasonOrOctaveDay
  ) {
    scrapedColor = null;
  }

  return scrapedColor
    ? { color: scrapedColor, color_hex: LITURGICAL_COLOR_HEX[scrapedColor] || effective.color_hex }
    : effective;
}

/** Metadati stagione/colore/santi coerenti con la modalità di celebrazione scelta. */
function liturgyMetadataForMode(
  vigilDate: Date,
  mode: CelebrationMode,
  scraped: { title: string; liturgical_color: string },
): {
  season: { season: string; color: string; color_hex: string };
  saints: SaintEntry[];
  liturgical_color: string;
} {
  const vigilEve = getVigilEveContext(vigilDate);
  let colorDate = vigilDate;
  let season = getLiturgicalSeason(vigilDate);
  let saints = getSaintsForDate(vigilDate);

  if (vigilEve && mode !== "calendar_day") {
    colorDate = parseDateStr(vigilEve.solemnityDateISO);
    season = getLiturgicalSeason(colorDate);
    saints = getSaintsForDate(colorDate);
  }

  const finalColor = resolveLiturgicalColorForDay(
    colorDate,
    season,
    saints,
    scraped.title,
    scraped.liturgical_color,
  );

  return {
    season: { ...season, color: finalColor.color, color_hex: finalColor.color_hex },
    saints,
    liturgical_color: finalColor.color,
  };
}

/** Applica regole colore/titolo a liturgia da cache (corregge dati salvati prima del fix). */
export function reconcileLiturgyColors(liturgy: Liturgy): Liturgy {
  const mode = liturgy.celebrationMode ?? "calendar_day";
  const d = parseDateStr(liturgy.date);
  const vigilEve = getVigilEveContext(d);
  let seasonBase = getLiturgicalSeason(d);
  let saints = liturgy.saints?.length ? liturgy.saints : getSaintsForDate(d);
  let colorDate = d;

  if (vigilEve && mode !== "calendar_day") {
    colorDate = parseDateStr(vigilEve.solemnityDateISO);
    seasonBase = getLiturgicalSeason(colorDate);
    saints = getSaintsForDate(colorDate);
  }

  let displayTitle = liturgy.title;
  if (
    mode === "calendar_day" &&
    shouldSuppressFacultativeMemory(displayTitle, seasonBase.season, d)
  ) {
    displayTitle = "";
  }

  const titleMatchesMode =
    !vigilEve ||
    mode === "calendar_day" ||
    (mode === "vigil_proper" &&
      (isVigilOrVespertineMass(displayTitle) ||
        celebrationTitlesMatch(displayTitle, vigilEve.solemnityTitle))) ||
    (mode === "solemnity_day" &&
      celebrationTitlesMatch(displayTitle, vigilEve.solemnityTitle) &&
      !isVigilOrVespertineMass(displayTitle));

  const colorTitle =
    vigilEve && mode !== "calendar_day" && !titleMatchesMode
      ? vigilEve.solemnityTitle
      : displayTitle;

  if (vigilEve && mode !== "calendar_day" && !titleMatchesMode) {
    displayTitle = vigilEve.solemnityTitle;
  }

  let scrapedColorRaw = liturgy.liturgical_color;
  if (vigilEve && mode !== "calendar_day" && !titleMatchesMode) {
    scrapedColorRaw = "";
  }

  const finalColor = resolveLiturgicalColorForDay(
    colorDate,
    seasonBase,
    saints,
    colorTitle,
    scrapedColorRaw,
  );
  return {
    ...liturgy,
    saints,
    title: displayTitle,
    season: { ...seasonBase, color: finalColor.color, color_hex: finalColor.color_hex },
    liturgical_color: finalColor.color,
  };
}

// ===== Interfaccia unica "Liturgy" compatibile con il vecchio backend =====

export type Liturgy = {
  date: string;
  date_label: string;
  season: { season: string; color: string; color_hex: string };
  saints: SaintEntry[];
  readings: any[];
  title: string;
  liturgical_color: string;
  source_url?: string;
  cached?: boolean;
  error?: string | null;
  fromLocalCache?: boolean;
  celebrationMode?: CelebrationMode;
};

export async function getFullLiturgy(
  d: Date,
  mode: CelebrationMode = "calendar_day",
): Promise<Liturgy> {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const scraped = await scrapeLiturgy(d, mode);
  const meta = liturgyMetadataForMode(d, mode, scraped);

  return {
    date: iso,
    date_label: italianDateLabel(d),
    season: meta.season,
    saints: meta.saints,
    readings: scraped.readings,
    title: scraped.title,
    liturgical_color: meta.liturgical_color,
    source_url: scraped.source_url,
    error: scraped.error || null,
    celebrationMode: mode,
  };
}

export async function getFullLiturgyByDateStr(
  dateStr: string,
  mode: CelebrationMode = "calendar_day",
): Promise<Liturgy> {
  return getFullLiturgy(parseDateStr(dateStr), mode);
}

// ===== Dati statici (ritornano subito, nessuna rete) =====

export function getFixedParts(): { parts: Record<string, any> } {
  return { parts: fixedParts as any };
}

export function getMassOrder(): { order: Array<{ id: string; title: string }> } {
  return { order: massOrder as any };
}

export function getEucharisticPrayers(includeChildren = true): { prayers: any[] } {
  const base = eucharisticPrayers as any[];
  return {
    prayers: includeChildren ? [...base, ...(eucharisticPrayersChildren as any[])] : base,
  };
}

export function getMysteryAcclamations(): { acclamations: any[] } {
  return { acclamations: mysteryAcclamations as any };
}

export function getSolemnBlessings(): { blessings: any[]; pasqua_dismissal: any; prayersOverPeople: any[] } {
  const d: any = solemnBlessingsData;
  return {
    blessings: d.blessings,
    pasqua_dismissal: d.pasqua_dismissal,
    prayersOverPeople: d.prayersOverPeople || [],
  };
}

export function getPrefaces(season?: string): { prefaces: any[] } {
  const all = prefaces as any[];
  if (!season) return { prefaces: all };
  const s = season.toLowerCase();
  return { prefaces: all.filter((p) => p.season.toLowerCase() === s || p.season === "comune") };
}

export function getVotiveMasses(): { masses: any[] } {
  return { masses: votiveMasses as any };
}

export function getAllSaints(): { calendar: Array<{ date: string; celebrations: any[] }> } {
  return { calendar: getAllSaintsCalendar() };
}

export function getSaintsForDateStr(dateStr: string): { date: string; celebrations: SaintEntry[] } {
  const d = parseDateStr(dateStr);
  return {
    date: dateStr,
    celebrations: getSaintsForDate(d),
  };
}
