/**
 * Verifica tutte le messe votive: testi, prefazi, orazionale, letture proprie.
 * Esegui: npm run test:votive-liturgy
 */
import votiveMasses from "../src/data/votiveMasses.json";
import prefaces from "../src/data/prefaces.json";
import {
  applyVotiveMassToLiturgy,
  getVotiveMassDefaultChoices,
  validateVotiveMassCoverage,
  type VotiveMassFull,
} from "../src/votiveLiturgy";
import type { Liturgy } from "../src/api";

const baseLiturgy: Liturgy = {
  date: "2026-06-12",
  title: "Venerdì della XII settimana del Tempo Ordinario",
  liturgical_color: "verde",
  season: { season: "Tempo Ordinario" },
  readings: [
    {
      type: "colletta",
      title: "Colletta",
      reference: "",
      text: "COLLETTA DEL GIORNO CEI — non deve restare nelle messe votive.",
    },
    {
      type: "prima_lettura",
      title: "Prima Lettura",
      reference: "Gen 1,1",
      text: "Lettura del giorno CEI.",
    },
    {
      type: "vangelo",
      title: "Vangelo",
      reference: "Mt 1,1",
      text: "Vangelo del giorno CEI.",
    },
  ],
  saints: [],
};

const prefaceIds = new Set((prefaces as { id: string }[]).map((p) => p.id));

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const masses = votiveMasses as VotiveMassFull[];
assert(masses.length === 14, `attese 14 messe votive, trovate ${masses.length}`);

const lectionaryChecks: Record<string, (text: string) => boolean> = {
  ss_trinita: (t) => t.includes("mosè") || t.includes("cor 13") || t.includes("giovanni") || t.includes("es 34"),
  spirito_santo: (t) => t.includes("pentecoste") || t.includes("spirito") || t.includes("atti"),
  ss_sacramento: (t) => t.includes("eucarist") || t.includes("pane") || t.includes("corpo"),
  ss_nome_gesu: (t) => t.includes("filippesi") || t.includes("nome") || t.includes("gesù"),
  preziosissimo_sangue: (t) => t.includes("sangue") || t.includes("redenz"),
  sacro_cuore: (t) => t.includes("cuore") || t.includes("deuteronomio"),
  bvm: (t) => t.includes("maria") || t.includes("vergine") || t.includes("madre"),
  defunti: (t) => t.includes("giobbe"),
  ss_apostoli: (t) => t.includes("pietro") || t.includes("paolo"),
  tutti_santi: (t) => t.includes("apocalisse") || t.includes("beati"),
  angeli: (t) => t.includes("angeli") || t.includes("daniele"),
  sposi: (t) => t.includes("immagine") || t.includes("congiunto") || t.includes("mistero è grande"),
  malati: (t) => t.includes("infermit") || t.includes("malato") || t.includes("guar"),
  pace: (t) => t.includes("pace") || t.includes("beati") || t.includes("giustizia"),
};

let failed = 0;
for (const mass of masses) {
  const coverage = validateVotiveMassCoverage(mass, prefaceIds);
  if (!coverage.ok) {
    console.error(`FAIL ${mass.id}: ${coverage.errors.join("; ")}`);
    failed++;
    continue;
  }

  const merged = applyVotiveMassToLiturgy(baseLiturgy, mass);
  const colletta = merged.readings?.find((r) => r.type === "colletta")?.text || "";
  if (!colletta || colletta.includes("GIORNO CEI")) {
    console.error(`FAIL ${mass.id}: colletta non sostituita`);
    failed++;
    continue;
  }
  if (colletta.trim() !== mass.colletta?.trim()) {
    console.error(`FAIL ${mass.id}: colletta non corrisponde al formulario`);
    failed++;
    continue;
  }

  const choices = getVotiveMassDefaultChoices(mass, "Tempo Ordinario");
  if (!choices.prefaceId || !prefaceIds.has(choices.prefaceId)) {
    console.error(`FAIL ${mass.id}: preface default invalido (${choices.prefaceId})`);
    failed++;
    continue;
  }
  if (!choices.orazionaleId) {
    console.error(`FAIL ${mass.id}: orazione fedeli non mappata`);
    failed++;
    continue;
  }
  if (mass.id === "defunti" && choices.showGloria) {
    console.error(`FAIL ${mass.id}: Gloria dovrebbe essere OFF`);
    failed++;
    continue;
  }

  const lectCheck = lectionaryChecks[mass.id];
  if (lectCheck) {
    const prima = merged.readings?.find((r) => r.type === "prima_lettura")?.text || "";
    const vangelo = merged.readings?.find((r) => r.type === "vangelo")?.text || "";
    const scripture = `${prima} ${vangelo}`.toLowerCase();
    if (scripture.includes("gen 1,1") || scripture.includes("lettura del giorno cei")) {
      console.error(`FAIL ${mass.id}: letture ancora quelle del giorno`);
      failed++;
      continue;
    }
    if (!lectCheck(scripture)) {
      console.error(`FAIL ${mass.id}: letture proprie non riconosciute`);
      failed++;
      continue;
    }
  } else {
    console.error(`FAIL ${mass.id}: nessun controllo letture definito`);
    failed++;
    continue;
  }

  console.log(`OK  ${mass.id.padEnd(22)} ${mass.title}`);
}

if (failed > 0) {
  console.error(`\n${failed} messa/e votiva/e con errori`);
  process.exit(1);
}

console.log(`\nTutte le ${masses.length} messe votive verificate.`);
