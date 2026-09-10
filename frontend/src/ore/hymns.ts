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
  return /^(SALMO|CANTICO|LETTURA|RESPONSORIO|ORAZIONE|INTERCESSIONI)\b/i.test(t);
}

/**
 * Porta di parseCeiHymnsHtml (sim HTML) senza DOM.
 * Ogni strofa tiene i <br> originali. «Oppure» apre l’inno successivo.
 */
export function parseCeiHymnsHtml(html: string): Hymn[] {
  const root = topLevelNodes(html);
  let scope: HtmlNode[] = root;
  const titoloIdx = root.findIndex(
    (n) => n.kind === "el" && hasClass(n.cls, "lo_titolo") && isExactInnoTitle(stripTags(n.inner)),
  );
  if (titoloIdx >= 0) scope = root.slice(titoloIdx + 1);

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
      if (/lo_antifona/.test(node.inner)) break;
      const innerNodes = topLevelNodes(node.inner);
      const innerTit = innerNodes.find((n) => n.kind === "el" && hasClass(n.cls, "lo_titolo"));
      const innerLabel =
        innerTit && innerTit.kind === "el" ? hymnRubricLabel(stripTags(innerTit.inner)) : null;
      if (innerLabel) {
        startHymn(innerLabel);
        continue;
      }
      flushLoose();
      const nested = innerNodes.filter((n) => n.kind === "el" && hasClass(n.cls, "lo_versetto"));
      if (nested.length) {
        for (const v of nested) {
          if (v.kind !== "el") continue;
          if (/lo_antifona/.test(v.inner)) break nodeLoop;
          pushVersesHtml(v.inner);
        }
        continue;
      }
      pushVersesHtml(node.inner);
      continue;
    }
    if (hasClass(node.cls, "lo_titolo")) {
      const label = hymnRubricLabel(stripTags(node.inner));
      if (label) {
        startHymn(label);
        continue;
      }
      if (isHymnStopTitle(stripTags(node.inner))) break;
      break;
    }
    if (hasClass(node.cls, "lo_antifona")) break;
    buf += node.inner || "";
  }
  flushLoose();
  return hymns.filter((h) => h.stanzas.length);
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
    if (hasClass(node.cls, "lo_titolo")) {
      const t = stripTags(node.inner);
      if (hymnRubricLabel(t)) {
        n += 1;
        continue;
      }
      if (isHymnStopTitle(t)) break;
      break;
    }
    if (hasClass(node.cls, "lo_versetto") && /lo_antifona/.test(node.inner)) break;
    n += 1;
  }
  return n;
}

export { isExactInnoTitle };
