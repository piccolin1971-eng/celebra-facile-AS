import {
  decodeHtmlEntities,
  liturgicalFragment,
  flattenLiturgyNodes,
  hasClass,
  hasClassPrefix,
  hasHoursMarkup,
  stripTags,
  topLevelNodes,
  type HtmlNode,
} from "./html";
import { normalizeTypewriterCapAccents } from "../litTextNormalize";
import { hymnConsume, isExactInnoTitle, isInnoMarkerNode, parseCeiHymnsHtml } from "./hymns";
import {
  applyBundledGospelCanticles,
  marianAntiphonsForDate,
  scrubLoneParenLines,
  splitPsalmTitle,
  stripCeiMarianTail,
} from "./bundled";
import { enrichPsalmHeads } from "./psalmHeadings";
import { JOIN_CROSS_MARK, hasJoinCross } from "./joinCross";
import { parseLocalDate } from "../dateUtils";
import type { MediaId, OreBlock, OreHourId, ParsedHour } from "./types";

function isMarianTitle(t: string): boolean {
  return /ANTIFONE DELLA BEATA VERGINE/i.test(t) || /antifona della beata vergine/i.test(t);
}

function looksLikePsalmTitle(t: string): boolean {
  return /^(SALMO|CANTICO)\b/i.test(t);
}

function psalmHeadFromTitle(text: string, sub = "", cite = ""): OreBlock {
  let { num, name } = splitPsalmTitle(text);
  if (
    !cite &&
    /^(?:[1-3]\s*)?(?:Is|Mt|Mc|Lc|Gv|At|Rm|1\s*Cor|Gal|Ef|Fil|Col|Eb|1\s*Pt|Ap|Dn|Ger|Ez)\b/i.test(name) &&
    /\d/.test(name)
  ) {
    cite = name;
    name = "";
  }
  return {
    k: "psalmHead",
    num,
    name,
    sub: tidyLitText(sub),
    cite: tidyLitText(cite),
  };
}

function tidyLitText(t: string): string {
  return normalizeTypewriterCapAccents(
    t
      .replace(/[\u200B\uFEFF\u200C\u200D]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*\bbr\s*$/i, "")
      .replace(/\s*(?:div|span)\s+class\s*=\s*"?\s*$/i, "")
      .trim(),
  );
}

/** Maiuscola iniziale (è→È) senza toccare V./R./*†/croce di congiunzione. */
function capitalizeLitStart(t: string): string {
  if (t.startsWith(JOIN_CROSS_MARK)) {
    const rest = t.slice(JOIN_CROSS_MARK.length);
    const m = rest.match(/^(\s*)([\s\S]*)$/);
    return JOIN_CROSS_MARK + (m?.[1] || "") + capitalizeLitStart(m?.[2] || "");
  }
  const s = tidyLitText(t);
  if (!s || /^(V\.|R\.|\*|†|—)/.test(s)) return s;
  const ch = s[0];
  if (/[a-zàáâäåèéêëìíîïòóôöùúûüçœæ]/i.test(ch) && ch === ch.toLocaleLowerCase("it-IT")) {
    return ch.toLocaleUpperCase("it-IT") + s.slice(1);
  }
  return s;
}

/** Antifone e primo verso dopo il titolo del salmo/cantico. */
function capitalizePsalmOpenings(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "rubric" && /ant/i.test(b.lab) && b.text) {
      out.push({ ...b, text: capitalizeLitStart(b.text) });
      continue;
    }
    if (b.k === "stanza" && out[out.length - 1]?.k === "psalmHead" && b.lines.length) {
      const lines = [...b.lines];
      lines[0] = capitalizeLitStart(lines[0]);
      out.push({ ...b, lines });
      continue;
    }
    out.push(b);
  }
  return out;
}

function extractCite(sub: string): { sub: string; cite: string } {
  const m = sub.match(/^(.*?)(\([^)]+\.?\)\.?)\s*$/);
  if (!m) return { sub, cite: "" };
  return { sub: m[1].trim(), cite: m[2].trim() };
}

function extractRif(inner: string): { title: string; rif: string } {
  const m = inner.match(/<div[^>]*class="[^"]*lo_rif[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const rif = m ? stripTags(m[1]) : "";
  const title = stripTags(inner.replace(/<div[^>]*lo_rif[\s\S]*?<\/div>/i, "")).replace(/\s+/g, " ").trim();
  return { title, rif };
}

type VerseLine = { text: string; hang: number };

/** 0 = colonna, 1 = secondo emistichio, 2 = wrap del verso (indentazione CEI più profonda). */
function indentHang(spaces: number): number {
  if (spaces >= 4) return 2;
  if (spaces >= 2) return 1;
  return 0;
}

/**
 * Costruisce versetti da righe già spezzate (spazi iniziali = rientro CEI).
 * Prosa senza *†/—: niente rientri (evita &nbsp; spurio nelle letture brevi).
 */
function verseLinesFromRawRows(rawLines: string[]): VerseLine[] {
  const merged: VerseLine[] = [];
  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    const spaces = (raw.match(/^[ \t]+/) || [""])[0].length;
    const indent = spaces >= 2;
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const prev = merged[merged.length - 1];
    const joinWrap =
      indent &&
      prev &&
      !/[*†]\s*$/.test(prev.text) &&
      prev.text.length >= 40 &&
      !/^—/.test(t) &&
      !/^(V\.|R\.|Ant\.)/i.test(t);
    if (joinWrap) {
      prev.text = `${prev.text} ${t}`;
      continue;
    }
      let hang = indentHang(spaces);
      if (/^—/.test(t)) hang = Math.max(hang, 1);
      if (prev && /[*†]\s*$/.test(prev.text)) hang = Math.max(hang, 1);
      // Wrap più profondo del CEI (es. 4–5 &nbsp; dopo un emistichio già rientrato).
      else if (prev && prev.hang > 0 && spaces >= 4) hang = Math.max(hang, 2);
      merged.push({ text: t, hang });
  }
  const withRubrics = mergeLoneRubricLines(merged);
  const hasMarks = withRubrics.some((l) => /[*†]/.test(l.text) || /^—/.test(l.text));
  if (!hasMarks) return withRubrics.map((l) => ({ ...l, hang: 0 }));
  return withRubrics;
}

/**
 * Spezza un lo_versetto CEI in più strofe se ci sono <br><br> (riga vuota voluta).
 * Un solo <br> (anche seguito da \\n nel HTML) non spezza.
 * Es. cantico Tb: «Convertitevi…» e «e allora egli…» nello stesso div.
 *
 * I soli a capo ammessi sono i `<br>` (e i marcatori da serializeRosso per R./V.).
 * I newline «di markup» tra nodi HTML non spezzano: così il responsorio CEI
 * «R. … * risposta.» resta su una riga (sul CEI non c’è <br> tra * e risposta),
 * mentre i salmi restano a due emistichi perché dopo * c’è un <br>.
 */
function coalesceCeiVerseGroups(inner: string): VerseLine[][] {
  const marked = inner
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "{{STANZA_BREAK}}")
    .replace(/<br\s*\/?>/gi, "{{LINE_BREAK}}");
  const text = decodeHtmlEntities(marked.replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ?\{\{LINE_BREAK\}\} ?/g, "\n")
    .replace(/ ?\{\{STANZA_BREAK\}\} ?/g, "{{STANZA_BREAK}}");
  const chunks = text.split("{{STANZA_BREAK}}");
  const groups: VerseLine[][] = [];
  for (const chunk of chunks) {
    const group = verseLinesFromRawRows(chunk.split(/\n/));
    if (group.length) groups.push(group);
  }
  return groups;
}

function blocksFromCoalescedVersetto(inner: string): OreBlock[] {
  const out: OreBlock[] = [];
  for (const group of coalesceCeiVerseGroups(inner)) {
    out.push(...blocksFromVerseLines(group));
  }
  return out;
}

function parseRubricLine(inner: string): OreBlock | null {
  const t = stripTags(inner);
  const m = t.match(/^(V\.|R\.|Ant\.)\s*(.*)$/i);
  if (m) return { k: "rubric", lab: m[1].replace(/\.$/, "."), text: m[2].trim() };
  return null;
}

function normalizeLab(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (/^V\.?$/i.test(t)) return "V.";
  if (/^R\.?$/i.test(t)) return "R.";
  return t;
}

function isAntiphonLabel(t: string): boolean {
  const s = t.replace(/\s+/g, " ").trim();
  return /^\d+\s*ant\.$/i.test(s) || /^Ant\.\s*al\s+Ben\.$/i.test(s) || /^Ant\.$/i.test(s);
}

/**
 * `lo_rosso` con solo † = croce di congiunzione (antifona = inizio/fine salmo).
 * `lo_rosso` con solo * = asterisco liturgico (es. risposta del responsorio): conservalo.
 * Non eliminarlo: sul CEI marca la parte ripetuta da chi risponde.
 */
function stripDecorativeRosso(inner: string): string {
  return inner
    .replace(
      /<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*(?:&dagger;|†)(?:&nbsp;|\s|<br\s*\/?>)*<\/div>/gi,
      JOIN_CROSS_MARK,
    )
    .replace(
      /<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*(?:\*)(?:&nbsp;|\s|<br\s*\/?>)*<\/div>/gi,
      " * ",
    );
}

function consumeSubAfterPsalm(nodes: HtmlNode[], i: number): { sub: string; cite: string; skip: number } {
  let skip = 0;
  let sub = "";
  let cite = "";
  const n = nodes[i];
  if (n && n.kind === "el" && hasClassPrefix(n.cls, "lo_sottotitolo")) {
    const parsed = extractCite(stripTags(n.inner));
    sub = parsed.sub;
    cite = parsed.cite;
    skip = 1;
    const innerVerse = topLevelNodes(n.inner).find((x) => x.kind === "el" && hasClass(x.cls, "lo_versetto"));
    if (innerVerse && innerVerse.kind === "el" && !sub) {
      const parsed2 = extractCite(stripTags(innerVerse.inner));
      sub = parsed2.sub;
      cite = parsed2.cite || cite;
    }
  } else if (n && n.kind === "el" && hasClass(n.cls, "lo_versetto")) {
    const kids = topLevelNodes(n.inner);
    const innerSub = kids.find((x) => x.kind === "el" && hasClassPrefix(x.cls, "lo_sottotitolo"));
    if (innerSub && innerSub.kind === "el") {
      const parsed = extractCite(stripTags(innerSub.inner));
      sub = parsed.sub;
      cite = parsed.cite;
      const leftover = kids
        .filter((x) => x !== innerSub)
        .map((x) => (x.kind === "el" ? stripTags(x.inner) : x.kind === "text" ? x.text : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      // Se il CEI mette i versetti (e a volte il resto dell'ora) nello stesso lo_versetto,
      // non saltare il nodo: altrimenti si perdono Benedictus, invocazioni, orazione.
      skip = leftover.length < 40 ? 1 : 0;
    } else {
      const t = stripTags(n.inner);
      if (t && t.length < 80 && !/[*†]/.test(t) && !/lo_antifona/.test(n.inner)) {
        sub = t;
        skip = 1;
      }
    }
  }
  return { sub, cite, skip };
}

function takeHymn(nodes: HtmlNode[], i: number, blocks: OreBlock[]): number | null {
  const hymns = parseCeiHymnsHtml(restToHtml(nodes.slice(i)));
  if (!hymns.length) return null;
  const { count, tail } = hymnConsume(nodes.slice(i));
  const consumed = Math.max(1, count);
  blocks.push({ k: "hymn", hymns });
  if (tail.length) nodes.splice(i + consumed, 0, ...tail);
  return consumed;
}

function restToHtml(nodes: HtmlNode[]): string {
  return nodes
    .map((n) =>
      n.kind === "el"
        ? `<${n.tag} class="${n.cls}">${n.inner}</${n.tag}>`
        : n.kind === "br"
          ? "<br/>"
          : n.text,
    )
    .join("");
}

function expandIfNestedLiturgy(node: HtmlNode): HtmlNode[] | null {
  if (node.kind !== "el") return null;
  const inner = topLevelNodes(node.inner);
  const lit = inner.filter((n) => n.kind === "el" && isLo(n.cls));
  if (lit.length === 0) return null;
  if (hasClass(node.cls, "lo_titolo") || hasClassPrefix(node.cls, "lo_sottotitolo")) return null;
  if (hasClass(node.cls, "lo_versetto") || hasClass(node.cls, "lo_strofa")) {
    const nestedHours = lit.filter(
      (n) =>
        n.kind === "el" &&
        (hasClass(n.cls, "lo_titolo") ||
          hasClass(n.cls, "lo_versetto") ||
          hasClass(n.cls, "lo_strofa") ||
          hasClassPrefix(n.cls, "lo_sottotitolo")),
    );
    if (nestedHours.length) return flattenKeepText(inner);
  }
  return null;
}

function isLo(cls: string): boolean {
  return cls.split(/\s+/).some((c) => c.startsWith("lo_"));
}

function flattenKeepText(nodes: HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const n of nodes) {
    if (n.kind === "br") continue;
    if (n.kind === "text") {
      if (n.text.replace(/\s+/g, " ").trim()) out.push(n);
      continue;
    }
    out.push(n);
  }
  return out;
}

function blocksFromAntiphonal(inner: string): OreBlock[] {
  const nodes = topLevelNodes(stripDecorativeRosso(inner));
  const out: OreBlock[] = [];
  let lab = "";
  let acc: string[] = [];
  const flush = () => {
    const text = tidyLitText(acc.join(" "));
    if (lab || text) {
      out.push({ k: "rubric", lab: normalizeLab(lab), text });
    }
    lab = "";
    acc = [];
  };
  for (const n of nodes) {
    if (n.kind === "el" && (hasClass(n.cls, "lo_antifona") || hasClass(n.cls, "lo_rosso"))) {
      const raw = stripTags(n.inner).replace(/\s+/g, " ").trim();
      if (!raw || raw === "*") continue;
      if (raw === "†" || raw === JOIN_CROSS_MARK) {
        acc.push(JOIN_CROSS_MARK);
        continue;
      }
      if (hasClass(n.cls, "lo_antifona") || isAntiphonLabel(raw) || /^(V\.?|R\.?)$/i.test(raw)) {
        if (lab || acc.length) flush();
        lab = raw;
        continue;
      }
    }
    if (n.kind === "br") continue;
    if (n.kind === "text") {
      const t = stripTags(n.text);
      if (t) acc.push(t);
      continue;
    }
    if (n.kind === "el") {
      const t = stripTags(n.inner);
      if (t === "†" || t === JOIN_CROSS_MARK) {
        acc.push(JOIN_CROSS_MARK);
        continue;
      }
      if (t && t !== "*") acc.push(t);
    }
  }
  flush();
  return out.filter((b) => b.k !== "rubric" || !!(b.lab || b.text));
}

function serializeRosso(inner: string): string {
  return inner.replace(/<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, (_m, body) => {
    const t = stripTags(body).replace(/\s+/g, " ").trim();
    if (t === "†") return JOIN_CROSS_MARK;
    if (t === "*") return ` ${t} `;
    // Marcatori (non \n grezzi): i newline di markup non devono spezzare
    // «R. … * risposta» del responsorio CEI (lì non c’è <br> tra * e risposta).
    if (/^R\.?$/i.test(t)) return "{{LINE_BREAK}}R. ";
    if (/^V\.?$/i.test(t)) return "{{LINE_BREAK}}V. ";
    if (isAntiphonLabel(t)) return `{{LINE_BREAK}}${t}{{LINE_BREAK}}`;
    if (t === "—" || t === "–" || t === "-") return "{{LINE_BREAK}}— ";
    return ` ${t} `;
  });
}

function mergeLoneRubricLines(lines: VerseLine[]): VerseLine[] {
  const out: VerseLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i].text.trim();
    // Croce di congiunzione sola → inizio della riga successiva (come sul CEI).
    if (cur === JOIN_CROSS_MARK && lines[i + 1]) {
      const next = lines[i + 1].text.replace(/^\s+/, "");
      out.push({
        text: `${JOIN_CROSS_MARK} ${next}`,
        hang: lines[i + 1].hang,
      });
      i += 1;
      continue;
    }
    // Asterisco di risposta/flessa solo → in coda alla riga precedente
    // (es. responsorio: «Ci nutri, Signore,» + «*» + «con fiore…»).
    if (
      cur === "*" &&
      out.length > 0 &&
      !/[*†]\s*$/.test(out[out.length - 1].text) &&
      !hasJoinCross(out[out.length - 1].text)
    ) {
      const prev = out[out.length - 1];
      prev.text = `${prev.text.replace(/\s+$/, "")} *`;
      continue;
    }
    // Responsorio CEI: «R. … *» + risposta sullo stesso verso (senza <br>) → una riga.
    // I salmi restano a due emistichi: lì dopo * c’è un <br>, e la riga non inizia con R.
    if (
      out.length > 0 &&
      /\*\s*$/.test(out[out.length - 1].text) &&
      /^R\./i.test(out[out.length - 1].text.trim()) &&
      !/^(V\.|R\.|Ant\.|—|\*)/i.test(cur) &&
      !hasJoinCross(cur)
    ) {
      const prev = out[out.length - 1];
      prev.text = `${prev.text.replace(/\s+$/, "")} ${cur}`;
      continue;
    }
    // «* testo» all’inizio riga → * in coda alla precedente, testo resta qui
    if (
      /^\*\s+\S/.test(cur) &&
      out.length > 0 &&
      !/[*†]\s*$/.test(out[out.length - 1].text) &&
      !hasJoinCross(out[out.length - 1].text)
    ) {
      const prev = out[out.length - 1];
      // Stesso caso responsorio se la riga precedente è un R.
      if (/^R\./i.test(prev.text.trim())) {
        prev.text = `${prev.text.replace(/\s+$/, "")} * ${cur.replace(/^\*\s+/, "")}`;
        continue;
      }
      prev.text = `${prev.text.replace(/\s+$/, "")} *`;
      out.push({
        text: cur.replace(/^\*\s+/, ""),
        hang: Math.max(lines[i].hang, 1),
      });
      continue;
    }
    if (/^(V\.|R\.|\*|†|—)\s*$/.test(cur) && lines[i + 1]) {
      out.push({
        text: `${cur} ${lines[i + 1].text}`,
        hang: Math.max(lines[i].hang, /^—/.test(cur) ? 1 : 0),
      });
      i += 1;
    } else {
      out.push(lines[i]);
    }
  }
  return out;
}

/**
 * Croce di congiunzione sola → inizio della riga/strofa successiva (come sul CEI).
 * Copre: strofa intera = †; oppure † in coda a una strofa con altre righe.
 */
function mergeLoneJoinCrossBlocks(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    let b = blocks[i];
    const next = blocks[i + 1];

    // † sola come unica riga della strofa → fusione sulla strofa successiva
    if (
      b.k === "stanza" &&
      b.lines.length === 1 &&
      b.lines[0].trim() === JOIN_CROSS_MARK &&
      next &&
      next.k === "stanza" &&
      next.lines.length > 0
    ) {
      const lines = [`${JOIN_CROSS_MARK} ${next.lines[0].replace(/^\s+/, "")}`, ...next.lines.slice(1)];
      const hang = next.hang ? [next.hang[0] ?? 0, ...next.hang.slice(1)] : undefined;
      out.push({ k: "stanza", lines, hang });
      i += 1;
      continue;
    }

    // † in coda a una strofa (stesso lo_versetto del CEI) → fusione sulla strofa successiva
    if (
      b.k === "stanza" &&
      b.lines.length > 1 &&
      b.lines[b.lines.length - 1].trim() === JOIN_CROSS_MARK &&
      next &&
      next.k === "stanza" &&
      next.lines.length > 0
    ) {
      const kept = b.lines.slice(0, -1);
      const keptHang = b.hang?.slice(0, -1);
      out.push({
        k: "stanza",
        lines: kept,
        hang: keptHang,
      });
      const lines = [`${JOIN_CROSS_MARK} ${next.lines[0].replace(/^\s+/, "")}`, ...next.lines.slice(1)];
      const hang = next.hang ? [next.hang[0] ?? 0, ...next.hang.slice(1)] : undefined;
      out.push({ k: "stanza", lines, hang });
      i += 1;
      continue;
    }

    if (b.k === "stanza" && b.lines.length > 1) {
      const merged = mergeLoneRubricLines(b.lines.map((text, j) => ({ text, hang: b.hang?.[j] ?? 0 })));
      b = {
        k: "stanza",
        lines: merged.map((l) => l.text),
        hang: merged.map((l) => l.hang),
      };
    }
    out.push(b);
  }
  return out;
}

/**
 * Anomalia CEI ricorrente (Sabato II salterio, Salmo 8 / Lodi):
 * - manca `*` dopo «su tutta la terra:» prima della croce di congiunzione;
 * - † spurio prima della ripresa finale («O Signore, nostro Dio, *»).
 * Forma corretta (libri / liturgiadelleore): terra: * † sopra i cieli… ; ripresa senza †.
 */
function repairCeiPsalm8JoinAnomaly(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  let inPsalm8 = false;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    if (b.k === "psalmHead" && /^SALMO\s*8\b/i.test(b.num)) {
      inPsalm8 = true;
      out.push(b);
      continue;
    }
    if (
      inPsalm8 &&
      (b.k === "rubric" ||
        b.k === "title" ||
        (b.k === "psalmHead" && !/^SALMO\s*8\b/i.test(b.num)))
    ) {
      inPsalm8 = false;
    }

    if (!inPsalm8 || b.k !== "stanza") {
      out.push(b);
      continue;
    }

    let lines = [...b.lines];
    let hang = b.hang ? [...b.hang] : undefined;

    // «su tutta la terra:» → «su tutta la terra: *» (asterisco omesso dal CEI)
    lines = lines.map((l) => {
      const t = l.trim();
      if (/^su tutta la terra:\s*$/i.test(t)) return "su tutta la terra: *";
      return l;
    });

    // Ripresa finale: togli † di congiunzione spurio davanti a «O Signore, nostro Dio, *»
    if (
      lines.length >= 1 &&
      new RegExp(`^${JOIN_CROSS_MARK}\\s+O Signore, nostro Dio,\\s*\\*\\s*$`).test(lines[0].trim())
    ) {
      lines[0] = lines[0].replace(JOIN_CROSS_MARK, "").replace(/^\s+/, "");
    }

    out.push({ k: "stanza", lines, hang });
  }
  return out;
}

function stanzaFromLines(lines: VerseLine[]): OreBlock {
  return {
    k: "stanza",
    lines: lines.map((l) => l.text),
    hang: lines.map((l) => l.hang),
  };
}

function blocksFromVerseLines(lines: VerseLine[]): OreBlock[] {
  const kept = lines
    .map((l) => ({ ...l, text: tidyLitText(l.text) }))
    .filter((l) => l.text && !isChromeText(l.text));
  if (!kept.length) return [];
  // «3 ant.» (spesso in lo_rosso) + testo senza *† → antifona in riga, come 1/2 ant.
  if (isAntiphonLabel(kept[0].text)) {
    const lab = normalizeLab(kept[0].text);
    const rest = kept.slice(1);
    if (!rest.length) return [{ k: "rubric", lab, text: "" }];
    if (!rest.some((l) => /[*†]/.test(l.text))) {
      return [{ k: "rubric", lab, text: tidyLitText(rest.map((l) => l.text).join(" ")) }];
    }
    return [{ k: "rubric", lab, text: "" }, stanzaFromLines(rest)];
  }
  if (kept.some((l) => /^—/.test(l.text))) return splitDashStanzas(kept.map((l) => l.text));
  // Letture / prosa CEI (anche multi-paragrafo via <br>): niente strofa né hang da salmo.
  const hasLitMarks = kept.some(
    (l) => /[*†]/.test(l.text) || /^(V\.|R\.|Ant\.)/i.test(l.text) || hasJoinCross(l.text),
  );
  if (!hasLitMarks) {
    return kept.map((l) => ({ k: "prose" as const, text: l.text }));
  }
  // Un lo_versetto CEI è già la strofa (2, 3 o 4 righe): non spezzare a coppie.
  return [stanzaFromLines(kept)];
}

function splitDashStanzas(lines: string[]): OreBlock[] {
  const out: OreBlock[] = [];
  let petition: string[] = [];
  const flushPetition = () => {
    if (!petition.length) return;
    out.push({ k: "stanza", lines: [...petition] });
    petition = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^—/.test(line)) {
      const last = out[out.length - 1];
      const lastLine = last && last.k === "stanza" ? last.lines[last.lines.length - 1] : "";
      if (
        last &&
        last.k === "stanza" &&
        /^—/.test(lastLine) &&
        !/[.!?]$/.test(lastLine) &&
        /^[a-zàèéìòù«]/.test(line)
      ) {
        last.lines[last.lines.length - 1] = `${lastLine} ${line}`;
        continue;
      }
      petition.push(line);
      continue;
    }
    let response = line.replace(/^—\s*/, "").trim();
    if (!response && lines[i + 1] && !/^—/.test(lines[i + 1])) {
      response = lines[i + 1].trim();
      i += 1;
    }
    const pet = petition.join(" ").trim();
    petition = [];
    const stanza = pet ? [pet] : [];
    stanza.push(response ? `— ${response}` : "—");
    out.push({ k: "stanza", lines: stanza });
  }
  flushPetition();
  return out;
}

function looksLikeToneIntro(text: string): boolean {
  if (!text || /^—/.test(text) || /[*†]/.test(text)) return false;
  return (
    /:\s*$/.test(text) ||
    /\bacclamiamo\b|\brivolgiamo\b|\bpreghiamo\b|\bdiciamo\b|\buniamo\b/i.test(text)
  );
}

/** Se il CEI mette la risposta nello stesso versetto dopo i due punti. */
function splitIntroRefrain(text: string): { intro: string; refrain: string } {
  const m = text.match(/^(.*?:\s*)(.+)$/s);
  if (!m) return { intro: text.trim(), refrain: "" };
  const refrain = m[2].replace(/\s+/g, " ").trim();
  if (refrain.length < 8 || refrain.length > 140 || /^—/.test(refrain)) {
    return { intro: text.trim(), refrain: "" };
  }
  return { intro: m[1].replace(/\s+/g, " ").trim(), refrain };
}

function flattenPrecesLines(blocks: OreBlock[]): { lines: string[]; refrainHint: string } {
  const lines: string[] = [];
  let refrainHint = "";
  for (const b of blocks) {
    if (b.k === "sub") {
      refrainHint = b.text;
      continue;
    }
    if (b.k === "tone") {
      if (b.intro) lines.push(b.intro);
      if (b.refrain) refrainHint = refrainHint || b.refrain;
      continue;
    }
    if (b.k === "prose") lines.push(b.text);
    if (b.k === "stanza") lines.push(...b.lines);
  }
  return { lines, refrainHint };
}

function joinPrecesWrap(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (/^—/.test(t)) {
      out.push(/^—\s/.test(t) ? t : `— ${t.replace(/^—\s*/, "")}`);
      continue;
    }
    const prev = out[out.length - 1];
    const prevIsDash = !!prev && /^—/.test(prev);
    const wrapAfterDash = prevIsDash && !/^—/.test(t) && !/[.!?]$/.test(prev);
    const cont =
      prev &&
      !/:\s*$/.test(prev) &&
      !/[.!?]$/.test(prev) &&
      !/^(V\.|R\.|Ant\.)/i.test(t) &&
      (!prevIsDash || wrapAfterDash);
    if (cont) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
  }
  return out;
}

function blockPlain(b: OreBlock): string {
  if (b.k === "prose" || b.k === "sub" || b.k === "omit" || b.k === "title") return b.text;
  if (b.k === "stanza") return b.lines.join(" ");
  if (b.k === "tone") return `${b.intro} ${b.refrain}`.trim();
  return "";
}

function responseFromSub(text: string, fallback: string): string {
  const t = text.replace(/\s+/g, " ").trim().replace(/^[–\-—]\s*/, "").trim();
  return t || fallback;
}

/** Petizioni CEI con un lo_sottotitolo (risposta) dopo ciascuna. */
function rebuildPrecesFromSubs(grabbed: OreBlock[]): OreBlock[] | null {
  const subIdxs = grabbed.map((b, i) => (b.k === "sub" ? i : -1)).filter((i) => i >= 0);
  if (subIdxs.length < 2) return null;
  const firstSub = subIdxs[0];
  const intro = grabbed
    .slice(0, firstSub)
    .map(blockPlain)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const refrain = grabbed[firstSub].k === "sub" ? responseFromSub(grabbed[firstSub].text, "") : "";
  if (!intro || intro.length < 8) return null;
  const out: OreBlock[] = [{ k: "tone", intro, refrain }];
  let pet: string[] = [];
  const flush = (resp: string) => {
    const t = pet.join(" ").replace(/\s+/g, " ").trim();
    pet = [];
    if (!t || /^Padre nostro\b/i.test(t)) return;
    const lines = [t];
    if (resp) lines.push(`— ${resp}`);
    out.push({ k: "stanza", lines });
  };
  for (let i = firstSub + 1; i < grabbed.length; i++) {
    const b = grabbed[i];
    if (b.k === "sub") {
      flush(responseFromSub(b.text, refrain));
    } else {
      const t = blockPlain(b).trim();
      if (t && !/^Padre nostro\b/i.test(t)) pet.push(t);
    }
  }
  if (pet.length) flush(refrain);
  return out.some((b) => b.k === "stanza") ? out : null;
}

function rebuildPreces(grabbed: OreBlock[]): OreBlock[] | null {
  const fromSubs = rebuildPrecesFromSubs(grabbed);
  if (fromSubs) return fromSubs;
  if (!grabbed.length) return null;
  const { lines: rawLines, refrainHint } = flattenPrecesLines(grabbed);
  const lines = joinPrecesWrap(rawLines);
  if (!lines.length && !refrainHint) return null;
  let introEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/:\s*$/.test(lines[i]) || /:\s+\S/.test(lines[i])) {
      introEnd = i;
      break;
    }
  }
  if (introEnd < 0) {
    if (!looksLikeToneIntro(lines.join(" "))) return null;
    // Senza due punti: solo le righe d'invito, non le petizioni del secondo formulario.
    for (let i = 0; i < lines.length; i++) {
      if (/^—/.test(lines[i])) break;
      if (i > 0 && !looksLikeToneIntro(lines[i])) break;
      if (looksLikeToneIntro(lines[i]) || i === 0) introEnd = i;
    }
    if (introEnd < 0) return null;
  }
  let intro = "";
  let refrain = refrainHint;
  let rest = lines.slice(introEnd + 1);
  const last = lines[introEnd] || "";
  const inline = last.match(/^(.*?:\s*)(.+)$/);
  if (inline && inline[2].trim() && inline[2].trim().length <= 140 && !/^—/.test(inline[2].trim())) {
    intro = [...lines.slice(0, introEnd), inline[1].trim()].join(" ");
    if (!refrain) refrain = inline[2].trim();
  } else {
    intro = lines.slice(0, introEnd + 1).join(" ");
    if (!refrain && rest[0] && rest[0].length <= 140 && !/^—/.test(rest[0]) && !/,$/.test(rest[0])) {
      refrain = rest[0];
      rest = rest.slice(1);
    }
  }
  intro = intro.replace(/\s+/g, " ").trim();
  refrain = (refrain || "").replace(/\s+/g, " ").trim();
  if (!intro || intro.length < 8) return null;
  const out: OreBlock[] = [{ k: "tone", intro, refrain }];
  out.push(...splitDashStanzas(rest));
  return out;
}

function normalizeOrElseText(t: string): string {
  const s = t.replace(/\s+/g, " ").trim() || "Oppure";
  return /:$/.test(s) ? s : `${s}:`;
}

function orElseRawText(b: OreBlock): string | null {
  const from = (t: string) => {
    const s = t.replace(/\s+/g, " ").trim();
    return /^Oppure\b/i.test(s) ? s : null;
  };
  if (b.k === "omit" || b.k === "prose" || b.k === "sub" || b.k === "title") return from(b.text);
  if (b.k === "rubric") return from(b.lab) || from(b.text) || from(`${b.lab} ${b.text}`.trim());
  return null;
}

/** Porta ogni «Oppure» a un blocco omit, anche se il CEI lo mette in una strofa. */
function explodeOrElse(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (const b of blocks) {
    if (b.k !== "stanza") {
      const raw = orElseRawText(b);
      if (raw) out.push({ k: "omit", text: normalizeOrElseText(raw) });
      else out.push(b);
      continue;
    }
    let lines: string[] = [];
    let hang: number[] = [];
    const flush = () => {
      if (!lines.length) return;
      out.push({ k: "stanza", lines, hang: hang.length ? hang : undefined });
      lines = [];
      hang = [];
    };
    b.lines.forEach((line, i) => {
      if (/^Oppure\b/i.test(line.trim())) {
        flush();
        out.push({ k: "omit", text: normalizeOrElseText(line) });
        return;
      }
      lines.push(line);
      hang.push(b.hang?.[i] ?? 0);
    });
    flush();
  }
  return out;
}

function isPrecesStop(n: OreBlock): boolean {
  if (n.k === "title" || n.k === "marian") return true;
  if (n.k === "omit" && /^Oppure\b/i.test(n.text)) return true;
  if (n.k === "prose" && /^Padre nostro\b/i.test(n.text.trim())) return true;
  return false;
}

function unwrapPrecesLine(t: string): string {
  return t.replace(/^\(\s*/, "").replace(/\s*\)\.?$/, "").trim();
}

/** Dopo un «Oppure» che non apre un secondo formulario: petizioni (anche in parentesi). */
function petitionsFromBlocks(grabbed: OreBlock[]): OreBlock[] {
  const { lines } = flattenPrecesLines(grabbed);
  const joined = joinPrecesWrap(lines)
    .map(unwrapPrecesLine)
    .filter((l) => l && !/^Padre nostro\b/i.test(l));
  return splitDashStanzas(joined);
}

function applyTonePhrases(blocks: OreBlock[]): OreBlock[] {
  const src = explodeOrElse(blocks);
  const out: OreBlock[] = [];
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    out.push(b);
    if (b.k !== "title" || !/^(INVOCAZIONI|INTERCESSIONI)\b/i.test(b.text)) continue;

    let j = i + 1;
    const rebuiltAll: OreBlock[] = [];
    let hadOrElse = false;
    let rebuiltTone = false;
    while (j < src.length) {
      const grabbed: OreBlock[] = [];
      while (j < src.length && !isPrecesStop(src[j])) {
        grabbed.push(src[j]);
        j += 1;
      }
      const rebuilt = rebuildPreces(grabbed);
      if (rebuilt && rebuilt.some((x) => x.k === "tone" && x.intro.length > 8)) {
        rebuiltAll.push(...rebuilt);
        rebuiltTone = true;
      } else if (grabbed.length) {
        rebuiltAll.push(...(hadOrElse ? petitionsFromBlocks(grabbed) : grabbed));
      }
      if (j < src.length && src[j].k === "omit" && /^Oppure\b/i.test(src[j].text)) {
        rebuiltAll.push(src[j]);
        hadOrElse = true;
        j += 1;
        continue;
      }
      break;
    }
    if (rebuiltTone || hadOrElse) {
      out.push(...rebuiltAll);
      i = j - 1;
    }
  }
  return out;
}

function mergeRubricPrefixLines(blocks: OreBlock[]): OreBlock[] {
  return blocks.map((b) => {
    if (b.k !== "stanza") return b;
    const merged = mergeLoneRubricLines(b.lines.map((text, i) => ({ text, hang: b.hang?.[i] ?? 0 })));
    return {
      k: "stanza" as const,
      lines: merged.map((l) => l.text),
      hang: merged.map((l) => l.hang),
    };
  });
}

/** Unisce «3 ant.» vuota / strofa-sola + testo successivo senza *† (testo fuori dal div CEI). */
function attachOrphanAntiphonText(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    const emptyRubric =
      b.k === "rubric" && /ant/i.test(b.lab) && !b.text && next?.k === "stanza";
    const loneLabelStanza =
      b.k === "stanza" &&
      b.lines.length === 1 &&
      isAntiphonLabel(b.lines[0]) &&
      next?.k === "stanza";
    if (emptyRubric || loneLabelStanza) {
      const lab = b.k === "rubric" ? b.lab : normalizeLab(b.lines[0]);
      const joined = next!.lines.join(" ").replace(/\s+/g, " ").trim();
      if (
        joined.length > 0 &&
        joined.length < 180 &&
        !/[*†]/.test(joined) &&
        !next!.lines.some((l) => /Gloria al Padre/i.test(l))
      ) {
        out.push({ k: "rubric", lab, text: joined });
        i += 1;
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

function isLoneJoinCrossBlock(b: OreBlock): boolean {
  if (b.k === "prose") return b.text.trim() === JOIN_CROSS_MARK;
  if (b.k === "stanza") {
    return b.lines.length === 1 && b.lines[0].trim() === JOIN_CROSS_MARK;
  }
  return false;
}

/**
 * CEI a volte mette il † di congiunzione tra testo ant e titolo SALMO
 * (es. Sabato II salterio, Salmo 8) invece che dentro l’antifona.
 * Lo riattacca all’antifona precedente.
 */
function attachJoinCrossBeforePsalmHead(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const join = blocks[i + 1];
    const head = blocks[i + 2];
    if (
      b.k === "rubric" &&
      /ant/i.test(b.lab) &&
      b.text &&
      !hasJoinCross(b.text) &&
      join &&
      isLoneJoinCrossBlock(join) &&
      head &&
      head.k === "psalmHead"
    ) {
      const text = `${b.text.replace(/\s+$/, "")} ${JOIN_CROSS_MARK}`.replace(/\s+/g, " ").trim();
      out.push({ ...b, text });
      i += 1; // salta il † orfano; psalmHead al giro successivo
      continue;
    }
    out.push(b);
  }
  return out;
}

function dropOrphanStarLines(blocks: OreBlock[]): OreBlock[] {
  return blocks
    .map((b) => {
      if (b.k !== "stanza") return b;
      const keep: number[] = [];
      b.lines.forEach((l, i) => {
        // Non scartare la croce di congiunzione (marker interno).
        if (hasJoinCross(l) || !/^[*†]\s*$/.test(l)) keep.push(i);
      });
      if (!keep.length) return null;
      return {
        k: "stanza" as const,
        lines: keep.map((i) => b.lines[i]),
        hang: b.hang ? keep.map((i) => b.hang?.[i] ?? 0) : undefined,
      };
    })
    .filter((b): b is OreBlock => !!b);
}

function coalesceResponsory(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    out.push(b);
    if (b.k !== "title" || !/RESPONSORIO/i.test(b.text)) continue;
    const lines: string[] = [];
    let j = i + 1;
    while (j < blocks.length) {
      const n = blocks[j];
      if (n.k === "stanza") {
        lines.push(...n.lines);
        j += 1;
        continue;
      }
      if (n.k === "prose" && n.text && !/^Padre nostro/i.test(n.text)) {
        lines.push(n.text);
        j += 1;
        continue;
      }
      break;
    }
    if (lines.length) {
      out.push({ k: "stanza", lines });
      i = j - 1;
    }
  }
  return out;
}

function blocksFromVersetto(inner: string): OreBlock[] {
  inner = stripDecorativeRosso(inner);
  inner = inner.replace(
    /<div[^>]*class="[^"]*lo_antifona[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    (full, body) => {
      const t = stripTags(body).replace(/\s+/g, " ").trim();
      if (/^(R\.?|V\.?)$/i.test(t)) return `<div class="lo_rosso">${t}</div>`;
      return full;
    },
  );
  const nodes = topLevelNodes(inner);
  const nested = nodes.filter((n) => n.kind === "el" && hasClass(n.cls, "lo_versetto"));
  if (nested.length) {
    const out: OreBlock[] = [];
    for (const n of nodes) {
      if (n.kind === "el" && hasClass(n.cls, "lo_versetto")) out.push(...blocksFromVersetto(n.inner));
      else if (n.kind === "el" && hasClass(n.cls, "lo_antifona")) {
        out.push({ k: "rubric", lab: normalizeLab(stripTags(n.inner)), text: "" });
      } else if (n.kind === "el" && hasClassPrefix(n.cls, "lo_sottotitolo")) {
        const t = stripTags(n.inner).replace(/\s+/g, " ").trim();
        if (t) out.push({ k: "sub", text: t });
      } else if (n.kind === "el" && /^(i|em)$/i.test(n.tag)) {
        const t = stripTags(n.inner).replace(/\s+/g, " ").trim();
        if (t) out.push({ k: "sub", text: t });
      } else if (n.kind === "text" && n.text.trim()) {
        const t = stripTags(n.text);
        if (t) out.push({ k: "prose", text: t });
      }
    }
    return out;
  }
  const subCount = nodes.filter((n) => n.kind === "el" && hasClassPrefix(n.cls, "lo_sottotitolo")).length;
  if (subCount >= 1) {
    const out: OreBlock[] = [];
    let acc = "";
    const flushAcc = () => {
      if (!acc.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim()) {
        acc = "";
        return;
      }
      out.push(...blocksFromCoalescedVersetto(serializeRosso(acc)));
      acc = "";
    };
    for (const n of nodes) {
      if (n.kind === "el" && hasClassPrefix(n.cls, "lo_sottotitolo")) {
        flushAcc();
        const t = stripTags(n.inner).replace(/\s+/g, " ").trim();
        if (t) out.push({ k: "sub", text: t });
        continue;
      }
      if (n.kind === "el" && /^(i|em)$/i.test(n.tag)) {
        const t = stripTags(n.inner).replace(/\s+/g, " ").trim();
        if (t) {
          flushAcc();
          out.push({ k: "sub", text: t });
        }
        continue;
      }
      if (n.kind === "br") {
        acc += "<br/>";
        continue;
      }
      if (n.kind === "text") {
        acc += n.text;
        continue;
      }
      if (n.kind === "el") acc += `<${n.tag} class="${n.cls}">${n.inner}</${n.tag}>`;
    }
    flushAcc();
    return out;
  }
  // Anche con lo_rosso residuo (es. † spuri): se c’è lo_antifona è un’antifona.
  if (/lo_antifona/.test(inner) || /lo_rosso[^>]*>\s*\d+\s*ant\./i.test(inner)) {
    const antBlocks = blocksFromAntiphonal(inner);
    if (antBlocks.some((b) => b.k === "rubric" && /ant/i.test(b.lab))) return antBlocks;
  }
  const subMatch = inner.match(/<div[^>]*class="[^"]*lo_sottotitolo[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const italics: string[] = [];
  let withoutSub = subMatch
    ? inner.replace(/<div[^>]*class="[^"]*lo_sottotitolo[^"]*"[^>]*>[\s\S]*?<\/div>/i, "")
    : inner;
  withoutSub = withoutSub.replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, body) => {
    const t = stripTags(body).replace(/\s+/g, " ").trim();
    if (t) italics.push(t);
    return " ";
  });
  const out = blocksFromCoalescedVersetto(serializeRosso(withoutSub));
  const refrain = (subMatch ? stripTags(subMatch[1]).replace(/\s+/g, " ").trim() : "") || italics.join(" ");
  if (refrain) out.push({ k: "sub", text: refrain });
  return out;
}

export function parseHourHtml(html: string, hour: OreHourId | MediaId, dateISO?: string): ParsedHour {
  const missing = {
    hour,
    blocks: [] as OreBlock[],
    error: "Testo non disponibile. Riprova con la connessione, oppure scarica 10 giorni dalla Home.",
  };
  if (!html || (/nessun contenuto trovato/i.test(html) && !hasHoursMarkup(html))) {
    return missing;
  }
  const frag = liturgicalFragment(html);
  if (!frag || !hasHoursMarkup(frag)) return missing;
  const nodes = flattenLiturgyNodes(frag);
  const blocks: OreBlock[] = [];
  let i = 0;
  let sawMarian = false;

  while (i < nodes.length) {
    const node = nodes[i];
    if (node.kind === "text" && !node.text.trim()) {
      i += 1;
      continue;
    }
    if (node.kind === "br") {
      i += 1;
      continue;
    }
    if (node.kind === "text") {
      // CEI a volte lascia l'ultima strofa fuori da lo_versetto (testo orfano + <br>).
      const rawRows: string[] = [];
      let j = i;
      while (j < nodes.length) {
        const n = nodes[j];
        if (n.kind === "br") {
          rawRows.push("");
          j += 1;
          continue;
        }
        if (n.kind !== "text") break;
        const decoded = decodeHtmlEntities(n.text).replace(/\u00a0/g, " ");
        if (decoded.replace(/\s+/g, " ").trim() && !isChromeText(decoded)) {
          rawRows.push(decoded);
        }
        j += 1;
      }
      if (rawRows.length) {
        const merged = verseLinesFromRawRows(rawRows);
        const lines = merged.map((l) => tidyLitText(l.text)).filter(Boolean);
        const looseProse =
          lines.length > 0 &&
          lines.every(
            (l) =>
              l.trim().length >= 45 &&
              !/[*†]/.test(l) &&
              !hasJoinCross(l) &&
              l !== JOIN_CROSS_MARK &&
              !/\s\/\s/.test(l) &&
              !/^(V\.|R\.|Ant\.|—)/.test(l.trim()),
          );
        if (looseProse) {
          for (const line of lines) blocks.push({ k: "prose", text: line });
        } else if (lines.length === 1 && !/[*†]/.test(lines[0]) && lines[0] !== JOIN_CROSS_MARK && !/^(V\.|R\.)/.test(lines[0])) {
          blocks.push({ k: "prose", text: lines[0] });
        } else if (lines.length) {
          const hangs = merged
            .filter((l) => tidyLitText(l.text))
            .map((l) => l.hang);
          blocks.push({ k: "stanza", lines, hang: hangs });
        }
      }
      i = j;
      continue;
    }

    const expanded = expandIfNestedLiturgy(node);
    if (expanded) {
      nodes.splice(i, 1, ...expanded);
      continue;
    }

    if (hasClass(node.cls, "lo_nota")) {
      const t = stripTags(node.inner);
      if (t) blocks.push({ k: "omit", text: t });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_titolo")) {
      const { title, rif } = extractRif(node.inner);
      const t = title.replace(/\s+/g, " ");
      if (isMarianTitle(t)) {
        sawMarian = true;
        break;
      }
      if (isExactInnoTitle(t) || isInnoMarkerNode(node)) {
        const consumed = takeHymn(nodes, i, blocks);
        if (consumed != null) i += consumed;
        else {
          blocks.push({ k: "title", text: "INNO" });
          i += 1;
        }
        continue;
      }
      if (looksLikePsalmTitle(t)) {
        const { sub, cite, skip } = consumeSubAfterPsalm(nodes, i + 1);
        const brLines = node.inner
          .split(/<br\s*\/?>/i)
          .map((p) => stripTags(p).replace(/\s+/g, " ").trim())
          .filter((p) => p && !/^Cfr\.?\s*$/i.test(p));
        if (brLines.length >= 2 && looksLikePsalmTitle(brLines[0])) {
          blocks.push({
            k: "psalmHead",
            num: brLines[0],
            name: brLines.slice(1).join(" "),
            sub: tidyLitText(sub),
            cite: tidyLitText(cite || rif),
          });
        } else {
          blocks.push(psalmHeadFromTitle(t, sub, cite || rif));
        }
        i += 1 + skip;
        continue;
      }
      if (/^Oppure\b/i.test(t)) {
        blocks.push({ k: "omit", text: t.endsWith(":") ? t : `${t}:` });
        i += 1;
        continue;
      }
      blocks.push({ k: "title", text: t });
      if (rif) blocks.push({ k: "sub", text: rif });
      i += 1;
      continue;
    }

    if (hasClassPrefix(node.cls, "lo_sottotitolo")) {
      const raw = stripTags(node.inner).replace(/\s+/g, " ").trim();
      if (looksLikePsalmTitle(raw)) {
        const { sub, cite, skip } = consumeSubAfterPsalm(nodes, i + 1);
        blocks.push(psalmHeadFromTitle(raw, sub, cite));
        i += 1 + skip;
        continue;
      }
      const parsed = extractCite(raw);
      const text = [parsed.sub, parsed.cite].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ k: "sub", text });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_antifona")) {
      const lab = normalizeLab(stripTags(node.inner));
      let text = "";
      let j = i + 1;
      // CEI a volte lascia solo «3 ant.» nel div e il testo subito dopo come nodi testo.
      while (j < nodes.length && !text) {
        const n = nodes[j];
        if (n.kind === "br") {
          j += 1;
          continue;
        }
        if (n.kind === "text") {
          const piece = stripTags(n.text).replace(/\s+/g, " ").trim();
          if (piece && !isChromeText(piece)) text = piece;
          j += 1;
          continue;
        }
        break;
      }
      if (text) {
        const more: string[] = [text];
        while (j < nodes.length) {
          const n = nodes[j];
          if (n.kind === "br") {
            j += 1;
            continue;
          }
          if (n.kind !== "text") break;
          const piece = stripTags(n.text).replace(/\s+/g, " ").trim();
          if (piece && !isChromeText(piece)) more.push(piece);
          j += 1;
        }
        text = more.join(" ").replace(/\s+/g, " ").trim();
        blocks.push({ k: "rubric", lab, text });
        i = j;
      } else {
        blocks.push({ k: "rubric", lab, text: "" });
        i += 1;
      }
      continue;
    }

    if (isInnoMarkerNode(node)) {
      const consumed = takeHymn(nodes, i, blocks);
      if (consumed != null) {
        i += consumed;
        continue;
      }
    }

    if (node.kind === "el" && /^(i|em)$/i.test(node.tag)) {
      const t = stripTags(node.inner).replace(/\s+/g, " ").trim();
      if (t) blocks.push({ k: "sub", text: t });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_rosso")) {
      const t = stripTags(node.inner).replace(/\s+/g, " ").trim();
      if (/^Oppure\b/i.test(t)) {
        blocks.push({ k: "omit", text: t.endsWith(":") ? t : `${t}:` });
      } else if (
        /^(ORAZIONE|INVOCAZIONI|INTERCESSIONI|LETTURA(?:\s+BREVE)?|RESPONSORIO(?:\s+BREVE)?|TE DEUM|PREGHIERA)\b/i.test(
          t,
        )
      ) {
        blocks.push({ k: "title", text: t.replace(/\s+/g, " ") });
      } else if (/^(R\.?|V\.?)$/i.test(t)) {
        nodes.splice(i, 1, { kind: "text", text: normalizeLab(t) });
        continue;
      } else if (t === "—" || t === "–" || t === "-") {
        nodes.splice(i, 1, { kind: "text", text: "—" });
        continue;
      } else if (t === "†" || t === JOIN_CROSS_MARK) {
        nodes.splice(i, 1, { kind: "text", text: JOIN_CROSS_MARK });
        continue;
      } else if (t === "*") {
        nodes.splice(i, 1, { kind: "text", text: t });
        continue;
      }
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_versetto") || hasClass(node.cls, "lo_strofa")) {
      const parts = blocksFromVersetto(node.inner);
      for (const p of parts) {
        if (p.k === "prose" && isChromeText(p.text)) continue;
        blocks.push(p);
      }
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_line") || node.tag === "p") {
      const rub = parseRubricLine(node.inner);
      if (rub) blocks.push(rub);
      else {
        const t = stripTags(node.inner);
        if (t && !isChromeText(t)) {
          if (/^Oppure:?$/i.test(t)) blocks.push({ k: "omit", text: "Oppure:" });
          else blocks.push({ k: "prose", text: t });
        }
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  if (hour === "compieta" || sawMarian) {
    const marianDate = dateISO ? parseLocalDate(dateISO) : new Date();
    const trimmed = scrubLoneParenLines(stripCeiMarianTail(blocks));
    blocks.length = 0;
    blocks.push(...trimmed);
    if (!blocks.some((b) => b.k === "marian")) {
      blocks.push({ k: "title", text: "ANTIFONE DELLA BEATA VERGINE MARIA" });
      blocks.push({ k: "marian", antiphons: marianAntiphonsForDate(marianDate) });
    }
  }

  const clean = applyTonePhrases(
    coalesceResponsory(
      dropOrphanStarLines(
        mergeRubricPrefixLines(
          attachJoinCrossBeforePsalmHead(
            attachOrphanAntiphonText(
              scrubLoneParenLines(
                blocks.filter((b) => {
                  if (b.k === "prose") {
                    if (b.text.trim() === JOIN_CROSS_MARK) return true;
                    return !isChromeText(b.text) && b.text.length > 1;
                  }
                  if (b.k === "tone") return b.intro.length > 1 && !isChromeText(b.intro);
                  if (b.k === "rubric") return !!(b.lab || b.text);
                  if (b.k === "stanza") return b.lines.length > 0;
                  return true;
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  if (clean.length === 0) {
    return {
      hour,
      blocks: [],
      error: "Testo non disponibile. Riprova con la connessione, oppure scarica 10 giorni dalla Home.",
    };
  }
  return {
    hour,
    blocks: capitalizePsalmOpenings(
      repairCeiPsalm8JoinAnomaly(
        mergeLoneJoinCrossBlocks(applyBundledGospelCanticles(enrichPsalmHeads(clean))),
      ),
    ),
  };
}

function isChromeText(t: string): boolean {
  const s = t.trim();
  if (/^<\/?[a-zA-Z][\w:-]*[^>]*>?$/.test(s) || /^\/?[a-z][\w-]*>$/.test(s)) return true;
  if (/^!doctype\b/i.test(s) || /^doctype html>?$/i.test(s)) return true;
  if (/^(div|span|section|p)\s+class=/i.test(s) || /^class\s*=/i.test(s) || /^br$/i.test(s)) return true;
  return /facebook|twitter|whatsapp|condividi|grandezza testo|\bstampa\b|\binvia\b|javascript:|sharer\.php|cookie|privacy policy|sito ufficiale|chiesacattolica\.it|lettura a schermo intero|nessun contenuto trovato|conferenza episcopale/i.test(
    t,
  );
}

const MEDIA_HEAD: Record<MediaId, { it: string; la: string }> = {
  terza: { it: "terza", la: "Tertiam" },
  sesta: { it: "sesta", la: "Sextam" },
  nona: { it: "nona", la: "Nonam" },
};

/** Indice del titolo d'ora, non di inni («L'ora terza risuona») o orazioni («all'ora terza»). */
function mediaHeadingIndex(frag: string, id: MediaId): number {
  const { it, la } = MEDIA_HEAD[id];
  const patterns = [
    new RegExp(`<h[1-3]\\b[^>]*>\\s*Ora\\s+${it}\\s*</h[1-3]>`, "i"),
    new RegExp(`<h[1-3]\\b[^>]*>\\s*Ad\\s+${la}\\s*</h[1-3]>`, "i"),
    new RegExp(`<(?:div|span)[^>]*class="[^"]*lo_titolo[^"]*"[^>]*>\\s*ORA\\s+${it}\\s*<`, "i"),
  ];
  let best = -1;
  for (const re of patterns) {
    const idx = frag.search(re);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  return best;
}

export function splitOraMediaHtml(html: string): Record<MediaId, string> {
  const frag = liturgicalFragment(html);
  const terzaAt = mediaHeadingIndex(frag, "terza");
  const sestaAt = mediaHeadingIndex(frag, "sesta");
  const nonaAt = mediaHeadingIndex(frag, "nona");
  const out: Record<MediaId, string> = { terza: frag, sesta: frag, nona: frag };
  if (sestaAt < 0 && nonaAt < 0) return out;

  const terzaStart = terzaAt >= 0 && (sestaAt < 0 || terzaAt < sestaAt) ? terzaAt : 0;
  if (sestaAt >= 0) {
    out.terza = frag.slice(terzaStart, sestaAt);
    if (nonaAt > sestaAt) {
      out.sesta = frag.slice(sestaAt, nonaAt);
      out.nona = frag.slice(nonaAt);
    } else {
      out.sesta = frag.slice(sestaAt);
      if (nonaAt >= 0) out.nona = frag.slice(nonaAt);
    }
  } else if (nonaAt >= 0) {
    out.terza = frag.slice(terzaStart, nonaAt);
    out.nona = frag.slice(nonaAt);
  }
  return out;
}

export function extractInvitatoryAntiphon(html: string): string {
  const frag = liturgicalFragment(html);
  const ant = frag.match(/<div[^>]*class="[^"]*lo_antifona[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (ant) {
    const lab = stripTags(ant[1]);
    if (!/^V\.?$|^R\.?$/i.test(lab) && lab.length > 8) return lab;
  }
  const m = frag.match(/Ant\.\s*<\/(?:span|div)>\s*([\s\S]{10,400}?)(?:<div class="lo_|SALMO)/i);
  if (m) {
    const t = stripTags(m[1]);
    if (t.length > 8 && !/^V\.|^R\./.test(t)) return t;
  }
  return "";
}
