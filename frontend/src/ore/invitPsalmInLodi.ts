import type { InvitPsalmId, OreBlock } from "./types";

export type InvitPsalmLodiOverlap = {
  psalmId: InvitPsalmId;
  /** Es. «terzo salmo» tra i salmi (non i cantici) delle Lodi. */
  positionLabel: string;
};

const ORDINAL: Record<number, string> = {
  1: "primo salmo",
  2: "secondo salmo",
  3: "terzo salmo",
  4: "quarto salmo",
};

/** Numero base da intestazione «SALMO 99» o «SALMO 62, 2-9». */
export function salmoBaseNumber(num: string): string | null {
  const m = String(num || "").match(/^SALMO\s+(\d+)/i);
  return m ? m[1] : null;
}

/** Salmi (non cantici) nell’ordine delle Lodi. */
export function lodiSalmoNumbers(blocks: OreBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k !== "psalmHead") continue;
    const n = salmoBaseNumber(b.num);
    if (n) out.push(n);
  }
  return out;
}

export function invitPsalmOverlapInLodi(
  blocks: OreBlock[],
  psalmId: InvitPsalmId,
): InvitPsalmLodiOverlap | null {
  const salmi = lodiSalmoNumbers(blocks);
  const idx = salmi.indexOf(psalmId);
  if (idx < 0) return null;
  const positionLabel = ORDINAL[idx + 1] || `${idx + 1}º salmo`;
  return { psalmId, positionLabel };
}
