import { parseHourHtml, extractInvitatoryAntiphon, splitOraMediaHtml } from "../src/ore/parseHour";
import { extractHoursBanner } from "../src/ore/html";
import { hourHeadMeta } from "../src/ore/dayHead";
import { ceiHourSlug, hourTitle } from "../src/ore/titles";
import { parseLocalDate } from "../src/dateUtils";
import type { OreBlock, OreHourId } from "../src/ore/types";

const START = "2026-09-10";
const DAYS = 20;
const PARSE_PASSES = 10;
const HOURS: OreHourId[] = ["invitatorio", "ufficio", "lodi", "ora-media", "vespri", "compieta"];
const JUNK = /facebook|twitter|whatsapp|condividi|\bsharer\.php|\bjavascript:/i;
const ENTITY = /&(?:egrave|eacute|agrave|ograve|ugrave|igrave|aelig|oelig|nbsp|rsquo|dagger|laquo)[;]?/i;

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function blobOf(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn") return b.hymns.map((h) => h.stanzas.map((s) => s.join("\n")).join("\n\n")).join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name} ${b.sub} ${b.cite}`;
      if (b.k === "marian") return b.antiphons.map((a) => a.join(" ")).join(" ");
      if (b.k === "title" || b.k === "sub" || b.k === "omit" || b.k === "prose") return b.text;
      return "";
    })
    .join("\n");
}

function hymnStats(blocks: OreBlock[]) {
  const hymns = blocks.filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn");
  const nHymns = hymns.reduce((n, h) => n + h.hymns.length, 0);
  const st = hymns.reduce((n, h) => n + h.hymns.reduce((m, x) => m + x.stanzas.length, 0), 0);
  const labels = hymns.flatMap((h) => h.hymns.map((x) => x.label || ""));
  return { hymns, nHymns, st, labels };
}

function issuesFor(label: string, blocks: OreBlock[], extra: string[] = []): string[] {
  const out = [...extra];
  const blob = blobOf(blocks);
  if (!blocks.length) out.push("VUOTO");
  if (JUNK.test(blob)) out.push("JUNK_SOCIAL");
  if (ENTITY.test(blob)) out.push("ENTITA_HTML");
  if (/Grandezza Testo|cci-share|Invia\s+Stampa/i.test(blob)) out.push("CHROME_CEI");
  const { hymns, nHymns, st } = hymnStats(blocks);
  if (!label.includes("invitatorio") && st === 0 && !/Te Deum/i.test(blob)) {
    out.push("SENZA_INNO");
  }
  for (const h of hymns) {
    for (const hy of h.hymns) {
      if (hy.label && /^Oppure\b/i.test(hy.label) === false && /^Oppure:?$/i.test(hy.stanzas[0]?.[0] || "")) {
        out.push("OPPURE_COME_STROFA");
      }
      for (const stanza of hy.stanzas) {
        const first = stanza[0] || "";
        if (stanza.length < 2 && !/^Amen\.?$/i.test(first)) {
          out.push(`STROFA_CORTA(${stanza.length}:${first.slice(0, 24)})`);
        }
        if (stanza.length > 8) out.push(`STROFA_LUNGA(${stanza.length})`);
        if (/^Oppure:?$/i.test(first) && stanza.length <= 2) out.push("OPPURE_COME_STROFA");
      }
    }
  }
  if (nHymns >= 2 && !hymns.some((h) => h.hymns.some((x) => x.label && /^Oppure\b/i.test(x.label)))) {
    out.push("SECONDO_INNO_SENZA_OPPURE");
  }
  if (
    blocks.some((b, i) => {
      if (b.k !== "prose" || b.text.length <= 400) return false;
      if (JUNK.test(b.text)) return true;
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prev = blocks[j];
        if (prev.k === "title" && /LETTURA|ORAZIONE/i.test(prev.text)) return false;
        if (prev.k === "sub") continue;
        break;
      }
      return b.text.length > 1200;
    })
  ) {
    out.push("PROSA_LUNGA");
  }
  return out;
}

async function fetchHtml(dateISO: string, slug: string): Promise<string> {
  const data = dateISO.replace(/-/g, "");
  const url = `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        last = `HTTP ${res.status} ${slug}`;
        if (attempt < 3) await sleep(800 * attempt);
        continue;
      }
      const html = await res.text();
      if (html.length < 400) {
        last = `HTML corto ${html.length} ${slug}`;
        if (attempt < 3) await sleep(800 * attempt);
        continue;
      }
      return html;
    } catch (e) {
      last = (e as Error).message;
      if (attempt < 3) await sleep(800 * attempt);
    }
  }
  throw new Error(last || `fetch ${slug}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function expectedSlug(hour: OreHourId, date: Date): string {
  return ceiHourSlug(hour, date);
}

function selfTests(): string[] {
  const fails: string[] = [];
  const wrap = (inner: string) =>
    `<div class="cci-opere-giorni-liturgia">GIOVEDI' - XXIII SETTIMANA DEL TEMPO ORDINARIO - III SETTIMANA DEL SALTERIO</div><div class="cci-liturgia-ore">${inner}</div>`;

  const oppureHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Te lucis ante términum,<br>rerum Creator, póscimus</div>
    <div class="lo_rosso">Oppure:</div>
    <div class="lo_versetto">Gesù, luce da luce,<br>splendore del Padre,</div>
    <div class="lo_titolo">SALMO 4</div>
    <div class="lo_sottotitolo">Sicuro riposo in Dio</div>
    <div class="lo_versetto">Quando ti invoco, rispondimi, * Dio mia giustizia;</div>
  `);
  const oppure = parseHourHtml(oppureHtml, "compieta");
  const oh = hymnStats(oppure.blocks);
  if (oh.nHymns !== 2) fails.push(`fixture Oppure inni=${oh.nHymns} attesi 2`);
  if (!oh.labels.some((l) => /^Oppure\b/i.test(l))) fails.push("fixture Oppure senza label");
  if (!oppure.blocks.some((b) => b.k === "psalmHead")) fails.push("fixture Oppure senza salmo dopo inno");

  const latinHtml = wrap(`
    <div class="lo_versetto">
      <div class="lo_rosso">INNO</div>
      Virgo v&iacute;rgimum pr&aelig;cl&aacute;ra,<br>
      mihi iam non sis am&aacute;ra,<br>
      fac me tecum pl&aacute;ngere.<br><br>
      Iuxta crucem tecum stare,<br>
      et me tibi soci&aacute;re<br>
      in planctu des&iacute;dero.
    </div>
    <div class="lo_versetto">1 ant. Cristo, nostra pace.</div>
    <div class="lo_titolo">SALMO 122</div>
    <div class="lo_versetto">A te levo i miei occhi, * a te che abiti nei cieli.</div>
  `);
  const latin = parseHourHtml(latinHtml, "vespri");
  const lh = hymnStats(latin.blocks);
  if (lh.nHymns < 1) fails.push("fixture latino SENZA_INNO");
  if (lh.st < 2) fails.push(`fixture latino strofe=${lh.st} attese >=2`);
  const latinBlob = blobOf(latin.blocks);
  if (!/præclára|præclara|praeclara/i.test(latinBlob) && !/præcl/i.test(latinBlob)) {
    if (/&aelig;|&aacute;/.test(latinBlob)) fails.push("fixture latino ENTITA_HTML");
    else if (!/Virgo/.test(latinBlob)) fails.push("fixture latino testo assente");
  }
  if (latin.blocks.filter((b) => b.k === "psalmHead").length < 1) fails.push("fixture latino senza salmo");

  const banner = extractHoursBanner(oppureHtml);
  const meta = hourHeadMeta("2026-09-10", "", banner);
  if (!/XXIII settimana T\.O\./i.test(meta.seasonLine)) fails.push(`fixture banner season=${meta.seasonLine}`);
  if (!/III settimana del salterio/i.test(meta.psalterLine)) fails.push(`fixture banner psalter=${meta.psalterLine}`);

  const sunBanner = extractHoursBanner(
    `<div class="cci-opere-giorni-liturgia">DOMENICA - XXIV DOMENICA DEL TEMPO ORDINARIO - IV SETTIMANA DEL SALTERIO</div><div class="cci-liturgia-ore"></div>`,
  );
  const metaS = hourHeadMeta("2026-09-13", "", sunBanner);
  if (!/XXIV Domenica T\.O\./i.test(metaS.seasonLine)) fails.push(`fixture domenica season=${metaS.seasonLine}`);
  if (!/IV settimana del salterio/i.test(metaS.psalterLine)) fails.push(`fixture domenica psalter=${metaS.psalterLine}`);

  const ones = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Virgo vírginum præclára,</div>
    <div class="lo_versetto">mihi iam non sis amára,</div>
    <div class="lo_versetto">fac me tecum plángere.</div>
    <div class="lo_versetto">Iuxta crucem tecum stare,</div>
    <div class="lo_versetto">et me tibi sociáre</div>
    <div class="lo_versetto">in planctu desídero.</div>
    <div class="lo_versetto">1 ant. Cristo, nostra pace.</div>
    <div class="lo_titolo">SALMO 121</div>
  `);
  const oneH = hymnStats(parseHourHtml(ones, "vespri").blocks);
  if (oneH.st !== 2) fails.push(`fixture tercine strofe=${oneH.st} attese 2`);
  if (oneH.hymns[0]?.hymns[0]?.stanzas.some((s) => s.length !== 3)) {
    fails.push("fixture tercine non a 3 versi");
  }

  const longHymn = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">${Array.from({ length: 12 }, (_, i) => `verso latino numero ${i + 1}`).join("<br>")}</div>
    <div class="lo_titolo">SALMO 4</div>
  `);
  const long = hymnStats(parseHourHtml(longHymn, "vespri").blocks);
  if (long.hymns[0]?.hymns[0]?.stanzas.some((s) => s.length > 8)) {
    fails.push("fixture strofa lunga non spezzata");
  }

  const propria = extractHoursBanner(
    `<div class="cci-opere-giorni-liturgia">ESALTAZIONE DELLA SANTA CROCE - Festa - Liturgia propria</div><div class="cci-liturgia-ore"></div>`,
  );
  const metaP = hourHeadMeta("2026-09-14", "", propria);
  if (!/esaltazione/i.test(metaP.seasonLine)) fails.push(`fixture festa season=${metaP.seasonLine}`);
  if (!/liturgia propria/i.test(metaP.psalterLine)) fails.push(`fixture festa psalter=${metaP.psalterLine}`);

  const officePsalm = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Stabat mater dolorósa<br>iuxta crucem lacrimósa,<br>dum pendébat Fílius.</div>
    <div class="lo_versetto">1 ant. A te giunga, Signore, il mio grido.</div>
    <div class="lo_sottotitolo">SALMO 101 Aspirazioni e preghiere di un esule</div>
    <div class="lo_titolo">I (2-12)</div>
    <div class="lo_versetto">Signore, ascolta la mia preghiera, * a te giunga il mio grido.</div>
  `);
  const office = parseHourHtml(officePsalm, "ufficio");
  if (office.blocks.filter((b) => b.k === "psalmHead").length < 1) {
    fails.push("fixture ufficio SALMO in sottotitolo");
  }
  const sat = parseLocalDate("2026-09-12");
  const sun = parseLocalDate("2026-09-13");
  if (ceiHourSlug("vespri", sat) !== "primi-vespri") fails.push("slug sab vespri");
  if (ceiHourSlug("compieta", sat) !== "compieta-dopo-i-primi-vespri") fails.push("slug sab compieta");
  if (ceiHourSlug("vespri", sun) !== "secondi-vespri") fails.push("slug dom vespri");
  if (ceiHourSlug("compieta", sun) !== "compieta-dopo-i-secondi-vespri") fails.push("slug dom compieta");

  return fails;
}

type ParsedRun = { extra: string[]; blocks: OreBlock[]; ant?: string };

function parseOnce(hour: OreHourId, html: string): ParsedRun {
  if (hour === "invitatorio") {
    const ant = extractInvitatoryAntiphon(html);
    const extra: string[] = [];
    if (!ant || ant.length < 8) extra.push("ANT_MANCANTE");
    if (/^V\.|^R\./.test(ant)) extra.push("ANT_E_VR");
    if (JUNK.test(ant)) extra.push("ANT_JUNK");
    return { extra, blocks: [], ant };
  }
  if (hour === "ora-media") {
    return { extra: [], blocks: [] };
  }
  const parsed = parseHourHtml(html, hour);
  const extra: string[] = [];
  if (parsed.error) extra.push(`ERR:${parsed.error}`);
  if (hour === "compieta" && !parsed.blocks.some((b) => b.k === "marian")) extra.push("SENZA_MARIANE");
  if (hour !== "compieta" && hour !== "invitatorio") {
    const psalms = parsed.blocks.filter((b) => b.k === "psalmHead").length;
    if (psalms === 0) extra.push("SALMI_ZERO");
  }
  return { extra, blocks: parsed.blocks };
}

async function main() {
  const fixtureFails = selfTests();
  if (fixtureFails.length) {
    console.log("SELFTEST FAIL\n" + fixtureFails.map((f) => `  ${f}`).join("\n"));
  } else {
    console.log("SELFTEST ok (Oppure, inno latino, banner, slugs sab/dom)");
  }

  const cache = new Map<string, string>();
  const fetched: Array<{ iso: string; hour: OreHourId; html: string; slug: string }> = [];
  const rows: string[] = [];
  let fail = 0;
  let drift = 0;

  for (let i = 0; i < DAYS; i++) {
    const iso = isoAdd(START, i);
    const date = parseLocalDate(iso);
    const wd = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][date.getDay()];
    for (const hour of HOURS) {
      const slug = expectedSlug(hour, date);
      const title = hourTitle(hour, date);
      let html = "";
      try {
        html = await fetchHtml(iso, slug);
        cache.set(`${iso}|${slug}`, html);
        fetched.push({ iso, hour, html, slug });
      } catch (e) {
        fail += 1;
        rows.push(`FAIL ${iso} ${wd} ${hour} slug=${slug} FETCH ${(e as Error).message}`);
        await sleep(250);
        continue;
      }

      const banner = extractHoursBanner(html);
      const meta = hourHeadMeta(iso, "", banner);
      const metaIssues: string[] = [];
      if (!banner) metaIssues.push("BANNER_ASSENTE");
      else {
        if (!meta.psalterLine) metaIssues.push("SALTERIO_ASSENTE");
        if (!meta.seasonLine) metaIssues.push("STAGIONE_ASSENTE");
      }

      if (hour === "ora-media") {
        const parts = splitOraMediaHtml(html);
        for (const id of ["terza", "sesta", "nona"] as const) {
          let firstSig = "";
          const extra: string[] = [];
          for (let p = 0; p < PARSE_PASSES; p++) {
            const parsed = parseHourHtml(parts[id], id);
            const sig = JSON.stringify(parsed.blocks);
            if (p === 0) firstSig = sig;
            else if (sig !== firstSig) {
              extra.push(`DRIFT_PASS_${p + 1}`);
              drift += 1;
            }
            extra.push(...(parsed.error ? [`ERR:${parsed.error}`] : []));
          }
          const parsed = parseHourHtml(parts[id], id);
          const iss = issuesFor(`${iso} ${id}`, parsed.blocks, extra);
          const { st } = hymnStats(parsed.blocks);
          const mark = iss.length ? "FAIL" : "ok";
          if (iss.length) fail += 1;
          rows.push(
            `${mark} ${iso} ${wd} ${id} slug=${slug} blocks=${parsed.blocks.length} inniStrofe=${st} ${iss.join(",")}`,
          );
        }
        if (metaIssues.length) {
          fail += 1;
          rows.push(`FAIL ${iso} ${wd} ora-media-meta ${metaIssues.join(",")}`);
        }
        await sleep(250);
        continue;
      }

      let firstSig = "";
      const passExtra: string[] = [];
      for (let p = 0; p < PARSE_PASSES; p++) {
        const run = parseOnce(hour, html);
        const sig = hour === "invitatorio" ? run.ant || "" : JSON.stringify(run.blocks);
        if (p === 0) firstSig = sig;
        else if (sig !== firstSig) {
          passExtra.push(`DRIFT_PASS_${p + 1}`);
          drift += 1;
        }
      }
      const run = parseOnce(hour, html);
      const extra = [...passExtra, ...run.extra, ...metaIssues];
      if (hour === "invitatorio") {
        const mark = extra.length ? "FAIL" : "ok";
        if (extra.length) fail += 1;
        rows.push(
          `${mark} ${iso} ${wd} invitatorio slug=${slug} ant="${(run.ant || "").replace(/\s+/g, " ").slice(0, 70)}" ${extra.join(",")}`,
        );
      } else {
        const iss = issuesFor(`${iso} ${hour}`, run.blocks, extra);
        const { nHymns, st } = hymnStats(run.blocks);
        const psalms = run.blocks.filter((b) => b.k === "psalmHead").length;
        const mark = iss.length ? "FAIL" : "ok";
        if (iss.length) fail += 1;
        rows.push(
          `${mark} ${iso} ${wd} ${hour} «${title}» slug=${slug} blocks=${run.blocks.length} inni=${nHymns}/${st} salmi=${psalms} ${iss.join(",")}`,
        );
      }
      await sleep(250);
    }
  }

  console.log(rows.join("\n"));
  console.log(`\nFAIL ${fail} / ${rows.length}  DRIFT ${drift}  PASSES ${PARSE_PASSES}  DAYS ${DAYS}`);

  const giroFails: number[] = [];
  for (let r = 1; r <= 10; r++) {
    let f = 0;
    for (const item of fetched) {
      if (item.hour === "ora-media") {
        const parts = splitOraMediaHtml(item.html);
        for (const id of ["terza", "sesta", "nona"] as const) {
          const parsed = parseHourHtml(parts[id], id);
          if (issuesFor(`${item.iso} ${id}`, parsed.blocks, parsed.error ? [`ERR:${parsed.error}`] : []).length) f += 1;
        }
        continue;
      }
      const run = parseOnce(item.hour, item.html);
      const banner = extractHoursBanner(item.html);
      const meta = hourHeadMeta(item.iso, "", banner);
      const metaIssues: string[] = [];
      if (!banner) metaIssues.push("BANNER_ASSENTE");
      else {
        if (!meta.psalterLine) metaIssues.push("SALTERIO_ASSENTE");
        if (!meta.seasonLine) metaIssues.push("STAGIONE_ASSENTE");
      }
      if (item.hour === "invitatorio") {
        if ([...run.extra, ...metaIssues].length) f += 1;
      } else if (issuesFor(`${item.iso} ${item.hour}`, run.blocks, [...run.extra, ...metaIssues]).length) {
        f += 1;
      }
    }
    giroFails.push(f);
    console.log(`giro ${r}/10 FAIL ${f} / ${fetched.length} giorni×ore in cache`);
  }
  if (giroFails.some((n) => n > 0)) process.exitCode = 1;
  if (fixtureFails.length) process.exitCode = 1;
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
