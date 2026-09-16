/**
 * Audit strutturale Ore vs HTML CEI: i buchi del primo audit a 30 giorni.
 * Non è un check di presenza («c’è INNO»). Confronta strofe, <br> latini,
 * petizioni/sottotitoli, Magnificat/Benedictus.
 *
 * Uso: npx tsx scripts/audit-ore-structure.ts [YYYY-MM-DD] [giorni]
 */
import { writeFileSync } from "node:fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { localDateStr, parseLocalDate } from "../src/dateUtils";
import { hasClass, liturgicalFragment, stripTags, topLevelNodes, type HtmlNode } from "../src/ore/html";
import { looksLatinText } from "../src/ore/hymnLang";
import { parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import { ceiHourSlug } from "../src/ore/titles";
import type { MediaId, OreBlock, OreHourId, ParsedHour } from "../src/ore/types";

const START = process.argv[2] || "2026-09-16";
const DAYS = Number(process.argv[3] || 12);
const OUT = "scripts/_ore-structure-audit.json";
const HOURS: OreHourId[] = ["ufficio", "lodi", "ora-media", "vespri", "compieta"];

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(dateISO: string, slug: string): Promise<string> {
  const data = dateISO.replace(/-/g, "");
  const local = `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  const direct = `https://www.chiesacattolica.it/la-liturgia-delle-ore/?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(local);
    if (res.ok) {
      const html = await res.text();
      if (html.length > 800) return html;
    }
  } catch {
    /* proxy spento */
  }
  const html = await fetchCeiUrl(direct);
  if (!html || html.length < 800) throw new Error(`HTML corto ${slug}`);
  return html;
}

function blobOf(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn") return b.hymns.map((h) => h.stanzas.map((s) => s.join("\n")).join("\n\n")).join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name} ${b.sub} ${b.cite}`;
      if (b.k === "tone") return `${b.intro}\n${b.refrain}`;
      if (b.k === "title" || b.k === "sub" || b.k === "omit" || b.k === "prose") return b.text;
      return "";
    })
    .join("\n");
}

function hymnBlob(blocks: OreBlock[]): string {
  return blocks
    .filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn")
    .map((h) => h.hymns.map((x) => x.stanzas.flat().join("\n")).join("\n"))
    .join("\n");
}

function parsedHymns(blocks: OreBlock[]) {
  return blocks.filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn").flatMap((b) => b.hymns);
}

function sliceAfterHeading(frag: string, heading: RegExp): string {
  const re = new RegExp(
    `<(?:div|span)[^>]*class="[^"]*lo_(?:titolo|rosso)[^"]*"[^>]*>\\s*(?:${heading.source})\\b`,
    "i",
  );
  const m = re.exec(frag);
  if (!m) return "";
  return frag.slice(m.index);
}

function hymnSectionHtml(frag: string): string {
  const fromInno = sliceAfterHeading(frag, /INNO/);
  if (!fromInno) return "";
  const end = fromInno.search(
    /<(?:div|span)[^>]*class="[^"]*(?:lo_antifona|lo_titolo)[^"]*"[^>]*>\s*(?:\d+\s*ant\.|SALMO|CANTICO|Ant\.)/i,
  );
  return end > 80 ? fromInno.slice(0, end) : fromInno.slice(0, 12000);
}

function precesSectionHtml(frag: string, heading: "INVOCAZIONI" | "INTERCESSIONI"): string {
  const from = sliceAfterHeading(frag, new RegExp(heading));
  if (!from) return "";
  const end = from.search(
    /<(?:div|span)[^>]*class="[^"]*lo_(?:titolo|rosso)[^"]*"[^>]*>\s*(?:PADRE\s+NOSTRO|ORAZIONE)\b/i,
  );
  return end > 80 ? from.slice(0, end) : from.slice(0, 8000);
}

function normKey(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[«»""]/g, "")
    .trim();
}

function visitVersetti(html: string, fn: (inner: string, node: HtmlNode) => void): void {
  const walk = (inner: string) => {
    for (const n of topLevelNodes(inner)) {
      if (n.kind !== "el") continue;
      if (hasClass(n.cls, "lo_versetto")) fn(n.inner, n);
      walk(n.inner);
    }
  };
  walk(html);
}

/** Testo del versetto padre prima dei figli lo_versetto (prima strofa CEI annidata). */
function nestedLeadings(hymnHtml: string): string[] {
  const out: string[] = [];
  visitVersetti(hymnHtml, (inner) => {
    const kids = topLevelNodes(inner);
    if (!kids.some((k) => k.kind === "el" && hasClass(k.cls, "lo_versetto"))) return;
    let lead = "";
    for (const k of kids) {
      if (k.kind === "el" && hasClass(k.cls, "lo_versetto")) break;
      if (k.kind === "el" && hasClass(k.cls, "lo_rosso") && /^\s*INNO\s*$/i.test(stripTags(k.inner))) continue;
      if (k.kind === "br") lead += "<br/>";
      else if (k.kind === "text") lead += k.text;
      else if (k.kind === "el") lead += k.inner;
    }
    const t = normKey(stripTags(lead));
    if (t.length >= 18 && !/^Oppure\b/i.test(t)) out.push(t);
  });
  return out;
}

/** Versi CEI: solo `<br>`, whitespace HTML compresso (come deve apparire). */
function ceiBrLines(inner: string): string[] {
  const kids = topLevelNodes(inner);
  const nested = kids.filter((k) => k.kind === "el" && hasClass(k.cls, "lo_versetto"));
  if (nested.length) {
    const lines: string[] = [];
    let acc = "";
    const flush = () => {
      lines.push(...ceiBrLines(acc));
      acc = "";
    };
    for (const k of kids) {
      if (k.kind === "el" && hasClass(k.cls, "lo_versetto")) {
        flush();
        lines.push(...ceiBrLines(k.inner));
        continue;
      }
      if (k.kind === "br") acc += "<br/>";
      else if (k.kind === "text") acc += k.text;
      else if (k.kind === "el") acc += `<${k.tag} class="${k.cls}">${k.inner}</${k.tag}>`;
    }
    flush();
    return lines.filter(Boolean);
  }
  return inner
    .split(/<br\s*\/?>/i)
    .map((s) =>
      stripTags(s)
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim(),
    )
    .filter(Boolean);
}

function latinCeiLineCount(hymnHtml: string): number {
  let n = 0;
  const walk = (inner: string) => {
    const kids = topLevelNodes(inner);
    const nested = kids.filter((k) => k.kind === "el" && hasClass(k.cls, "lo_versetto"));
    if (!nested.length) {
      const lines = ceiBrLines(inner);
      if (looksLatinText(lines.join(" ")) && lines.length >= 2) n += lines.length;
      return;
    }
    let acc = "";
    const flushLead = () => {
      const lead = ceiBrLines(acc);
      acc = "";
      if (looksLatinText(lead.join(" ")) && lead.length >= 2) n += lead.length;
    };
    for (const k of kids) {
      if (k.kind === "el" && hasClass(k.cls, "lo_versetto")) {
        flushLead();
        if (/lo_antifona/.test(k.inner) || /^\d+\s*ant\./i.test(stripTags(k.inner))) continue;
        walk(k.inner);
        continue;
      }
      if (k.kind === "br") acc += "<br/>";
      else if (k.kind === "text") acc += k.text;
      else if (k.kind === "el") acc += `<${k.tag} class="${k.cls}">${k.inner}</${k.tag}>`;
    }
    flushLead();
  };
  walk(hymnHtml);
  return n;
}

function parsedLatinLineCount(blocks: OreBlock[]): number {
  let n = 0;
  for (const h of parsedHymns(blocks)) {
    const blob = h.stanzas.flat().join(" ");
    if (!looksLatinText(blob)) continue;
    n += h.stanzas.flat().length;
  }
  return n;
}

const GENDER_ORPHAN = /^(?:\(|\)|Hæ|Hae|Hǽ|quas|quos|Hi)$/i;

function orphanGenderLines(blocks: OreBlock[]): string[] {
  const out: string[] = [];
  for (const h of parsedHymns(blocks)) {
    for (const st of h.stanzas) {
      for (const line of st) {
        const t = line.trim();
        if (GENDER_ORPHAN.test(t)) out.push(t);
      }
    }
  }
  return out;
}

function countSottotitoli(section: string): number {
  return (section.match(/class="[^"]*lo_sottotitolo/gi) || []).length;
}

function countPrecesDashes(section: string): number {
  const inRosso = section.match(
    /lo_rosso[^>]*>[\s\S]*?(?:&mdash;|&ndash;|—|–|&minus;)\s*<\/div>/gi,
  );
  if (inRosso?.length) return inRosso.length;
  return (section.match(/&mdash;|—/g) || []).length;
}

function parsedPrecesPairs(blocks: OreBlock[]): Extract<OreBlock, { k: "stanza" }>[] {
  return blocks.filter((b): b is Extract<OreBlock, { k: "stanza" }> => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));
}

function mashedPetition(pairs: Extract<OreBlock, { k: "stanza" }>[]): boolean {
  return pairs.some((p) => {
    const pet = p.lines.filter((l) => !/^—/.test(l)).join(" ");
    const starts = pet.match(/(?:^|[.!?]\s+)(?:Perché|Perchè|Per i tuoi|Per le tue)\b/gi) || [];
    const noi = pet.match(/\bNoi ti lodiamo e ti adoriamo, o /gi) || [];
    return starts.length >= 2 || noi.length >= 2 || pet.length > 520;
  });
}

function ceiGospelAnt(frag: string, which: "Magn" | "Ben"): string {
  const re = new RegExp(
    `lo_antifona[^>]*>\\s*Ant\\.\\s*al\\s*${which}\\.?\\s*</div>([\\s\\S]*?)(?:<div class="lo_|<div class="cci-)`,
    "i",
  );
  const m = frag.match(re);
  if (!m) return "";
  return normKey(stripTags(m[1]));
}

function issuesForHour(hour: OreHourId | MediaId, html: string, parsed: ParsedHour): string[] {
  const out: string[] = [];
  const frag = liturgicalFragment(html);
  const blocks = parsed.blocks || [];
  const blob = blobOf(blocks);
  const hBlob = hymnBlob(blocks);

  if (parsed.error) out.push(`ERR:${parsed.error}`);
  if (!blocks.length) {
    out.push("VUOTO");
    return out;
  }

  const hymnHtml = hymnSectionHtml(frag);
  if (hymnHtml) {
    for (const lead of nestedLeadings(hymnHtml)) {
      const key = lead.slice(0, 28);
      if (key.length >= 18 && !normKey(hBlob).toLowerCase().includes(key.slice(0, 22).toLowerCase())) {
        out.push(`INNO_STROFA_PADRE_PERSA(${key.slice(0, 36)})`);
      }
    }

    const orphans = orphanGenderLines(blocks);
    if (orphans.length) out.push(`INNO_LATINO_PARENTESI_SPEZZATE(${orphans.slice(0, 6).join("|")})`);

    const ceiN = latinCeiLineCount(hymnHtml);
    const appN = parsedLatinLineCount(blocks);
    if (ceiN >= 6 && appN > 0 && appN >= ceiN + 4) {
      out.push(`INNO_LATINO_PIU_RIGHE_DEI_BR(cei=${ceiN} app=${appN})`);
    }
    if (ceiN >= 6 && appN > 0 && appN <= ceiN - 4) {
      out.push(`INNO_LATINO_MENO_RIGHE_DEI_BR(cei=${ceiN} app=${appN})`);
    }
  }

  const precesHead = hour === "lodi" || hour === "terza" || hour === "sesta" || hour === "nona" ? "INVOCAZIONI" : "INTERCESSIONI";
  const checkPreces = hour === "lodi" || hour === "vespri";
  if (checkPreces) {
    const section = precesSectionHtml(frag, precesHead);
    if (section) {
      const subs = countSottotitoli(section);
      const dashes = countPrecesDashes(section);
      const pairs = parsedPrecesPairs(blocks);
      const expected = Math.max(subs > 1 ? subs - 1 : 0, dashes);
      if (expected >= 3 && pairs.length < expected) {
        out.push(`PRECES_COPPIE_VS_CEI(cei≈${expected} sub=${subs} —=${dashes} app=${pairs.length})`);
      }
      if (subs >= 3 && pairs.length <= 1) {
        out.push(`PRECES_PETIZIONI_INCOLLATE(sub=${subs} coppie=${pairs.length})`);
      }
      if (mashedPetition(pairs)) out.push("PRECES_TESTO_INCOLLATO_IN_COPPIA");
      if (!blocks.some((b) => b.k === "tone")) out.push("TONO_MANCANTE");
    }
  }

  if (hour === "vespri" && /CANTICO DELLA BEATA VERGINE|CANTICO DI MARIA/i.test(frag)) {
    if (!/l.anima mia magnifica|magnificat anima/i.test(blob)) out.push("MAGNIFICAT_CORPO_PERSO");
    const ant = ceiGospelAnt(frag, "Magn");
    if (ant.length >= 16 && !normKey(blob).toLowerCase().includes(ant.slice(0, 22).toLowerCase())) {
      out.push(`MAGNIFICAT_ANTIFONA_PERSA(${ant.slice(0, 36)})`);
    }
  }
  if (hour === "lodi" && /CANTICO DI ZACCARIA/i.test(frag)) {
    if (!/Benedetto il Signore Dio/i.test(blob)) out.push("BENEDICTUS_CORPO_PERSO");
    const ant = ceiGospelAnt(frag, "Ben");
    if (ant.length >= 16 && !normKey(blob).toLowerCase().includes(ant.slice(0, 22).toLowerCase())) {
      out.push(`BENEDICTUS_ANTIFONA_PERSA(${ant.slice(0, 36)})`);
    }
  }

  return out;
}

type Row = { iso: string; hour: string; issues: string[] };

async function main() {
  const rows: Row[] = [];
  const tally: Record<string, number> = {};
  const bump = (k: string) => {
    tally[k] = (tally[k] || 0) + 1;
  };

  console.log(`Audit strutturale Ore ${START} + ${DAYS} giorni\n`);

  for (let i = 0; i < DAYS; i++) {
    const iso = isoAdd(START, i);
    const date = parseLocalDate(iso);
    const wd = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][date.getDay()];
    for (const hour of HOURS) {
      const slug = ceiHourSlug(hour, date);
      let html = "";
      try {
        html = await fetchHtml(iso, slug);
      } catch (e) {
        const issues = [`FETCH:${(e as Error).message}`];
        rows.push({ iso, hour, issues });
        issues.forEach(bump);
        console.log(`${iso} ${wd} ${hour}  ${issues.join(" | ")}`);
        await sleep(250);
        continue;
      }

      const run = (id: OreHourId | MediaId, piece: string) => {
        const parsed = parseHourHtml(piece, id);
        const issues = issuesForHour(id, piece, parsed);
        rows.push({ iso, hour: String(id), issues });
        issues.forEach((iss) => bump(iss.replace(/\(.*$/, "")));
        const flag = issues.length ? issues.join(" | ") : "ok";
        console.log(`${iso} ${wd} ${id}  ${flag}`);
      };

      if (hour === "ora-media") {
        const parts = splitOraMediaHtml(html);
        for (const id of ["terza", "sesta", "nona"] as MediaId[]) run(id, parts[id]);
      } else {
        run(hour, html);
      }
      await sleep(280);
    }
  }

  const fails = rows.filter((r) => r.issues.length);
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), start: START, days: DAYS, tally, fails, rows }, null, 2),
    "utf8",
  );
  console.log("\nTALLY");
  const keys = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
  if (!keys.length) console.log("  (nessun issue)");
  for (const k of keys) console.log(`  ${tally[k]}\t${k}`);
  console.log(`\nOre con issue: ${fails.length}/${rows.length}`);
  console.log(`Scritto ${OUT}`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
