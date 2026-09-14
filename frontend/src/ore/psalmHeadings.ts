import headingsData from "./data/psalmHeadings.json";
import type { OreBlock } from "./types";

export type PsalmHeading = { name: string; sub: string; cite: string };

const DATA = headingsData as Record<string, PsalmHeading>;

export function normalizePsalmKey(raw: string): string {
  let t = String(raw || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  t = t.replace(/^salmo\s+/i, "");
  t = t.replace(/^cantico(?:\s+(?:di|dei|degli|dell[aeio]'?|delle|del)\s+[a-zà-ÿ'’ ]+)?\s+/i, "cant:");
  t = t.replace(/\bcfr\.?\s*/gi, "");
  t = t.replace(/\s*\((?:i{1,3}|iv)\)\s*/gi, " ");
  t = t.replace(/[–—]/g, "-");
  t = t.replace(/\s+/g, "");
  return t;
}

export function lookupPsalmHeading(num: string): PsalmHeading | null {
  const key = normalizePsalmKey(num);
  if (!key) return null;
  if (DATA[key]) return DATA[key];
  const noRange = key.replace(/,.*$/, "");
  if (noRange !== key && DATA[noRange]) return DATA[noRange];
  return null;
}

/** Completa titolo e frase-tono se il CEI (tipicamente ai Vespri) omette lo_sottotitolo. */
export function enrichPsalmHead(b: Extract<OreBlock, { k: "psalmHead" }>): Extract<OreBlock, { k: "psalmHead" }> {
  if (b.name && b.sub) return b;
  const hit = lookupPsalmHeading(b.num);
  if (!hit) return b;
  const sameCaption = (a: string, b: string) =>
    a.replace(/['’]/g, "'").trim() === b.replace(/['’]/g, "'").trim();
  const name = b.name || (hit.name && !sameCaption(hit.name, b.sub) ? hit.name : b.name);
  const sub = b.sub || hit.sub;
  const cite = b.cite || hit.cite;
  return { ...b, name, sub, cite };
}

export function enrichPsalmHeads(blocks: OreBlock[]): OreBlock[] {
  return blocks.map((b) => (b.k === "psalmHead" ? enrichPsalmHead(b) : b));
}
