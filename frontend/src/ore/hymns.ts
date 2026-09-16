import { hasClass, hymnLineSplit, nodesToHtml, stripTags, topLevelNodes, type HtmlNode } from "./html";
import { looksLatinText } from "./hymnLang";
import type { Hymn } from "./types";

function isExactInnoTitle(text: string): boolean {
  return /^\s*INNO\s*$/i.test(String(text || "").replace(/\u00a0/g, " "));
}

function hymnRubricLabel(text: string): string | null {
  const t = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  if (/^Oppure\b/i.test(t)) return t;
  if (/Ufficio (domenicale|feriale)/i.test(t)) return t;
  if (/ore notturne|prime ore del mattino|quando si dice di giorno/i.test(t)) return t;
  return null;
}

export function isHymnStopTitle(text: string): boolean {
  const t = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (isExactInnoTitle(t)) return true;
  if (/^INNO\s+Te Deum/i.test(t)) return true;
  return /^(SALMO|CANTICO|LETTURA|RESPONSORIO|ORAZIONE|INTERCESSIONI|INVOCAZIONI|PREGHIERA|TE DEUM)\b/i.test(t);
}

function isHymnBoundaryText(text: string): boolean {
  const t = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^\d+\s*ant\./i.test(t)) return true;
  if (/^(SALMO|CANTICO)\b/i.test(t)) return true;
  return false;
}

function pickGroupSize(n: number): number {
  if (n <= 1) return 1;
  if (n % 3 === 0 && n % 4 !== 0) return 3;
  if (n % 4 === 0) return 4;
  if (n % 3 === 0) return 3;
  return 4;
}

function chunkLines(lines: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size));
  return out;
}

/** Strofe da 1 riga o blocchi >8 versi: raggruppa 3 (latino) o 4 (italiano). */
export function normalizeHymnStanzas(stanzas: string[][]): string[][] {
  const blob = stanzas.flat().join(" ");
  // Latino già spezzato sui `<br>` CEI: non ricomporre a 3/4.
  if (looksLatinText(blob) && stanzas.some((s) => s.length >= 2)) {
    return stanzas.filter((s) => s.length);
  }
  if (stanzas.length < 2 && (stanzas[0]?.length || 0) <= 8) return stanzas;
  const splitLong: string[][] = [];
  for (const st of stanzas) {
    if (st.length > 8) splitLong.push(...chunkLines(st, pickGroupSize(st.length)));
    else splitLong.push(st);
  }
  const out: string[][] = [];
  let run: string[] = [];
  const flushRun = () => {
    if (!run.length) return;
    if (run.length === 1) out.push([run[0]]);
    else out.push(...chunkLines(run, pickGroupSize(run.length)));
    run = [];
  };
  for (const st of splitLong) {
    if (st.length === 1) run.push(st[0]);
    else {
      flushRun();
      out.push(st);
    }
  }
  flushRun();
  return out;
}

/** INNO come titolo, come lo_rosso, o come primo lo_rosso dentro un lo_versetto. */
export function isInnoMarkerNode(node: HtmlNode): boolean {
  if (node.kind !== "el") return false;
  if ((hasClass(node.cls, "lo_titolo") || hasClass(node.cls, "lo_rosso")) && isExactInnoTitle(stripTags(node.inner))) {
    return true;
  }
  if (!hasClass(node.cls, "lo_versetto")) return false;
  const inner = topLevelNodes(node.inner);
  const rosso = inner.find((n) => n.kind === "el" && hasClass(n.cls, "lo_rosso"));
  return !!(rosso && rosso.kind === "el" && isExactInnoTitle(stripTags(rosso.inner)));
}

function isHymnBoundaryNode(n: HtmlNode): boolean {
  if (n.kind !== "el") return false;
  if (hasClass(n.cls, "lo_antifona")) return true;
  if (hasClass(n.cls, "lo_titolo") && isHymnStopTitle(stripTags(n.inner))) return true;
  if (/lo_sottotitolo/.test(n.cls) && isHymnBoundaryText(stripTags(n.inner))) return true;
  if (hasClass(n.cls, "lo_versetto")) {
    if (/lo_antifona/.test(n.inner)) return true;
    if (isHymnBoundaryText(stripTags(n.inner))) return true;
  }
  return false;
}

/** Testo d'inno prima di 1 ant./SALMO annidati nello stesso versetto CEI. */
function splitHymnPrefix(inner: string): { prefix: string; tail: HtmlNode[]; hasBoundary: boolean } {
  const kids = topLevelNodes(inner);
  const pre: HtmlNode[] = [];
  const tail: HtmlNode[] = [];
  let boundary = false;
  for (const n of kids) {
    if (!boundary && isHymnBoundaryNode(n)) boundary = true;
    if (boundary) tail.push(n);
    else pre.push(n);
  }
  return { prefix: nodesToHtml(pre), tail, hasBoundary: boundary };
}

function findHymnLabelNode(nodes: HtmlNode[]): { index: number; label: string } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.kind !== "el") continue;
    if (!(hasClass(n.cls, "lo_titolo") || hasClass(n.cls, "lo_rosso"))) continue;
    const label = hymnRubricLabel(stripTags(n.inner));
    if (label) return { index: i, label };
  }
  return null;
}
function stanzasFromBr(html: string): string[][] {
  const raw = String(html || "");
  if (!stripTags(raw).trim()) return [];
  return raw
    .split(/<br\s*\/?>\s*(?:&nbsp;\s*)*<br\s*\/?>/i)
    .map((part) => hymnLineSplit(part))
    .filter((st) => st.length);
}

/**
 * Porta di parseCeiHymnsHtml (sim HTML) senza DOM.
 * Ogni strofa tiene i <br> originali. «Oppure» apre l’inno successivo.
 */
export function parseCeiHymnsHtml(html: string): Hymn[] {
  const root = topLevelNodes(html);
  let scope: HtmlNode[] = root;
  const titoloIdx = root.findIndex((n) => isInnoMarkerNode(n));
  if (titoloIdx >= 0) {
    const start = root[titoloIdx];
    const keepStart =
      start.kind === "el" && hasClass(start.cls, "lo_versetto") && isInnoMarkerNode(start);
    scope = keepStart ? root.slice(titoloIdx) : root.slice(titoloIdx + 1);
  }

  const hymns: Hymn[] = [{ label: null, stanzas: [] }];
  let buf = "";
  let stop = false;
  const current = () => hymns[hymns.length - 1];
  const flushLoose = () => {
    for (const st of stanzasFromBr(buf)) current().stanzas.push(st);
    buf = "";
  };
  const startHymn = (label: string) => {
    flushLoose();
    if (!current().stanzas.length && !current().label) {
      current().label = label;
    } else {
      hymns.push({ label, stanzas: [] });
    }
  };
  const pushStanzas = (inner: string) => {
    for (const st of stanzasFromBr(inner)) current().stanzas.push(st);
  };
  const emitVersetto = (inner: string) => {
    if (stop) return;
    if (isHymnBoundaryText(stripTags(inner))) {
      stop = true;
      return;
    }
    const split = splitHymnPrefix(inner);
    if (split.hasBoundary) {
      if (stripTags(split.prefix).trim()) emitVersetto(split.prefix);
      stop = true;
      return;
    }
    const innerNodes = topLevelNodes(inner);
    const labeled = findHymnLabelNode(innerNodes);
    if (labeled) {
      const before = nodesToHtml(innerNodes.slice(0, labeled.index));
      if (stripTags(before).trim()) emitVersetto(before);
      startHymn(labeled.label);
      const after = nodesToHtml(innerNodes.slice(labeled.index + 1));
      if (stripTags(after).trim()) emitVersetto(after);
      return;
    }
    const innerRosso = innerNodes.find((n) => n.kind === "el" && hasClass(n.cls, "lo_rosso"));
    if (innerRosso && innerRosso.kind === "el" && isExactInnoTitle(stripTags(innerRosso.inner))) {
      const without = inner.replace(/<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>[\s\S]*?<\/div>/i, "");
      emitVersetto(without);
      return;
    }
    const hasNested = innerNodes.some((n) => n.kind === "el" && hasClass(n.cls, "lo_versetto"));
    const hasRubric = innerNodes.some((n) => {
      if (n.kind !== "el") return false;
      if (!(hasClass(n.cls, "lo_titolo") || hasClass(n.cls, "lo_rosso"))) return false;
      return !!hymnRubricLabel(stripTags(n.inner));
    });
    if (!hasNested && !hasRubric) {
      pushStanzas(inner);
      return;
    }
    let acc = "";
    const flushAcc = () => {
      pushStanzas(acc);
      acc = "";
    };
    for (const n of innerNodes) {
      if (stop) break;
      if (n.kind === "el" && hasClass(n.cls, "lo_versetto")) {
        flushAcc();
        emitVersetto(n.inner);
        continue;
      }
      if (n.kind === "el" && (hasClass(n.cls, "lo_titolo") || hasClass(n.cls, "lo_rosso"))) {
        const label = hymnRubricLabel(stripTags(n.inner));
        if (label) {
          flushAcc();
          startHymn(label);
          continue;
        }
        if (isExactInnoTitle(stripTags(n.inner))) continue;
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
  };

  for (const node of scope) {
    if (stop) break;
    if (node.kind === "text") {
      if (!node.text.trim()) continue;
      buf += node.text.replace(/^\s+|\s+$/g, "");
      continue;
    }
    if (node.kind === "br") {
      buf += "<br/>";
      continue;
    }
    if (hasClass(node.cls, "lo_versetto")) {
      if (isHymnBoundaryText(stripTags(node.inner))) {
        flushLoose();
        break;
      }
      const split = splitHymnPrefix(node.inner);
      if (split.hasBoundary && !stripTags(split.prefix).trim()) {
        flushLoose();
        break;
      }
      flushLoose();
      emitVersetto(node.inner);
      if (stop) break;
      continue;
    }
    if (hasClass(node.cls, "lo_titolo") || hasClass(node.cls, "lo_rosso")) {
      const label = hymnRubricLabel(stripTags(node.inner));
      if (label) {
        startHymn(label);
        continue;
      }
      if (isExactInnoTitle(stripTags(node.inner))) continue;
      if (hasClass(node.cls, "lo_titolo") && isHymnStopTitle(stripTags(node.inner))) break;
      if (hasClass(node.cls, "lo_titolo")) break;
    }
    if (node.kind === "el" && /lo_sottotitolo/.test(node.cls) && isHymnBoundaryText(stripTags(node.inner))) {
      flushLoose();
      break;
    }
    if (hasClass(node.cls, "lo_antifona")) {
      flushLoose();
      break;
    }
    buf += node.inner || "";
  }
  flushLoose();
  return hymns
    .map((h) => ({ ...h, stanzas: normalizeHymnStanzas(h.stanzas) }))
    .filter((h) => h.stanzas.length);
}

export function hymnConsume(nodes: HtmlNode[]): { count: number; tail: HtmlNode[] } {
  let n = 0;
  let tail: HtmlNode[] = [];
  for (const node of nodes) {
    if (node.kind === "text" && !node.text.trim()) {
      n += 1;
      continue;
    }
    if (node.kind === "br" || node.kind === "text") {
      n += 1;
      continue;
    }
    if (hasClass(node.cls, "lo_antifona")) break;
    if (hasClass(node.cls, "lo_versetto")) {
      const split = splitHymnPrefix(node.inner);
      if (split.hasBoundary) {
        if (stripTags(split.prefix).trim()) {
          n += 1;
          tail = split.tail;
        }
        break;
      }
      if (isHymnBoundaryText(stripTags(node.inner))) break;
      n += 1;
      continue;
    }
    if (node.kind === "el" && /lo_sottotitolo/.test(node.cls) && isHymnBoundaryText(stripTags(node.inner))) {
      break;
    }
    if (hasClass(node.cls, "lo_titolo") || hasClass(node.cls, "lo_rosso")) {
      const t = stripTags(node.inner);
      if (hymnRubricLabel(t) || isExactInnoTitle(t)) {
        n += 1;
        continue;
      }
      if (hasClass(node.cls, "lo_titolo") && isHymnStopTitle(t)) break;
      if (hasClass(node.cls, "lo_titolo")) break;
      if (hasClass(node.cls, "lo_rosso") && /^(Ant\.?|V\.|R\.)$/i.test(t)) break;
    }
    n += 1;
  }
  return { count: n, tail };
}

export function hymnConsumeCount(nodes: HtmlNode[]): number {
  return hymnConsume(nodes).count;
}

export { isExactInnoTitle };
