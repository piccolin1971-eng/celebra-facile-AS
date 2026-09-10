import { shouldSuppressFacultativeMemory } from "./liturgicalCelebrationUtils";
import type { CelebrationMode } from "./massSession";
import type { VigilEveContext } from "./vigilCatalog";
import { localDateStr, parseLocalDate } from "./dateUtils";
import {
  getLiturgicalSeason,
  getSaintsForDate,
  isCalendarFeastObservedOnDate,
  resolveLiturgicalColorForDay,
} from "./localLiturgy";
import { numberedSeasonSundayTitle, liturgicalYearLetter } from "./liturgicalDates";
import { getMoveableFeastsForYear } from "./calendarMonth";

/** CEI rank suffix so home banner parsing works when only the feast name is stored. */
export function bannerCeiTitleWithRank(
  title: string,
  mode: CelebrationMode,
  vigilCtx: VigilEveContext | null,
): string {
  const t = title.trim();
  if (!t) return t;
  if (vigilCtx && (mode === "vigil_proper" || mode === "solemnity_day")) {
    if (/solennit/i.test(t)) return t;
    return `${t} — Solennità`;
  }
  return t;
}

/** Colore liturgico per i banner home (senza fetch CEI). */
export function homeBannerLiturgicalColor(
  date: Date,
  mode: CelebrationMode,
  vigilCtx: VigilEveContext | null,
  liturgyTitle: string,
): string {
  const vigilNonCalendar = vigilCtx && mode !== "calendar_day";
  const colorDate = vigilNonCalendar
    ? parseLocalDate(vigilCtx.solemnityDateISO)
    : date;
  const season = getLiturgicalSeason(colorDate);
  const saints = getSaintsForDate(colorDate);
  const title = bannerCeiTitleWithRank(
    liturgyTitle || (vigilNonCalendar ? vigilCtx.solemnityTitle : ""),
    mode,
    vigilCtx,
  );
  return resolveLiturgicalColorForDay(colorDate, season, saints, title).color;
}

function normalizeBannerTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BANNER_PLACEHOLDER_RE = /prepara la liturgia per questo giorno/i;

/** Titolo sessione preparata utilizzabile nel banner (esclude placeholder e memorie facoltative). */
export function preparedBannerLiturgyTitle(title: string | undefined): string {
  const t = (title || "").trim();
  if (!t || BANNER_PLACEHOLDER_RE.test(t)) return "";
  if (shouldSuppressFacultativeMemory(t)) return "";
  return t;
}

const SAINT_RANK_LABELS: Record<string, string> = {
  solennita: "Solennità",
  festa: "Festa",
  memoria_obbligatoria: "Memoria",
  memoria_facoltativa: "Memoria",
};

/** Celebrazione obbligatoria del giorno (esclude memorie facoltative). */
function pickPrimaryCalendarCelebration(
  date: Date,
): { title: string; rankLabel: string } | null {
  const moveable = getMoveableFeastsForYear(date.getFullYear()).get(localDateStr(date));
  if (moveable) {
    return {
      title: moveable.title,
      rankLabel: SAINT_RANK_LABELS[moveable.rank] ?? "Solennità",
    };
  }

  const season = getLiturgicalSeason(date);
  const saints = getSaintsForDate(date);
  if (saints.length === 0) return null;

  const rankPriority: Record<string, number> = {
    solennita: 1,
    festa: 2,
    memoria_obbligatoria: 3,
    memoria_facoltativa: 4,
  };

  let best = saints[0];
  for (const s of saints) {
    if (rankPriority[s.rank] < rankPriority[best.rank]) best = s;
  }

  if (!isCalendarFeastObservedOnDate(best, date, season.season)) return null;

  const rankLabel = SAINT_RANK_LABELS[best.rank];
  if (!rankLabel) return null;

  return { title: best.title, rankLabel };
}

/** Titolo banner home da calendario santi quando la liturgia non è ancora preparata. */
export function calendarCelebrationBannerTitle(date: Date): string {
  const primary = pickPrimaryCalendarCelebration(date);
  if (!primary) return "";
  const rankSuffix =
    primary.rankLabel === "Solennità"
      ? "SOLENNITÀ"
      : primary.rankLabel === "Festa"
        ? "FESTA"
        : primary.rankLabel.toUpperCase();
  return `${primary.title.toUpperCase()} — ${rankSuffix}`;
}

/** Rank da calendario santi quando il titolo CEI non include «solennità» / «festa». */
function rankFromSaintsCalendar(title: string, date: Date): string | null {
  const saints = getSaintsForDate(date);
  if (saints.length === 0) return null;

  const nt = normalizeBannerTitle(title);
  if (nt) {
    for (const s of saints) {
      const st = normalizeBannerTitle(s.title);
      if (!st) continue;
      if (nt === st || nt.includes(st) || st.includes(nt)) {
        return SAINT_RANK_LABELS[s.rank] ?? null;
      }
    }
  }

  const solemnity = saints.find((s) => s.rank === "solennita");
  if (solemnity && !nt) return "Solennità";

  return null;
}

function isUnusableCeiBannerTitle(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (/nessun contenuto/i.test(t)) return true;
  if (/^[-–—]+$/.test(t)) return true;
  if (/^messa del giorno$/i.test(t)) return true;
  if (/^\d{1,2}\s+\w+\s+\d{4}$/i.test(t)) return true;
  return false;
}

function feriaBanner(season: string, isSunday: boolean, date: Date) {
  if (isSunday) {
    const numbered = numberedSeasonSundayTitle(date);
    if (numbered) {
      return { rankLabel: "Domenica" as const, displayTitle: numbered, seasonLine: season };
    }
  }
  let displayTitle = season;
  if (isSunday) {
    displayTitle =
      season === "Tempo Ordinario"
        ? "Domenica del Tempo Ordinario"
        : `Domenica di ${season}`;
  }
  return {
    rankLabel: isSunday ? "Domenica" : "Feria",
    displayTitle,
    seasonLine: season,
  };
}

/** Testo rank + titolo per il banner data in home (stile H2). */
export function parseBannerCelebration(
  ceiTitle: string | undefined,
  seasonName: string,
  date: Date,
): { rankLabel: string; displayTitle: string; seasonLine: string } {
  const isSunday = date.getDay() === 0;
  const season = (seasonName || "").trim() || getLiturgicalSeason(date).season;
  let raw = (ceiTitle || "").trim();
  if (BANNER_PLACEHOLDER_RE.test(raw) || isUnusableCeiBannerTitle(raw)) raw = "";
  const liturgicalYear = extractLiturgicalYear(raw);
  const seasonLine = season;

  if (!raw) {
    const primary = pickPrimaryCalendarCelebration(date);
    if (primary) {
      return {
        rankLabel: primary.rankLabel,
        displayTitle: formatCelebrationTitle(primary.title),
        seasonLine: season,
      };
    }
    return feriaBanner(season, isSunday, date);
  }

  if (shouldSuppressFacultativeMemory(raw, season, date)) {
    return feriaBanner(season, isSunday, date);
  }

  const t = raw.toLowerCase();
  let rankLabel = "Feria";
  if (t.includes("solennit") || /\bsolenn\b/i.test(t)) rankLabel = "Solennità";
  else if (/\bfesta\b/.test(t)) rankLabel = "Festa";
  else if (/\bmemoria\s+obbligatoria\b/.test(t) || t.includes("memoria")) rankLabel = "Memoria";
  else if (isSunday || t.includes("domenica")) rankLabel = "Domenica";

  const calendarRank = rankFromSaintsCalendar(raw, date);
  if (calendarRank) rankLabel = calendarRank;
  else if (isSunday && rankLabel === "Feria") rankLabel = "Domenica";

  let displayTitle = raw
    .replace(/\s*[–—-]\s*(MEMORIA\s+OBBLIGATORIA|MEMORIA\s+FACOLTATIVA|MEMORIA)(?:\s*[–—-]\s*ANNO\s+[A-C])?\s*$/i, "")
    .replace(/\s*[–—-]\s*(SOLENNIT[ÀA]?|FESTA)(?:\s*[–—-]\s*ANNO\s+[A-C])?\s*$/i, "")
    .replace(/\s*[–—-]\s*DOMENICA(?:\s*[–—-]\s*ANNO\s+[A-C])?\s*$/i, "")
    .replace(/\s*[–—-]\s*ANNO\s+[A-C]\s*$/i, "")
    .trim();

  if (!displayTitle) displayTitle = raw;

  const numberedSunday = formatNumberedSundayTitle(
    displayTitle,
    liturgicalYear || liturgicalYearLetter(date),
  );
  if (numberedSunday) {
    return { rankLabel, displayTitle: numberedSunday, seasonLine };
  }

  const weekdayOrdinary = formatWeekdayOrdinaryTimeTitle(displayTitle);
  if (weekdayOrdinary) {
    return { rankLabel, displayTitle: weekdayOrdinary, seasonLine };
  }

  return {
    rankLabel,
    displayTitle: formatCelebrationTitle(displayTitle),
    seasonLine,
  };
}

function extractLiturgicalYear(raw: string): string | null {
  const m = raw.match(/\bANNO\s+([ABC])\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Es. LUNEDÌ DELLA XIV SETTIMANA DEL TEMPO ORDINARIO (ANNO PARI) */
function formatWeekdayOrdinaryTimeTitle(title: string): string | null {
  const m = title.match(
    /^\s*(LUNED[IÌ]|MARTED[IÌ]|MERCOLED[IÌ]|GIOVED[IÌ]|VENERD[IÌ]|SABATO)\s+DELLA\s+([XVI]{1,8})\s+SETTIMANA\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/i,
  );
  if (!m) return null;

  const day = formatCelebrationTitle(m[1]);
  const week = m[2].toUpperCase();
  const tail = formatCelebrationTitle(m[3].trim());
  const tailLower = tail.charAt(0).toLowerCase() + tail.slice(1);
  let out = `${day} della ${week} settimana ${tailLower}`;
  const anno = m[4]?.trim();
  if (anno) out += ` (${anno.toLowerCase()})`;
  return out;
}

/** Es. XI DOMENICA DEL TEMPO ORDINARIO → XI Domenica del Tempo Ordinario - Anno A */
function formatNumberedSundayTitle(title: string, liturgicalYear: string | null): string | null {
  const m =
    title.match(/^\s*DOMENICA\s+([XVI]{1,8})\s+(.+?)\s*$/i) ||
    title.match(/^\s*([XVI]{1,8})\s+DOMENICA\s+(.+?)\s*$/i);
  if (!m) return null;

  const roman = m[1].toUpperCase();
  const tail = formatCelebrationTitle(m[2].trim());
  const tailLower = tail.charAt(0).toLowerCase() + tail.slice(1);

  let out = `Domenica ${roman} ${tailLower}`;
  if (liturgicalYear) out += ` - Anno ${liturgicalYear}`;
  return out;
}

/** Articoli, preposizioni e congiunzioni: mai in maiuscolo in mezzo al titolo. */
const ITALIAN_TITLE_PARTICLES = new Set([
  "a",
  "ad",
  "al",
  "allo",
  "alla",
  "ai",
  "agli",
  "alle",
  "e",
  "ed",
  "o",
  "od",
  "di",
  "del",
  "dello",
  "della",
  "dei",
  "degli",
  "delle",
  "da",
  "dal",
  "dallo",
  "dalla",
  "dai",
  "dagli",
  "dalle",
  "in",
  "su",
  "per",
  "con",
  "tra",
  "fra",
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "uno",
  "una",
  "nel",
  "nello",
  "nella",
  "nei",
  "negli",
  "nelle",
]);

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** «E» → «e», «Della» → «della», ecc. Resta maiuscolo solo se è la prima parola. */
function applyItalianTitleParticles(title: string): string {
  return title.replace(/[A-Za-zÀ-ÿ]+/g, (word, offset: number) => {
    const lower = word.toLowerCase();
    if (!ITALIAN_TITLE_PARTICLES.has(lower)) return word;
    const before = title.slice(0, offset).replace(/[\s«""'(\[]+/g, "");
    if (before.length === 0) return capitalizeWord(lower);
    return lower;
  });
}

/** CEI spesso in maiuscolo: rende leggibile senza alterare nomi propri oltre il necessario. */
export function formatCelebrationTitle(title: string): string {
  const letters = title.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, "").length;
  let out = title;
  if (letters.length > 0 && upper / letters.length > 0.6) {
    out = title
      .toLowerCase()
      .replace(/(^|[\s('"]+)([a-zà-ÿ])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
  }
  return fixRomanNumerals(applyItalianTitleParticles(out));
}

/** Numeri romani (domeniche, settimane 1–34) sempre in maiuscolo: XXIII, non Xxiii. */
function fixRomanNumerals(title: string): string {
  return title.replace(/\b([XVI]{1,8})\b/gi, (m) => m.toUpperCase());
}

export type LiturgicalPalette = {
  liturgicalGreen: string;
  liturgicalRed: string;
  liturgicalPurple: string;
  liturgicalWhite: string;
  liturgicalRose: string;
};

export function liturgicalColorHex(liturgicalColor: string, palette: LiturgicalPalette): string {
  switch (liturgicalColor) {
    case "bianco":
      return palette.liturgicalWhite;
    case "rosso":
      return palette.liturgicalRed;
    case "viola":
      return palette.liturgicalPurple;
    case "rosa":
      return palette.liturgicalRose;
    default:
      return palette.liturgicalGreen;
  }
}

function abbreviateStripCelebration(title: string, rankLabel: string): string {
  let t = title.trim();
  if (!t) return "";

  if (rankLabel === "Domenica" || /\bdomenica\b/i.test(t)) {
    const litYear =
      t.match(/\bAnno\s+([ABC])\b/i)?.[1]?.toUpperCase() ||
      t.match(/\bANNO\s+([ABC])\b/i)?.[1]?.toUpperCase();
    const roman =
      t.match(/\bDomenica\s+([XVI]{1,8})\b/i)?.[1]?.toUpperCase() ||
      t.match(/\b([XVI]{1,8})\s+Domenica\b/i)?.[1]?.toUpperCase();
    if (roman) return litYear ? `${roman} Domenica ${litYear}` : `${roman} Domenica`;
    if (litYear) return `Domenica ${litYear}`;
    return "Domenica";
  }

  return t.replace(/,\s*/g, " ");
}

export type HomeStripDayMeta = {
  liturgicalColor: string;
  subtitle: string | null;
};

/** Bordo liturgico e sottotitolo per i tasti giorno nella striscia Home. */
export function homeStripDayMeta(date: Date, ceiTitle?: string): HomeStripDayMeta {
  const season = getLiturgicalSeason(date);
  const saints = getSaintsForDate(date);
  const cei = (ceiTitle || "").trim();
  let rawTitle = cei || calendarCelebrationBannerTitle(date);

  if (rawTitle && shouldSuppressFacultativeMemory(rawTitle, season.season, date)) {
    rawTitle = "";
  } else if (!cei && saints.length > 0) {
    const hasObligatory = saints.some(
      (s) =>
        s.rank === "solennita" || s.rank === "festa" || s.rank === "memoria_obbligatoria",
    );
    if (!hasObligatory) rawTitle = "";
  }

  const liturgicalColor = homeBannerLiturgicalColor(date, "calendar_day", null, rawTitle);
  const parsed = parseBannerCelebration(rawTitle || undefined, season.season, date);

  const isSunday = date.getDay() === 0;
  const isGreenWeekdayFeria =
    liturgicalColor === "verde" && parsed.rankLabel === "Feria" && !isSunday;

  const subtitle = isGreenWeekdayFeria
    ? null
    : abbreviateStripCelebration(parsed.displayTitle, parsed.rankLabel) || null;

  return { liturgicalColor, subtitle };
}
