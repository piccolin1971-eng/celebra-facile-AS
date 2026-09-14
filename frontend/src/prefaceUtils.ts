import { Preface } from "./api";
import { parseLocalDate } from "./dateUtils";
import { getObservedSaintsForDate } from "./localLiturgy";
import {
  resolvePrefacesFromFeastMap,
} from "./prefaceFeastMap";

export type LiturgySaint = { title: string; rank: string; color?: string };

export type LiturgyLike = {
  date?: string;
  title?: string;
  season?: { season?: string };
  saints?: LiturgySaint[];
};

/** Solennità/feste mobili: parole chiave nel titolo CEI → prefazi propri (ordine = priorità). */
const MOVEABLE_FEAST_PREFACE_IDS: { keywords: string[]; ids: string[] }[] = [
  {
    keywords: ["corpus", "corpo e sangue", "santissimo corpo"],
    ids: [
      "della_santissima_eucaristia_ii_i_frutti_d",
      "della_santissima_eucaristia_i_l_eucarist",
      "della_santissima_eucaristia_iii_l_eucarist",
    ],
  },
  {
    keywords: ["santissima trinit"],
    ids: ["il_mistero_della_santissima_trinit"],
  },
  {
    keywords: ["sacro cuore", "sacratissimo cuore"],
    ids: ["l_immenso_amore_di_cristo"],
  },
  {
    keywords: ["cristo re", "re dell'universo", "re delluniverso"],
    ids: ["cristo_re_dell_universo"],
  },
  {
    keywords: ["tutti i santi"],
    ids: ["la_gloria_della_gerusalemme_del_cielo__nostra_madre"],
  },
  {
    keywords: ["pentecoste"],
    ids: ["il_mistero_della_pentecoste"],
  },
  {
    keywords: ["ascensione del signore", "ascensione"],
    ids: [
      "dell_ascensione_del_signore_i_il_mistero",
      "dell_ascensione_del_signore_ii_il_mistero",
      "dopo_l_ascensione_nell_attes",
    ],
  },
];

/** Mappa il nome stagione liturgica CEI al key usato nei prefazi. */
export function getLiturgicalSeasonKey(seasonName: string): string {
  const s = (seasonName || "").toLowerCase();
  if (s.includes("avvento")) return "avvento";
  if (s.includes("natale") || s.includes("epifania")) return "natale";
  if (s.includes("settimana santa") || s.includes("passione") || s.includes("palme")) return "passione";
  if (s.includes("quaresima")) return "quaresima";
  if (s.includes("pasqua") || s.includes("pentecoste") || s.includes("ascensione")) return "pasqua";
  return "ordinario";
}

const RANK_PRIORITY: Record<string, number> = {
  solennita: 1,
  festa: 2,
  memoria_obbligatoria: 3,
  memoria_facoltativa: 4,
};

const CELEBRATION_RANKS = new Set(["solennita", "festa", "memoria_obbligatoria"]);

/**
 * Celebrazioni con prefazio proprio nel Messale 2020 (titolo santo o festa → id prefazi).
 * Valutato prima delle famiglie generiche (martiri, BVM comune, ecc.).
 */
const DEDICATED_CELEBRATION_PREFACE_RULES: {
  keywords: string[];
  excludeKeywords?: string[];
  ids: string[];
}[] = [
  {
    keywords: ["giovanni battista"],
    excludeKeywords: ["de la salle", "montini"],
    ids: ["la_missione_del_precursore"],
  },
  {
    keywords: ["maria maddalena"],
    excludeKeywords: ["de pazzi"],
    ids: ["apostola_degli_apostoli"],
  },
  {
    keywords: ["annunciazione del signore"],
    ids: ["il_mistero_dell_incarnazione"],
  },
  {
    keywords: ["tutti i santi"],
    ids: ["la_gloria_della_gerusalemme_del_cielo__nostra_madre"],
  },
  {
    keywords: ["fedeli defunti", "commemorazione di tutti i fedeli"],
    ids: [
      "dei_defunti_i_la_speranz",
      "dei_defunti_ii_cristo___m",
      "dei_defunti_iii_cristo__sa",
      "dei_defunti_iv_dalla_vita",
      "dei_defunti_v_la_nostra",
    ],
  },
  {
    keywords: ["trasfigurazione del signore"],
    ids: ["il_mistero_della_trasfigurazione"],
  },
  {
    keywords: ["esaltazione della santa croce"],
    ids: ["la_vittoria_della_croce_gloriosa"],
  },
  {
    keywords: ["battesimo del signore"],
    ids: ["consacrazione_e_missione_di_ges"],
  },
  {
    keywords: ["dedicazione della basilica lateranense"],
    ids: ["il_mistero_del_tempio_di_dio_che___la_chiesa", "il_mistero_del_tempio_di_dio"],
  },
  {
    keywords: ["immacolata concezione"],
    ids: ["il_mistero_di_maria_e_della_chiesa"],
  },
  {
    keywords: ["assunzione della beata vergine", "assunzione della"],
    ids: ["la_gloria_di_maria_assunta_in_cielo"],
  },
  {
    keywords: ["presentazione del signore"],
    ids: ["il_mistero_della_presentazione_del_signore"],
  },
  {
    keywords: ["dedicazione", "pietro", "paolo"],
    ids: ["degli_apostoli_i_gli_aposto", "degli_apostoli_ii_la_chiesa"],
  },
  {
    keywords: ["pietro", "paolo"],
    excludeKeywords: ["dedicazione"],
    ids: ["la_duplice_missione_di_pietro_e_di_paolo_nella_chiesa"],
  },
];

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSundayDate(dateStr?: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return parseLocalDate(dateStr).getDay() === 0;
}

function normalizeSaintRank(rank: string): string {
  return rank
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pickPrimarySaint(saints?: LiturgySaint[]): LiturgySaint | null {
  if (!saints?.length) return null;
  const relevant = saints.filter((s) => CELEBRATION_RANKS.has(normalizeSaintRank(s.rank)));
  if (relevant.length === 0) return null;
  return [...relevant].sort(
    (a, b) => (RANK_PRIORITY[normalizeSaintRank(a.rank)] ?? 99) - (RANK_PRIORITY[normalizeSaintRank(b.rank)] ?? 99),
  )[0];
}

function pickPrimarySaintForLiturgy(liturgy: LiturgyLike): LiturgySaint | null {
  if (liturgy.date && /^\d{4}-\d{2}-\d{2}$/.test(liturgy.date)) {
    return pickPrimarySaint(getObservedSaintsForDate(parseLocalDate(liturgy.date)));
  }
  return pickPrimarySaint(liturgy.saints);
}

function isMarianCelebration(title: string, rank: string): boolean {
  const t = normalizeTitle(title);
  if (/\b(madre di dio|vergine maria|beata vergine|assunzione|immacolata|visitazione|annunciazione|nascita della beata vergine|presentazione del signore)\b/.test(t)) {
    return true;
  }
  if (/\bmaria\b/.test(t) && /\b(regina|sabbato|lourdes|fatima|guadalupe|perpetuo soccorso|carmelo|rosario)\b/.test(t)) {
    return true;
  }
  if ((rank === "festa" || rank === "solennita") && /\bmaria\b/.test(t) && !/\bgiuseppe\b/.test(t)) {
    return true;
  }
  return false;
}

export type SaintPrefaceGroup =
  | "giuseppe"
  | "bvm"
  | "pietro_paolo"
  | "apostoli"
  | "martiri"
  | "pastori"
  | "dottori"
  | "vergini"
  | "angeli"
  | "generici";

/** Classifica il santo per la famiglia di prefazi propri (Messale 2020). */
export function classifySaintPrefaceGroup(title: string, rank: string): SaintPrefaceGroup {
  const t = normalizeTitle(title);

  if (/\bgiuseppe\b/.test(t) && (/\bsposo\b/.test(t) || /\bsan giuseppe\b/.test(t) || rank !== "memoria_facoltativa")) {
    if (!/\bmaria\b/.test(t)) return "giuseppe";
  }
  if (isMarianCelebration(title, rank)) return "bvm";
  if (/\bpietro\b/.test(t) && /\bpaolo\b/.test(t)) return "pietro_paolo";
  if (/\bapostol/.test(t)) return "apostoli";
  if (/\bmartir/.test(t)) return "martiri";
  if (/\bdottor/.test(t)) return "dottori";
  if (/\b(vescov|papa|presbiter|pastor)\b/.test(t)) return "pastori";
  if (/\b(arcangel|angeli?)\b/.test(t)) return "angeli";
  if (/\b(vergine|vergin|religios)\b/.test(t)) return "vergini";
  return "generici";
}

function idsMatching(prefaces: Preface[], predicate: (p: Preface) => boolean): Preface[] {
  return prefaces.filter(predicate);
}

function prefacesForSaintGroup(group: SaintPrefaceGroup, prefaces: Preface[]): Preface[] {
  switch (group) {
    case "giuseppe":
      return idsMatching(prefaces, (p) => p.id === "di_san_giuseppe_sposo_dell");
    case "bvm":
      return idsMatching(
        prefaces,
        (p) => p.season === "bvm" && p.id !== "di_san_giuseppe_sposo_dell",
      );
    case "pietro_paolo":
      return idsMatching(
        prefaces,
        (p) => p.id === "la_duplice_missione_di_pietro_e_di_paolo_nella_chiesa",
      );
    case "apostoli":
      return idsMatching(prefaces, (p) => p.id.startsWith("degli_apostoli"));
    case "martiri":
      return idsMatching(prefaces, (p) => p.id.startsWith("dei_santi_martiri"));
    case "pastori":
      return idsMatching(prefaces, (p) => p.id.startsWith("dei_santi_pastori"));
    case "dottori":
      return idsMatching(prefaces, (p) => p.id.startsWith("dei_santi_dottori"));
    case "vergini":
      return idsMatching(
        prefaces,
        (p) =>
          p.id.startsWith("delle_sante_vergini") ||
          p.id.startsWith("la_verginit") ||
          p.id.startsWith("la_vita_religiosa"),
      );
    case "angeli":
      return idsMatching(prefaces, (p) => p.id.startsWith("degli_angeli"));
    case "generici":
      return idsMatching(
        prefaces,
        (p) => p.id === "dei_santi_i_la_gloria" || p.id === "dei_santi_ii_l_esempio",
      );
    default:
      return [];
  }
}

function sortByOrderOrId(items: Preface[]): Preface[] {
  return [...items].sort((a, b) => {
    const oa = a.sortOrder ?? 999;
    const ob = b.sortOrder ?? 999;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

function seasonalPrefaces(prefaces: Preface[], seasonKey: string): Preface[] {
  return sortByOrderOrId(prefaces.filter((p) => p.season === seasonKey));
}

function comuniPrefaces(prefaces: Preface[]): Preface[] {
  return sortByOrderOrId(prefaces.filter((p) => p.season === "comune"));
}

function ordinarioDomeniche(prefaces: Preface[]): Preface[] {
  return sortByOrderOrId(prefaces.filter((p) => p.season === "ordinario"));
}

function prefacesByIds(prefaces: Preface[], ids: string[]): Preface[] {
  const byId = new Map(prefaces.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Preface => p != null);
}

/** Prefazio proprio per celebrazione (titolo calendario o CEI). */
export function prefacesForDedicatedCelebration(
  title: string | undefined,
  prefaces: Preface[],
): Preface[] | null {
  if (!title?.trim()) return null;
  const t = normalizeTitle(title);
  for (const rule of DEDICATED_CELEBRATION_PREFACE_RULES) {
    if (rule.excludeKeywords?.some((kw) => t.includes(normalizeTitle(kw)))) continue;
    if (!rule.keywords.every((kw) => t.includes(normalizeTitle(kw)))) continue;
    const matched = prefacesByIds(prefaces, rule.ids);
    if (matched.length > 0) return matched;
  }
  return null;
}

/** Prefazi propri per solennità/feste mobili (titolo CEI, non in saintsCalendar). */
export function prefacesForMoveableFeastTitle(
  title: string | undefined,
  prefaces: Preface[],
): Preface[] | null {
  if (!title?.trim()) return null;
  const t = normalizeTitle(title);
  for (const rule of MOVEABLE_FEAST_PREFACE_IDS) {
    if (rule.keywords.some((kw) => t.includes(normalizeTitle(kw)))) {
      const matched = prefacesByIds(prefaces, rule.ids);
      if (matched.length > 0) return matched;
    }
  }
  return null;
}

/** Logica precedente: usata solo se la tabella Messale non trova corrispondenza. */
function suggestPrefacesLegacy(
  prefaces: Preface[],
  liturgy: LiturgyLike,
  seasonKey: string,
): Preface[] {
  const saint = pickPrimarySaintForLiturgy(liturgy);

  const dedicatedFromSaint = saint
    ? prefacesForDedicatedCelebration(saint.title, prefaces)
    : null;
  if (dedicatedFromSaint?.length) return dedicatedFromSaint;

  if (saint) {
    const group = classifySaintPrefaceGroup(saint.title, saint.rank);
    const saintPrefaces = prefacesForSaintGroup(group, prefaces);
    if (saintPrefaces.length > 0) return saintPrefaces;
  }

  const dedicatedFromTitle = prefacesForDedicatedCelebration(liturgy.title, prefaces);
  if (dedicatedFromTitle?.length) return dedicatedFromTitle;

  const feastPrefaces = prefacesForMoveableFeastTitle(liturgy.title, prefaces);
  if (feastPrefaces?.length) return feastPrefaces;

  const sunday = isSundayDate(liturgy.date);

  if (seasonKey === "ordinario") {
    if (sunday) return ordinarioDomeniche(prefaces);
    return comuniPrefaces(prefaces);
  }

  return seasonalPrefaces(prefaces, seasonKey);
}

/**
 * Prefazi suggeriti in base a calendario liturgico, giorno della settimana e santo del giorno.
 * Prima consulta la tabella Messale 2020; se non trova corrispondenza, usa la logica legacy.
 */
export function getSuggestedPrefacesForLiturgy(
  prefaces: Preface[],
  liturgy: LiturgyLike | null | undefined,
): Preface[] {
  if (!liturgy) return comuniPrefaces(prefaces);

  const fromFeastMap = resolvePrefacesFromFeastMap(prefaces, liturgy);
  if (fromFeastMap?.length) return fromFeastMap;

  const seasonKey = getLiturgicalSeasonKey(liturgy.season?.season || "");
  return suggestPrefacesLegacy(prefaces, liturgy, seasonKey);
}

/** @deprecated Preferire getSuggestedPrefacesForLiturgy — solo tempo + comuni. */
export function getSuggestedPrefaces(prefaces: Preface[], seasonKey: string): Preface[] {
  const seasonal = prefaces.filter((p) => p.season === seasonKey);
  const comuni = seasonKey !== "comune" ? prefaces.filter((p) => p.season === "comune") : [];
  const seen = new Set<string>();
  const merged: Preface[] = [];
  for (const p of [...seasonal, ...comuni]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
  }
  if (seasonKey === "pasqua" || seasonKey === "ordinario") {
    return merged.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }
  return merged;
}
