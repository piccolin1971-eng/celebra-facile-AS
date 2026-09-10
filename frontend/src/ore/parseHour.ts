import {
  liturgicalFragment,
  flattenLiturgyNodes,
  hasClass,
  hasClassPrefix,
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
  if (!name) {
    const m = text.match(/^(SALMO\s+\d+\s*[a-zA-Z]?)\s+(.+)$/i);
    if (m) {
      num = m[1].trim();
      name = m[2].trim();
    }
  }
  if (!name) {
    const cant = text.match(/^(CANTICO(?:\s+DI\s+\S+)?)(?:\s+(\S.*))?$/i);
    if (cant) {
      num = cant[1].trim();
      const rest = (cant[2] || "").trim();
      if (/^(Is|Mt|Mc|Lc|Gv|At|Rm|1\s*Cor|Gal|Ef|Fil|Col|Eb|1\s*Pt|Ap|Dn|Ger|Ez)\b/i.test(rest)) {
        cite = cite || rest;
      } else if (rest) {
        name = rest;
      }
    }
  }
  if (!cite && /^(Is|Mt|Mc|Lc|Gv|At|Rm|1\s*Cor|Gal|Ef|Fil|Col|Eb|1\s*Pt|Ap|Dn|Ger|Ez)\b/i.test(name)) {
    cite = name;
    name = "";
  }
  return { k: "psalmHead", num, name, sub: sub.replace(/\s+/g, " ").trim(), cite: cite.replace(/\s+/g, " ").trim() };
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

function stanzaLinesFromInner(inner: string): string[] {
  return stripTags(inner.replace(/<br\s*\/?>/gi, "\n"))
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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
    const t = stripTags(n.inner);
    if (t && t.length < 80 && !/[*†]/.test(t) && !/lo_antifona/.test(n.inner)) {
      sub = t;
      skip = 1;
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
    const text = acc.join(" ").replace(/\s+/g, " ").trim();
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
    if (/^R\.?$/i.test(t)) return "R. ";
    if (/^V\.?$/i.test(t)) return "\nV. ";
    if (t === "—" || t === "–" || t === "-") return "\n— ";
    return ` ${t} `;
  });
}

function mergeLoneRubrics(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^(V\.|R\.|\*|†|—)\s*$/.test(lines[i]) && lines[i + 1]) {
      out.push(`${lines[i].trim()} ${lines[i + 1]}`);
      i += 1;
    } else {
      out.push(lines[i]);
    }
  }
  return out;
}

function blocksFromVersetto(inner: string): OreBlock[] {
  const nodes = topLevelNodes(inner);
  const nested = nodes.filter((n) => n.kind === "el" && hasClass(n.cls, "lo_versetto"));
  if (nested.length) {
    const out: OreBlock[] = [];
    for (const n of nodes) {
      if (n.kind === "el" && hasClass(n.cls, "lo_versetto")) out.push(...blocksFromVersetto(n.inner));
      else if (n.kind === "el" && hasClass(n.cls, "lo_antifona")) {
        out.push({ k: "rubric", lab: normalizeLab(stripTags(n.inner)), text: "" });
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
  const lines = mergeLoneRubrics(stanzaLinesFromInner(serializeRosso(inner)));
  if (!lines.length) return [];
  return [{ k: "stanza", lines }];
}

export function parseHourHtml(html: string, hour: OreHourId | MediaId): ParsedHour {
  const frag = liturgicalFragment(html);
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
      if (collected.length === 1 && !/[*†]/.test(collected[0])) {
        blocks.push({ k: "prose", text: collected[0] });
      } else if (collected.length) {
        blocks.push({ k: "stanza", lines: collected });
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

    if (hasClass(node.cls, "lo_rosso")) {
      const t = stripTags(node.inner).replace(/\s+/g, " ").trim();
      if (/^Oppure\b/i.test(t)) {
        blocks.push({ k: "omit", text: t.endsWith(":") ? t : `${t}:` });
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

  const clean = blocks.filter((b) => {
    if (b.k === "prose") return !isChromeText(b.text) && b.text.length > 1;
    if (b.k === "rubric") return !!(b.lab || b.text);
    if (b.k === "stanza") return b.lines.length > 0;
    return true;
  });

  if (clean.length === 0) {
    return {
      hour,
      blocks: [],
      error: "Testo non trovato nella pagina CEI.",
    };
  }
  return { hour, blocks: clean };
}

function isChromeText(t: string): boolean {
  return /facebook|twitter|whatsapp|condividi|grandezza testo|\bstampa\b|\binvia\b|javascript:|sharer\.php|cookie|privacy policy/i.test(
    t,
  );
}

export function splitOraMediaHtml(html: string): Record<MediaId, string> {
  const frag = liturgicalFragment(html);
  const markers: { id: MediaId; re: RegExp }[] = [
    { id: "terza", re: /ORA\s+TERZA|Ad Tertiam|Ora terza/i },
    { id: "sesta", re: /ORA\s+SESTA|Ad Sextam|Ora sesta/i },
    { id: "nona", re: /ORA\s+NONA|Ad Nonam|Ora nona/i },
  ];
  const hits = markers
    .map((m) => ({ id: m.id, idx: frag.search(m.re) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  const out: Record<MediaId, string> = { terza: frag, sesta: frag, nona: frag };
  if (hits.length < 2) return out;
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : frag.length;
    out[hits[i].id] = frag.slice(start, end);
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
