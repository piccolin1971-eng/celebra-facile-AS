/**
 * Audit titoli letture Ufficio + intro V/R + punti orfani.
 * Uso: npx tsx --require ./scripts/_rn-mock.cjs scripts/audit-ufficio-titles.ts [YYYY-MM-DD] [giorni]
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { localDateStr, parseLocalDate, todayStr } from "../src/dateUtils";
import { hoursUrl, hoursUrlForHour } from "../src/ore/scraper";
import { ceiHourSlug } from "../src/ore/titles";
import { parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import type { OreBlock, OreHourId, MediaId } from "../src/ore/types";

const START = process.argv[2] || todayStr();
const DAYS = Math.max(1, Number(process.argv[3] || 20));

type Issue = { date: string; hour: string; kind: string; detail: string };

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function auditBlocks(date: string, hour: string, blocks: OreBlock[]): Issue[] {
  const out: Issue[] = [];
  const push = (kind: string, detail: string) => out.push({ date, hour, kind, detail });

  // Intro V./R. come rubric
  const first = blocks.find((b) => b.k !== "omit");
  if (first?.k === "stanza" && /^V\./i.test(first.lines[0] || "")) {
    push("intro-vr-as-stanza", first.lines[0].slice(0, 60));
  }

  // Punti orfani
  for (const b of blocks) {
    if (b.k === "prose" && /^[.\s·•…]+$/.test(b.text)) {
      push("orphan-period", JSON.stringify(b.text));
    }
  }

  if (hour !== "ufficio") return out;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k !== "title" || !/^(PRIMA|SECONDA)\s+LETTURA\b/i.test(b.text)) continue;
    const which = /PRIMA/i.test(b.text) ? "prima" : "seconda";
    const after: OreBlock[] = [];
    for (let j = i + 1; j < blocks.length && after.length < 6; j++) {
      const n = blocks[j];
      if (n.k === "title" && /LETTURA|RESPONSORIO|ORAZIONE/i.test(n.text)) break;
      after.push(n);
    }
    const subs = after.filter((x) => x.k === "sub");
    const proses = after.filter((x) => x.k === "prose");

    // Fonte (Dalla/Dai…)
    const source = subs.find((x) => x.k === "sub" && /^(?:Dal|Dalla|Dallo|Dai|Dalle|Dall['’])\s/i.test(x.text));
    if (!source && which === "seconda") {
      // Seconda patristica di solito ha Dai…
      const asProse = proses.find((x) => x.k === "prose" && /^(?:Dal|Dai)\s/i.test(x.text));
      if (asProse) push("source-as-prose", asProse.text.slice(0, 80));
      else if (!subs.length) push("missing-source", which);
    }
    if (!source && which === "prima") {
      const asProse = proses.find((x) => x.k === "prose" && /^(?:Dal|Dalla)\s/i.test(x.text));
      if (asProse) push("source-as-prose", asProse.text.slice(0, 80));
    }

    // Citazione edizione non deve essere title
    for (const n of after) {
      if (n.k === "title" && /^\(.*Disc\.|Nn\.|CCL|Opera omnia/i.test(n.text)) {
        push("edition-as-title", n.text.slice(0, 90));
      }
    }

    // Dopo Prima: almeno fonte; tema rosso spesso presente (sub senza Dai)
    if (which === "prima" && source) {
      const theme = subs.find(
        (x) =>
          x.k === "sub" &&
          x !== source &&
          !/^\(/.test(x.text) &&
          !/^\d/.test(x.text) &&
          x.text.length > 8 &&
          x.text.length < 120,
      );
      // Non sempre c'è tema; segnala solo se CEI tipicamente lo ha via sottotitolorosso
      // Heuristica: se c'è un solo sub (solo fonte) e il corpo inizia subito, ok-ish;
      // se manca del tutto un secondo sub "tematico" non forziamo fail su tutti i giorni.
      void theme;
    }

    if (which === "seconda") {
      const edition = subs.find((x) => x.k === "sub" && /^\(.*\)$/.test(x.text.trim()));
      const theme = subs.find(
        (x) =>
          x.k === "sub" &&
          !/^(?:Dal|Dai)\s/i.test(x.text) &&
          !/^\(/.test(x.text) &&
          x.text.length > 8 &&
          x.text.length < 140,
      );
      if (source && !edition && after.some((x) => x.k === "title" && /^\(/.test(x.text))) {
        push("edition-as-title", "seconda");
      }
      if (source && !theme) {
        // molte seconde hanno tema; se manca solo fonte+corpo segnala soft
        const onlySource = subs.length === 1;
        if (onlySource) push("missing-theme-seconda", source.text.slice(0, 60));
      }
    }
  }

  // Psalm heads senza nome (es. lo_sottotitolonoi mal gestito)
  for (const b of blocks) {
    if (b.k === "psalmHead" && /^SALMO\b/i.test(b.num) && !b.name.trim()) {
      push("empty-psalm-name", b.num);
    }
  }

  // Deve esistere PRIMA LETTURA nell'ufficio
  if (hour === "ufficio" && !blocks.some((b) => b.k === "title" && /PRIMA\s+LETTURA/i.test(b.text))) {
    push("missing-prima-lettura", "");
  }

  return out;
}

async function fetchParsed(iso: string, hour: OreHourId | MediaId | "ora-media") {
  if (hour === "ora-media" || hour === "terza" || hour === "sesta" || hour === "nona") {
    let html: string | null = null;
    for (let a = 0; a < 3; a++) {
      html = await fetchCeiUrl(hoursUrl(iso, "ora-media"));
      if (html && html.length > 500 && !/nessun contenuto trovato/i.test(html)) break;
      await sleep(400 * (a + 1));
      html = null;
    }
    if (!html) return { ok: false as const, issues: [{ date: iso, hour: "ora-media", kind: "fetch-fail", detail: "ora-media" }] };
    const parts = splitOraMediaHtml(html);
    const issues: Issue[] = [];
    for (const id of ["terza", "sesta", "nona"] as MediaId[]) {
      const parsed = parseHourHtml(parts[id], id, iso);
      if (!parsed.blocks.length) {
        issues.push({ date: iso, hour: id, kind: "empty", detail: parsed.error || "" });
      } else {
        issues.push(...auditBlocks(iso, id, parsed.blocks));
      }
    }
    return { ok: issues.every((i) => i.kind !== "fetch-fail" && i.kind !== "empty"), issues };
  }
  const url = hoursUrlForHour(iso, hour as OreHourId);
  let html: string | null = null;
  for (let a = 0; a < 3; a++) {
    html = await fetchCeiUrl(url);
    if (html && html.length > 500 && !/nessun contenuto trovato/i.test(html)) break;
    await sleep(400 * (a + 1));
    html = null;
  }
  if (!html) return { ok: false as const, issues: [{ date: iso, hour, kind: "fetch-fail", detail: hour }] };
  const parsed = parseHourHtml(html, hour, iso);
  if (!parsed.blocks.length) {
    return { ok: false as const, issues: [{ date: iso, hour, kind: "empty", detail: parsed.error || "" }] };
  }
  return { ok: true as const, issues: auditBlocks(iso, hour, parsed.blocks), blocks: parsed.blocks };
}

async function main() {
  const all: Issue[] = [];
  let daysOk = 0;
  for (let d = 0; d < DAYS; d++) {
    const iso = isoAdd(START, d);
    const hours: Array<OreHourId | "ora-media"> = ["ufficio", "lodi", "vespri", "ora-media"];
    let dayFail = false;
    for (const h of hours) {
      const r = await fetchParsed(iso, h);
      all.push(...r.issues);
      if (!r.ok) dayFail = true;
      await sleep(150);
    }
    if (!dayFail) daysOk += 1;
    const dayIssues = all.filter((i) => i.date === iso);
    console.log(
      `${iso} issues=${dayIssues.length}` +
        (dayIssues.length ? ` [${dayIssues.map((i) => i.kind).join(", ")}]` : ""),
    );
  }

  const byKind: Record<string, number> = {};
  for (const i of all) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  const summary = { start: START, days: DAYS, daysOk, issueCount: all.length, byKind, issues: all };
  writeFileSync("scripts/_ufficio-titles-audit.json", JSON.stringify(summary, null, 2));
  console.log("\n=== RIEPILOGO ===");
  console.log(JSON.stringify({ daysOk, issueCount: all.length, byKind }, null, 2));
  for (const i of all.slice(0, 40)) {
    console.log(`${i.date} ${i.hour} ${i.kind} ${i.detail}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
