/**
 * Scarica dal sito CEI le letture proprie delle solennità
 * usate dalle messe votive e scrive votiveReadings.json.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { scrapeLiturgy } from "../src/liturgyScraper";
import type { Reading } from "../src/liturgyScraper";

const SCRIPTURE_TYPES = new Set([
  "prima_lettura",
  "salmo",
  "seconda_lettura",
  "sequenza",
  "acclamazione",
  "vangelo",
]);

/** Votive id → data di riferimento CEI (solennità / festa fissa). */
const VOTIVE_CEi_DATES: Record<string, string> = {
  ss_trinita: "2026-05-31",
  spirito_santo: "2026-05-24",
  ss_sacramento: "2026-06-07",
  sacro_cuore: "2026-06-12",
  /** Lunedì dopo Pentecoste — Maria Madre della Chiesa (formulario BVM votivo). */
  bvm: "2026-05-25",
  /**
   * Il 1° luglio non è più solennità nel calendario CEI generale;
   * le letture proprie coincidono con quelle del SS.mo Corpo e Sangue.
   */
  preziosissimo_sangue: "2026-06-07",
  ss_nome_gesu: "2026-01-03",
  angeli: "2026-09-29",
  ss_apostoli: "2026-06-29",
  tutti_santi: "2026-11-01",
};

async function main() {
  const dest = join(__dirname, "../src/data/votiveReadings.json");
  let out: Record<string, Reading[]> = {};
  try {
    out = JSON.parse(readFileSync(dest, "utf8")) as Record<string, Reading[]>;
  } catch {
    /* nuovo file */
  }

  for (const [votiveId, iso] of Object.entries(VOTIVE_CEi_DATES)) {
    const d = new Date(`${iso}T12:00:00`);
    console.log(`Fetching ${votiveId} (${iso})...`);
    const lit = await scrapeLiturgy(d);
    const scripture = (lit.readings || []).filter((r) => SCRIPTURE_TYPES.has(r.type));
    console.log(
      `  ${lit.title?.slice(0, 55) || "?"} — ${scripture.length} letture` +
        (scripture[0] ? `, prima: ${scripture[0].reference}` : ""),
    );
    if (scripture.length) out[votiveId] = scripture;
    else console.warn(`  WARN: nessuna lettura per ${votiveId}`);
  }

  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`\nScritto ${dest} (${Object.keys(out).length} messe)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
