import { hasClass, hymnLineSplit, stripTags, topLevelNodes, type HtmlNode } from "./html";
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
  const current = () => hymns[hymns.length - 1];
  const flushLoose = () => {
    const raw = stripTags(buf.replace(/<br\s*\/?>/gi, "\n"));
    buf = "";
    raw.split(/\n\s*\n/).forEach((chunk) => {
      const lines = chunk
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length) current().stanzas.push(lines);
    });
  };
  const startHymn = (label: string) => {
    flushLoose();
    if (!current().stanzas.length && !current().label) {
      current().label = label;
    } else {
      hymns.push({ label, stanzas: [] });
    }
  };
  const pushVersesHtml = (inner: string) => {
    const lines = hymnLineSplit(inner);
    if (lines.length) current().stanzas.push(lines);
  };

  nodeLoop: for (const node of scope) {
    if (node.kind === "text") {
      if (!node.text.trim()) continue;
      buf += node.text.replace(/^\s+|\s+$/g, "");
      continue;
    }
    if (node.kind === "br") {
      buf += "\n";
      continue;
    }
    if (hasClass(node.cls, "lo_versetto")) {
      if (/lo_antifona/.test(node.inner) || isHymnBoundaryText(stripTags(node.inner))) {
        flushLoose();
        break;
      }
      const innerNodes = topLevelNodes(node.inner);
      const innerTit = innerNodes.find((n) => n.kind === "el" && hasClass(n.cls, "lo_titolo"));
      const innerRosso = innerNodes.find((n) => n.kind === "el" && hasClass(n.cls, "lo_rosso"));
      const innerLabel =
        innerTit && innerTit.kind === "el"
          ? hymnRubricLabel(stripTags(innerTit.inner))
          : innerRosso && innerRosso.kind === "el"
            ? hymnRubricLabel(stripTags(innerRosso.inner))
            : null;
      if (innerLabel) {
        startHymn(innerLabel);
        const without = node.inner.replace(
          /<div[^>]*class="[^"]*lo_(?:titolo|rosso)[^"]*"[^>]*>[\s\S]*?<\/div>/i,
          "",
        );
        if (stripTags(without).trim()) {
          buf += without.replace(/<br\s*\/?>/gi, "\n");
          flushLoose();
        }
        continue;
      }
      if (innerRosso && innerRosso.kind === "el" && isExactInnoTitle(stripTags(innerRosso.inner))) {
        const without = node.inner.replace(/<div[^>]*class="[^"]*lo_rosso[^"]*"[^>]*>[\s\S]*?<\/div>/i, "");
        buf += without.replace(/<br\s*\/?>/gi, "\n");
        flushLoose();
        continue;
      }
      flushLoose();
      const nested = innerNodes.filter((n) => n.kind === "el" && hasClass(n.cls, "lo_versetto"));
      if (nested.length) {
        for (const v of nested) {
          if (v.kind !== "el") continue;
          if (/lo_antifona/.test(v.inner) || isHymnBoundaryText(stripTags(v.inner))) {
            flushLoose();
            break nodeLoop;
          }
          pushVersesHtml(v.inner);
        }
        continue;
      }
      pushVersesHtml(node.inner);
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

export function hymnConsumeCount(nodes: HtmlNode[]): number {
  let n = 0;
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
    if (hasClass(node.cls, "lo_versetto") && ( /lo_antifona/.test(node.inner) || isHymnBoundaryText(stripTags(node.inner)))) {
      break;
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
  return n;
}

export { isExactInnoTitle };
