/**
 * Confronto LDO (CEI) ↔ app dopo parse+migrate per il Benedicite alle Lodi.
 * Esegui: yarn audit:dn3-lodi  (richiede rete)
 */
import { fetchLdoDayHtml, extractLdoHourHtml } from "../src/ore/ldo";
import { parseLdoHourHtml } from "../src/ore/parseLdo";
import { migrateOreBlocks } from "../src/ore/parseHour";
import {
  BENEDICITE_NO_GLORIA_RUBRIC,
  isLongBenediciteCanticleHead,
  isBenediciteCanticleHead,
} from "../src/ore/benediciteRubric";
import type { OreBlock } from "../src/ore/types";

const CASES: Array<{ iso: string; label: string; expect: "short" | "long" }> = [
  { iso: "2026-11-08", label: "Dn3 corto (IV settimana)", expect: "short" },
  { iso: "2026-11-15", label: "Dn3 lungo (I settimana)", expect: "long" },
  { iso: "2026-10-25", label: "Dn3 corto (II settimana)", expect: "short" },
  { iso: "2026-10-04", label: "Dn3 lungo (III settimana)", expect: "long" },
];

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

function hasGloriaStanza(blocks: OreBlock[]): boolean {
  return blocks.some(
    (b) =>
      b.k === "stanza" &&
      b.lines?.some((l) => /^Gloria al Padre\b/i.test(l)) &&
      b.lines.some((l) => /Spirito Santo/i.test(l)),
  );
}

function benediciteSlice(blocks: OreBlock[]): { head: OreBlock; tail: OreBlock[] } | null {
  const i = blocks.findIndex((b) => isBenediciteCanticleHead(b));
  if (i < 0) return null;
  const j = blocks.findIndex((b, k) => k > i && b.k === "psalmHead");
  const end = j < 0 ? blocks.length : j;
  return { head: blocks[i], tail: blocks.slice(i + 1, end) };
}

async function auditOne(iso: string, label: string, expect: "short" | "long") {
  const dayHtml = await fetchLdoDayHtml(iso);
  if (!dayHtml) fail(`${iso}: LDO non scaricabile`);
  const lodHtml = extractLdoHourHtml(dayHtml, "lodi");
  if (!/Dn\s*3/i.test(lodHtml)) {
    console.log(`SKIP ${iso} (${label}): nessun Dn 3 alle Lodi`);
    return;
  }
  const ldoLong = /Dn\s*3,\s*57-88/i.test(lodHtml);
  const ldoShort = /Dn\s*3,\s*52-57/i.test(lodHtml);
  if (expect === "long" && !ldoLong) fail(`${iso}: atteso lungo sul LDO`);
  if (expect === "short" && !ldoShort) fail(`${iso}: atteso corto sul LDO`);

  const parsed = parseLdoHourHtml(lodHtml, "lodi", iso);
  const blocks = migrateOreBlocks(parsed.blocks);
  const slice = benediciteSlice(blocks);
  if (!slice) fail(`${iso}: head Benedicite mancante dopo parse`);

  const longHead = isLongBenediciteCanticleHead(slice.head);
  if (expect === "long" && !longHead) fail(`${iso}: head non riconosciuto come lungo`);
  if (expect === "short" && longHead) fail(`${iso}: head non riconosciuto come corto`);

  const rubrics = slice.tail.filter((b) => b.k === "omit" && b.text === BENEDICITE_NO_GLORIA_RUBRIC);
  if (expect === "short") {
    if (rubrics.length) fail(`${iso}: rubrica su Benedicite corto`);
    if (hasGloriaStanza(slice.tail)) fail(`${iso}: Gloria scritto dopo corto`);
  } else {
    if (rubrics.length !== 1) fail(`${iso}: rubrica lungo assente o duplicata`);
    if (hasGloriaStanza(slice.tail)) fail(`${iso}: Gloria scritto dopo lungo`);
  }
  console.log(`OK ${iso} ${label} (${expect})`);
}

async function main() {
  for (const c of CASES) {
    await auditOne(c.iso, c.label, c.expect);
  }
  console.log("OK audit-dn3-lodi-cei");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
