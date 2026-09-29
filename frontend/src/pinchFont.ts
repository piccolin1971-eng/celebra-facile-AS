/**
 * Quanto del gesto arriva al testo. 1 sarebbe «un dito, un salto» come la liturgia CEI.
 * 0,42: allargare le dita del doppio fa crescere il testo di circa il 42%.
 */
export const PINCH_GAIN = 0.42;

/** Grandezza del testo a fine gesto. Nessuna velocità: il valore è solo la distanza delle dita. */
export function fontFromPinch(base: number, scale: number, min: number, max: number): number {
  const b = Math.round(base);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const clamp = (n: number) => Math.max(lo, Math.min(hi, n));
  if (!Number.isFinite(scale) || scale <= 0) return clamp(b);
  const factor = 1 + (scale - 1) * PINCH_GAIN;
  return clamp(Math.round(b * factor));
}
