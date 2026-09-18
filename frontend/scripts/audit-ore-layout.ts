/**
 * Controlla layout Ore che l’audit “presenza” non vede:
 * antifone vuote, titoli cantico uniti, Madonna duplicata / fuori stagione, «(» monchi.
 *
 * Uso: npx tsx scripts/audit-ore-layout.ts [YYYY-MM-DD] [giorni]
 */
import { fetchCeiUrl } from "../src/liturgyScraper";
import { addDays, localDateStr, parseLocalDate } from "../src/dateUtils";
import { computeEasterSunday, firstAdventSunday } from "../src/liturgicalDates";
import { getBundledCompline } from "../src/ore/complineBundled";
import { parseHourHtml } from "../src/ore/parseHour";
import { hoursUrl } from "../src/ore/scraper";
import { ceiHourSlug } from "../src/ore/titles";
import type { OreBlock, OreHourId } from "../src/ore/types";

const START = process.argv[2] || "2026-09-16";
const DAYS = Number(process.argv[3] || 14);
const HOURS: OreHourId[] = ["vespri", "compieta"];

type Issue = { date: string; hour: string; kind: string; detail: string };

function issuesFor(dateISO: string, hour: string, blocks: OreBlock[]): Issue[] {
  const out: Issue[] = [];
  const date = parseLocalDate(dateISO);

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "rubric" && /ant/i.test(b.lab) && !b.text.trim()) {
      out.push({ date: dateISO, hour, kind: "empty-ant", detail: `${b.lab} @${i}` });
    }
    if (b.k === "psalmHead" && /Inno di|Lode alla|Preghiera/i.test(b.num) && !b.name) {
      out.push({ date: dateISO, hour, kind: "mashed-title", detail: b.num.slice(0, 80) });
    }
    if (b.k === "psalmHead" && /\bCfr\.\b/i.test(b.num) && /Inno /i.test(b.num)) {
      out.push({ date: dateISO, hour, kind: "mashed-canticle", detail: b.num.slice(0, 80) });
    }
    if (b.k === "stanza" && b.lines.some((l) => l.trim() === "(" || l.trim() === ")")) {
      out.push({ date: dateISO, hour, kind: "lone-paren", detail: `stanza@${i}` });
    }
  }

  const aveCount = blocks.reduce((n, b) => {
    if (b.k === "stanza" && /Ave,? o Maria/i.test(b.lines[0] || "")) return n + 1;
    if (b.k === "marian") return n + b.antiphons.filter((a) => /Ave,? o Maria/i.test(a[0] || "")).length;
    return n;
  }, 0);
  if (aveCount > 1) {
    out.push({ date: dateISO, hour, kind: "dup-ave-maria", detail: `count=${aveCount}` });
  }

  const marian = blocks.find((b) => b.k === "marian");
  if (marian && marian.k === "marian") {
    const firsts = marian.antiphons.map((a) => a[0] || "");
    const easter = computeEasterSunday(date.getFullYear());
    const pentecost = addDays(easter, 49);
    const t = date.getTime();
    const inEaster = t >= easter.getTime() && t <= pentecost.getTime();
    const advent = firstAdventSunday(date.getFullYear()).getTime();
    if (!inEaster && firsts.some((f) => /Regina dei cieli/i.test(f))) {
      out.push({ date: dateISO, hour, kind: "regina-out-of-season", detail: firsts.join(" | ") });
    }
    if (t > pentecost.getTime() && t < advent && !firsts.some((f) => /Salve,? Regina/i.test(f))) {
      out.push({ date: dateISO, hour, kind: "missing-salve", detail: firsts.join(" | ") });
    }
    if (blocks.some((b) => b.k === "omit" && /antifona della Beata/i.test(b.text))) {
      out.push({ date: dateISO, hour, kind: "cei-marian-tail", detail: "Si conclude… ancora presente" });
    }
  }

  return out;
}

async function main() {
  const all: Issue[] = [];
  let d = parseLocalDate(START);
  for (let i = 0; i < DAYS; i++) {
    const iso = localDateStr(d);
    for (const hour of HOURS) {
      let blocks: OreBlock[] = [];
      if (hour === "compieta") {
        const bundled = getBundledCompline(iso);
        if (bundled?.blocks?.length) {
          blocks = bundled.blocks;
        } else {
          const html = await fetchCeiUrl(hoursUrl(iso, ceiHourSlug(hour, d)));
          blocks = parseHourHtml(html || "", hour, iso).blocks;
        }
      } else {
        const html = await fetchCeiUrl(hoursUrl(iso, ceiHourSlug(hour, d)));
        blocks = parseHourHtml(html || "", hour, iso).blocks;
      }
      const found = issuesFor(iso, hour, blocks);
      all.push(...found);
      const mark = found.length ? `FAIL ${found.map((x) => x.kind).join(",")}` : "ok";
      console.log(iso, hour, "blocks", blocks.length, mark);
    }
    d = addDays(d, 1);
  }
  console.log("\nTOTAL ISSUES", all.length);
  for (const x of all) console.log("-", x.date, x.hour, x.kind, x.detail);
  if (all.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
