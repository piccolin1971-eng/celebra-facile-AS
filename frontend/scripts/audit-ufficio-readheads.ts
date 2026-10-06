/**
 * Audit letture Ufficio: blocchi readHead (fonte, rif., tema, edizione).
 * Uso: npx tsx --require ./scripts/_rn-mock.cjs scripts/audit-ufficio-readheads.ts [YYYY-MM-DD] [giorni]
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { localDateStr, parseLocalDate, todayStr } from "../src/dateUtils";
import { hoursUrlForHour } from "../src/ore/scraper";
import { decodeHtmlEntities } from "../src/ore/html";
import { migrateOreBlocks, parseHourHtml } from "../src/ore/parseHour";
import type { OreBlock } from "../src/ore/types";

function normTheme(s: string): string {
  return decodeHtmlEntities(s)
    .replace(/\u200b/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const START = process.argv[2] || todayStr();
const DAYS = Math.max(1, Number(process.argv[3] || 20));

type Issue = { date: string; kind: string; detail: string };

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readingSections(blocks: OreBlock[]): Array<{ which: "prima" | "seconda"; i: number; after: OreBlock[] }> {
  const out: Array<{ which: "prima" | "seconda"; i: number; after: OreBlock[] }> = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k !== "title" || !/^(PRIMA|SECONDA)\s+LETTURA\b/i.test(b.text)) continue;
    const which = /PRIMA/i.test(b.text) ? "prima" : "seconda";
    const after: OreBlock[] = [];
    for (let j = i + 1; j < blocks.length; j++) {
      const n = blocks[j];
      if (n.k === "title" && /^(PRIMA|SECONDA)\s+LETTURA|RESPONSORIO|ORAZIONE\b/i.test(n.text)) break;
      if (n.k === "prose" || n.k === "stanza") break;
      after.push(n);
    }
    out.push({ which, i, after });
  }
  return out;
}

function auditUfficio(date: string, html: string, blocks: OreBlock[]): Issue[] {
  const issues: Issue[] = [];
  const push = (kind: string, detail: string) => issues.push({ date, kind, detail });

  const readingHtml = html.split(/PRIMA\s+LETTURA/i).slice(1).join(" ") || html;
  const ceiThemes = [...readingHtml.matchAll(/lo_sottotitolorosso[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 8 && t.length < 160 && !/^SALMO|CANTICO|INNO/i.test(t));

  const parsedThemes = blocks
    .filter((b) => b.k === "readHead" && b.role === "theme")
    .map((b) => normTheme(b.text));

  for (const raw of ceiThemes) {
    const nt = normTheme(raw);
    const hit = parsedThemes.some((p) => p === nt || p.includes(nt) || nt.includes(p));
    if (!hit) push("cei-theme-missing", decodeHtmlEntities(raw).slice(0, 70));
  }

  for (const { which, after } of readingSections(blocks)) {
    const heads = after.filter((b) => b.k === "readHead");
    const legacySubs = after.filter(
      (b) =>
        b.k === "sub" &&
        (/^(?:Dal|Dai|Dalla)\s/i.test(b.text) ||
          /^\(.*Disc\.|CCL|Opera omnia/i.test(b.text) ||
          (b.text.length > 8 && b.text.length < 140 && !/^\d/.test(b.text))),
    );

    if (legacySubs.length) {
      push("legacy-sub-after-lettura", `${which}: ${legacySubs[0].text.slice(0, 60)}`);
    }

    const source = heads.find((h) => h.role === "source");
    const proseSource = after.find((b) => b.k === "prose" && /^(?:Dal|Dai|Dalla)\s/i.test(b.text));
    if (proseSource) push("source-as-prose", `${which}: ${proseSource.text.slice(0, 70)}`);

    const editionTitle = after.find((b) => b.k === "title" && /^\(/.test(b.text));
    if (editionTitle) push("edition-as-title", editionTitle.text.slice(0, 80));

    const editionHead = heads.find((h) => h.role === "edition");
    const editionSub = after.find((b) => b.k === "sub" && /^\(.*\)$/.test(b.text.trim()));
    if (editionSub && !editionHead) push("edition-as-sub", editionSub.text.slice(0, 70));

    if (!source && !proseSource) push("missing-source", which);

    if (which === "seconda" && source && !heads.some((h) => h.role === "theme")) {
      const themeInProse = blocks
        .slice(blocks.findIndex((b) => b === after[0]))
        .find((b) => b.k === "prose" && b.text.length < 100 && !b.text.includes("«"));
      if (themeInProse) push("theme-in-prose", themeInProse.text.slice(0, 70));
    }

    // Ordine atteso: source [, ref] [, edition] [, theme]
    const order = heads.map((h) => h.role);
    const rank: Record<string, number> = { source: 0, ref: 1, edition: 2, theme: 3 };
    for (let k = 1; k < order.length; k++) {
      if (rank[order[k]] < rank[order[k - 1]]) {
        push("head-order", `${which}: ${order.join(">")}`);
        break;
      }
    }

    if (source && /\d[\d,\s\-–]+\s*-\s*\d/.test(source.text)) {
      push("ref-in-source", source.text.slice(0, 70));
    }
  }

  // Migrazione idempotente
  const migrated = migrateOreBlocks(blocks);
  if (JSON.stringify(migrated) !== JSON.stringify(blocks)) {
    push("migrate-not-idempotent", "blocks changed on second migrate");
  }

  return issues;
}

async function main() {
  const all: Issue[] = [];
  let fetchFail = 0;
  let daysClean = 0;

  for (let d = 0; d < DAYS; d++) {
    const iso = isoAdd(START, d);
    let html: string | null = null;
    for (let a = 0; a < 3; a++) {
      html = await fetchCeiUrl(hoursUrlForHour(iso, "ufficio"));
      if (html && html.length > 500 && !/nessun contenuto trovato/i.test(html)) break;
      await sleep(450 * (a + 1));
      html = null;
    }
    if (!html) {
      fetchFail += 1;
      all.push({ date: iso, kind: "fetch-fail", detail: "" });
      console.log(`${iso} FETCH FAIL`);
      continue;
    }

    const parsed = parseHourHtml(html, "ufficio", iso);
    const blocks = migrateOreBlocks(parsed.blocks);
    const issues = auditUfficio(iso, html, blocks);
    all.push(...issues);
    if (!issues.length) daysClean += 1;
    console.log(
      `${iso} blocks=${blocks.length} readHead=${blocks.filter((b) => b.k === "readHead").length}` +
        (issues.length ? ` ISSUES: ${issues.map((i) => i.kind).join(", ")}` : " ok"),
    );
    await sleep(200);
  }

  const byKind: Record<string, number> = {};
  for (const i of all) byKind[i.kind] = (byKind[i.kind] || 0) + 1;

  const summary = { start: START, days: DAYS, daysClean, fetchFail, issueCount: all.length, byKind, issues: all };
  writeFileSync("scripts/_ufficio-readheads-audit.json", JSON.stringify(summary, null, 2));
  console.log("\n=== RIEPILOGO ===");
  console.log(JSON.stringify({ daysClean, fetchFail, issueCount: all.length, byKind }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
