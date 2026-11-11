/**
 * Controllo prima del publish: poche ore campione dal CEI, stesso parser dell'app.
 * Ferma la build se l'inno è impaginato male (strofa su una riga, «Oppure» nel testo, niente antifone numerate).
 *
 * Esegui: yarn check:ore-publish
 */
import { fetchCeiUrl } from "../src/liturgyScraper";
import { parseLocalDate } from "../src/dateUtils";
import { hourParsedHymnLooksCollapsed } from "../src/ore/hourCacheHealth";
import { parseHourHtml } from "../src/ore/parseHour";
import { hoursUrl } from "../src/ore/scraper";
import { ceiFetchDateISO, ceiHourSlug } from "../src/ore/titles";
import type { Hymn, OreBlock, OreHourId } from "../src/ore/types";

const SAMPLES: { iso: string; why: string }[] = [
  { iso: "2026-11-13", why: "feria" },
  { iso: "2026-11-15", why: "domenica" },
  { iso: "2026-11-11", why: "festa (inno nel versetto CEI)" },
];

const HOURS: OreHourId[] = ["lodi", "vespri"];

function hymnsOf(blocks: OreBlock[]): Hymn[] {
  return blocks.flatMap((b) => (b.k === "hymn" ? b.hymns : []));
}

function issuesFor(blocks: OreBlock[], hour: OreHourId): string[] {
  const out: string[] = [];
  if (!blocks.length) {
    out.push("ora vuota");
    return out;
  }
  const hymns = hymnsOf(blocks);
  if (!hymns.length) out.push("manca l'inno");
  if (hourParsedHymnLooksCollapsed(hour, { hour, blocks })) {
    out.push("prima strofa tutta su una riga");
  }
  for (const hymn of hymns) {
    if (hymn.label && /^Oppure:?$/i.test(hymn.label) === false && /^Oppure:?$/i.test(hymn.stanzas[0]?.[0] || "")) {
      out.push("«Oppure» finito dentro la strofa");
    }
    for (const stanza of hymn.stanzas) {
      const first = stanza[0] || "";
      const words = first.split(/\s+/).filter(Boolean).length;
      if (stanza.length === 1 && words >= 12) out.push(`strofa su una riga: «${first.slice(0, 48)}»`);
      if (/^Oppure:?$/i.test(first)) out.push("«Oppure» letto come verso");
    }
  }
  if (hymns.length >= 2 && !hymns.some((h) => h.label && /^Oppure\b/i.test(h.label))) {
    out.push("secondo inno senza «Oppure»");
  }
  const numbered = blocks.some((b) => b.k === "rubric" && /\d+\s*ant\./i.test(b.lab || ""));
  if (!numbered) out.push("mancano le antifone numerate");
  return out;
}

async function main() {
  const fails: string[] = [];
  for (const sample of SAMPLES) {
    const date = parseLocalDate(sample.iso);
    for (const hour of HOURS) {
      const label = `${sample.iso} ${hour} (${sample.why})`;
      const slug = ceiHourSlug(hour, date);
      const fetchISO = ceiFetchDateISO(sample.iso, hour);
      const html = await fetchCeiUrl(hoursUrl(fetchISO, slug));
      if (!html) {
        fails.push(`${label}: pagina CEI non scaricata`);
        continue;
      }
      const parsed = parseHourHtml(html, hour, sample.iso);
      const issues = issuesFor(parsed.blocks, hour);
      if (parsed.error && !parsed.blocks.length) issues.unshift(parsed.error);
      if (issues.length) fails.push(`${label}: ${issues.join("; ")}`);
      else console.log(`ok ${label}`);
    }
  }
  if (fails.length) {
    console.error(fails.join("\n"));
    process.exit(1);
  }
  console.log("OK check-ore-publish");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
