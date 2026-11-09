(globalThis as { __DEV__?: boolean }).__DEV__ = false;

/**
 * Audit Ore fino alla fine del tempo di Natale: default 2026-11-09 → min(CEI, cap).
 * Uso: npx tsx scripts/audit-ore-advent-natale.ts [YYYY-MM-DD] [YYYY-MM-DD-cap]
 * Fetch con hoursUrlForHour (slug + data CEI), parse come in app.
 */
import { writeFileSync } from "node:fs";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { addDays, localDateStr, parseLocalDate } from "../src/dateUtils";
import { computeEasterSunday, firstAdventSunday } from "../src/liturgicalDates";
import { getBundledCompline, complineNeedsCeiFetch } from "../src/ore/complineBundled";
import { extractInvitatoryAntiphon, parseHourHtml, splitOraMediaHtml } from "../src/ore/parseHour";
import { extractHoursBanner, liturgicalFragment, stripTags } from "../src/ore/html";
import { hourHeadMeta } from "../src/ore/dayHead";
import { hoursUrlForHour } from "../src/ore/scraper";
import { ceiFetchDateISO, ceiHourSlug } from "../src/ore/titles";
import type { MediaId, OreBlock, OreHourId } from "../src/ore/types";

const WINDOW_START = process.argv[2] || "2026-11-09";
/** Battesimo del Signore e immediati giorni dopo (fine «feste di Natale» sul CEI). */
const WINDOW_CAP = process.argv[3] || "2027-01-13";
const OUT = "scripts/_ore-nov-natale-audit.json";
const HOURS: OreHourId[] = ["invitatorio", "ufficio", "lodi", "ora-media", "vespri", "compieta"];
const MEDIA: MediaId[] = ["terza", "sesta", "nona"];
const SLEEP_MS = 180;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeLiturgy(html: string): boolean {
  if (!html || html.length < 800) return false;
  const frag = liturgicalFragment(html);
  return frag.length > 200 && /lo_titolo|lo_versetto|INNO|SALMO|cci-liturgia-ore/i.test(html);
}

async function fetchHour(iso: string, hour: OreHourId): Promise<string> {
  const url = hoursUrlForHour(iso, hour);
  const data = url.match(/data-liturgia=([^&]+)/)?.[1] || iso.replace(/-/g, "");
  const slug = decodeURIComponent(url.match(/ora=([^&]+)/)?.[1] || "");
  const local = `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(local);
    if (res.ok) {
      const html = await res.text();
      if (html.length > 800) return html;
    }
  } catch {
    /* proxy off */
  }
  const html = await fetchCeiUrl(url);
  if (!html || html.length < 800) throw new Error(`HTML corto ${hour} len=${html?.length || 0}`);
  return html;
}

async function findCeiLastInWindow(): Promise<string> {
  const cap = parseLocalDate(WINDOW_CAP);
  let d = parseLocalDate(WINDOW_START);
  let last = WINDOW_START;
  while (d.getTime() <= cap.getTime()) {
    const iso = localDateStr(d);
    try {
      const html = await fetchHour(iso, "lodi");
      if (!looksLikeLiturgy(html)) break;
      last = iso;
    } catch {
      break;
    }
    d = addDays(d, 1);
    await sleep(120);
  }
  return last;
}

function blobOf(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn") return b.hymns.map((h) => h.stanzas.map((s) => s.join("\n")).join("\n\n")).join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name}`;
      if (b.k === "marian") return b.antiphons.map((a) => a.join(" ")).join(" ");
      if (b.k === "tone") return `${b.intro}\n${b.refrain}`;
      if (b.k === "title" || b.k === "sub" || b.k === "prose" || b.k === "omit") return b.text;
      return "";
    })
    .join("\n");
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

function precesSectionBlocks(blocks: OreBlock[], heading: string): OreBlock[] {
  const i = blocks.findIndex((b) => b.k === "title" && new RegExp(heading, "i").test(b.text));
  if (i < 0) return [];
  let j = i + 1;
  while (j < blocks.length) {
    const b = blocks[j];
    if (b.k === "title" && !new RegExp(heading, "i").test(b.text)) break;
    j++;
  }
  return blocks.slice(i + 1, j);
}

function invocOrphanLayoutIssues(hour: OreHourId, blocks: OreBlock[]): string[] {
  const heading = hour === "vespri" ? "INTERCESSIONI" : "INVOCAZIONI";
  if (hour !== "lodi" && hour !== "vespri") return [];
  const section = precesSectionBlocks(blocks, heading);
  if (!section.length) return [];
  const out: string[] = [];
  if (section.some((b) => b.k === "sub")) out.push("INVOC_SUB_ORFANO");
  const mega = section.find(
    (b) => b.k === "stanza" && b.lines.length > 4 && b.lines.filter((l) => /^—/.test(l)).length >= 2,
  );
  if (mega) out.push(`INVOC_MEGA_STANZA(${mega.lines.length})`);
  const introProse = section.filter((b) => b.k === "prose").length;
  if (introProse >= 2 && !section.some((b) => b.k === "tone")) out.push("INVOC_PROSA_SENZA_TONO");
  return out;
}

function precesIssues(hour: OreHourId, html: string, blocks: OreBlock[]): string[] {
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
  if (secondForm && tones.length < 2) out.push(`PRECES_SECONDO_TONO_PERSO(toni=${tones.length} attesi=2)`);
  if (ceiDash >= 4 && pairs.length < Math.min(4, Math.floor(ceiDash * 0.6))) {
    out.push(`PRECES_COPPIE_POCHE(cei—=${ceiDash} app=${pairs.length})`);
  }

  for (const t of tones) {
    if (!t.intro || t.intro.length < 12) out.push("TONO_INTRO_CORTA");
    if (!t.refrain || t.refrain.length < 8) out.push("TONO_RISPOSTA_MANCANTE");
    if (t.refrain && t.intro.includes(t.refrain.slice(0, 18))) out.push("TONO_RISPOSTA_DENTRO_INTRO");
  }
  if (!tones.length && ceiDash >= 2) out.push("TONO_MANCANTE");

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
  out.push(...invocOrphanLayoutIssues(hour, blocks));
  return out;
}

function layoutIssues(iso: string, hour: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  const date = parseLocalDate(iso);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "rubric" && /ant/i.test(b.lab) && !b.text.trim()) out.push(`empty-ant@${i}`);
    if (b.k === "psalmHead" && /Inno di|Lode alla/i.test(b.num) && !b.name) out.push("mashed-title");
    if (b.k === "stanza" && b.lines.some((l) => l.trim() === "(" || l.trim() === ")")) out.push("lone-paren");
  }
  const marian = blocks.find((b) => b.k === "marian");
  if (marian && marian.k === "marian") {
    const firsts = marian.antiphons.map((a) => a[0] || "");
    const advent = firstAdventSunday(date.getFullYear()).getTime();
    const t = date.getTime();
    if (t >= advent && t < new Date(date.getFullYear(), 11, 25).getTime()) {
      if (!firsts.some((f) => /Alma Redemptoris/i.test(f))) out.push("missing-alma-advent");
    }
    if (t >= new Date(date.getFullYear(), 11, 25).getTime() && t <= new Date(date.getFullYear(), 0, 2).getTime()) {
      if (!firsts.some((f) => /Alma Redemptoris|Ave Regina/i.test(f))) out.push("marian-post-natale");
    }
  }
  return out;
}

function contentIssues(hour: OreHourId | MediaId, html: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  const blob = blobOf(blocks);
  const plain = stripTags(liturgicalFragment(html)).replace(/\s+/g, " ");
  if (!blocks.length && hour !== "invitatorio") out.push("VUOTO");
  if (/&(?:egrave|nbsp|dagger);/i.test(blob)) out.push("ENTITA_HTML");
  const psalms = blocks.filter((b) => b.k === "psalmHead").length;
  if (hour !== "invitatorio" && hour !== "compieta" && /SALMO|CANTICO/i.test(plain) && psalms === 0) {
    out.push("SALMI_PERSI");
  }
  if (hour === "lodi" && /CANTICO DI ZACCARIA/i.test(html) && !/Benedetto il Signore Dio/i.test(blob)) {
    out.push("BENEDICTUS_PERSO");
  }
  if (hour === "vespri" && /Magnificat|CANTICO DI MARIA/i.test(html) && !/magnifica/i.test(blob)) {
    out.push("MAGNIFICAT_PERSO");
  }
  if ((hour === "terza" || hour === "sesta" || hour === "nona") && blocks.length < 8) out.push("ORA_MEDIA_TRONCA");
  for (const b of blocks) {
    if (b.k === "stanza" && b.lines.some((l) => /^[*†]\s*$/.test(l))) out.push("ASTERISCO_ORFANO");
  }
  if (hour === "lodi" || hour === "vespri") out.push(...precesIssues(hour, html, blocks));
  out.push(...psalmBodyIssues(blocks));
  if ((hour === "lodi" || hour === "vespri") && /Padre nostro/i.test(html) && !/Padre nostro/i.test(blob)) {
    out.push("PADRE_NOSTRO_PERSO");
  }
  return out;
}

function slugIssues(iso: string, date: Date): string[] {
  const out: string[] = [];
  const dow = date.getDay();
  if (dow === 6) {
    if (ceiHourSlug("vespri", date) !== "primi-vespri") out.push("slug-sab-vespri");
    if (ceiHourSlug("compieta", date) !== "compieta-dopo-i-primi-vespri") out.push("slug-sab-compieta");
    const fetchV = ceiFetchDateISO(iso, "vespri");
    const next = localDateStr(addDays(date, 1));
    if (fetchV !== next) out.push(`fetch-sab-vespri=${fetchV}`);
  }
  if (dow === 0) {
    if (ceiHourSlug("vespri", date) !== "secondi-vespri") out.push("slug-dom-vespri");
    if (ceiHourSlug("compieta", date) !== "compieta-dopo-i-secondi-vespri") out.push("slug-dom-compieta");
  }
  return out;
}

type Row = {
  iso: string;
  hour: string;
  slug: string;
  fetchDate: string;
  blocks: number;
  issues: string[];
  meta?: { season?: string; psalter?: string };
};

async function main() {
  console.log("=== Orizzonte CEI nel periodo ===");
  const ceiLast = await findCeiLastInWindow();
  const capDate = parseLocalDate(WINDOW_CAP);
  const ceiEnd = parseLocalDate(ceiLast);
  const end = ceiEnd.getTime() > capDate.getTime() ? capDate : ceiEnd;
  console.log(
    `Fine audit: ${localDateStr(end)} (CEI fino ${ceiLast}, cap feste Natale ${WINDOW_CAP})`,
  );
  const tally: Record<string, number> = {};
  const rows: Row[] = [];
  const fetchFails: string[] = [];

  for (let d = parseLocalDate(WINDOW_START); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const iso = localDateStr(d);
    const date = parseLocalDate(iso);
    const wd = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][date.getDay()];
    const slugDay = slugIssues(iso, date);
    if (slugDay.length) {
      for (const s of slugDay) {
        tally[s] = (tally[s] || 0) + 1;
        rows.push({ iso, hour: "_slug", slug: "", fetchDate: "", blocks: 0, issues: [s] });
      }
    }

    for (const hour of HOURS) {
      const slug = ceiHourSlug(hour, date);
      const fetchISO = ceiFetchDateISO(iso, hour);
      let blocks: OreBlock[] = [];
      let html = "";
      const issues: string[] = [];

      try {
        if (hour === "compieta") {
          const bundled = getBundledCompline(iso);
          if (bundled?.blocks?.length) {
            blocks = bundled.blocks;
            issues.push("COMPIETA_BUNDLED");
          } else {
            html = await fetchHour(iso, hour);
            blocks = parseHourHtml(html, hour, iso).blocks;
            issues.push(complineNeedsCeiFetch(date) ? "COMPIETA_CEI_OTTAVA" : "COMPIETA_CEI_FALLBACK");
          }
        } else if (hour === "invitatorio") {
          html = await fetchHour(iso, hour);
          const ant = extractInvitatoryAntiphon(html);
          blocks = parseHourHtml(html, hour, iso).blocks;
          if (!ant && !blocks.length) issues.push("INVIT_VUOTO");
        } else if (hour === "ora-media") {
          html = await fetchHour(iso, hour);
          const parts = splitOraMediaHtml(html);
          for (const id of MEDIA) {
            const parsed = parseHourHtml(parts[id], id, iso);
            const iss = [...contentIssues(id, parts[id], parsed.blocks), ...layoutIssues(iso, id, parsed.blocks)];
            for (const x of iss) tally[x.replace(/\(.*$/, "")] = (tally[x.replace(/\(.*$/, "")] || 0) + 1;
            rows.push({
              iso,
              hour: id,
              slug,
              fetchDate: fetchISO,
              blocks: parsed.blocks.length,
              issues: iss,
            });
            const mark = iss.length ? iss.join("|") : "ok";
            console.log(`${iso} ${wd} ${id} ${mark}`);
          }
          await sleep(SLEEP_MS);
          continue;
        } else {
          html = await fetchHour(iso, hour);
          blocks = parseHourHtml(html, hour, iso).blocks;
        }
      } catch (e) {
        const msg = `FETCH:${(e as Error).message}`;
        fetchFails.push(`${iso} ${hour} ${msg}`);
        rows.push({ iso, hour, slug, fetchDate: fetchISO, blocks: 0, issues: [msg] });
        tally.FETCH = (tally.FETCH || 0) + 1;
        console.log(`${iso} ${wd} ${hour} ${msg}`);
        await sleep(SLEEP_MS);
        continue;
      }

      const banner = html ? extractHoursBanner(html) : "";
      const meta = hourHeadMeta(iso, "", banner);
      issues.push(...contentIssues(hour, html || "", blocks), ...layoutIssues(iso, hour, blocks));
      if (html && !banner && hour !== "compieta") issues.push("BANNER_ASSENTE");
      if (html && banner && !meta.seasonLine) issues.push("STAGIONE_ASSENTE");

      for (const x of issues) tally[x.replace(/\(.*$/, "")] = (tally[x.replace(/\(.*$/, "")] || 0) + 1;
      rows.push({
        iso,
        hour,
        slug,
        fetchDate: fetchISO,
        blocks: blocks.length,
        issues,
        meta: { season: meta.seasonLine, psalter: meta.psalterLine },
      });
      const mark = issues.filter((x) => !x.startsWith("COMPIETA_")).length
        ? issues.filter((x) => !x.startsWith("COMPIETA_")).join("|")
        : issues.join("|") || "ok";
      console.log(`${iso} ${wd} ${hour} blocks=${blocks.length} ${mark}`);
      await sleep(SLEEP_MS);
    }
  }

  const fails = rows.filter((r) => r.issues.some((x) => !x.startsWith("COMPIETA_BUNDLED") && !x.startsWith("COMPIETA_CEI_OTTAVA")));
  const realFails = fails.filter((r) => r.issues.length > 0);

  const precesFails = realFails.filter((r) =>
    r.issues.some((x) => /INVOC_|PRECES_|TONO_|COPPIA_/i.test(x)),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    windowStart: WINDOW_START,
    windowEnd: localDateStr(end),
    windowCap: WINDOW_CAP,
    ceiLast,
    rows,
    tally,
    fetchFails,
    summary: {
      hourRuns: rows.length,
      withIssues: realFails.length,
      precesOrInvocIssues: precesFails.length,
    },
    precesFails: precesFails.map((r) => ({ iso: r.iso, hour: r.hour, issues: r.issues })),
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log("\n=== TALLY ===");
  for (const k of Object.keys(tally).sort((a, b) => tally[b] - tally[a])) {
    console.log(`  ${tally[k]}\t${k}`);
  }
  console.log(`\nOre con issue (escl. solo bundled): ${realFails.length}/${rows.length}`);
  console.log(`Invocazioni/intercessioni: ${precesFails.length} corse con issue`);
  if (precesFails.length) {
    console.log("--- PRECES / INVOC ---");
    for (const r of precesFails.slice(0, 40)) {
      console.log(`  ${r.iso} ${r.hour} ${r.issues.filter((x) => /INVOC_|PRECES_|TONO_|COPPIA_/i.test(x)).join("|")}`);
    }
    if (precesFails.length > 40) console.log(`  … altre ${precesFails.length - 40}`);
  }
  console.log(`Scritto ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
