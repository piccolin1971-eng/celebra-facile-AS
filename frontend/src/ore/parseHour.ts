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
import { hymnConsumeCount, isExactInnoTitle, isInnoMarkerNode, parseCeiHymnsHtml } from "./hymns";
import { MARIAN_ANTIPHONS, splitPsalmTitle } from "./bundled";
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
  return t
    .replace(/\s+/g, " ")
    .replace(/\s*\bbr\s*$/i, "")
    .replace(/\s*(?:div|span)\s+class\s*=\s*"?\s*$/i, "")
    .trim();
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

function coalesceCeiVerseLines(inner: string): VerseLine[] {
  const text = decodeHtmlEntities(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(
    /\u00a0/g,
    " ",
  );
  const rawLines = text.split(/\n/);
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
    merged.push({ text: t, hang });
  }
  return mergeLoneRubricLines(merged);
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
    const innerSub = topLevelNodes(n.inner).find(
      (x) => x.kind === "el" && hasClassPrefix(x.cls, "lo_sottotitolo"),
    );
    if (innerSub && innerSub.kind === "el") {
      const parsed = extractCite(stripTags(innerSub.inner));
      sub = parsed.sub;
      cite = parsed.cite;
      skip = 1;
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
  const nodes = topLevelNodes(inner);
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
    if (n.kind === "el" && hasClass(n.cls, "lo_antifona")) {
      if (lab || acc.length) flush();
      lab = stripTags(n.inner);
      continue;
    }
    if (n.kind === "br") continue;
    if (n.kind === "text") {
      const t = stripTags(n.text);
      if (t) acc.push(t);
      continue;
    }
    if (n.kind === "el") {
      const t = stripTags(n.inner);
      if (t) acc.push(t);
    }
  }
  flush();
  return out.filter((b) => b.k !== "rubric" || !!(b.lab || b.text));
}

function serializeRosso(inner: string): string {
  return inner.replace(/<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, (_m, body) => {
    const t = stripTags(body).replace(/\s+/g, " ").trim();
    if (t === "*" || t === "†") return ` ${t} `;
    if (/^R\.?$/i.test(t)) return "\nR. ";
    if (/^V\.?$/i.test(t)) return "\nV. ";
    if (t === "—" || t === "–" || t === "-") return "\n— ";
    return ` ${t} `;
  });
}

function mergeLoneRubricLines(lines: VerseLine[]): VerseLine[] {
  const out: VerseLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^(V\.|R\.|\*|†|—)\s*$/.test(lines[i].text) && lines[i + 1]) {
      out.push({
        text: `${lines[i].text.trim()} ${lines[i + 1].text}`,
        hang: Math.max(lines[i].hang, /^—/.test(lines[i].text) ? 1 : 0),
      });
      i += 1;
    } else {
      out.push(lines[i]);
    }
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
  if (kept.some((l) => /^—/.test(l.text))) return splitDashStanzas(kept.map((l) => l.text));
  if (kept.length === 1 && !/[*†]/.test(kept[0].text) && !/^(V\.|R\.)/.test(kept[0].text)) {
    return [{ k: "prose", text: kept[0].text }];
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
    const wrapAfterDash = prevIsDash && /^[a-zàèéìòù«]/.test(t);
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

function rebuildPreces(grabbed: OreBlock[]): OreBlock[] | null {
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
    introEnd = lines.length - 1;
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

function applyTonePhrases(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    out.push(b);
    if (b.k !== "title" || !/^(INVOCAZIONI|INTERCESSIONI)\b/i.test(b.text)) continue;
    const grabbed: OreBlock[] = [];
    let j = i + 1;
    while (j < blocks.length) {
      const n = blocks[j];
      if (n.k === "title") break;
      if (n.k === "marian") break;
      if (n.k === "prose" && /^Padre nostro\.?$/i.test(n.text.trim())) break;
      grabbed.push(n);
      j += 1;
    }
    const rebuilt = rebuildPreces(grabbed);
    if (rebuilt && rebuilt.some((x) => x.k === "tone" && x.intro.length > 8)) {
      out.push(...rebuilt);
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

function dropOrphanStarLines(blocks: OreBlock[]): OreBlock[] {
  return blocks
    .map((b) => {
      if (b.k !== "stanza") return b;
      const keep: number[] = [];
      b.lines.forEach((l, i) => {
        if (!/^[*†]\s*$/.test(l)) keep.push(i);
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
  if (/lo_antifona/.test(inner) && !/lo_rosso/.test(inner)) {
    return blocksFromAntiphonal(inner);
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
  const lines = coalesceCeiVerseLines(serializeRosso(withoutSub));
  const out = blocksFromVerseLines(lines);
  const refrain = (subMatch ? stripTags(subMatch[1]).replace(/\s+/g, " ").trim() : "") || italics.join(" ");
  if (refrain) out.push({ k: "sub", text: refrain });
  return out;
}

export function parseHourHtml(html: string, hour: OreHourId | MediaId): ParsedHour {
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
      const collected: string[] = [];
      let j = i;
      while (j < nodes.length) {
        const n = nodes[j];
        if (n.kind === "br") {
          j += 1;
          continue;
        }
        if (n.kind !== "text") break;
        const t = stripTags(n.text);
        if (t && !isChromeText(t)) collected.push(t);
        j += 1;
      }
      if (collected.length) {
        const merged = mergeLoneRubricLines(collected.map((text) => ({ text, hang: 0 })));
        const lines = merged.map((l) => tidyLitText(l.text)).filter(Boolean);
        if (lines.length === 1 && !/[*†]/.test(lines[0]) && !/^(V\.|R\.)/.test(lines[0])) {
          blocks.push({ k: "prose", text: lines[0] });
        } else if (lines.length) {
          blocks.push({ k: "stanza", lines, hang: merged.map((l) => l.hang) });
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
        const hymns = parseCeiHymnsHtml(restToHtml(nodes.slice(i)));
        if (hymns.length) {
          const consumed = Math.max(1, hymnConsumeCount(nodes.slice(i)));
          blocks.push({ k: "hymn", hymns });
          i += consumed;
        } else {
          blocks.push({ k: "title", text: "INNO" });
          i += 1;
        }
        continue;
      }
      if (looksLikePsalmTitle(t)) {
        const { sub, cite, skip } = consumeSubAfterPsalm(nodes, i + 1);
        blocks.push(psalmHeadFromTitle(t, sub, cite || rif));
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
      blocks.push({ k: "rubric", lab: normalizeLab(stripTags(node.inner)), text: "" });
      i += 1;
      continue;
    }

    if (isInnoMarkerNode(node)) {
      const hymns = parseCeiHymnsHtml(restToHtml(nodes.slice(i)));
      if (hymns.length) {
        const consumed = Math.max(1, hymnConsumeCount(nodes.slice(i)));
        blocks.push({ k: "hymn", hymns });
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
      } else if (t === "*" || t === "†") {
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
    const already = blocks.some((b) => b.k === "marian");
    if (!already) {
      blocks.push({ k: "title", text: "ANTIFONE DELLA BEATA VERGINE MARIA" });
      blocks.push({ k: "marian", antiphons: MARIAN_ANTIPHONS });
    }
  }

  const clean = applyTonePhrases(
    coalesceResponsory(
      dropOrphanStarLines(
        mergeRubricPrefixLines(
          blocks.filter((b) => {
            if (b.k === "prose") return !isChromeText(b.text) && b.text.length > 1;
            if (b.k === "tone") return b.intro.length > 1 && !isChromeText(b.intro);
            if (b.k === "rubric") return !!(b.lab || b.text);
            if (b.k === "stanza") return b.lines.length > 0;
            return true;
          }),
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
  return { hour, blocks: clean };
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
