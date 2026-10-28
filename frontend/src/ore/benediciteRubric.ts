import { normalizePsalmKey } from "./psalmHeadings";
import type { OreBlock } from "./types";

/** Rubrica CEI (`lo_rosso`) dopo il Benedicite (Dn 3). */
export const BENEDICITE_NO_GLORIA_RUBRIC =
  "Alla fine di questo cantico non si dice il Gloria al Padre";

const NO_GLORIA_RE = /non si dice il Gloria al Padre/i;

export function isBenediciteCanticleHead(b: OreBlock): boolean {
  if (b.k !== "psalmHead") return false;
  const key = normalizePsalmKey(b.num);
  if (key.startsWith("cant:dn3")) return true;
  return /\bcantico\s*dn\s*3\b/i.test(b.num);
}

function closingAntiphonIndex(blocks: OreBlock[], headIdx: number): number {
  for (let j = headIdx + 1; j < blocks.length; j++) {
    const b = blocks[j];
    if (b.k === "psalmHead" || b.k === "hymn") return j;
    if (b.k === "title" && /^(LETTURA|INVOCAZIONI|ORAZIONE|TE DEUM|RESPONSORIO)/i.test(b.text)) {
      return j;
    }
    if (b.k === "rubric" && /ant/i.test(b.lab)) {
      const hasStanza = blocks.slice(headIdx + 1, j).some((x) => x.k === "stanza");
      if (hasStanza) return j;
    }
  }
  return -1;
}

/** Garantisce la rubrica dopo ogni cantico Dn 3 e normalizza il testo. */
export function ensureBenediciteNoGloriaRubric(blocks: OreBlock[]): OreBlock[] {
  let out = blocks.filter((b) => !(b.k === "prose" && NO_GLORIA_RE.test(b.text)));
  out = out.map((b) => {
    if (b.k === "omit" && NO_GLORIA_RE.test(b.text)) {
      return { k: "omit" as const, text: BENEDICITE_NO_GLORIA_RUBRIC, ceiRubric: true as const };
    }
    return b;
  });

  for (let i = 0; i < out.length; i++) {
    if (!isBenediciteCanticleHead(out[i])) continue;
    const end = closingAntiphonIndex(out, i);
    if (end < 0) continue;
    const between = out.slice(i + 1, end);
    if (between.some((b) => b.k === "omit" && NO_GLORIA_RE.test(b.text))) continue;
    out = [
      ...out.slice(0, end),
      { k: "omit", text: BENEDICITE_NO_GLORIA_RUBRIC, ceiRubric: true },
      ...out.slice(end),
    ];
    i = end;
  }
  return out;
}
