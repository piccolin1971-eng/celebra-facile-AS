/** Da questa dimensione in su i tasti A−/A+, luce, auto scroll e le icone in alto crescono. */
export const CHROME_SCALE_FROM = 25;

/**
 * 1 fino a 25. Oltre, metà della crescita del testo rispetto a 25:
 * a 55 (testo ×2,2) i tasti sono ×1,6.
 */
export function chromeScale(fontSize: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= CHROME_SCALE_FROM) return 1;
  return 1 + 0.5 * (fontSize / CHROME_SCALE_FROM - 1);
}

/** Testo di default: sotto 25 la rotella tiene la misura di oggi. */
const GLYPH_FONT_BASE = 26;

/**
 * Glifo della barra (stellina, rotella). Fino a 25 segue il testo come adesso.
 * Oltre, mezza proporzione, così non esce dal bordo destro.
 */
export function topBarGlyphSize(fontSize: number, base = 40): number {
  const at = (n: number) => (base * n) / GLYPH_FONT_BASE;
  if (!Number.isFinite(fontSize) || fontSize <= CHROME_SCALE_FROM) {
    return Math.max(22, Math.round(at(Math.max(12, fontSize))));
  }
  return Math.max(22, Math.round(at(CHROME_SCALE_FROM) * chromeScale(fontSize)));
}

/** Cornice più larga del glifo: i denti della rotella non vengono tagliati. */
export function topBarGlyphBox(glyph: number): number {
  return glyph + 16;
}
