/**
 * Elenco sintetico per il modal «Aggiornamento disponibile» (Android).
 *
 * Chiave: `android.versionCode` della release pubblicata (GitHub / APK).
 * In CI coincide con `GITHUB_RUN_NUMBER` (es. v1.0.63 → 63).
 * A ogni release: 3–6 punti in italiano, scelti insieme prima del publish.
 */
export const RELEASE_HIGHLIGHTS: Record<number, readonly string[]> = {
  // Prossima release unica dopo commit+push (run CI 63 se il 62 è annullato).
  63: [
    "Tre nuovi temi in Impostazioni → Tema: Pesca, Blu notte e Notte morbida.",
    "La finestra di aggiornamento mostra l’elenco delle novità di questa versione.",
    "Correzione bug minori.",
  ],
};

export function getReleaseHighlights(versionCode: number): string[] {
  const list = RELEASE_HIGHLIGHTS[versionCode];
  if (!list?.length) return [];
  return [...list];
}
