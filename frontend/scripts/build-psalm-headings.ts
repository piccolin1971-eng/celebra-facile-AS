import { writeFileSync } from "fs";
import { fetchLdoDayHtml, extractLdoHourHtml } from "../src/ore/ldo";
import { decodeHtmlEntities, stripTags } from "../src/ore/html";
import { normalizePsalmKey } from "../src/ore/psalmHeadings";
import type { MediaId, OreHourId } from "../src/ore/types";

const HOURS: Array<OreHourId | MediaId> = [
  "lodi",
  "vespri",
  "ufficio",
  "terza",
  "sesta",
  "nona",
  "compieta",
];

export function flattenLdoFonts(html: string): string {
  return html.replace(/<FONT CLASS=Minuscoletto>([\s\S]*?)<\/FONT>/gi, "$1");
}

type Head = { name: string; sub: string; cite: string };

function extractCite(sub: string): { sub: string; cite: string } {
  const m = sub.match(/^(.*?)(\([^)]+\.?\)\.?)\s*$/);
  if (!m) return { sub, cite: "" };
  return { sub: m[1].trim(), cite: m[2].trim() };
}

export function extractLdoPsalmHeads(hourHtml: string): Array<{ key: string; label: string; head: Head }> {
  const flat = flattenLdoFonts(hourHtml);
  const re =
    /<FONT CLASS=Risalto>([\s\S]*?)<\/FONT>(?:\s*<FONT CLASS=Spiegazione>([\s\S]*?)<\/FONT>)?(?:\s*<br\s*\/?>)*\s*(?:<FONT CLASS=Citazione>([\s\S]*?)<\/FONT>)?/gi;
  const out: Array<{ key: string; label: string; head: Head }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    const label = stripTags(m[1]).replace(/\s+/g, " ").trim();
    if (!/^(SALMO|CANTICO)\b/i.test(label)) continue;
    const name = stripTags(m[2] || "").replace(/\s+/g, " ").trim();
    const citRaw = stripTags(m[3] || "").replace(/\s+/g, " ").trim();
    if (!name && !citRaw) continue;
    const { sub, cite } = extractCite(citRaw);
    out.push({
      key: normalizePsalmKey(label),
      label,
      head: { name, sub, cite },
    });
  }
  return out;
}

function isoAdd(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

async function main() {
  const map: Record<string, Head> = {};
  const start = "2026-09-01";
  for (let i = 0; i < 42; i++) {
    const iso = isoAdd(start, i);
    const html = await fetchLdoDayHtml(iso);
    if (!html) {
      console.log(iso, "NO LDO");
      continue;
    }
    let n = 0;
    for (const h of HOURS) {
      const frag = extractLdoHourHtml(html, h);
      if (!frag) continue;
      for (const row of extractLdoPsalmHeads(frag)) {
        const prev = map[row.key];
        if (!prev) {
          map[row.key] = row.head;
          n += 1;
        } else if (!prev.sub && row.head.sub) {
          map[row.key] = row.head;
        }
      }
    }
    console.log(iso, "new", n, "total", Object.keys(map).length);
  }
  const ordered = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    new URL("../src/ore/data/psalmHeadings.json", import.meta.url),
    JSON.stringify(ordered, null, 2) + "\n",
    "utf8",
  );
  console.log("wrote", Object.keys(ordered).length, "keys");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
