/**
 * Elenco sintetico per il modal «Aggiornamento disponibile» (Android).
 *
 * Fonte: `src/data/release-highlights.json` (in CI finisce anche in version.json remoto).
 * Chiave: `android.versionCode` (= GITHUB_RUN_NUMBER, es. 63 → "63").
 * A ogni release: 3–6 punti in italiano, scelti insieme prima del push.
 */
import highlightsByCode from "./data/release-highlights.json";

export const RELEASE_HIGHLIGHTS: Record<number, readonly string[]> = Object.fromEntries(
  Object.entries(highlightsByCode).map(([code, lines]) => [Number(code), lines as readonly string[]]),
);

export function getReleaseHighlights(versionCode: number): string[] {
  const list = RELEASE_HIGHLIGHTS[versionCode];
  if (!list?.length) return [];
  return [...list];
}
