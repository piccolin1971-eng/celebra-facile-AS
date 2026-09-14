/**
 * Engine C — paginazione liturgica deterministica.
 * Misura altezze segmento → impacchetta in pagine fisse → niente scroll+mask.
 */

export type SegmentPackMeta = {
  kind: string;
  packGroup?: string;
  text?: string;
  noSplit?: boolean;
};

const SPLITTABLE_KINDS = new Set([
  "normal",
  "umili",
  "preghieraFedeli",
  "rubric",
  "subtitle",
  "peText",
  "peDossologia",
]);

/** Segmento spezzabile se ha testo e non è in un packGroup / noSplit. */
export function isSplittableSegment(seg: SegmentPackMeta): boolean {
  if (seg.noSplit) return false;
  if (seg.packGroup?.trim()) return false;
  if (!isPackableSegmentKind(seg.kind)) return false;
  if (seg.kind === "salmo") return false;
  if (!(seg.text?.trim())) return false;
  return SPLITTABLE_KINDS.has(seg.kind);
}

/** Spezza un segmento troppo alto: paragrafi → righe → metà parole → metà caratteri. */
export function splitSegmentForPaging(seg: SegmentPackMeta): SegmentPackMeta[] {
  const text = seg.text ?? "";
  if (!text.trim()) return [seg];

  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length > 1) {
    return paragraphs.map((p) => ({ ...seg, text: p.trim() }));
  }

  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length > 1) {
    return lines.map((l) => ({ ...seg, text: l.trim() }));
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    return [
      { ...seg, text: words.slice(0, mid).join(" ") },
      { ...seg, text: words.slice(mid).join(" ") },
    ];
  }

  if (text.length > 1) {
    const mid = Math.ceil(text.length / 2);
    return [
      { ...seg, text: text.slice(0, mid) },
      { ...seg, text: text.slice(mid) },
    ];
  }

  return [seg];
}

const SECTION_TITLE_KINDS = new Set([
  "sectionTitle",
  "sectionTitleBreak",
  "antifonaTitle",
  "readingTitle",
  "orazioneTitle",
  "peTitle",
  "troparioTitle",
]);

export function isSectionTitleKind(kind: string): boolean {
  return SECTION_TITLE_KINDS.has(kind);
}

export function isPackableSegmentKind(kind: string): boolean {
  return kind !== "kindleBreak";
}

export function countPackableSegments(segments: SegmentPackMeta[]): number {
  return segments.reduce(
    (n, s) => (isPackableSegmentKind(s.kind) ? n + 1 : n),
    0,
  );
}

type PackUnit = {
  indices: number[];
  height: number;
  nextIndex: number;
};

function measurePackUnit(
  segments: SegmentPackMeta[],
  heights: ReadonlyMap<number, number>,
  startIndex: number,
): PackUnit | null {
  const seg = segments[startIndex];
  if (!seg || !isPackableSegmentKind(seg.kind)) return null;

  const group = seg.packGroup?.trim();
  if (!group) {
    return {
      indices: [startIndex],
      height: heights.get(startIndex) ?? 0,
      nextIndex: startIndex + 1,
    };
  }

  const indices = [startIndex];
  let totalH = heights.get(startIndex) ?? 0;
  let j = startIndex + 1;
  while (j < segments.length) {
    const next = segments[j];
    if (!isPackableSegmentKind(next.kind)) break;
    if (next.packGroup !== group) break;
    indices.push(j);
    totalH += heights.get(j) ?? 0;
    j++;
  }
  return { indices, height: totalH, nextIndex: j };
}

function heightSpan(
  segments: SegmentPackMeta[],
  heights: ReadonlyMap<number, number>,
  from: number,
  to: number,
): number {
  let h = 0;
  for (let k = from; k < to; k++) {
    if (!isPackableSegmentKind(segments[k]?.kind ?? "")) continue;
    h += heights.get(k) ?? 0;
  }
  return h;
}

/** Primo blocco dopo un titolo, saltando spacer; null se c'è un altro titolo o un break. */
function nextKeepWithUnit(
  segments: SegmentPackMeta[],
  heights: ReadonlyMap<number, number>,
  startIndex: number,
): PackUnit | null {
  let j = startIndex;
  while (j < segments.length) {
    const s = segments[j];
    if (!s) return null;
    if (s.kind === "kindleBreak") return null;
    const unit = measurePackUnit(segments, heights, j);
    if (!unit) {
      j += 1;
      continue;
    }
    const kind = segments[unit.indices[0]]?.kind ?? "";
    if (kind === "spacer") {
      j = unit.nextIndex;
      continue;
    }
    if (isSectionTitleKind(kind)) return null;
    return unit;
  }
  return null;
}

/**
 * Impacchetta indici segmento in pagine che entrano in viewportH.
 * `kindleBreak` forza salto pagina; `packGroup` tiene segmenti adiacenti insieme
 * (es. bianco + formula azzurra della consacrazione).
 */
export function packSegmentIndicesIntoPages(
  segments: SegmentPackMeta[],
  heights: ReadonlyMap<number, number>,
  viewportH: number,
  opts?: { paddingBottom?: number; minUsable?: number },
): number[][] {
  const pad = opts?.paddingBottom ?? 28;
  const usable = Math.max(opts?.minUsable ?? 180, viewportH - pad);
  const pages: number[][] = [];
  let current: number[] = [];
  let currentH = 0;

  const flush = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
      currentH = 0;
    }
  };

  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (seg.kind === "kindleBreak") {
      flush();
      i++;
      continue;
    }

    const unit = measurePackUnit(segments, heights, i);
    if (!unit) {
      i++;
      continue;
    }

    let h = Math.max(unit.height, 1);

    if (h > usable) {
      // Segmento più alto del viewport: LiturgyPagedReader lo spezza prima del pack.
      flush();
      pages.push([...unit.indices]);
      i = unit.nextIndex;
      continue;
    }

    // Titolo + primo blocco di testo: se non entrano insieme, il titolo
    // parte dalla pagina successiva (niente «Rito della Pace» orfano).
    if (isSectionTitleKind(seg.kind) && !seg.packGroup?.trim() && current.length > 0) {
      const keep = nextKeepWithUnit(segments, heights, unit.nextIndex);
      if (keep) {
        const together =
          h + heightSpan(segments, heights, unit.nextIndex, keep.indices[0]) + Math.max(keep.height, 1);
        if (currentH + together > usable) flush();
      }
    }

    if (current.length > 0 && currentH + h > usable) {
      flush();
    }

    current.push(...unit.indices);
    currentH += h;
    i = unit.nextIndex;
  }
  flush();

  if (pages.length === 0) {
    const all = segments
      .map((_, idx) => idx)
      .filter((idx) => isPackableSegmentKind(segments[idx].kind));
    return all.length ? [all] : [[]];
  }
  return pages;
}

export function packedPagesCoverAllPackable(
  pages: number[][],
  segments: SegmentPackMeta[],
): boolean {
  const seen = new Set<number>();
  for (const page of pages) {
    for (const i of page) seen.add(i);
  }
  for (let i = 0; i < segments.length; i++) {
    if (!isPackableSegmentKind(segments[i].kind)) continue;
    if (!seen.has(i)) return false;
  }
  return true;
}

export function estimateSegmentHeight(seg: SegmentPackMeta, fontSize: number): number {
  const t = seg.text || " ";
  const lineCount = Math.max(1, t.split("\n").length);
  const extra = Math.floor(t.length / Math.max(24, Math.round(52 / Math.max(8, fontSize * 0.52))));
  return Math.ceil((lineCount + extra) * fontSize * 1.55);
}

/** Completa altezze mancanti/nulle così il packer non salta segmenti. */
export function fillMissingSegmentHeights(
  segments: SegmentPackMeta[],
  heights: Map<number, number>,
  fontSize: number,
): void {
  for (let i = 0; i < segments.length; i++) {
    if (!isPackableSegmentKind(segments[i].kind)) continue;
    const h = heights.get(i);
    if (h == null || h <= 0) {
      heights.set(i, estimateSegmentHeight(segments[i], fontSize));
    }
  }
}

export function packedPageMaxHeight(
  pages: number[][],
  heights: ReadonlyMap<number, number>,
): number {
  let max = 0;
  for (const page of pages) {
    let h = 0;
    for (const i of page) h += heights.get(i) ?? 0;
    if (h > max) max = h;
  }
  return max;
}
