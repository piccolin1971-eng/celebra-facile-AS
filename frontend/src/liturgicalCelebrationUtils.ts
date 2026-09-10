/**
 * Regole condivise per memorie facoltative.
 * Fonte autorevole: chiesacattolica.it — solo «MEMORIA FACOLTATIVA» esplicita nel titolo CEI.
 */
export function shouldSuppressFacultativeMemory(
  ceiTitle: string,
  _seasonName?: string,
  _date?: Date,
): boolean {
  return /\bmemoria\s+facoltativa\b/i.test((ceiTitle || "").trim());
}
