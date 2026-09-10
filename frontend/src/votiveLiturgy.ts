/**
 * Applica i testi del formulario votivo alla liturgia di preparazione/celebrazione.
 */
import type { Liturgy, Reading } from "./api";
import lectionaryData from "./data/saintLectionary.json";
import votiveReadingsData from "./data/votiveReadings.json";
import { getLiturgicalSeasonKey } from "./prefaceUtils";

export type VotiveMassFull = {
  id: string;
  title: string;
  color: string;
  preface_id?: string;
  antifona_ingresso?: string;
  antifona_comunione?: string;
  colletta?: string;
  sulle_offerte?: string;
  dopo_comunione?: string;
};

/** ID brevi in votiveMasses.json → id reali in prefaces.json */
const VOTIVE_PREFACE_IDS: Record<string, string> = {
  ss_trinita: "il_mistero_della_santissima_trinit",
  pentecoste: "il_mistero_della_pentecoste",
  ss_eucaristia_1: "della_santissima_eucaristia_i_l_eucarist",
  ss_eucaristia_2: "della_santissima_eucaristia_ii_i_frutti_d",
  sacro_cuore: "l_immenso_amore_di_cristo",
  bvm_1: "della_beata_vergine_maria_i_la_materni",
  angeli: "degli_angeli_la_gloria",
  apostoli_1: "degli_apostoli_i_gli_aposto",
  santi_1: "dei_santi_i_la_gloria",
  defunti_1: "dei_defunti_i_la_speranz",
  comune_1: "comune_i_il_rinnova",
  comune_2: "comune_ii_la_salvezz",
  comune_3: "comune_iii_lode_a_dio",
};

/** Preghiera dei fedeli suggerita per formulario votivo (Orazionale CEI). */
const VOTIVE_ORAZIONALE_IDS: Record<string, string> = {
  ss_trinita: "pt_90",
  spirito_santo: "pt_55",
  ss_sacramento: "pt_91",
  ss_nome_gesu: "pt_56",
  preziosissimo_sangue: "pt_91",
  sacro_cuore: "pt_92",
  bvm: "st_32",
  angeli: "st_20",
  ss_apostoli: "st_10",
  tutti_santi: "st_22",
  defunti: "df_1",
  sposi: "st_22",
  malati: "st_44",
  pace: "pt_56",
};

/** Letture proprie dal lezionario santi (mm-dd + chiave titolo). */
const VOTIVE_LECTIONARY: Record<string, { mmdd: string; keyIncludes: string }> = {
  defunti: { mmdd: "11-02", keyIncludes: "defunti" },
  ss_apostoli: { mmdd: "06-29", keyIncludes: "pietro e paolo" },
  tutti_santi: { mmdd: "11-01", keyIncludes: "tutti i santi" },
  angeli: { mmdd: "09-29", keyIncludes: "angeli" },
  ss_nome_gesu: { mmdd: "01-03", keyIncludes: "santissimo nome di gesu" },
};

type VotiveReadingsFile = Record<string, Reading[]>;

const SCRIPTURE_TYPES = new Set([
  "prima_lettura",
  "salmo",
  "seconda_lettura",
  "sequenza",
  "acclamazione",
  "vangelo",
]);

const READING_ORDER = [
  "antifona_ingresso",
  "colletta",
  "prima_lettura",
  "salmo",
  "seconda_lettura",
  "sequenza",
  "acclamazione",
  "vangelo",
  "sulle_offerte",
  "antifona_comunione",
  "dopo_comunione",
];

type LectionaryFile = {
  entries: Record<string, Record<string, { readings: Reading[] }>>;
};

export function resolveVotivePrefaceId(prefaceId: string | undefined): string | undefined {
  if (!prefaceId) return undefined;
  return VOTIVE_PREFACE_IDS[prefaceId] || prefaceId;
}

export function votiveSessionNeedsDefaultRepair(
  mass: VotiveMassFull,
  savedPrefaceId: string | undefined,
): boolean {
  const expected = resolveVotivePrefaceId(mass.preface_id);
  if (!expected) return false;
  if (!savedPrefaceId) return false;
  if (savedPrefaceId === mass.preface_id) return true;
  return savedPrefaceId !== expected;
}

function readingTitle(type: string): string {
  switch (type) {
    case "antifona_ingresso":
      return "Antifona d'ingresso";
    case "colletta":
      return "Colletta";
    case "sulle_offerte":
      return "Sulle offerte";
    case "antifona_comunione":
      return "Antifona alla Comunione";
    case "dopo_comunione":
      return "Dopo la Comunione";
    default:
      return type;
  }
}

function upsertReading(readings: Reading[], type: string, text: string | undefined): Reading[] {
  if (!text?.trim()) return readings;
  const next = readings.filter((r) => r.type !== type);
  next.push({
    type,
    title: readingTitle(type),
    reference: "",
    text: text.trim(),
  });
  return sortReadings(next);
}

function sortReadings(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => {
    const ia = READING_ORDER.indexOf(a.type);
    const ib = READING_ORDER.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

function lectionaryReadingsForVotive(massId: string): Reading[] | null {
  const embedded = (votiveReadingsData as VotiveReadingsFile)[massId];
  if (embedded?.length) return embedded;

  const spec = VOTIVE_LECTIONARY[massId];
  if (!spec) return null;
  const entries = (lectionaryData as LectionaryFile).entries?.[spec.mmdd];
  if (!entries) return null;
  const key = Object.keys(entries).find((k) => k.includes(spec.keyIncludes));
  return key ? entries[key].readings : null;
}

export function applyVotiveMassToLiturgy(base: Liturgy, mass: VotiveMassFull): Liturgy {
  let readings = [...(base.readings || [])];

  readings = upsertReading(readings, "antifona_ingresso", mass.antifona_ingresso);
  readings = upsertReading(readings, "colletta", mass.colletta);
  readings = upsertReading(readings, "sulle_offerte", mass.sulle_offerte);
  readings = upsertReading(readings, "antifona_comunione", mass.antifona_comunione);
  readings = upsertReading(readings, "dopo_comunione", mass.dopo_comunione);

  const proper = lectionaryReadingsForVotive(mass.id);
  if (proper?.length) {
    const kept = readings.filter((r) => !SCRIPTURE_TYPES.has(r.type));
    readings = sortReadings([...kept, ...proper]);
  }

  return {
    ...base,
    title: mass.title,
    liturgical_color: mass.color,
    readings,
  };
}

export type VotiveMassDefaultChoices = {
  prefaceId?: string;
  orazionaleId?: string;
  showGloria: boolean;
  showCredo: boolean;
  showOrazionalePray: boolean;
  penitentialSeason: string;
};

export function getVotiveMassDefaultChoices(
  mass: VotiveMassFull,
  seasonName = "",
): VotiveMassDefaultChoices {
  const seasonKey = getLiturgicalSeasonKey(seasonName);
  const isDefunti = mass.id === "defunti";
  const gloriaSeasonOk =
    seasonKey !== "avvento" && seasonKey !== "quaresima" && seasonKey !== "passione";

  return {
    prefaceId: resolveVotivePrefaceId(mass.preface_id),
    orazionaleId: VOTIVE_ORAZIONALE_IDS[mass.id],
    showGloria: !isDefunti && gloriaSeasonOk,
    showCredo: false,
    showOrazionalePray: true,
    penitentialSeason: seasonKey === "passione" ? "quaresima" : seasonKey,
  };
}

/** Per test e diagnostica: verifica che colletta e prefazio siano applicabili. */
export function validateVotiveMassCoverage(
  mass: VotiveMassFull,
  prefaceIds: Set<string>,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!mass.colletta?.trim()) errors.push("colletta mancante");
  if (!mass.antifona_ingresso?.trim()) errors.push("antifona ingresso mancante");
  const preface = resolveVotivePrefaceId(mass.preface_id);
  if (!preface) errors.push("preface_id assente");
  else if (!prefaceIds.has(preface)) errors.push(`prefazio non trovato: ${preface}`);
  const orId = VOTIVE_ORAZIONALE_IDS[mass.id];
  if (!orId) errors.push("orazionale non mappato");
  return { ok: errors.length === 0, errors };
}
