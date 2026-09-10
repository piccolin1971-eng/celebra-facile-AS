import { GLORIA, INVIT_PSALMS, splitPsalmTitle } from "./bundled";
import type { InvitPsalmId, OreBlock } from "./types";

function withAntMark(lines: string[]): string[] {
  if (!lines.length) return lines;
  const copy = [...lines];
  const last = copy[copy.length - 1].replace(/\s+$/, "");
  if (/\(Ant\.\)\.?$/i.test(last)) return copy;
  copy[copy.length - 1] = `${last} (Ant.).`;
  return copy;
}

export function invitatoryBlocks(psalmId: InvitPsalmId, ant: string): OreBlock[] {
  const p = INVIT_PSALMS[psalmId];
  const { num, name } = splitPsalmTitle(p.title);
  const antText = ant.replace(/\s*\n\s*/g, " ").trim();
  const blocks: OreBlock[] = [
    { k: "rubric", lab: "V.", text: "Signore, apri le mie labbra" },
    { k: "rubric", lab: "R.", text: "e la mia bocca proclami la tua lode" },
    { k: "rubric", lab: "Ant.", text: antText },
    { k: "psalmHead", num, name, sub: p.sub, cite: p.cite },
  ];
  for (const v of p.verses) blocks.push({ k: "stanza", lines: withAntMark(v) });
  blocks.push({ k: "stanza", lines: withAntMark(GLORIA) });
  blocks.push({ k: "rubric", lab: "Ant.", text: antText });
  return blocks;
}
