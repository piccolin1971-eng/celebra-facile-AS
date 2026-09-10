/**
 * Tipografia liturgica condivisa (Celebra / Messa).
 * Un rapporto corpo unico + fattore interlinea utente per coerenza visiva.
 */

/** Rapporto lineHeight/fontSize per il testo di lettura (corpo, dialoghi, PE). */
export const BODY_LINE_HEIGHT = 1.55;

/** Corpo Liturgia delle Ore: +10% rispetto alla Messa. */
export const ORE_BODY_LINE_HEIGHT = BODY_LINE_HEIGHT * 1.1;

/** Rubriche e testi secondari (font più piccolo). */
export const RUBRIC_LINE_HEIGHT = 1.25;

/** Titoli di sezione e sottotitoli. */
export const TITLE_LINE_HEIGHT = 1.2;

export const LINE_SPACING_MIN = 0.85;
export const LINE_SPACING_MAX = 1.5;
export const LINE_SPACING_DEFAULT = 1;
export const LINE_SPACING_STEP = 0.05;

export function formatLineSpacingValue(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export function clampLineSpacing(n: number): number {
  const step = LINE_SPACING_STEP;
  const snapped = Math.round(n / step) * step;
  return Math.max(LINE_SPACING_MIN, Math.min(LINE_SPACING_MAX, snapped));
}

/** lineHeight in px per un testo con fontSize noto. */
export function liturgyLineHeight(
  fontSizePt: number,
  ratio: number,
  lineSpacing: number,
): number {
  return Math.round(fontSizePt * ratio * lineSpacing);
}

/** lineHeight corpo principale (celebra/messa). */
export function bodyLineHeight(fontSizePt: number, lineSpacing: number): number {
  return liturgyLineHeight(fontSizePt, BODY_LINE_HEIGHT, lineSpacing);
}

/** lineHeight testo liturgico delle Ore (Libre Baskerville). */
export function oreBodyLineHeight(fontSizePt: number, lineSpacing: number): number {
  return liturgyLineHeight(fontSizePt, ORE_BODY_LINE_HEIGHT, lineSpacing);
}
