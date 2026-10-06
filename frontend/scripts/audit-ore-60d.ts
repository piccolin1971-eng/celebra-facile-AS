/**
 * Audit Ore 60 giorni: tutte le ore CEI + letture Ufficio (readHead).
 * Uso: npx tsx --require ./scripts/_rn-mock.cjs scripts/audit-ore-60d.ts [YYYY-MM-DD] [giorni]
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
import { writeFileSync } from "fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { localDateStr, parseLocalDate, todayStr } from "../src/dateUtils";
import { hoursUrlForHour } from "../src/ore/scraper";
import {
  extractInvitatoryAntiphon,
  migrateOreBlocks,
  parseHourHtml,
  splitOraMediaHtml,
} from "../src/ore/parseHour";
import { hymnNeedsItalianAlternate } from "../src/ore/hymnLang";
import type { MediaId, OreBlock, OreHourId, ParsedHour } from "../src/ore/types";

const START = process.argv[2] || todayStr();
const DAYS = Math.max(1, Number(process.argv[3] || 60));

const HOURS: OreHourId[] = ["invitatorio", "ufficio", "lodi", "ora-media", "vespri", "compieta"];
const JUNK = /facebook|twitter|whatsapp|condividi|\bsharer\.php|\bjavascript:|Grandezza Testo|cci-share/i;
const ENTITY = /&(?:egrave|eacute|agrave|ograve|ugrave|igrave|aelig|oelig|nbsp|rsquo|dagger|laquo)[;]?/i;

type Issue = { date: string; hour: string; kind: string; detail: string };

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function blobOf(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn") return b.hymns.map((h) => h.stanzas.flat().join("\n")).join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name} ${b.sub} ${b.cite}`;
      if (b.k === "marian") return b.antiphons.map((a) => a.join(" ")).join(" ");
      if (b.k === "tone") return `${b.intro}\n${b.refrain}`;
      if (b.k === "readHead") return b.text;
      if (b.k === "title" || b.k === "sub" || b.k === "omit" || b.k === "prose") return b.text;
      return "";
    })
    .join("\n");
}

function hourQuality(hour: string, blocks: OreBlock[], parsed: ParsedHour, html?: string): string[] {
  const out: string[] = [];
  if (parsed.error) out.push(`ERR:${parsed.error.slice(0, 40)}`);
  if (!blocks.length && hour !== "invitatorio") out.push("VUOTO");
  const blob = blobOf(blocks);
  if (JUNK.test(blob)) out.push("JUNK_SOCIAL");
  if (ENTITY.test(blob)) out.push("ENTITA_HTML");
  if (/div class=/i.test(blob)) out.push("CODA_HTML");
  const hymns = blocks.filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn");
  const st = hymns.reduce((n, h) => n + h.hymns.reduce((m, x) => m + x.stanzas.length, 0), 0);
  const hymnTitle = blocks.some((b) => b.k === "title" && /^INNO\b/i.test(b.text));
  const hasPsalm = blocks.some((b) => b.k === "psalmHead");
  if (
    ["lodi", "terza", "sesta", "nona"].includes(hour) &&
    st === 0 &&
    !/Te Deum/i.test(blob) &&
    !hymnTitle &&
    hasPsalm
  ) {
    out.push("SENZA_INNO");
  }
  if (hour === "compieta" && !blocks.some((b) => b.k === "marian")) out.push("SENZA_MARIANE");
  if (
    !["invitatorio", "compieta", "ufficio"].includes(hour) &&
    !blocks.some((b) => b.k === "psalmHead")
  ) {
    out.push("SENZA_SALMO");
  }
  if (
    hour === "ufficio" &&
    !blocks.some((b) => b.k === "title" && /PRIMA\s+LETTURA/i.test(b.text)) &&
    html &&
    /lo_titolo[^>]*>\s*PRIMA\s+LETTURA\s*</i.test(html)
  ) {
    out.push("MANCA_PRIMA_LETTURA");
  }
  for (const b of blocks) {
    if (b.k === "prose" && /^[.\s·•…]+$/.test(b.text)) out.push("PUNTO_ORFANO");
  }
  if (hymns.some((h) => hymnNeedsItalianAlternate(h.hymns))) out.push("INNO_LATINO");
  return out;
}

function ufficioReadingIssues(blocks: OreBlock[]): string[] {
  const out: string[] = [];
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
    const heads = after.filter((x) => x.k === "readHead");
    const legacySubs = after.filter(
      (x) =>
        x.k === "sub" &&
        (/^(?:Dal|Dai|Dalla)\s/i.test(x.text) || /^\(.*Disc\.|CCL|Opera omnia/i.test(x.text)),
    );
    if (legacySubs.length) out.push(`LETTURA_${which}:SUB_LEGACY`);
    if (after.some((x) => x.k === "prose" && /^(?:Dal|Dai|Dalla|Dall['’])(?:\s|[«"“'’])/i.test(x.text))) {
      out.push(`LETTURA_${which}:FONTE_PROSA`);
    }
    if (after.some((x) => x.k === "title" && /^\(/.test(x.text))) out.push(`LETTURA_${which}:EDIZIONE_TITOLO`);
    const source = heads.find((h) => h.role === "source");
    if (!source) out.push(`LETTURA_${which}:MANCA_FONTE`);
    if (
      source &&
      !heads.some((h) => h.role === "ref") &&
      (/\d[\d,\s\-–]+\s*-\s*\d/.test(source.text) || /\d+,\s*\d+(?:\s*[-–]\s*[\d\s,]+)?\s*$/.test(source.text.trim()))
    ) {
      out.push(`LETTURA_${which}:RIF_IN_FONTE`);
    }
  }
  return out;
}

async function fetchHourParsed(
  dateISO: string,
  hour: OreHourId,
): Promise<Array<{ hour: string; parsed: ParsedHour; html?: string }>> {
  if (hour === "invitatorio") {
    const html = await fetchCeiUrl(hoursUrlForHour(dateISO, hour));
    if (!html) return [{ hour, parsed: { hour, blocks: [], error: "fetch" } }];
    const ant = extractInvitatoryAntiphon(html);
    return [
      {
        hour,
        parsed: {
          hour,
          blocks: ant ? [{ k: "prose", text: ant }] : [],
          error: ant ? undefined : "ANT_MANCANTE",
        },
      },
    ];
  }
  if (hour === "ora-media") {
    const html = await fetchCeiUrl(hoursUrlForHour(dateISO, hour));
    if (!html) {
      return (["terza", "sesta", "nona"] as MediaId[]).map((id) => ({
        hour: id,
        parsed: { hour: id, blocks: [], error: "fetch" },
      }));
    }
    const parts = splitOraMediaHtml(html);
    return (["terza", "sesta", "nona"] as MediaId[]).map((id) => {
      const parsed = parseHourHtml(parts[id], id, dateISO);
      return { hour: id, parsed: { ...parsed, blocks: migrateOreBlocks(parsed.blocks) } };
    });
  }
  const html = await fetchCeiUrl(hoursUrlForHour(dateISO, hour));
  if (!html) return [{ hour, parsed: { hour, blocks: [], error: "fetch" } }];
  const parsed = parseHourHtml(html, hour, dateISO);
  const blocks = hour === "ufficio" ? migrateOreBlocks(parsed.blocks) : parsed.blocks;
  return [{ hour, parsed: { ...parsed, blocks }, html: hour === "ufficio" ? html : undefined }];
}

async function main() {
  const all: Issue[] = [];
  const byKind: Record<string, number> = {};
  const bump = (date: string, hour: string, kind: string, detail = "") => {
    all.push({ date, hour, kind, detail });
    byKind[kind] = (byKind[kind] || 0) + 1;
  };

  let daysClean = 0;
  for (let d = 0; d < DAYS; d++) {
    const iso = isoAdd(START, d);
    const dayIssues: string[] = [];
    for (const h of HOURS) {
      let rows: Array<{ hour: string; parsed: ParsedHour }>;
      try {
        rows = await fetchHourParsed(iso, h);
      } catch (e) {
        bump(iso, h, "FETCH_EX", String(e).slice(0, 60));
        dayIssues.push(h);
        continue;
      }
      for (const { hour, parsed, html } of rows) {
        const blocks = parsed.blocks || [];
        for (const k of hourQuality(hour, blocks, parsed, html)) {
          bump(iso, hour, k);
          dayIssues.push(`${hour}:${k}`);
        }
        if (hour === "ufficio") {
          for (const k of ufficioReadingIssues(blocks)) {
            bump(iso, hour, k);
            dayIssues.push(`${hour}:${k}`);
          }
        }
      }
      await sleep(120);
    }
    if (!dayIssues.length) daysClean += 1;
    console.log(`${iso} ${dayIssues.length ? dayIssues.slice(0, 8).join(" ") : "ok"}`);
    await sleep(80);
  }

  const summary = { start: START, days: DAYS, daysClean, issueCount: all.length, byKind, issues: all };
  writeFileSync("scripts/_ore-60d-audit.json", JSON.stringify(summary, null, 2));
  console.log("\n=== RIEPILOGO ===");
  console.log(JSON.stringify({ daysClean, days: DAYS, issueCount: all.length, byKind }, null, 2));
  const samples = Object.keys(byKind)
    .sort((a, b) => (byKind[b] || 0) - (byKind[a] || 0))
    .slice(0, 12);
  for (const k of samples) {
    const ex = all.find((i) => i.kind === k);
    if (ex) console.log(`  ${k} (${byKind[k]}): ${ex.date} ${ex.hour} ${ex.detail}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
