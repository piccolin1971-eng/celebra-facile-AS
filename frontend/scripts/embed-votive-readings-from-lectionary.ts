/**
 * Copia in votiveReadings.json le letture proprie dei formulari votivi
 * che oggi risolvono solo via saintLectionary (fallback).
 *
 * Uso: npx tsx scripts/embed-votive-readings-from-lectionary.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Reading } from "../src/liturgyScraper";

const ROOT = join(__dirname, "..");
const VOTIVE_READINGS = join(ROOT, "src/data/votiveReadings.json");
const LECTIONARY = join(ROOT, "src/data/saintLectionary.json");

/** Allineato a VOTIVE_LECTIONARY in votiveLiturgy.ts */
const FROM_LECTIONARY: Record<string, { mmdd: string; keyIncludes: string }> = {
  ss_nome_gesu: { mmdd: "01-03", keyIncludes: "santissimo nome di gesu" },
  angeli: { mmdd: "09-29", keyIncludes: "angeli" },
  ss_apostoli: { mmdd: "06-29", keyIncludes: "pietro e paolo" },
  tutti_santi: { mmdd: "11-01", keyIncludes: "tutti i santi" },
};

/** Prima lettura P&P nel lezionario santi ha ref corrotta; testo messale/CEI. */
const SS_APOSTOLI_PRIMA: Reading = {
  type: "prima_lettura",
  title: "Prima Lettura",
  reference: "Dagli Atti degli Apostoli (At 12,1-11)",
  text:
    "In quel tempo il re Erode cominciò a perseguitare alcuni membri della Chiesa. Fece uccidere di spada Giacomo, fratello di Giovanni. Vedendo che ciò era gradito ai Giudei, fece arrestare anche Pietro. Erano quelli i giorni degli Àzzimi. Lo fece catturare e lo gettò in carcere, consegnandolo in custodia a quattro picchetti di quattro soldati ciascuno, col proposito di farlo comparire davanti al popolo dopo la Pasqua.\nMentre Pietro dunque era tenuto in carcere, dalla Chiesa saliva incessantemente a Dio una preghiera per lui. In quella notte, quando Erode stava per farlo comparire davanti al popolo, Pietro, piantonato da due soldati e legato con due catene, stava dormendo, mentre davanti alle porte le sentinelle custodivano il carcere. Ed ecco, gli si presentò un angelo del Signore e una luce sfolgorò nella cella. Egli toccò il fianco di Pietro, lo destò e disse: «Àlzati, in fretta!». E le catene gli caddero dalle mani. L’angelo gli disse: «Mettiti la cintura e légati i sandali». E così fece. L’angelo disse: «Metti il mantello e seguimi!». Pietro uscì e prese a seguirlo, ma non si rendeva conto che era realtà ciò che stava succedendo per opera dell’angelo: credeva invece di avere una visione. Essi oltrepassarono il primo posto di guardia e il secondo e arrivarono alla porta di ferro che conduce in città; la porta si aprì da sé davanti a loro. Uscirono, percorsero una strada e a un tratto l’angelo si allontanò da lui. Pietro allora, rientrato in sé, disse: «Ora so veramente che il Signore ha mandato il suo angelo e mi ha strappato dalla mano di Erode e da tutto ciò che il popolo dei Giudei si attendeva».\n\nParola di Dio.",
};

type LectionaryFile = {
  entries: Record<string, Record<string, { readings: Reading[] }>>;
};

function lectionaryReadings(mmdd: string, keyIncludes: string): Reading[] | null {
  const entries = (JSON.parse(readFileSync(LECTIONARY, "utf8")) as LectionaryFile).entries?.[mmdd];
  if (!entries) return null;
  const key = Object.keys(entries).find((k) => k.includes(keyIncludes));
  return key ? entries[key].readings : null;
}

function normalizeSalmoR(readings: Reading[]): Reading[] {
  return readings.map((r) => {
    if (r.type !== "salmo" || !r.text?.trim()) return r;
    const t = r.text.trim();
    if (/^R\./m.test(t)) return r;
    const lines = t.split("\n").filter(Boolean);
    if (lines.length < 2) return r;
    const refrain = lines[0].endsWith(".") ? lines[0] : `${lines[0]}.`;
    const body = lines.slice(1).join("\n");
    return {
      ...r,
      reference: r.reference || "",
      text: `R. ${refrain}\n\n${body}\n\nR.`,
    };
  });
}

function patchApostoli(readings: Reading[]): Reading[] {
  return readings.map((r) => (r.type === "prima_lettura" ? SS_APOSTOLI_PRIMA : r));
}

function main() {
  const out = JSON.parse(readFileSync(VOTIVE_READINGS, "utf8")) as Record<string, Reading[]>;

  for (const [votiveId, spec] of Object.entries(FROM_LECTIONARY)) {
    let readings = lectionaryReadings(spec.mmdd, spec.keyIncludes);
    if (!readings?.length) {
      console.error(`SKIP ${votiveId}: nessuna lettura in lezionario (${spec.mmdd})`);
      continue;
    }
    readings = normalizeSalmoR(readings);
    if (votiveId === "ss_apostoli") readings = patchApostoli(readings);
    out[votiveId] = readings;
    console.log(`OK  ${votiveId} (${readings.length} segmenti)`);
  }

  writeFileSync(VOTIVE_READINGS, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\nAggiornato ${VOTIVE_READINGS}`);
}

main();
