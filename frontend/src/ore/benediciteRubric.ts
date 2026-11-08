import { normalizePsalmKey } from "./psalmHeadings";
import type { OreBlock } from "./types";

/**
 * Post-elaborazione Benedicite (Dn 3) allineata al LDO/CEI del giorno.
 *
 * La variante corta/lunga non si calcola dalla settimana del salterio: nel Solo testo
 * compare Dn 3, 52-57 (corto) oppure Dn 3, 57-88 (lungo; es. domeniche salterio I/III).
 *
 * - Corto: niente rubrica; si toglie il Gloria se il LDO lo stampa (si recita, non si scrive).
 * - Lungo: rubrica CEI prima dell'antifona di chiusura; niente Gloria scritto; se il parse
 *   omette la rubrica ma il riferimento è 57-88, si integra il testo CEI standard.
 */
export const BENEDICITE_NO_GLORIA_RUBRIC =
  "Alla fine di questo cantico non si dice il Gloria al Padre";

const NO_GLORIA_RE = /non si dice il Gloria al Padre/i;

export function isBenediciteCanticleHead(b: OreBlock): boolean {
  if (b.k !== "psalmHead") return false;
  const key = normalizePsalmKey(b.num);
  if (key.startsWith("cant:dn3")) return true;
  return /\bcantico\s*dn\s*3\b/i.test(b.num);
}

/** Cantico Benedicite lungo: riferimento CEI Dn 3, 57-88. */
export function isLongBenediciteCanticleHead(b: OreBlock): boolean {
  if (!isBenediciteCanticleHead(b)) return false;
  const key = normalizePsalmKey(b.num);
  if (/^cant:dn3,57/.test(key)) return true;
  return /\b57\s*[-–]\s*88/i.test(b.num);
}

export function isShortBenediciteCanticleHead(b: OreBlock): boolean {
  return isBenediciteCanticleHead(b) && !isLongBenediciteCanticleHead(b);
}

function isGloriaPatriStanza(b: OreBlock): boolean {
  if (b.k !== "stanza" || !b.lines?.length) return false;
  if (!b.lines.some((l) => /^Gloria al Padre\b/i.test(l))) return false;
  return b.lines.some((l) => /^e allo Spirito Santo\b/i.test(l) || /Spirito Santo/i.test(l));
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
    const long = isLongBenediciteCanticleHead(out[i]);
    let end = closingAntiphonIndex(out, i);
    if (end < 0) continue;

    const middle = out.slice(i + 1, end).filter((b) => {
      if (isGloriaPatriStanza(b)) return false;
      if (!long && b.k === "omit" && NO_GLORIA_RE.test(b.text)) return false;
      return true;
    });
    const drop = end - (i + 1) - middle.length;
    if (drop > 0) {
      out = [...out.slice(0, i + 1), ...middle, ...out.slice(end)];
      end -= drop;
    }

    if (!long) {
      i = end;
      continue;
    }

    const hasRubric = out.slice(i + 1, end).some((b) => b.k === "omit" && NO_GLORIA_RE.test(b.text));
    if (!hasRubric) {
      out = [
        ...out.slice(0, end),
        { k: "omit", text: BENEDICITE_NO_GLORIA_RUBRIC, ceiRubric: true },
        ...out.slice(end),
      ];
      end += 1;
    }
    i = end;
  }
  return out;
}
