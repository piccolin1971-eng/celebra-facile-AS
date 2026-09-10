import { liturgicalFragment, hasClass, stripTags, topLevelNodes, type HtmlNode } from "./html";
import { hymnConsumeCount, isExactInnoTitle, parseCeiHymnsHtml } from "./hymns";
import { MARIAN_ANTIPHONS, splitPsalmTitle } from "./bundled";
import type { MediaId, OreBlock, OreHourId, ParsedHour } from "./types";

function isMarianTitle(t: string): boolean {
  return /ANTIFONE DELLA BEATA VERGINE/i.test(t) || /antifona della beata vergine/i.test(t);
}

function looksLikePsalmTitle(t: string): boolean {
  return /^(SALMO|CANTICO)\b/i.test(t);
}

function psalmHeadFromTitle(text: string, sub = "", cite = ""): OreBlock {
  const { num, name } = splitPsalmTitle(text);
  return { k: "psalmHead", num, name, sub, cite };
}

function extractCite(sub: string): { sub: string; cite: string } {
  const m = sub.match(/^(.*?)(\([^)]+\.?\)\.?)\s*$/);
  if (!m) return { sub, cite: "" };
  return { sub: m[1].trim(), cite: m[2].trim() };
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
  if (m) return { k: "rubric", lab: m[1].replace(/\.$/, ".") , text: m[2].trim() };
  return null;
}

function consumeSubAfterPsalm(nodes: HtmlNode[], i: number): { sub: string; cite: string; skip: number } {
  let skip = 0;
  let sub = "";
  let cite = "";
  const n = nodes[i];
  if (n && n.kind === "el" && hasClass(n.cls, "lo_sottotitolo")) {
    const parsed = extractCite(stripTags(n.inner));
    sub = parsed.sub;
    cite = parsed.cite;
    skip = 1;
  }
  return { sub, cite, skip };
}

export function parseHourHtml(html: string, hour: OreHourId | MediaId): ParsedHour {
  const frag = liturgicalFragment(html);
  const nodes = topLevelNodes(frag);
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
      const t = stripTags(node.text);
      if (t) blocks.push({ k: "prose", text: t });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_titolo")) {
      const t = stripTags(node.inner).replace(/\s+/g, " ");
      if (isMarianTitle(t)) {
        sawMarian = true;
        break;
      }
      if (isExactInnoTitle(t)) {
        const rest = nodes.slice(i);
        const hymns = parseCeiHymnsHtml(
          `<div class="lo_titolo">INNO</div>${rest
            .map((n) =>
              n.kind === "el"
                ? `<${n.tag} class="${n.cls}">${n.inner}</${n.tag}>`
                : n.kind === "br"
                  ? "<br/>"
                  : n.text,
            )
            .join("")}`,
        );
        if (hymns.length) blocks.push({ k: "hymn", hymns });
        i += 1 + hymnConsumeCount(nodes.slice(i + 1));
        continue;
      }
      if (looksLikePsalmTitle(t)) {
        const { sub, cite, skip } = consumeSubAfterPsalm(nodes, i + 1);
        blocks.push(psalmHeadFromTitle(t, sub, cite));
        i += 1 + skip;
        continue;
      }
      if (/^Oppure\b/i.test(t)) {
        blocks.push({ k: "omit", text: t.endsWith(":") ? t : `${t}:` });
        i += 1;
        continue;
      }
      blocks.push({ k: "title", text: t });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_sottotitolo")) {
      const parsed = extractCite(stripTags(node.inner));
      blocks.push({ k: "sub", text: [parsed.sub, parsed.cite].filter(Boolean).join(" ") });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_antifona")) {
      blocks.push({ k: "rubric", lab: "Ant.", text: stripTags(node.inner) });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_versetto") || hasClass(node.cls, "lo_strofa")) {
      if (/lo_antifona/.test(node.inner) && !/lo_versetto/.test(node.inner.replace(/lo_antifona/g, ""))) {
        const ant = node.inner.match(/lo_antifona[^>]*>([\s\S]*?)<\/div>/i);
        if (ant) blocks.push({ k: "rubric", lab: "Ant.", text: stripTags(ant[1]) });
        i += 1;
        continue;
      }
      const lines = stanzaLinesFromInner(node.inner);
      if (lines.length) blocks.push({ k: "stanza", lines });
      i += 1;
      continue;
    }

    if (hasClass(node.cls, "lo_line") || node.tag === "p") {
      const rub = parseRubricLine(node.inner);
      if (rub) blocks.push(rub);
      else {
        const t = stripTags(node.inner);
        if (t) {
          if (/^Oppure:?$/i.test(t)) blocks.push({ k: "omit", text: "Oppure:" });
          else blocks.push({ k: "prose", text: t });
        }
      }
      i += 1;
      continue;
    }

    const innerNodes = topLevelNodes(node.inner);
    if (innerNodes.some((n) => n.kind === "el" && /lo_/.test(n.cls))) {
      nodes.splice(i, 1, ...innerNodes);
      continue;
    }
    const t = stripTags(node.inner);
    if (t.length > 40) blocks.push({ k: "prose", text: t });
    i += 1;
  }

  if (hour === "compieta" || sawMarian) {
    const already = blocks.some((b) => b.k === "marian");
    if (!already) {
      blocks.push({ k: "title", text: "ANTIFONE DELLA BEATA VERGINE MARIA" });
      blocks.push({ k: "marian", antiphons: MARIAN_ANTIPHONS });
    }
  }

  if (blocks.length === 0) {
    const dump = stripTags(frag).slice(0, 4000);
    if (dump) blocks.push({ k: "prose", text: dump });
    return {
      hour,
      blocks,
      error: dump ? undefined : "Testo non trovato nella pagina CEI.",
    };
  }
  return { hour, blocks };
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
    const t = stripTags(ant[1]);
    if (t.length > 8) return t;
  }
  const m = frag.match(/Ant\.\s*<\/span>\s*([\s\S]{10,400}?)(?:<div class="lo_|SALMO)/i);
  if (m) return stripTags(m[1]);
  return "";
}
