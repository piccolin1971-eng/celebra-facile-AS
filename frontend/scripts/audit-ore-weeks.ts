/**
 * Controllo Ore + Messa su più settimane.
 * Uso: npx tsx scripts/audit-ore-weeks.ts [YYYY-MM-DD] [giorni]
 */
import { getFullLiturgyByDateStr } from "../src/localLiturgy";
import { parseLocalDate, localDateStr } from "../src/dateUtils";
import { liturgicalFragment, extractHoursBanner, hasHoursMarkup } from "../src/ore/html";
import { hourHeadMeta } from "../src/ore/dayHead";
import { extractInvitatoryAntiphon, parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import { ceiHourSlug, hourTitle } from "../src/ore/titles";
import type { MediaId, OreBlock, OreHourId } from "../src/ore/types";

const START = process.argv[2] || "2026-09-15";
const DAYS = Number(process.argv[3] || 28);
const HOURS: OreHourId[] = ["invitatorio", "ufficio", "lodi", "ora-media", "vespri", "compieta"];
const MEDIA: MediaId[] = ["terza", "sesta", "nona"];
const JUNK = /facebook|twitter|whatsapp|condividi|\bsharer\.php|\bjavascript:|Grandezza Testo|cci-share/i;
const ENTITY = /&(?:egrave|eacute|agrave|ograve|ugrave|igrave|aelig|oelig|nbsp|rsquo|dagger|laquo)[;]?/i;

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeLiturgy(html: string): boolean {
  if (!html || html.length < 800) return false;
  if (/nessun contenuto trovato/i.test(html) && !hasHoursMarkup(html)) return false;
  return hasHoursMarkup(html) || /cci-liturgia-ore/i.test(html);
}

function isPsalmPartTitle(t: string): boolean {
  return /^(I{1,3}|IV|V|VI)\s*(\(|$)/i.test(String(t || "").trim());
}

function psalmBodyIssues(blocks: OreBlock[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k !== "psalmHead") continue;
    let sawStanza = false;
    for (let j = i + 1; j < blocks.length; j++) {
      const n = blocks[j];
      if (n.k === "stanza") {
        sawStanza = true;
        break;
      }
      if (n.k === "psalmHead" || n.k === "hymn" || n.k === "tone") break;
      if (n.k === "title" && isPsalmPartTitle(n.text)) continue;
      if (n.k === "title") break;
    }
    if (!sawStanza) out.push(`SALMO_SENZA_VERSETTI(${b.num})`);
  }
  return out;
}

function blobOf(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn") return b.hymns.map((h) => h.stanzas.map((s) => s.join("\n")).join("\n\n")).join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name} ${b.sub} ${b.cite}`;
      if (b.k === "marian") return b.antiphons.map((a) => a.join(" ")).join(" ");
      if (b.k === "tone") return `${b.intro}\n${b.refrain}`;
      if (b.k === "title" || b.k === "sub" || b.k === "omit" || b.k === "prose") return b.text;
      return "";
    })
    .join("\n");
}

function hymnBlob(blocks: OreBlock[]): string {
  return blocks
    .filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn")
    .map((h) => h.hymns.map((x) => x.stanzas.map((s) => s.join("\n")).join("\n\n")).join("\n"))
    .join("\n");
}

async function fetchHtml(dateISO: string, slug: string): Promise<string> {
  const data = dateISO.replace(/-/g, "");
  const local = `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  const direct =
    `https://www.chiesacattolica.it/la-liturgia-delle-ore/?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  let last = "";
  for (const url of [local, direct]) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "CelebraFacileAudit/1.0" } });
        if (!res.ok) {
          last = `HTTP ${res.status} ${slug}`;
          if (attempt < 3) await sleep(700 * attempt);
          continue;
        }
        const html = await res.text();
        if (html.length < 400) {
          last = `HTML corto ${html.length} ${slug}`;
          if (attempt < 3) await sleep(700 * attempt);
          continue;
        }
        return html;
      } catch (e) {
        last = (e as Error).message;
        if (attempt < 3) await sleep(700 * attempt);
      }
    }
  }
  throw new Error(last || `fetch ${slug}`);
}

function precesSectionHtml(html: string, heading: string): string {
  const frag = liturgicalFragment(html);
  const re = new RegExp(
    `<(?:div|span)[^>]*class="[^"]*lo_(?:titolo|rosso)[^"]*"[^>]*>\\s*${heading}\\b`,
    "i",
  );
  const m = re.exec(frag);
  if (!m) return "";
  const rest = frag.slice(m.index);
  const end = rest.search(
    /<(?:div|span)[^>]*class="[^"]*lo_(?:titolo|rosso)[^"]*"[^>]*>\s*(?:PADRE\s+NOSTRO|ORAZIONE)\b/i,
  );
  return end > 80 ? rest.slice(0, end) : rest;
}

function countCeiOppure(section: string): number {
  const rosso = section.match(/lo_rosso[^>]*>\s*Oppure\b/gi) || [];
  if (rosso.length) return rosso.length;
  return (section.match(/\bOppure\s*:/gi) || []).length;
}

function countCeiDashes(section: string): number {
  return (section.match(/&mdash;|—/g) || []).length;
}

function precesIssues(hour: OreHourId | MediaId, html: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  if (hour !== "lodi" && hour !== "vespri") return out;
  const heading = hour === "lodi" ? "INVOCAZIONI" : "INTERCESSIONI";
  const section = precesSectionHtml(html, heading);
  const hasHeading = /INVOCAZIONI|INTERCESSIONI/i.test(html);
  if (!hasHeading) return out;

  const titles = blocks.filter((b) => b.k === "title").map((b) => b.text);
  if (!titles.some((t) => new RegExp(heading, "i").test(t))) out.push(`TITOLO_${heading}_PERSO`);

  const ceiOpp = section ? countCeiOppure(section) : 0;
  const ceiDash = section ? countCeiDashes(section) : 0;
  const secondForm =
    ceiOpp >= 1 &&
    !/\bOppure\s*:\s*\(/i.test(section.replace(/<[^>]+>/g, " ")) &&
    /\b(preghiamo|diciamo|acclamiamo|invochiamo|rivolgiamo)\b/i.test(
      (section.split(/\bOppure\s*:/i)[1] || "").replace(/<[^>]+>/g, " ").slice(0, 220),
    );
  const parsedOpp = blocks.filter((b) => b.k === "omit" && /^Oppure\b/i.test(b.text)).length;
  const tones = blocks.filter((b): b is Extract<OreBlock, { k: "tone" }> => b.k === "tone");
  const pairs = blocks.filter((b) => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));

  if (secondForm && parsedOpp < 1) out.push(`PRECES_OPPURE_PERSO(cei=${ceiOpp} app=${parsedOpp})`);
  if (secondForm && tones.length < 2) {
    out.push(`PRECES_SECONDO_TONO_PERSO(toni=${tones.length} attesi=2)`);
  }
  if (ceiDash >= 4 && pairs.length < Math.min(4, Math.floor(ceiDash * 0.6))) {
    out.push(`PRECES_COPPIE_POCHE(cei—=${ceiDash} app=${pairs.length})`);
  }

  for (const t of tones) {
    if (!t.intro || t.intro.length < 12) out.push("TONO_INTRO_CORTA");
    if (!t.refrain || t.refrain.length < 8) out.push("TONO_RISPOSTA_MANCANTE");
    if (t.refrain && t.intro.includes(t.refrain.slice(0, 18))) out.push("TONO_RISPOSTA_DENTRO_INTRO");
  }
  if (!tones.length) out.push("TONO_MANCANTE");

  for (const p of pairs) {
    if (p.k !== "stanza") continue;
    const dashes = p.lines.filter((l) => /^—/.test(l)).length;
    if (dashes && p.lines.length !== 2) out.push(`COPPIA_STRANA(${p.lines.length}r/${dashes}—)`);
    if (p.lines.length >= 2 && /^—/.test(p.lines[0] || "")) out.push("COPPIA_INIZIA_CON_TRATTINO");
  }

  if (secondForm) {
    const i0 = blocks.findIndex((b) => b.k === "tone");
    const iOr = blocks.findIndex((b) => b.k === "omit" && /^Oppure\b/i.test(b.text));
    const i1 = blocks.findIndex((b, i) => b.k === "tone" && i > iOr);
    if (!(i0 >= 0 && iOr > i0 && i1 > iOr)) out.push("PRECES_OPPURE_ORDINE");
  }
  return out;
}

function structureIssues(hour: OreHourId | MediaId, html: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  const blob = blobOf(blocks) + "\n" + hymnBlob(blocks);
  if (!blocks.length && hour !== "invitatorio") out.push("VUOTO");
  if (JUNK.test(blob)) out.push("JUNK_SOCIAL");
  if (ENTITY.test(blob)) out.push("ENTITA_HTML");
  if (/div class=/i.test(blob)) out.push("CODA_HTML");
  if (/\sbr\b/i.test(blob) || /<br\s*$/im.test(blob)) out.push("BR_RESIDUO");

  const hymns = blocks.filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn");
  const st = hymns.reduce((n, h) => n + h.hymns.reduce((m, x) => m + x.stanzas.length, 0), 0);
  if (hour !== "invitatorio" && st === 0 && !/Te Deum/i.test(blob)) out.push("SENZA_INNO");
  if (hymns.some((h) => h.hymns.length >= 2 && !h.hymns.some((x) => x.label && /^Oppure\b/i.test(x.label)))) {
    out.push("SECONDO_INNO_SENZA_OPPURE");
  }

  const psalms = blocks.filter((b): b is Extract<OreBlock, { k: "psalmHead" }> => b.k === "psalmHead");
  if (hour !== "invitatorio" && hour !== "compieta" && psalms.length === 0) out.push("SENZA_SALMO");
  for (const p of psalms) {
    if (/SALMO/i.test(p.num) && !p.name && !p.sub) out.push(`SALMO_SENZA_TITOLO(${p.num})`);
  }

  if (hour === "lodi" && /CANTICO\s+DI\s+ZACCARIA|Benedictus/i.test(html) && !/Benedetto il Signore/i.test(blob)) {
    out.push("BENEDICTUS_PERSO");
  }
  if (hour === "vespri" && /CANTICO\s+DI\s+MARIA|Magnificat/i.test(html) && !/magnifica/i.test(blob)) {
    out.push("MAGNIFICAT_PERSO");
  }
  if ((hour === "lodi" || hour === "vespri") && /Padre nostro/i.test(html) && !/Padre nostro/i.test(blob)) {
    out.push("PADRE_NOSTRO_PERSO");
  }
  if (hour === "ufficio" && /RESPONSORIO/i.test(html) && !/RESPONSORIO/i.test(blob)) out.push("RESPONSORIO_PERSO");
  if (hour === "ufficio" && /LETTURA/i.test(html) && !/LETTURA/i.test(blob)) out.push("LETTURA_PERSA");
  if (hour === "ufficio" && /TE DEUM/i.test(html) && !/Te Deum/i.test(blob)) out.push("TE_DEUM_PERSO");
  if (hour === "compieta") {
    if (!blocks.some((b) => b.k === "marian")) out.push("SENZA_MARIANE");
    if (/Nunc dimittis|CANTICO\s+DI\s+SIMEONE|Ora, o Signore, lascia/i.test(html) && !/lascia (che il tuo servo|andare)|Nunc dimittis/i.test(blob)) {
      if (!/Signore.*servo/i.test(blob)) out.push("NUNC_PERSO");
    }
  }
  if ((hour === "lodi" || hour === "vespri") && /LETTURA\s+BREVE/i.test(html)) {
    if (!blocks.some((b) => b.k === "title" && /LETTURA/i.test(b.text)) && !/LETTURA BREVE/i.test(blob)) {
      out.push("LETTURA_BREVE_PERSA");
    }
  }
  if ((hour === "lodi" || hour === "vespri") && />\s*ORAZIONE\s*</i.test(html)) {
    if (!blocks.some((b) => b.k === "title" && /ORAZIONE/i.test(b.text))) out.push("ORAZIONE_PERSA");
  }
  if ((hour === "terza" || hour === "sesta" || hour === "nona") && blocks.length < 8) out.push("ORA_MEDIA_TRONCA");
  out.push(...psalmBodyIssues(blocks));
  return out;
}

function expectsSecondReading(iso: string, title: string, saints: { rank?: string }[]): boolean {
  const d = parseLocalDate(iso);
  if (d.getDay() === 0) return true;
  if (/domenica|solennit/i.test(title)) return true;
  return saints.some((s) => s.rank === "solennita");
}

function massIssues(iso: string, lit: Awaited<ReturnType<typeof getFullLiturgyByDateStr>>): string[] {
  const out: string[] = [];
  const types = new Set((lit.readings || []).map((r) => r.type));
  if (lit.error) out.push(`SCRAPE:${lit.error}`);
  if (!lit.title?.trim()) out.push("SENZA_TITOLO");
  if (!lit.readings?.length) out.push("SENZA_LETTURE");
  for (const t of ["prima_lettura", "salmo", "vangelo"] as const) {
    if (!types.has(t)) out.push(`MANCA_${t.toUpperCase()}`);
  }
  if (expectsSecondReading(iso, lit.title || "", lit.saints || []) && !types.has("seconda_lettura")) {
    out.push("MANCA_SECONDA_LETTURA");
  }
  for (const r of lit.readings || []) {
    const text = (r.text || "").trim();
    if (["prima_lettura", "seconda_lettura", "vangelo"].includes(r.type) && text.length < 80) {
      out.push(`TESTO_CORTO_${r.type}`);
    }
  }
  return out;
}

type Row = { iso: string; wd: string; id: string; issues: string[]; note?: string };

async function main() {
  const rows: Row[] = [];
  const dualOk: string[] = [];
  console.log(`Audit Ore+Messa ${START} → ${isoAdd(START, DAYS - 1)} (${DAYS} giorni)\n`);

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
        rows.push({ iso, wd, id: hour, issues: [`FETCH:${(e as Error).message}`] });
        await sleep(250);
        continue;
      }
      if (!looksLikeLiturgy(html)) {
        rows.push({ iso, wd, id: hour, issues: ["CEI_ASSENTE"] });
        await sleep(180);
        continue;
      }
      const banner = extractHoursBanner(html);
      const meta = hourHeadMeta(iso, "", banner);
      const metaIssues: string[] = [];
      if (!banner) metaIssues.push("BANNER_ASSENTE");
      else {
        if (!meta.seasonLine) metaIssues.push("STAGIONE_ASSENTE");
        if (!meta.psalterLine) metaIssues.push("SALTERIO_ASSENTE");
      }

      if (hour === "invitatorio") {
        const ant = extractInvitatoryAntiphon(html);
        const extra = [...metaIssues];
        if (!ant || ant.length < 8) extra.push("ANT_MANCANTE");
        rows.push({ iso, wd, id: hour, issues: extra, note: (ant || "").slice(0, 70) });
        await sleep(180);
        continue;
      }

      if (hour === "ora-media") {
        const parts = splitOraMediaHtml(html);
        for (const id of MEDIA) {
          const parsed = parseHourHtml(parts[id], id);
          const iss = [
            ...metaIssues,
            ...(parsed.error ? [`ERR:${parsed.error}`] : []),
            ...structureIssues(id, parts[id], parsed.blocks),
          ];
          rows.push({ iso, wd, id, issues: iss });
        }
        await sleep(180);
        continue;
      }

      const parsed = parseHourHtml(html, hour);
      const preces = precesIssues(hour, html, parsed.blocks);
      const iss = [
        ...metaIssues,
        ...(parsed.error ? [`ERR:${parsed.error}`] : []),
        ...structureIssues(hour, html, parsed.blocks),
        ...preces,
      ];
      const tones = parsed.blocks.filter((b) => b.k === "tone").length;
      const opp = parsed.blocks.filter((b) => b.k === "omit" && /^Oppure\b/i.test(b.text)).length;
      const note =
        hour === "lodi" || hour === "vespri"
          ? `${hourTitle(hour, date)} toni=${tones} oppure=${opp}`
          : hourTitle(hour, date);
      if ((hour === "lodi" || hour === "vespri") && tones >= 2 && opp >= 1 && !preces.some((x) => /PRECES_/.test(x))) {
        dualOk.push(`${iso} ${wd} ${hour} toni=${tones} oppure=${opp}`);
      }
      rows.push({ iso, wd, id: hour, issues: iss, note });
      await sleep(180);
    }

    try {
      const lit = await getFullLiturgyByDateStr(iso);
      const iss = massIssues(iso, lit);
      rows.push({
        iso,
        wd,
        id: "messa",
        issues: iss,
        note: (lit.title || "").replace(/\s+/g, " ").slice(0, 80),
      });
    } catch (e) {
      rows.push({ iso, wd, id: "messa", issues: [`MESS_ERR:${(e as Error).message}`] });
    }
    await sleep(220);
    if ((i + 1) % 10 === 0) {
      const soFar = rows.filter((r) => r.issues.length).length;
      console.log(`… ${iso}  giorni ${i + 1}/${DAYS}  fail finora ${soFar}`);
    }
  }

  const ceiMissing = rows.filter((r) => r.issues.includes("CEI_ASSENTE"));
  const fails = rows.filter((r) => r.issues.some((t) => t !== "CEI_ASSENTE"));
  const kinds: Record<string, number> = {};
  for (const r of fails) {
    for (const t of r.issues) {
      const k = t.replace(/\(.*$/, "").replace(/:.*$/, "");
      kinds[k] = (kinds[k] || 0) + 1;
    }
  }

  console.log("=== FAIL ===");
  if (!fails.length) console.log("(nessuno)");
  for (const r of fails) {
    console.log(`${r.iso} ${r.wd} ${r.id}  ${r.issues.join(" | ")}  ${r.note || ""}`);
  }
  console.log("\n=== TAG ===");
  console.log(
    Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n}\t${k}`)
      .join("\n") || "(nessuno)",
  );
  console.log("\n=== DUE FORMULARI OK ===");
  console.log(dualOk.join("\n") || "(nessun doppio formulario nel periodo)");
  const ceiFrom = ceiMissing[0]?.iso;
  if (ceiMissing.length) {
    console.log(`\n=== CEI NON PUBBLICATO ===`);
    console.log(`dal ${ceiFrom}: ${ceiMissing.length} ore (il sito non ha ancora i testi)`);
  }
  const ok = rows.length - fails.length - ceiMissing.length;
  console.log(`\nOre/Messa controllate: ${rows.length}  FAIL: ${fails.length}  CEI assente: ${ceiMissing.length}  OK: ${ok}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
