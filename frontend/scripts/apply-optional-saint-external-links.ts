/**
 * Applica link Wikipedia e Santiebeati verificati a optionalSaintBios.json.
 * Uso: npx tsx scripts/apply-optional-saint-external-links.ts
 */
import fs from "fs";
import path from "path";
import catalog from "../src/data/optionalSaintsCatalog.json";
import {
  OPTIONAL_SAINT_SANTIE_BEATI,
  OPTIONAL_SAINT_WIKIPEDIA,
} from "../src/data/optionalSaintExternalLinks";

const OUT = path.resolve(__dirname, "../src/data/optionalSaintBios.json");

type Bio = { wikipediaUrl: string; santiebeatiUrl: string };

const bios = JSON.parse(fs.readFileSync(OUT, "utf8")) as Record<string, Bio>;
const saints = (catalog as { saints: { id: string }[] }).saints;
const missing: string[] = [];

for (const s of saints) {
  const bio = bios[s.id];
  if (!bio) {
    missing.push(`${s.id}: bio assente`);
    continue;
  }
  const wiki = OPTIONAL_SAINT_WIKIPEDIA[s.id];
  const sb = OPTIONAL_SAINT_SANTIE_BEATI[s.id];
  if (!wiki) missing.push(`${s.id}: wikipedia mancante in tabella`);
  if (!sb) missing.push(`${s.id}: santiebeati mancante in tabella`);
  if (wiki) bio.wikipediaUrl = wiki;
  if (sb) bio.santiebeatiUrl = sb;
}

fs.writeFileSync(OUT, JSON.stringify(bios, null, 2) + "\n", "utf8");
console.log("Aggiornato", OUT);
if (missing.length) {
  console.log("Avvisi:");
  for (const m of missing) console.log(" ", m);
  process.exit(1);
}
