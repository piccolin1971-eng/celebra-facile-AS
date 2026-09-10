/**
 * Spezzatura PE per Engine C: blocchi indivisibili attorno alle formule azzurre.
 */
import {
  PE_FIRST_PREAMBLE_ANCHORS,
  normalizeAnchorKey,
} from "./kindlePages";

export { PE_FIRST_PREAMBLE_ANCHORS, normalizeAnchorKey } from "./kindlePages";
import {
  isPe1RubricLine,
  isPeConsecrationLine,
  unwrapPe1RubricLine,
} from "./liturgy/peLineRendering";

export type PeEngineChunk = {
  kind: "peText";
  text: string;
  packGroup?: string;
  noSplit?: boolean;
};

function splitPeFlowParagraphs(text: string): PeEngineChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\n{2,}/).filter((p) => p.trim());
  if (parts.length <= 1) {
    return [{ kind: "peText", text: trimmed }];
  }
  return parts.map((p) => ({ kind: "peText", text: p.trim() }));
}

function linesSlice(lines: string[], from: number, to: number): string {
  return lines
    .slice(from, to + 1)
    .join("\n")
    .trim();
}

/** Raggruppa indici righe consacrazione in run consecutivi (multi-riga). */
function consecrationRuns(lines: string[]): number[][] {
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const display = unwrapPe1RubricLine(lines[i]);
    if (
      display.length > 0 &&
      !isPe1RubricLine(lines[i]) &&
      isPeConsecrationLine(display)
    ) {
      indices.push(i);
    }
  }
  if (indices.length === 0) return [];

  const runs: number[][] = [];
  let run = [indices[0]];
  for (let i = 1; i < indices.length; i++) {
    const prev = indices[i - 1];
    const cur = indices[i];
    let onlyGap = true;
    for (let j = prev + 1; j < cur; j++) {
      const ln = lines[j].trim();
      if (ln && !isPe1RubricLine(lines[j])) {
        onlyGap = false;
        break;
      }
    }
    if (cur === prev + 1 || onlyGap) {
      run.push(cur);
    } else {
      runs.push(run);
      run = [cur];
    }
  }
  runs.push(run);
  return runs;
}

/**
 * Prima parte PE (pre «Mistero della fede») in chunk impacchettabili.
 * packGroup `pe-pane` / `pe-calice` = blocco bianco+formula indivisibile.
 */
export function buildPeTextEngineChunks(
  beforePart: string,
  peId: string,
): PeEngineChunk[] {
  const trimmed = beforePart.trim();
  if (!trimmed) return [];

  const lines = beforePart.split("\n");
  const runs = consecrationRuns(lines);
  if (runs.length < 2) {
    return splitPeFlowParagraphs(trimmed);
  }

  const firstRun = runs[0];
  const secondRun = runs[1];
  const firstStart = firstRun[0];
  const firstEnd = firstRun[firstRun.length - 1];
  const secondStart = secondRun[0];
  const secondEnd = secondRun[secondRun.length - 1];

  let paneStart = firstStart;
  const anchor = PE_FIRST_PREAMBLE_ANCHORS[peId];
  if (anchor) {
    const want = normalizeAnchorKey(anchor);
    for (let i = 0; i <= firstStart; i++) {
      const display = unwrapPe1RubricLine(lines[i]);
      if (normalizeAnchorKey(display).includes(want)) {
        paneStart = i;
        break;
      }
    }
  }

  let bridgeStart = firstEnd + 1;
  while (bridgeStart < secondStart && lines[bridgeStart].trim() === "") {
    bridgeStart++;
  }
  if (bridgeStart > secondStart) bridgeStart = secondStart;

  const out: PeEngineChunk[] = [];

  if (paneStart > 0) {
    out.push(...splitPeFlowParagraphs(linesSlice(lines, 0, paneStart - 1)));
  }

  out.push({
    kind: "peText",
    text: linesSlice(lines, paneStart, firstEnd),
    packGroup: "pe-pane",
    noSplit: true,
  });

  out.push({
    kind: "peText",
    text: linesSlice(lines, bridgeStart, secondEnd),
    packGroup: "pe-calice",
    noSplit: true,
  });

  if (secondEnd + 1 < lines.length) {
    out.push(...splitPeFlowParagraphs(linesSlice(lines, secondEnd + 1, lines.length - 1)));
  }

  return out.filter((c) => c.text.length > 0);
}
