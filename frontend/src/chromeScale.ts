/** Da questa dimensione in su i tasti A−/A+, luce e auto scroll crescono. */
export const CHROME_SCALE_FROM = 25;

/**
 * 1 fino a 25. Oltre, metà della crescita del testo rispetto a 25:
 * a 55 (testo ×2,2) i tasti sono ×1,6.
 */
export function chromeScale(fontSize: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= CHROME_SCALE_FROM) return 1;
  return 1 + 0.5 * (fontSize / CHROME_SCALE_FROM - 1);
}
