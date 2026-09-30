/**
 * Audit approfondito sessioni «Messe votive e rituali».
 * Esegui: npx tsx scripts/audit-ritual-sessions.ts
 */
import ritualMassesData from "../src/data/ritualMasses.json";
import votiveMassesData from "../src/data/votiveMasses.json";
import votiveReadingsData from "../src/data/votiveReadings.json";
import prefacesData from "../src/data/prefaces.json";
import {
  applyVotiveMassToLiturgy,
  getVotiveMassDefaultChoices,
  hasVotiveProperReadings,
  resolveVotivePrefaceId,
} from "../src/votiveLiturgy";
import { getPrayerById } from "../src/orazionale";
import {
  buildRitualMassSession,
  getQuickMass,
  listRitualFamilies,
  ritualAllowedPrayerIds,
  ritualPeSelections,
  VOTIVE_IDS_REPLACED_BY_RITUAL,
  type RitualMass,
} from "../src/ritualMasses";

type Issue = { severity: "error" | "warn"; id: string; msg: string };
const issues: Issue[] = [];

function note(severity: Issue["severity"], id: string, msg: string) {
  issues.push({ severity, id, msg });
}

const prefaceIds = new Set(
  (Array.isArray(prefacesData)
    ? (prefacesData as { id: string }[])
    : (prefacesData as { prefaces?: { id: string }[] }).prefaces || []
  ).map((p) => p.id),
);

const baseLiturgy = {
  date: "2026-09-30",
  title: "Feriale",
  liturgical_color: "verde",
  season: { season: "Tempo Ordinario" },
  readings: [
    { type: "prima_lettura", title: "Prima", reference: "DAY", text: "giorno" },
    { type: "salmo", title: "Salmo", reference: "DAY", text: "giorno" },
    { type: "vangelo", title: "Vangelo", reference: "DAY", text: "giorno" },
    { type: "colletta", title: "Colletta", reference: "", text: "colletta giorno" },
  ],
};

console.log("=== FAMIGLIE ===");
for (const f of listRitualFamilies()) {
  console.log(`- ${f.id}: ${f.title} (${f.masses.length})`);
}

console.log("\n=== RITUALI (defunti + matrimonio) ===");
for (const m of ritualMassesData as RitualMass[]) {
  const sid = m.id;
  const sess = buildRitualMassSession(m);
  const or = sess.selectedOrazionaleId ? getPrayerById(sess.selectedOrazionaleId) : null;
  const prefOk = !!(sess.selectedPrefaceId && prefaceIds.has(sess.selectedPrefaceId));
  const proper = hasVotiveProperReadings(sid);
  const applied = applyVotiveMassToLiturgy(baseLiturgy as any, m);
  const prima = applied.readings.find((r) => r.type === "prima_lettura");

  console.log(`\n${sid}`);
  console.log(`  title: ${m.title}`);
  console.log(`  peKind=${m.peKind} pe=${sess.selectedPrayerId} peSel=${JSON.stringify(sess.peSelections)}`);
  console.log(`  gloria=${sess.showGloria} credo=${sess.showCredo}`);
  console.log(`  preface=${sess.selectedPrefaceId} ok=${prefOk}`);
  console.log(`  orazionale=${sess.selectedOrazionaleId} → ${or?.title || "MANCANTE"}`);
  console.log(`  letture proprie=${proper} prima=${prima?.reference?.slice(0, 55)}`);

  if (!prefOk) note("error", sid, `prefazio assente/non trovato: ${sess.selectedPrefaceId}`);
  if (!or) note("error", sid, `orazionale mancante: ${sess.selectedOrazionaleId}`);
  if (or && /tutti i santi/i.test(or.title) && m.peKind === "matrimonio") {
    note("error", sid, `orazionale Errato Tutti i Santi (${or.id}) per matrimonio`);
  }
  if (!proper) note("error", sid, "mancano letture proprie in votiveReadings");
  if (prima?.reference === "DAY") note("error", sid, "letture del giorno non sostituite");
  if (m.peKind === "defunti" && sess.showGloria) note("warn", sid, "Gloria attiva su defunti");
  if (m.peKind === "matrimonio" && !sess.showGloria) note("warn", sid, "Gloria spenta su matrimonio");
  if (m.peKind === "defunti") {
    const pe2 = ritualPeSelections("defunti", "pe2");
    const pe3 = ritualPeSelections("defunti", "pe3");
    if (pe2.rito !== "defunti") note("error", sid, "PE2 rito defunti assente");
    if (pe3.memoria_defunti !== "defunti") note("error", sid, "PE3 memoria_defunti assente");
  }
  if (m.peKind === "matrimonio") {
    const pe2 = ritualPeSelections("matrimonio", "pe2");
    if (pe2.rito !== "matrimonio") note("error", sid, "PE2 rito matrimonio assente");
    const allowed = ritualAllowedPrayerIds("matrimonio");
    if (!allowed?.includes("pe2") || !allowed.includes("pe3")) {
      note("error", sid, "PE consentite non pe2/pe3");
    }
  }
  for (const field of ["colletta", "antifona_ingresso", "sulle_offerte", "dopo_comunione"] as const) {
    if (!(m as any)[field]?.trim()) note("warn", sid, `${field} vuoto`);
  }
}

console.log("\n=== VOTIVE GENERICHE (catalogo quick) ===");
const votives = (votiveMassesData as { id: string; title: string; preface_id?: string }[]).filter(
  (m) => !VOTIVE_IDS_REPLACED_BY_RITUAL.has(m.id),
);
for (const m of votives) {
  const quick = getQuickMass(m.id);
  if (!quick) {
    note("error", m.id, "non in getQuickMass");
    continue;
  }
  const sess = buildRitualMassSession(quick);
  const choices = getVotiveMassDefaultChoices(m as any);
  const pref = resolveVotivePrefaceId(m.preface_id) || sess.selectedPrefaceId;
  const prefOk = !!(pref && prefaceIds.has(pref));
  const or = sess.selectedOrazionaleId ? getPrayerById(sess.selectedOrazionaleId) : null;
  const proper = hasVotiveProperReadings(m.id);
  const applied = applyVotiveMassToLiturgy(baseLiturgy as any, m as any);
  const prima = applied.readings.find((r) => r.type === "prima_lettura");

  console.log(
    `${m.id}: oraz=${sess.selectedOrazionaleId || "-"} (${or?.title?.slice(0, 40) || "n/d"})` +
      ` prefOk=${prefOk} letture=${proper ? prima?.reference?.slice(0, 40) : "GIORNO/assenti"}`,
  );

  if (!prefOk) note("warn", m.id, `prefazio dubbio: ${pref}`);
  if (!or) note("warn", m.id, "nessuna preghiera dei fedeli mappata");
  if (!proper && !(votiveReadingsData as any)[m.id]) {
    note("warn", m.id, "senza letture embedded (userà giorno o lezionario santi se mappato)");
  }
  if (choices.orazionaleId === "st_22" && m.id !== "tutti_santi") {
    note("error", m.id, "orazionale st_22 (Tutti i Santi) inappropriato");
  }
}

console.log("\n=== DISTINZIONE LETTURE ===");
const readingSig = (id: string) =>
  JSON.stringify(
    ((votiveReadingsData as any)[id] || []).map((x: any) => [x.type, x.reference]),
  );
for (const group of [
  ["defunti_a", "defunti_b", "defunti_c", "defunti_d"],
  ["matrimonio_anniversario", "matrimonio_25", "matrimonio_50"],
] as const) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const same = readingSig(group[i]) === readingSig(group[j]);
      console.log(`${group[i]} vs ${group[j]}: ${same ? "STESSE" : "distinte"}`);
      if (same) note("error", group[i], `stesso set letture di ${group[j]}`);
    }
  }
}

console.log("\n=== ESITO ===");
const errors = issues.filter((i) => i.severity === "error");
const warns = issues.filter((i) => i.severity === "warn");
for (const i of issues) {
  console.log(`${i.severity.toUpperCase()} [${i.id}] ${i.msg}`);
}
console.log(`\n${errors.length} errori, ${warns.length} avvisi`);
if (errors.length) process.exitCode = 1;
