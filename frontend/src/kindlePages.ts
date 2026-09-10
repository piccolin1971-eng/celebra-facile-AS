/**
 * Paginazione stile Kindle (esperimento):
 * - ogni micro-pagina inizia a un Y nel contenuto continuo;
 * - se una riga verrebbe tagliata dal bordo inferiore del viewport,
 *   quella riga intera passa alla pagina successiva (spazio vuoto in basso).
 * - opzionale: bande «consacrazione PE» da non spezzare a metà.
 */

export type LineBox = { y: number; height: number };

/**
 * Ancore del testo bianco da agganciiare alla 1ª formula (mani sul pane).
 * Chiave = id preghiera eucaristica. Estendibile PE per PE.
 */
export const PE_FIRST_PREAMBLE_ANCHORS: Record<string, string> = {
  pe1: "la vigilia della sua passione",
  pe2: "egli, consegnandosi volontariamente alla passione",
  pe3: "egli, nella notte in cui veniva tradito",
  pe4: "e mentre cenava con loro",
  per_r1: "mentre cenava, prese il pane",
  per_r2: "egli, venuta l'ora di dare la vita per la nostra liberazione",
  pvn_1: "la vigilia della sua passione",
  pvn_2: "la vigilia della sua passione",
  pvn_3: "la vigilia della sua passione",
  pvn_4: "la vigilia della sua passione",
  pe_fanciulli_1: "la sera prima di morire",
  pe_fanciulli_2: "egli, alla vigilia della sua morte",
  pe_fanciulli_3: "la sera prima di morire",
};

export function normalizeAnchorKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Y (relativa al content) della prima occorrenza del needle nel DOM scroll. */
export function measureDomTextAnchorY(
  scrollEl: HTMLElement | null | undefined,
  needle: string,
): number | null {
  if (!scrollEl || !needle || typeof document === "undefined") return null;
  const content =
    (scrollEl.firstElementChild as HTMLElement | null) || scrollEl;
  const contentRect = content.getBoundingClientRect();
  const want = normalizeAnchorKey(needle);
  if (!want) return null;

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const raw = node.textContent || "";
    const norm = normalizeAnchorKey(raw);
    const idx = norm.indexOf(want);
    if (idx >= 0 && raw.trim()) {
      // Mappa approssimata: seleziona l’intero nodo testo (riga).
      const range = document.createRange();
      try {
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects());
        for (const r of rects) {
          if (r.height < 4 || r.width < 2) continue;
          return r.top - contentRect.top;
        }
      } catch {
        // ignore
      }
    }
    node = walker.nextNode();
  }
  return null;
}


/**
 * Banda delle due formule di consacrazione (azzurre):
 * - preambleStartY: testo bianco prima della 1ª (mani sul pane), se noto per quella PE
 * - first*: «…IN SACRIFICIO PER VOI»
 * - bridgeStartY: prima riga DOPO la 1ª formula (testo bianco «Allo stesso modo…»)
 * - second*: «…FATE QUESTO IN MEMORIA DI ME»
 *
 * Il celebrante prende il pane/calice e non può cliccare fino a fine formula:
 * bianco+formula restano insieme; spezza solo ai ponti se il blocco non entra.
 */
export type ConsecrationKeepBand = {
  /** Inizio blocco «bianco + 1ª formula» (default = firstStartY). */
  preambleStartY: number;
  firstStartY: number;
  firstEndY: number;
  /** Inizio blocco «bianco + 2ª formula» (di solito subito dopo firstEndY). */
  bridgeStartY: number;
  secondStartY: number;
  secondEndY: number;
  /**
   * Fine blocco calice+Mistero della fede (acclamazione inclusa).
   * Se assente = secondEndY.
   */
  mysteryEndY: number;
};

/** Y/altezza a pixel interi: evita break diversi a ogni misura (subpixel). */
export function quantizeLineBoxes(lines: LineBox[]): LineBox[] {
  const out: LineBox[] = [];
  for (const ln of lines) {
    if (!ln || !(ln.height > 0) || !Number.isFinite(ln.y)) continue;
    const y = Math.round(ln.y);
    const height = Math.max(1, Math.round(ln.height));
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.y - y) <= 1) {
      prev.height = Math.max(prev.height, height);
    } else {
      out.push({ y, height });
    }
  }
  return out;
}

/** Raggruppa box consacrazione in run consecutivi (due formule tipiche). */
export function buildConsecrationKeepBand(
  conLines: LineBox[],
  allLines?: LineBox[],
  gapPx = 36,
  preambleStartY?: number | null,
): ConsecrationKeepBand | null {
  const sorted = quantizeLineBoxes(conLines).sort((a, b) => a.y - b.y);
  if (sorted.length < 2) return null;

  const runs: LineBox[][] = [];
  let cur: LineBox[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = cur[cur.length - 1];
    const ln = sorted[i];
    const gap = ln.y - (prev.y + prev.height);
    if (gap > gapPx) {
      runs.push(cur);
      cur = [ln];
    } else {
      cur.push(ln);
    }
  }
  runs.push(cur);

  if (runs.length < 2) {
    const only = runs[0];
    const start = only[0].y;
    const end = only[only.length - 1].y + only[only.length - 1].height;
    const pre =
      typeof preambleStartY === "number" &&
      preambleStartY > 0 &&
      preambleStartY < start
        ? preambleStartY
        : start;
    return {
      preambleStartY: pre,
      firstStartY: start,
      firstEndY: end,
      bridgeStartY: end,
      secondStartY: end,
      secondEndY: end,
      mysteryEndY: end,
    };
  }

  const a = runs[0];
  const b = runs[1];
  const firstStartY = a[0].y;
  const firstEndY = a[a.length - 1].y + a[a.length - 1].height;
  const secondStartY = b[0].y;
  const secondEndY = b[b.length - 1].y + b[b.length - 1].height;

  let bridgeStartY = secondStartY;
  if (allLines && allLines.length) {
    const pool = quantizeLineBoxes(allLines).sort((x, y) => x.y - y.y);
    const after = pool.find((ln) => ln.y >= firstEndY - 0.75);
    if (after && after.y <= secondStartY + 0.75) {
      bridgeStartY = after.y;
    }
  }

  const pre =
    typeof preambleStartY === "number" &&
    preambleStartY > 0 &&
    preambleStartY <= firstStartY + 0.75
      ? preambleStartY
      : firstStartY;

  return {
    preambleStartY: pre,
    firstStartY,
    firstEndY,
    bridgeStartY,
    secondStartY,
    secondEndY,
    mysteryEndY: secondEndY,
  };
}

/**
 * Misura le due formule azzurre dal DOM (testID pe-con-line).
 * Y relative al primo figlio dello scroll (come measureDomTextLines).
 */
export function measureDomConsecrationKeepBand(
  scrollEl: HTMLElement | null | undefined,
  allLines?: LineBox[],
  preambleStartY?: number | null,
): ConsecrationKeepBand | null {
  if (!scrollEl || typeof document === "undefined") return null;
  const content =
    (scrollEl.firstElementChild as HTMLElement | null) || scrollEl;
  const contentRect = content.getBoundingClientRect();
  const nodes = content.querySelectorAll('[data-testid="pe-con-line"]');
  if (!nodes.length) return null;
  const boxes: LineBox[] = [];
  nodes.forEach((n) => {
    const r = (n as HTMLElement).getBoundingClientRect();
    if (r.height < 4 || r.width < 2) return;
    boxes.push({ y: r.top - contentRect.top, height: r.height });
  });
  return buildConsecrationKeepBand(boxes, allLines, 36, preambleStartY);
}

/**
 * Estende la banda fino a fine «Mistero della Fede» (titolo + dialogo).
 * Cerca il titolo dopo la 2ª formula e prende le righe successive fino a un buco.
 */
export function extendBandWithMystery(
  band: ConsecrationKeepBand,
  allLines: LineBox[],
  mysteryTitleY: number | null,
  eps = 0.75,
): ConsecrationKeepBand {
  if (!(mysteryTitleY != null && mysteryTitleY >= band.secondEndY - 8)) {
    return band;
  }
  const pool = quantizeLineBoxes(allLines).sort((a, b) => a.y - b.y);
  if (!pool.length) return { ...band, mysteryEndY: band.secondEndY };

  let end = mysteryTitleY;
  let prevBottom = mysteryTitleY;
  let linesAfterTitle = 0;
  for (const ln of pool) {
    if (ln.y + ln.height < mysteryTitleY - eps) continue;
    const gap = ln.y - prevBottom;
    const pastTitle = ln.y > mysteryTitleY + eps;
    // Spacer tra titolo e dialogo: non spezzare finché non ci sono
    // almeno 2–3 righe del Mistero (celebrante + assemblea).
    if (pastTitle && gap > 56 && linesAfterTitle >= 3) break;
    if (pastTitle && gap > 110 && linesAfterTitle >= 1) break;
    end = ln.y + ln.height;
    prevBottom = end;
    if (pastTitle) linesAfterTitle += 1;
    // Sicurezza: non mangiare mezza anamnesi.
    if (end - mysteryTitleY > 720) break;
  }
  return {
    ...band,
    mysteryEndY: Math.max(band.secondEndY, end),
  };
}

/**
 * Misura Y del titolo «Mistero della Fede» (relativa al content).
 */
export function measureDomMysteryTitleY(
  scrollEl: HTMLElement | null | undefined,
): number | null {
  return measureDomTextAnchorY(scrollEl, "Mistero della Fede");
}

/**
 * Snap del break sulle bande pane/calice.
 * Contratto critico: non restituire mai un Y > top+usableH
 * (saltarebbe righe). Se il blocco non entra, lascia il break naturale.
 * `null` = non spezzare su questa riga (il blocco intero entra già da top).
 */
export function snapBreakForConsecration(
  top: number,
  next: number,
  band: ConsecrationKeepBand,
  usableH: number,
  eps = 0.75,
): number | null {
  const {
    preambleStartY,
    firstStartY,
    firstEndY,
    bridgeStartY,
    secondStartY,
    secondEndY,
    mysteryEndY,
  } = band;
  const preamble =
    preambleStartY <= firstStartY + eps ? preambleStartY : firstStartY;
  const bridge = bridgeStartY > firstEndY - eps ? bridgeStartY : secondStartY;
  const caliceEnd = Math.max(secondEndY, mysteryEndY || secondEndY);
  const limit = top + usableH;

  /** Solo candidati che restano dentro l’area utile della pagina corrente. */
  const fitSnap = (y: number): number | null => {
    if (y <= top + eps) return null;
    if (y > limit + eps) return null;
    return y;
  };

  const fullFitsFromTop =
    caliceEnd - top <= usableH + eps && preamble >= top - eps;
  const paneFitsFromTop = firstEndY - top <= usableH + eps;
  const caliceFitsFromTop = caliceEnd - top <= usableH + eps;
  const bridgeFitsFromTop = bridge - top <= usableH + eps;

  // Dentro bianco prima della 1ª o dentro la 1ª → blocco pane.
  if (next > preamble + eps && next < firstEndY - eps) {
    if (fullFitsFromTop) return null;
    const toPreamble = fitSnap(preamble);
    if (toPreamble != null && preamble > top + eps) return toPreamble;
    // Spezza dopo la 1ª solo se il ponte è ancora in pagina (altrimenti
    // la 1ª non entra: break naturale, niente salto oltre usableH).
    if (bridgeFitsFromTop) {
      const toBridge = fitSnap(bridge);
      if (toBridge != null && bridge > top + eps) return toBridge;
    }
    if (paneFitsFromTop) return null;
    return next;
  }

  // Dentro bianco intermedio, 2ª formula o Mistero della fede → blocco calice.
  if (next > bridge + eps && next < caliceEnd - eps) {
    if (fullFitsFromTop) return null;
    // Non ancora nel calice: riparti da «Allo…» solo se sulla pagina
    // nuova entra almeno l’inizio della 2ª (niente Allo orfano).
    if (top < bridge - eps) {
      const blueStartFitsOnFresh =
        secondStartY < bridge + usableH - Math.max(24, (secondEndY - secondStartY) * 0.05);
      const toBridge = fitSnap(bridge);
      if (toBridge != null && blueStartFitsOnFresh) return toBridge;
      return next;
    }
    // Già su «Allo…»: non creare un break proprio sull’inizio della 2ª
    // (lascerebbe Allo da solo). Preferisci null (continua) se la 2ª entra,
    // altrimenti break naturale più avanti.
    if (next <= secondStartY + eps) {
      if (secondEndY - top <= usableH + eps) return null;
      if (caliceFitsFromTop) return null;
      // Se la prima riga blu non entra dopo Allo, break naturale (rara).
      return next;
    }
    if (next > secondStartY + eps && next < secondEndY - eps) {
      if (caliceFitsFromTop) return null;
      if (secondEndY - top <= usableH + eps) return null;
      return next;
    }
    if (next > secondEndY + eps && next < caliceEnd - eps) {
      if (caliceFitsFromTop) return null;
      return next;
    }
    if (caliceFitsFromTop) return null;
    return next;
  }

  // Break proprio sul ponte dopo la 1ª.
  if (next >= firstEndY - eps && next <= bridge + eps) {
    if (fullFitsFromTop) return null;
    return fitSnap(bridge) ?? next;
  }

  // Break proprio sull’inizio del preambolo 1ª.
  if (next >= preamble - eps && next <= firstStartY + eps) {
    if (fullFitsFromTop) return null;
    if (paneFitsFromTop && preamble >= top - eps) return null;
    return fitSnap(preamble) ?? next;
  }

  return next;
}

export function startsSignature(starts: number[]): string {
  return starts.map((s) => Math.round(s)).join("|");
}

/**
 * Micro-pagine troppo ravvicinate (tipico bug: tap avanza di una riga).
 */
export function startsLookLineByLine(
  starts: number[],
  lines: LineBox[],
  viewportH: number,
): boolean {
  if (starts.length < 3 || !(viewportH >= 120)) return false;
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const g = starts[i] - starts[i - 1];
    if (g > 4) gaps.push(g);
  }
  if (gaps.length < 2) return false;
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 0;
  const lineHeights = lines
    .map((l) => l.height)
    .filter((h) => h > 2)
    .sort((a, b) => a - b);
  const medianH = lineHeights[Math.floor(lineHeights.length / 2)] ?? 28;
  const minReasonablePage = Math.max(medianH * 3, 72);
  return medianGap < minReasonablePage && medianGap < viewportH * 0.22;
}

/**
 * Ricostruisci i break se il viewport era sottostimato o i break sono troppo fitti.
 */
export function shouldRebuildKindleStarts(
  builtVh: number,
  currentVh: number,
  starts: number[],
  lines: LineBox[],
): boolean {
  if (!(currentVh >= 120) || starts.length <= 1) return false;
  if (builtVh < 120) return true;
  if (currentVh > builtVh * 1.18 && starts.length >= 3) return true;
  return startsLookLineByLine(starts, lines, currentVh);
}

/** @deprecated Usare shouldRebuildKindleStarts */
export function shouldRebuildStartsForViewport(
  builtVh: number,
  currentVh: number,
  startCount: number,
): boolean {
  if (!(currentVh >= 120) || startCount <= 1) return false;
  if (builtVh < 120) return true;
  return currentVh > builtVh * 1.18 && startCount >= 3;
}

/** Se tutto il testo entra in un viewport, una sola micro-pagina (tap → sezione dopo). */
export function collapseSingleScreenStarts(
  starts: number[],
  lines: LineBox[],
  viewportH: number,
  textEnd: number,
  safetyPx = 8,
): number[] {
  if (!(viewportH > 0)) return starts.length ? starts : [0];
  const usableH = Math.max(40, viewportH - safetyPx);
  const sorted = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  const contentBottom =
    sorted.length > 0
      ? sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
      : 0;
  const effectiveEnd = Math.max(textEnd, contentBottom);
  if (effectiveEnd <= usableH + 12) return [0];
  return starts.length ? starts : [0];
}

/** Righe sintetiche da bounding box segmento (fallback se mancano misure). */
export function synthesizeLinesFromBounds(
  bounds: Record<string, { y: number; height: number }>,
  lineH: number,
): LineBox[] {
  const out: LineBox[] = [];
  const step = Math.max(16, lineH);
  for (const b of Object.values(bounds)) {
    if (!b || b.height < 8) continue;
    let pos = b.y;
    const end = b.y + b.height;
    while (pos < end - step * 0.25) {
      const h = Math.min(step, end - pos);
      out.push({ y: pos, height: h });
      pos += step;
    }
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}

/** Riempie buchi tra righe misurate (testo non catturato dal DOM). */
export function fillLineGaps(lines: LineBox[]): LineBox[] {
  if (lines.length < 2) return lines;
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const heights = sorted.map((l) => l.height).sort((a, b) => a - b);
  const step = Math.max(16, heights[Math.floor(heights.length / 2)] || 24);
  const out: LineBox[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    let y = prev.y + Math.max(prev.height, step * 0.85);
    while (cur.y - y > step * 1.4) {
      out.push({ y, height: step });
      y += step;
    }
    out.push({ ...cur });
  }
  return out;
}
function splitTallRect(
  y: number,
  height: number,
  stepHint: number,
): LineBox[] {
  const step = Math.max(16, stepHint);
  if (height <= step * 2.2) return [{ y, height }];
  const out: LineBox[] = [];
  let pos = y;
  const end = y + height;
  while (pos < end - step * 0.2) {
    const h = Math.min(step, end - pos);
    out.push({ y: pos, height: h });
    pos += step;
  }
  return out;
}

/**
 * Misura le righe di testo dal DOM (web). Coordinate relative al content root
 * (invarianti allo scrollTop).
 */
export function measureDomTextLines(scrollEl: HTMLElement | null | undefined): LineBox[] {
  if (!scrollEl || typeof document === "undefined") return [];
  const content =
    (scrollEl.firstElementChild as HTMLElement | null) || scrollEl;
  const contentRect = content.getBoundingClientRect();

  const raw: LineBox[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent || "";
    if (text.trim()) {
      const range = document.createRange();
      try {
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects());
        for (const r of rects) {
          if (r.height < 4 || r.width < 2) continue;
          raw.push({
            y: r.top - contentRect.top,
            height: r.height,
          });
        }
      } catch {
        // ignore nodes non selezionabili
      }
    }
    node = walker.nextNode();
  }

  if (raw.length === 0) return [];

  raw.sort((a, b) => a.y - b.y);
  const heights = raw.map((l) => l.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 24;
  const maxKeep = Math.max(medianH * 2.4, 48);

  const expanded: LineBox[] = [];
  for (const ln of raw) {
    if (ln.height > maxKeep) {
      expanded.push(...splitTallRect(ln.y, ln.height, medianH));
    } else {
      expanded.push(ln);
    }
  }

  expanded.sort((a, b) => a.y - b.y);
  const merged: LineBox[] = [];
  for (const ln of expanded) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.y - ln.y) < 2.5) {
      prev.height = Math.max(prev.height, ln.height);
      continue;
    }
    merged.push({ y: ln.y, height: ln.height });
  }
  return fillLineGaps(merged);
}

/** Misura DOM senza riempire i buchi: allineamento break/maschera al testo visibile. */
export function measureDomTextLinesStrict(
  scrollEl: HTMLElement | null | undefined,
): LineBox[] {
  if (!scrollEl || typeof document === "undefined") return [];
  const content =
    (scrollEl.firstElementChild as HTMLElement | null) || scrollEl;
  const contentRect = content.getBoundingClientRect();
  const raw: LineBox[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent || "";
    if (text.trim()) {
      const range = document.createRange();
      try {
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) {
          if (r.height < 4 || r.width < 2) continue;
          raw.push({ y: r.top - contentRect.top, height: r.height });
        }
      } catch {
        // ignore
      }
    }
    node = walker.nextNode();
  }
  raw.sort((a, b) => a.y - b.y);
  const merged: LineBox[] = [];
  for (const ln of raw) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.y - ln.y) < 2.5) {
      prev.height = Math.max(prev.height, ln.height);
      continue;
    }
    merged.push({ y: ln.y, height: ln.height });
  }
  return quantizeLineBoxes(merged);
}

/** Riallinea e completa i break con le misure live (coda pagina inclusa). */
export function finalizeKindleStarts(
  starts: number[],
  lines: LineBox[],
  viewportH: number,
  textEnd: number,
  opts?: {
    safetyPx?: number;
    forcedBreakYs?: number[];
    consecrationBand?: ConsecrationKeepBand | null;
  },
): number[] {
  const eps = 0.75;
  const safety = opts?.safetyPx ?? 8;
  if (!(viewportH > 0)) return starts.length ? starts : [0];
  const usableH = Math.max(40, viewportH - safety);
  const sorted = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  const lastBottom = sorted.length
    ? sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
    : 0;
  const end = Math.max(textEnd, lastBottom);
  const heights = sorted.map((l) => l.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 24;
  const bottomSlop = Math.max(4, medianH * 0.2);
  const base = starts.length ? starts : [0];
  const extended = extendStartsForTailOverflow(
    base,
    sorted,
    usableH,
    end,
    bottomSlop,
    eps,
    viewportH,
  );
  const fitted = repairStartsBottomFit(
    extended,
    sorted,
    usableH,
    bottomSlop,
    eps,
    viewportH,
  );
  const repaired = repairStartsAgainstLines(fitted, sorted, eps, viewportH).map(
    (s, idx) => (idx === 0 ? 0 : snapScrollToLineTop(s, sorted, eps)),
  );
  // Se l’ultima pagina ha ancora una riga oltre il viewport, aggiungi un break.
  const lastTop = repaired[repaired.length - 1] ?? 0;
  const overflow = sorted.find(
    (ln) =>
      ln.y > lastTop + eps &&
      ln.y < lastTop + viewportH - 2 &&
      ln.y + ln.height > lastTop + viewportH - 1,
  );
  if (overflow) {
    const next = Math.round(overflow.y);
    if (next > lastTop + eps) repaired.push(next);
  }
  const band = opts?.consecrationBand ?? null;
  let aligned = repaired;
  if (band) {
    const lineAtOrAfter = (y: number): number => {
      const hit = sorted.find((ln) => ln.y >= y - eps);
      return hit ? hit.y : y;
    };
    aligned = repaired.reduce<number[]>((acc, s, idx) => {
      if (idx === 0) {
        acc.push(0);
        return acc;
      }
      const top = acc[acc.length - 1];
      const snapped = snapBreakForConsecration(top, s, band, usableH, eps);
      if (snapped == null) return acc;
      const y = Math.round(lineAtOrAfter(snapped));
      if (y > top + eps) acc.push(y);
      return acc;
    }, []);
  }
  const withBreaks = injectForcedBreaks(aligned, opts?.forcedBreakYs, sorted, eps);
  return collapseSingleScreenStarts(
    withBreaks,
    sorted,
    viewportH,
    end,
    safety,
  );
}

/**
 * Snap break/scroll Y so no text line is clipped at the top of the viewport.
 */
export function snapScrollToLineTop(
  y: number,
  lines: LineBox[],
  eps = 0.75,
): number {
  if (y <= eps) return 0;
  const sorted = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  if (!sorted.length) return Math.round(y);
  for (const ln of sorted) {
    const bottom = ln.y + ln.height;
    if (bottom <= y + eps) continue;
    if (ln.y < y + eps && bottom > y + eps) {
      return Math.round(ln.y);
    }
    return Math.round(ln.y);
  }
  return Math.round(y);
}

/** Non iniziare a metà formula azzurra: pane → preambolo, calice → «Allo stesso modo». */
export function snapScrollForConsecrationBand(
  y: number,
  band: ConsecrationKeepBand | null | undefined,
  pageStartY: number,
): number {
  if (!band) return y;
  const inFirst = y >= band.firstStartY - 1 && y < band.firstEndY - 2;
  const inSecond = y >= band.secondStartY - 1 && y < band.secondEndY - 2;
  if (inFirst) {
    const target =
      band.preambleStartY <= band.firstStartY + 2
        ? band.preambleStartY
        : band.firstStartY;
    if (target >= pageStartY - 80) {
      return Math.round(Math.min(y, target));
    }
    return Math.round(Math.min(y, band.firstStartY));
  }
  if (inSecond) {
    return Math.round(Math.min(y, band.bridgeStartY));
  }
  return y;
}

/** Allinea lo scroll web: righe testo + formule azzurre non tagliate in alto. */
export function measureDomSnapScrollY(
  scrollEl: HTMLElement | null | undefined,
  y: number,
  lines?: LineBox[],
): number {
  let out = lines?.length ? snapScrollToLineTop(y, lines) : y;
  if (!scrollEl || typeof document === "undefined") return Math.round(out);
  const content =
    (scrollEl.firstElementChild as HTMLElement | null) || scrollEl;
  const cr = content.getBoundingClientRect();
  content.querySelectorAll('[data-testid="pe-con-line"]').forEach((node) => {
    const r = (node as HTMLElement).getBoundingClientRect();
    if (r.height < 4) return;
    const top = r.top - cr.top;
    const bottom = top + r.height;
    if (top < out + 1 && bottom > out + 1) {
      out = Math.min(out, Math.floor(top));
    }
  });
  return Math.round(out);
}

/** Marker DOM `kindle-force-break`: Y relative al contenuto (salto micro-pagina). */
export function measureDomForceBreakYs(
  scrollEl: HTMLElement | null | undefined,
): number[] {
  if (!scrollEl || typeof document === "undefined") return [];
  const content =
    (scrollEl.firstElementChild as HTMLElement | null) || scrollEl;
  const cr = content.getBoundingClientRect();
  const ys: number[] = [];
  content.querySelectorAll('[data-testid="kindle-force-break"]').forEach((node) => {
    const r = (node as HTMLElement).getBoundingClientRect();
    const y = r.top - cr.top;
    if (y > 2) ys.push(y);
  });
  ys.sort((a, b) => a - b);
  return ys;
}

/**
 * Inserisce break obbligatori (es. ogni formula penitenziale su pagina nuova).
 * Allinea ogni marker alla prima riga di testo successiva.
 */
export function injectForcedBreaks(
  starts: number[],
  forceYs: number[] | undefined,
  lines: LineBox[],
  eps = 0.75,
): number[] {
  if (!forceYs?.length) return starts.length ? starts : [0];
  const sorted = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  const snapped: number[] = [];
  for (const raw of forceYs) {
    if (!(raw > eps)) continue;
    const hit = sorted.find((ln) => ln.y >= raw - 4);
    const y = Math.round(hit ? hit.y : raw);
    if (y > eps) snapped.push(y);
  }
  const merged = [...(starts.length ? starts : [0]), ...snapped]
    .map((s) => Math.round(s))
    .sort((a, b) => a - b);
  const out: number[] = [0];
  for (const s of merged) {
    if (s > out[out.length - 1] + 12) out.push(s);
  }
  return out;
}

/** Aggiunge break se l’ultima pagina supera l’altezza utile. */
function extendStartsForTailOverflow(
  starts: number[],
  lines: LineBox[],
  usableH: number,
  end: number,
  bottomSlop: number,
  eps: number,
  viewportH?: number,
): number[] {
  const sorted = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  const out = [...starts];
  const viewH = viewportH && viewportH > 0 ? viewportH : usableH;
  let guard = 0;
  while (guard++ < 500) {
    const top = out[out.length - 1];
    if (end - top <= Math.min(usableH, viewH) + eps) break;
    const limit = top + usableH;
    const viewLimit = top + viewH - 1;
    let next: number | null = null;
    for (const ln of sorted) {
      if (ln.y < top - eps) continue;
      if (
        ln.y + ln.height + bottomSlop > limit + eps ||
        ln.y + ln.height > viewLimit
      ) {
        next = ln.y;
        break;
      }
    }
    if (next == null) {
      const below = sorted.find((ln) => ln.y > top + eps);
      if (!below || below.y >= end - eps) break;
      next = below.y;
    }
    if (next <= top + eps || next >= end - eps) break;
    out.push(Math.round(next));
  }
  return out;
}

/**
 * Se una riga “a cavallo” del break (inizia prima, finisce dopo), sposta
 * il break all’inizio di quella riga — evita taglio in verticale + ripresa.
 */
export function repairStartsAgainstLines(
  starts: number[],
  lines: LineBox[],
  eps: number,
  viewportH?: number,
): number[] {
  if (starts.length < 2 || lines.length < 1) return starts;
  const pool = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  let out = starts.map((s) => Math.round(s));
  const viewH = viewportH && viewportH > 0 ? viewportH : 0;

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let s = 1; s < out.length; s++) {
      const breakY = out[s];
      const top = out[s - 1];
      let adjusted = breakY;
      for (const ln of pool) {
        const bottom = ln.y + ln.height;
        if (ln.y < top - eps) continue;
        const intoLine = breakY - ln.y;
        const straddles = ln.y < breakY - eps && bottom > breakY - 0.25;
        const nearStart =
          intoLine > 1 &&
          intoLine < Math.max(16, ln.height * 0.55) &&
          bottom > breakY - 2;
        const overflowsView =
          viewH > 0 &&
          ln.y < top + viewH - 2 &&
          bottom > top + viewH - 1;
        if (straddles || nearStart || overflowsView) {
          adjusted = Math.min(adjusted, ln.y);
        }
      }
      if (adjusted > top + eps && adjusted < breakY - eps) {
        out[s] = Math.round(adjusted);
        changed = true;
      }
      if (out[s] <= out[s - 1] + eps) {
        const below = pool.find((ln) => ln.y > out[s - 1] + eps);
        if (!below) {
          out.splice(s);
          changed = true;
          break;
        }
        out[s] = Math.round(below.y);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const dedup: number[] = [out[0]];
  for (let i = 1; i < out.length; i++) {
    if (out[i] > dedup[dedup.length - 1] + eps) dedup.push(out[i]);
  }
  return dedup;
}

/**
 * Fase A: micro-pagine ancorate ai marker kindleBreak (blocchi liturgici).
 * Solo se un blocco supera il viewport si pagina al suo interno.
 */
export function buildChunkKindleStarts(
  lines: LineBox[],
  viewportH: number,
  textEnd: number,
  forcedBreakYs: number[],
  opts?: { safetyPx?: number },
): number[] {
  const safety = opts?.safetyPx ?? 8;
  if (!(viewportH > 0)) return [0];
  const usableH = Math.max(40, viewportH - safety);
  const sorted = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  const end = Math.max(
    textEnd,
    sorted.length
      ? sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
      : 0,
  );

  const chunkBoundaries = injectForcedBreaks([0], forcedBreakYs, sorted, 0.75);
  const out: number[] = [];

  for (let ci = 0; ci < chunkBoundaries.length; ci++) {
    const top = chunkBoundaries[ci];
    const bottom =
      ci + 1 < chunkBoundaries.length ? chunkBoundaries[ci + 1] : end;
    if (top >= end - 1) continue;

    if (!out.length || out[out.length - 1] < top - 0.5) {
      out.push(Math.round(top));
    }

    const chunkSpan = bottom - top;
    if (chunkSpan <= usableH + 12) continue;

    const chunkLines = sorted
      .filter((ln) => ln.y >= top - 0.75 && ln.y < bottom - 0.75)
      .map((ln) => ({ y: ln.y - top, height: ln.height }));

    if (chunkLines.length < 1) continue;

    const inner = buildKindlePageStarts(chunkLines, viewportH, chunkSpan, {
      safetyPx: safety,
    });
    for (let j = 1; j < inner.length; j++) {
      const absY = Math.round(top + inner[j]);
      if (absY > out[out.length - 1] + 12 && absY < bottom - 4) {
        out.push(absY);
      }
    }
  }

  if (!out.length) out.push(0);
  return collapseSingleScreenStarts(out, sorted, viewportH, end, safety);
}

/** Sposta i break se una riga sulla pagina supera l’altezza utile. */
function repairStartsBottomFit(
  starts: number[],
  lines: LineBox[],
  usableH: number,
  bottomSlop: number,
  eps: number,
  viewportH?: number,
): number[] {
  if (starts.length < 2 || !lines.length) return starts;
  const pool = quantizeLineBoxes(lines).sort((a, b) => a.y - b.y);
  const viewH = viewportH && viewportH > 0 ? viewportH : usableH;
  const out: number[] = [starts[0]];
  for (let i = 1; i < starts.length; i++) {
    let breakY = starts[i];
    const top = out[out.length - 1];
    const limit = top + usableH;
    const viewLimit = top + viewH - 1;
    for (const ln of pool) {
      if (ln.y < top - eps) continue;
      if (ln.y >= breakY - eps) break;
      if (
        ln.y + ln.height + bottomSlop > limit + eps ||
        ln.y + ln.height > viewLimit
      ) {
        breakY = Math.min(breakY, ln.y);
      }
    }
    if (breakY > top + eps) out.push(Math.round(breakY));
  }
  return out;
}

export function buildKindlePageStarts(
  lines: LineBox[],
  viewportH: number,
  textEnd: number,
  opts?: {
    eps?: number;
    safetyPx?: number;
    consecrationBand?: ConsecrationKeepBand | null;
    forcedBreakYs?: number[];
  },
): number[] {
  const eps = opts?.eps ?? 0.75;
  // Margine unico: stesso budget per “ci sta?” e area utile (niente mismatch maschera).
  const safety = opts?.safetyPx ?? 4;
  if (!(viewportH > 0)) return [0];
  const usableH = Math.max(40, viewportH - safety);
  const end = Math.max(0, textEnd);
  const band = opts?.consecrationBand ?? null;
  let sorted = quantizeLineBoxes(
    [...lines]
      .filter((ln) => ln && ln.height > 0 && Number.isFinite(ln.y))
      .sort((a, b) => a.y - b.y),
  );

  const maxLine = usableH * 0.9;
  const normalized: LineBox[] = [];
  for (const ln of sorted) {
    if (ln.height > maxLine) {
      normalized.push(
        ...splitTallRect(ln.y, ln.height, Math.min(28, usableH / 12)),
      );
    } else {
      normalized.push(ln);
    }
  }
  sorted = normalized.sort((a, b) => a.y - b.y);

  // Merge righe quasi coincidenti (stesso baseline, misure duplicate).
  const merged: LineBox[] = [];
  for (const ln of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.y - ln.y) < 2) {
      prev.height = Math.max(prev.height, ln.height);
      continue;
    }
    merged.push({ y: ln.y, height: ln.height });
  }
  sorted = merged;

  let medianH = 24;
  if (sorted.length >= 1) {
    const heights = sorted.map((l) => l.height).sort((a, b) => a - b);
    medianH = heights[Math.floor(heights.length / 2)] || 24;
  }
  // Tolleranza anti-taglio (sottostima misura) + un filo fisso per subpixel.
  const bottomSlop = Math.max(4, medianH * 0.2);

  const starts: number[] = [0];

  if (sorted.length === 0) {
    let y = 0;
    while (y + usableH < end - eps) {
      y += usableH;
      starts.push(y);
      if (starts.length > 500) break;
    }
    return starts;
  }

  const lineAtOrAfter = (y: number): number => {
    const hit = sorted.find((ln) => ln.y >= y - eps);
    return hit ? hit.y : y;
  };

  while (starts.length < 500) {
    const top = starts[starts.length - 1];
    const limit = top + usableH;
    let next: number | null = null;

    for (const ln of sorted) {
      if (ln.y < top - eps) continue;
      const bottom = ln.y + ln.height + bottomSlop;
      if (bottom <= limit + eps) continue;

      let candidate = ln.y;
      if (band) {
        const snapped = snapBreakForConsecration(
          top,
          candidate,
          band,
          usableH,
          eps,
        );
        if (snapped == null) continue;
        candidate = lineAtOrAfter(snapped);
      }
      next = candidate;
      break;
    }

    if (next == null) {
      if (end - top > usableH + eps) {
        const overflow = sorted.find(
          (ln) =>
            ln.y >= top - eps &&
            ln.y + ln.height + bottomSlop > limit + eps,
        );
        if (overflow && overflow.y > top + eps && overflow.y < end - eps) {
          next = overflow.y;
        }
      }
      if (next == null) break;
    }

    if (next <= top + eps) {
      const below = sorted.find((ln) => ln.y > top + eps);
      if (!below) break;
      next = below.y;
    }

    if (next >= end - eps) break;

    const hasMore = sorted.some((ln) => ln.y >= next - eps && ln.y < end - eps);
    if (!hasMore) break;

    starts.push(Math.round(next));
  }

  const extended = extendStartsForTailOverflow(
    starts,
    sorted,
    usableH,
    end,
    bottomSlop,
    eps,
    viewportH,
  );

  const fitted = repairStartsBottomFit(
    extended,
    sorted,
    usableH,
    bottomSlop,
    eps,
    viewportH,
  );

  const afterBand = repairStartsAgainstLines(fitted, sorted, eps, viewportH)
    .map((s, idx) => (idx === 0 ? 0 : snapScrollToLineTop(s, sorted, eps)))
    .reduce<number[]>((acc, s, idx) => {
      if (!band || idx === 0) {
        acc.push(s);
        return acc;
      }
      const top = acc[acc.length - 1];
      const snapped = snapBreakForConsecration(top, s, band, usableH, eps);
      if (snapped == null) {
        // Break illegittimo tra/dentro formule: salta questo start.
        return acc;
      }
      const aligned = Math.round(lineAtOrAfter(snapped));
      if (aligned > top + eps) acc.push(aligned);
      return acc;
    }, []);
  const withBreaks = injectForcedBreaks(afterBand, opts?.forcedBreakYs, sorted, eps);
  return collapseSingleScreenStarts(
    withBreaks,
    sorted,
    viewportH,
    end,
    safety,
  );
}

export function findNearestPageIndex(starts: number[], y: number): number {
  if (!starts.length) return 0;
  let best = 0;
  let bestDist = Math.abs(starts[0] - y);
  for (let i = 1; i < starts.length; i++) {
    const d = Math.abs(starts[i] - y);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/** Fine del contenuto appartenente alla micro-pagina `index` (esclusiva). */
export function pageContentEnd(
  starts: number[],
  index: number,
  textEnd: number,
): number {
  if (index + 1 < starts.length) return starts[index + 1];
  return Math.max(textEnd, starts[index] ?? 0);
}

/** Altezza maschera in basso: copre da inizio pagina successiva fino a fondo viewport. */
export function pageMaskHeight(
  starts: number[],
  index: number,
  lines: LineBox[],
  viewportH: number,
  textEnd: number,
  eps = 0.75,
): number {
  if (!(viewportH > 0)) return 0;
  const top = starts[index] ?? 0;
  const endExclusive = pageContentEnd(starts, index, textEnd);
  const breakY = Math.floor(endExclusive + 1e-4);
  let maskH = Math.max(0, Math.ceil(viewportH - Math.max(0, breakY - top) + 4));

  const pool = quantizeLineBoxes(lines);
  let maskTop = breakY;
  for (const ln of pool) {
    const bottom = ln.y + ln.height;
    if (ln.y < breakY - eps && bottom > breakY + eps) {
      maskTop = Math.min(maskTop, ln.y);
    }
  }
  maskH = Math.max(
    0,
    Math.ceil(viewportH - Math.max(0, maskTop - top) + 4),
  );
  return maskH;
}

/**
 * Maschera dal break (o dall’inizio della riga che lo attraversa).
 * Non “mangia” all’indietro righe che finiscono prima del break.
 */
export function computeKindleMaskHeight(
  starts: number[],
  index: number,
  lines: LineBox[],
  viewportH: number,
  textEnd: number,
  scrollY: number,
  eps = 0.75,
): number {
  if (!(viewportH > 0) || !lines.length) return 0;
  const top = starts[index] ?? 0;
  const breakY = Math.floor(pageContentEnd(starts, index, textEnd) + 1e-4);
  const viewBot = scrollY + viewportH;
  let maskTop = Math.min(breakY, viewBot);
  for (const ln of quantizeLineBoxes(lines)) {
    const bottom = ln.y + ln.height;
    const straddlesBreak = ln.y < breakY - eps && bottom > breakY - 0.25;
    const clippedByView =
      ln.y > scrollY + 4 &&
      ln.y < viewBot - 2 &&
      bottom > viewBot - 1;
    if (straddlesBreak || clippedByView) {
      maskTop = Math.min(maskTop, ln.y);
    }
  }
  const maskH = Math.max(
    0,
    Math.ceil(viewportH - Math.max(0, maskTop - scrollY) + 4),
  );
  // Mai coprire quasi tutta la pagina (misure incomplete → schermo nero).
  if (maskH > viewportH * 0.72) return 0;
  return Math.min(Math.max(0, viewportH - 2), maskH);
}
