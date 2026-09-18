import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { addDays, localDateStr, parseLocalDate } from "../src/dateUtils";
import { scrubLoneParenLines, stripCeiMarianTail } from "../src/ore/bundled";
import { parseHourHtml } from "../src/ore/parseHour";
import { hoursUrl } from "../src/ore/scraper";
import { complineCeiSlug } from "../src/ore/titles";
import { getObservedSaintsForDate } from "../src/saintsCalendar";
import type { OreBlock } from "../src/ore/types";

type ComplineSchemaId = "sun-i" | "sun-ii" | "mon" | "tue" | "wed" | "thu" | "fri";

function dateLooksLikeFeast(d: Date): boolean {
  return getObservedSaintsForDate(d).some((s) => {
    const r = s.rank.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return r === "festa" || r === "solennita";
  });
}

const SCHEMAS: ComplineSchemaId[] = ["sun-i", "sun-ii", "mon", "tue", "wed", "thu", "fri"];

function weekdaySchema(d: Date): ComplineSchemaId {
  const dow = d.getDay();
  if (dow === 0) return "sun-ii";
  if (dow === 6) return "sun-i";
  return (["sun-ii", "mon", "tue", "wed", "thu", "fri", "sun-i"] as const)[dow];
}

function tidyComplineBlocks(blocks: OreBlock[]): OreBlock[] {
  const stripped = scrubLoneParenLines(
    stripCeiMarianTail(
      blocks.filter(
        (b) => b.k !== "marian" && !(b.k === "title" && /ANTIFONE DELLA BEATA VERGINE/i.test(b.text)),
      ),
    ),
  );
  const out: OreBlock[] = [];
  for (const b of stripped) {
    if (b.k === "stanza" && b.lines?.length === 2 && /^\d+\s*ant\.\s*$/i.test(b.lines[0].trim())) {
      out.push({ k: "rubric", lab: b.lines[0].trim(), text: b.lines[1].trim() });
      continue;
    }
    if (b.k === "sub") {
      const prev = out[out.length - 1];
      if (prev?.k === "psalmHead" && prev.sub.replace(/\s+/g, " ").trim() === b.text.replace(/\s+/g, " ").trim()) {
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

async function main() {
  const out: Partial<Record<ComplineSchemaId, { sourceDate: string; blocks: OreBlock[] }>> = {};
  let d = parseLocalDate("2026-10-19");
  for (let i = 0; i < 28 && SCHEMAS.some((s) => !out[s]); i++) {
    const iso = localDateStr(d);
    const schema = weekdaySchema(d);
    if (out[schema]) {
      d = addDays(d, 1);
      continue;
    }
    if (d.getDay() !== 0 && d.getDay() !== 6 && dateLooksLikeFeast(d)) {
      console.log(iso, "skip feast");
      d = addDays(d, 1);
      continue;
    }
    const slug = complineCeiSlug(d);
    const html = await fetchCeiUrl(hoursUrl(iso, slug));
    const parsed = parseHourHtml(html || "", "compieta");
    const psalms = parsed.blocks.filter((b) => b.k === "psalmHead").length;
    console.log(iso, schema, slug, "blocks", parsed.blocks.length, "psalms", psalms, parsed.error || "");
    if (parsed.blocks.length >= 8 && psalms >= 1) {
      out[schema] = { sourceDate: iso, blocks: tidyComplineBlocks(parsed.blocks) };
    }
    d = addDays(d, 1);
  }
  const missing = SCHEMAS.filter((s) => !out[s]);
  if (missing.length) {
    console.error("missing schemas", missing);
    process.exit(1);
  }
  writeFileSync(
    new URL("../src/ore/data/complineSchemas.json", import.meta.url),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
  console.log("wrote", Object.keys(out).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
