import type { OreBlock } from "./types";

function isTeDeumTitle(text: string): boolean {
  const t = String(text || "").replace(/\u00a0/g, " ").trim();
  return /^INNO\s+Te\s+Deum\b/i.test(t) || /^TE\s+DEUM\b/i.test(t);
}

function isOpeningInnoTitle(text: string): boolean {
  const t = String(text || "").replace(/\u00a0/g, " ").trim();
  return /^INNO\b/i.test(t) && !isTeDeumTitle(t);
}

function isTeDeumHymnBlock(b: Extract<OreBlock, { k: "hymn" }>): boolean {
  const blob = b.hymns
    .map((h) => h.stanzas.flat().join(" "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return /^Te\s+Deum\b/i.test(blob) || /\bTe\s+Deum\s+laudamus\b/i.test(blob);
}

/** Indice del blocco da mostrare in cima (titolo INNO o primo inno d’apertura, non il Te Deum). */
export function oreHymnBlockIndex(blocks: OreBlock[]): number | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "title" && isOpeningInnoTitle(b.text)) return i;
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "hymn" && !isTeDeumHymnBlock(b)) return i;
  }
  return null;
}
