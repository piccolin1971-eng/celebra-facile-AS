/**
 * Provider locale per tutti i dati liturgici.
 * Sostituisce completamente il backend FastAPI: i testi statici sono bundlati nell'APK
 * e le letture del giorno vengono scaricate direttamente da chiesacattolica.it.
 */
import { scrapeLiturgy } from "./liturgyScraper";
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
import saintsCalendarArr from "./data/saintsCalendar.json";

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

// ===== Stagione liturgica (calcolo approssimato) =====

const COLOR_MAP: Record<string, string> = {
  verde: "#1B5E20",
  viola: "#4A148C",
  bianco: "#D4AF37",
  rosso: "#B71C1C",
  rosa: "#AD1457",
};

export function getLiturgicalSeason(d: Date): { season: string; color: string; color_hex: string } {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if ((m === 12 && day <= 24) || (m === 11 && day >= 27))
    return { season: "Avvento", color: "viola", color_hex: COLOR_MAP.viola };
  if ((m === 12 && day >= 25) || (m === 1 && day <= 13))
    return { season: "Natale", color: "bianco", color_hex: COLOR_MAP.bianco };
  if ((m === 2 && day >= 14) || (m === 3 && day <= 31))
    return { season: "Quaresima", color: "viola", color_hex: COLOR_MAP.viola };
  if (m === 4 || (m === 5 && day <= 25))
    return { season: "Pasqua", color: "bianco", color_hex: COLOR_MAP.bianco };
  return { season: "Tempo Ordinario", color: "verde", color_hex: COLOR_MAP.verde };
}

// ===== Calcolo colore liturgico effettivo (Santi vs Stagione) =====

export function calculateLiturgicalColor(
  season: { season: string; color: string; color_hex: string },
  saints: SaintEntry[],
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

  const isLentOrAdvent = season.season === "Avvento" || season.season === "Quaresima";

  if (best) {
    // Solennità e Feste cambiano sempre il colore (es. San Giuseppe in Quaresima = Bianco)
    if (best.rank === "solennita" || best.rank === "festa") {
      return { color: best.color, color_hex: COLOR_MAP[best.color] || season.color_hex };
    }
    // Memorie obbligatorie cambiano colore solo in Tempo Ordinario.
    // In Avvento/Quaresima sono ridotte a commemorazioni (colore viola resta).
    if (best.rank === "memoria_obbligatoria" && !isLentOrAdvent) {
      return { color: best.color, color_hex: COLOR_MAP[best.color] || season.color_hex };
    }
  }

  return { color: season.color, color_hex: season.color_hex };
}

// ===== Calendario santi =====

type SaintEntry = { title: string; rank: string; color: string; votive_mass?: string };
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
};

export async function getFullLiturgy(d: Date): Promise<Liturgy> {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const season = getLiturgicalSeason(d);
  const saints = getSaintsForDate(d);
  const scraped = await scrapeLiturgy(d);

  const effective = calculateLiturgicalColor(season, saints);

  return {
    date: iso,
    date_label: italianDateLabel(d),
    season: { ...season, color: effective.color, color_hex: effective.color_hex },
    saints,
    readings: scraped.readings,
    title: scraped.title,
    liturgical_color: scraped.liturgical_color || effective.color,
    source_url: scraped.source_url,
    error: scraped.error || null,
  };
}

export async function getFullLiturgyByDateStr(dateStr: string): Promise<Liturgy> {
  return getFullLiturgy(parseDateStr(dateStr));
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
  return { calendar: saintsCalendarArr as any };
}

export function getSaintsForDateStr(dateStr: string): { date: string; celebrations: SaintEntry[] } {
  const d = parseDateStr(dateStr);
  return {
    date: dateStr,
    celebrations: getSaintsForDate(d),
  };
}
