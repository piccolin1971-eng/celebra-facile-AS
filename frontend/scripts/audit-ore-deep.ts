/**
 * Audit approfondito Liturgia delle Ore vs HTML CEI.
 * 1) trova l’orizzonte dei testi sul sito
 * 2) scarica ogni ora disponibile
 * 3) confronta titoli/inni/tono/salmi/sezioni con il parse
 */
import { parseHourHtml, extractInvitatoryAntiphon, splitOraMediaHtml } from "../src/ore/parseHour";
import { extractHoursBanner, liturgicalFragment, stripTags } from "../src/ore/html";
import { hourHeadMeta } from "../src/ore/dayHead";
import { ceiHourSlug, hourTitle } from "../src/ore/titles";
import { parseLocalDate } from "../src/dateUtils";
import type { MediaId, OreBlock, OreHourId } from "../src/ore/types";

const START = "2026-09-10";
const PARSE_PASSES = 5;
const HOURS: OreHourId[] = ["invitatorio", "ufficio", "lodi", "ora-media", "vespri", "compieta"];
const MEDIA: MediaId[] = ["terza", "sesta", "nona"];
const JUNK = /facebook|twitter|whatsapp|condividi|\bsharer\.php|\bjavascript:|Grandezza Testo|cci-share/i;
const ENTITY = /&(?:egrave|eacute|agrave|ograve|ugrave|igrave|aelig|oelig|nbsp|rsquo|dagger|laquo|#\d+)[;]?/i;

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function ceiPlain(html: string): string {
  return stripTags(liturgicalFragment(html)).replace(/\s+/g, " ").trim();
}

function countRe(html: string, re: RegExp): number {
  const src = liturgicalFragment(html);
  return (src.match(re) || []).length;
}

function hymnStats(blocks: OreBlock[]) {
  const hymns = blocks.filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn");
  const nHymns = hymns.reduce((n, h) => n + h.hymns.length, 0);
  const st = hymns.reduce((n, h) => n + h.hymns.reduce((m, x) => m + x.stanzas.length, 0), 0);
  return { hymns, nHymns, st };
}

async function fetchHtml(dateISO: string, slug: string): Promise<{ ok: boolean; html: string; err: string; status: number }> {
  const data = dateISO.replace(/-/g, "");
  const url = `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url);
    const html = await res.text();
    return { ok: res.ok && html.length > 800, html, err: res.ok ? "" : `HTTP ${res.status}`, status: res.status };
  } catch (e) {
    return { ok: false, html: "", err: (e as Error).message, status: 0 };
  }
}

function looksLikeLiturgy(html: string): boolean {
  if (html.length < 800) return false;
  const frag = liturgicalFragment(html);
  if (frag.length < 200) return false;
  return /lo_titolo|lo_versetto|INNO|SALMO|cci-liturgia-ore/i.test(html);
}

async function findHorizon(): Promise<{ last: string; probed: string[] }> {
  const probed: string[] = [];
  let lastGood = START;
  let lo = 0;
  let hi = 90;
  const first = await fetchHtml(START, "lodi-mattutine");
  if (!looksLikeLiturgy(first.html)) {
    throw new Error(`CEI non risponde già per ${START}: ${first.err || first.html.length}`);
  }
  probed.push(`${START} ok ${first.html.length}`);

  for (const n of [7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 90]) {
    const iso = isoAdd(START, n);
    const r = await fetchHtml(iso, "lodi-mattutine");
    const good = looksLikeLiturgy(r.html);
    probed.push(`${iso} ${good ? "ok" : "NO"} ${r.html.length} ${r.err}`);
    if (good) {
      lastGood = iso;
      lo = n;
    } else {
      hi = n;
      break;
    }
    await sleep(200);
  }
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const iso = isoAdd(START, mid);
    const r = await fetchHtml(iso, "lodi-mattutine");
    const good = looksLikeLiturgy(r.html);
    probed.push(`bin ${iso} ${good ? "ok" : "NO"} ${r.html.length}`);
    if (good) {
      lastGood = iso;
      lo = mid;
    } else hi = mid;
    await sleep(200);
  }
  return { last: lastGood, probed };
}

function alignmentIssues(blocks: OreBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k !== "stanza") continue;
    const lines = b.lines;
    if (lines.some((l) => /^[*†]\s*$/.test(l))) out.push("ASTERISCO_ORFANO");
    const dashes = lines.filter((l) => /^—/.test(l)).length;
    if (dashes && lines.length !== 2) out.push(`COPPIA_STRANA(${lines.length}r/${dashes}—)`);
  }
  return out;
}

function hasPrecesHeading(html: string): boolean {
  return /<(?:div|span)[^>]*class="[^"]*lo_(?:titolo|rosso)[^"]*"[^>]*>\s*(INVOCAZIONI|INTERCESSIONI)\b/i.test(
    html,
  );
}

function toneIssues(hour: string, html: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  if (!hasPrecesHeading(html)) return out;
  if (/ufficio/i.test(hour)) return out;
  const tone = blocks.find((b) => b.k === "tone");
  if (!tone || tone.k !== "tone") out.push("TONO_MANCANTE");
  else {
    if (!tone.intro || tone.intro.length < 12) out.push("TONO_INTRO_CORTA");
    if (!tone.refrain || tone.refrain.length < 8) out.push("TONO_RISPOSTA_MANCANTE");
    if (tone.refrain && tone.intro.includes(tone.refrain.slice(0, 18))) out.push("TONO_RISPOSTA_DENTRO_INTRO");
  }
  return out;
}

function expectedSectionIssues(hour: OreHourId | MediaId, html: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  const blob = blobOf(blocks);
  const plain = ceiPlain(html);
  const titles = blocks.filter((b) => b.k === "title").map((b) => (b.k === "title" ? b.text : ""));
  const { nHymns, st } = hymnStats(blocks);
  const psalms = blocks.filter((b) => b.k === "psalmHead").length;
  const ceiInno = countRe(html, />\s*INNO\s*</gi) + countRe(html, /lo_rosso[^>]*>\s*INNO\s*</gi);
  const ceiSalmo = countRe(html, /lo_(?:titolo|sottotitolo)[^>]*>[^<]*(SALMO|CANTICO)/gi);

  if (hour !== "invitatorio" && ceiInno && st === 0 && !/Te Deum/i.test(blob)) out.push("CEI_INNO_PERSO");
  if (hour !== "invitatorio" && hour !== "compieta" && ceiSalmo >= 1 && psalms === 0) out.push("CEI_SALMI_PERSI");
  if ((hour === "terza" || hour === "sesta" || hour === "nona") && blocks.length < 10) {
    out.push("ORA_MEDIA_TRONCA");
  }
  if (nHymns >= 2 && !hymnStats(blocks).hymns.some((h) => h.hymns.some((x) => x.label && /^Oppure/i.test(x.label)))) {
    out.push("SECONDO_INNO_SENZA_OPPURE");
  }

  if (hour === "lodi") {
    if (!/Benedictus|Benedica|Benedetto il Signore Dio d.Israele/i.test(blob + plain)) {
      if (/CANTICO\s+DI\s+ZACCARIA|Benedictus/i.test(html) && !/Benedetto il Signore/i.test(blob)) out.push("BENEDICTUS_PERSO");
    }
    if (/INVOCAZIONI/i.test(html) && !titles.some((t) => /INVOCAZIONI/i.test(t))) out.push("TITOLO_INVOCAZIONI_PERSO");
  }
  if (hour === "vespri") {
    if (/Magnificat|CANTICO\s+DI\s+MARIA|L.anima mia magnifica/i.test(html) && !/magnifica/i.test(blob)) {
      out.push("MAGNIFICAT_PERSO");
    }
    if (/INTERCESSIONI/i.test(html) && !titles.some((t) => /INTERCESSIONI/i.test(t))) out.push("TITOLO_INTERCESSIONI_PERSO");
  }
  if (hour === "lodi" || hour === "vespri") {
    if (/Padre nostro/i.test(html) && !/Padre nostro/i.test(blob)) out.push("PADRE_NOSTRO_PERSO");
    if (/>\s*ORAZIONE\s*</i.test(html) && !titles.some((t) => /ORAZIONE/i.test(t)) && !/ORAZIONE/i.test(blob)) {
      out.push("ORAZIONE_PERSA");
    }
  }
  if (hour === "ufficio") {
    if (/LETTURA/i.test(html) && !/LETTURA/i.test(blob)) out.push("LETTURA_PERSA");
    if (/RESPONSORIO/i.test(html) && !/RESPONSORIO/i.test(blob)) out.push("RESPONSORIO_PERSO");
  }
  if (hour === "compieta") {
    if (!blocks.some((b) => b.k === "marian")) out.push("SENZA_MARIANE");
    if (/Nunc dimittis|Ora, o Signore, lascia|CANTICO\s+DI\s+SIMEONE/i.test(html) && !/lascia (che il tuo servo|andare)/i.test(blob) && !/Nunc dimittis/i.test(blob)) {
      if (!/Signore.*servo/i.test(blob)) out.push("NUNC_PERSO");
    }
  }
  if (JUNK.test(blob)) out.push("JUNK_SOCIAL");
  if (ENTITY.test(blob)) out.push("ENTITA_HTML");
  if (!blocks.length && hour !== "invitatorio") out.push("VUOTO");
  return out;
}

function coverageIssues(html: string, blocks: OreBlock[]): string[] {
  const out: string[] = [];
  const plain = ceiPlain(html);
  const blob = blobOf(blocks).replace(/\s+/g, " ");
  const samples = plain
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 120 && !JUNK.test(s) && !/Cookie|Privacy|Facebook/i.test(s));
  let missed = 0;
  const shown: string[] = [];
  for (const s of samples.slice(0, 40)) {
    const key = s.slice(0, 32).replace(/[.*+?^${}()|[\]\\]/g, " ");
    const compact = key.replace(/\s+/g, " ").trim();
    if (compact.length < 18) continue;
    if (!blob.toLowerCase().includes(compact.slice(0, 22).toLowerCase())) {
      missed += 1;
      if (shown.length < 3) shown.push(compact.slice(0, 40));
    }
  }
  if (missed >= 8) out.push(`TESTO_PERSO(~${missed}:${shown.join("|")})`);
  return out;
}

function issuesFor(hour: OreHourId | MediaId, html: string, blocks: OreBlock[], extra: string[] = []): string[] {
  return [
    ...extra,
    ...alignmentIssues(blocks),
    ...toneIssues(hour, html, blocks),
    ...expectedSectionIssues(hour, html, blocks),
    ...coverageIssues(html, blocks),
  ];
}

async function main() {
  console.log("=== ORIZZONTE CEI ===");
  const horizon = await findHorizon();
  console.log(horizon.probed.join("\n"));
  console.log(`Ultimo giorno con Lodi: ${horizon.last}`);

  const days: string[] = [];
  for (let i = 0; ; i++) {
    const iso = isoAdd(START, i);
    days.push(iso);
    if (iso === horizon.last) break;
    if (i > 120) break;
  }

  const rows: string[] = [];
  let fail = 0;
  let drift = 0;
  let okN = 0;
  const cache: Array<{ iso: string; hour: OreHourId | MediaId; html: string }> = [];

  for (const iso of days) {
    const date = parseLocalDate(iso);
    const wd = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][date.getDay()];
    for (const hour of HOURS) {
      const slug = ceiHourSlug(hour, date);
      const r = await fetchHtml(iso, slug);
      if (!r.ok || !looksLikeLiturgy(r.html)) {
        fail += 1;
        rows.push(`FAIL ${iso} ${wd} ${hour} slug=${slug} FETCH ${r.err || "HTML_NON_LITURGICO"} len=${r.html.length}`);
        await sleep(180);
        continue;
      }
      const banner = extractHoursBanner(r.html);
      const meta = hourHeadMeta(iso, "", banner);
      const metaIssues: string[] = [];
      if (!banner) metaIssues.push("BANNER_ASSENTE");
      else {
        if (!meta.seasonLine) metaIssues.push("STAGIONE_ASSENTE");
        if (!meta.psalterLine) metaIssues.push("SALTERIO_ASSENTE");
      }

      if (hour === "invitatorio") {
        const ant = extractInvitatoryAntiphon(r.html);
        const extra = [...metaIssues];
        if (!ant || ant.length < 8) extra.push("ANT_MANCANTE");
        if (/^V\.|^R\./.test(ant || "")) extra.push("ANT_E_VR");
        if (JUNK.test(ant || "")) extra.push("ANT_JUNK");
        let first = ant || "";
        for (let p = 1; p < PARSE_PASSES; p++) {
          const a = extractInvitatoryAntiphon(r.html);
          if (a !== first) {
            extra.push(`DRIFT_PASS_${p + 1}`);
            drift += 1;
          }
        }
        const mark = extra.length ? "FAIL" : "ok";
        if (extra.length) fail += 1;
        else okN += 1;
        rows.push(`${mark} ${iso} ${wd} invitatorio ant="${(ant || "").replace(/\s+/g, " ").slice(0, 64)}" ${extra.join(",")}`);
        cache.push({ iso, hour, html: r.html });
        await sleep(180);
        continue;
      }

      if (hour === "ora-media") {
        const parts = splitOraMediaHtml(r.html);
        for (const id of MEDIA) {
          let firstSig = "";
          const extra = [...metaIssues];
          for (let p = 0; p < PARSE_PASSES; p++) {
            const parsed = parseHourHtml(parts[id], id);
            const sig = JSON.stringify(parsed.blocks);
            if (p === 0) firstSig = sig;
            else if (sig !== firstSig) {
              extra.push(`DRIFT_PASS_${p + 1}`);
              drift += 1;
            }
          }
          const parsed = parseHourHtml(parts[id], id);
          if (parsed.error) extra.push(`ERR:${parsed.error}`);
          const iss = issuesFor(id, parts[id], parsed.blocks, extra);
          const { st } = hymnStats(parsed.blocks);
          const mark = iss.length ? "FAIL" : "ok";
          if (iss.length) fail += 1;
          else okN += 1;
          rows.push(
            `${mark} ${iso} ${wd} ${id} blocks=${parsed.blocks.length} strofe=${st} salmi=${parsed.blocks.filter((b) => b.k === "psalmHead").length} ${iss.join(",")}`,
          );
          cache.push({ iso, hour: id, html: parts[id] });
        }
        await sleep(180);
        continue;
      }

      let firstSig = "";
      const extra = [...metaIssues];
      for (let p = 0; p < PARSE_PASSES; p++) {
        const parsed = parseHourHtml(r.html, hour);
        const sig = JSON.stringify(parsed.blocks);
        if (p === 0) firstSig = sig;
        else if (sig !== firstSig) {
          extra.push(`DRIFT_PASS_${p + 1}`);
          drift += 1;
        }
      }
      const parsed = parseHourHtml(r.html, hour);
      if (parsed.error) extra.push(`ERR:${parsed.error}`);
      const iss = issuesFor(hour, r.html, parsed.blocks, extra);
      const { nHymns, st } = hymnStats(parsed.blocks);
      const psalms = parsed.blocks.filter((b) => b.k === "psalmHead").length;
      const mark = iss.length ? "FAIL" : "ok";
      if (iss.length) fail += 1;
      else okN += 1;
      rows.push(
        `${mark} ${iso} ${wd} ${hour} «${hourTitle(hour, date)}» blocks=${parsed.blocks.length} inni=${nHymns}/${st} salmi=${psalms} ${iss.join(",")}`,
      );
      cache.push({ iso, hour, html: r.html });
      await sleep(180);
    }
  }

  console.log("\n=== PRIMO GIRO ===");
  console.log(rows.join("\n"));
  console.log(`\nFAIL ${fail}  OK ${okN}  DRIFT ${drift}  DAYS ${days.length}  fino a ${horizon.last}`);

  const giro: number[] = [];
  for (let g = 1; g <= 5; g++) {
    let f = 0;
    for (const item of cache) {
      if (item.hour === "invitatorio") {
        const ant = extractInvitatoryAntiphon(item.html);
        if (!ant || ant.length < 8) f += 1;
        continue;
      }
      const parsed = parseHourHtml(item.html, item.hour);
      if (issuesFor(item.hour, item.html, parsed.blocks, parsed.error ? [`ERR:${parsed.error}`] : []).length) f += 1;
    }
    giro.push(f);
    console.log(`giro ${g}/5 FAIL ${f} / ${cache.length}`);
  }

  const failRows = rows.filter((r) => r.startsWith("FAIL"));
  const kinds: Record<string, number> = {};
  for (const r of failRows) {
    const tags = r.split(/\s+/).filter((t) => /^[A-Z_]+/.test(t) && /_/.test(t) || /^(VUOTO|JUNK)/.test(t));
    const rest = r.replace(/^FAIL \S+ \S+ \S+ /, "");
    for (const tok of rest.split(/\s+/)) {
      const k = tok.replace(/\(.*$/, "").replace(/:~.*/, "");
      if (/^[A-Z][A-Z0-9_]+/.test(k)) kinds[k] = (kinds[k] || 0) + 1;
    }
  }
  console.log("\n=== TAG FAIL ===");
  console.log(
    Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n}\t${k}`)
      .join("\n"),
  );

  if (fail || giro.some((n) => n > 0)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
