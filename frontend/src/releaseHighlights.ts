/**
 * Elenco sintetico per il modal «Aggiornamento disponibile» (Android).
 *
 * Chiave: `android.versionCode` della release pubblicata (GitHub / APK).
 * A ogni release: 3–6 punti in italiano, scelti insieme prima del publish.
 */
export const RELEASE_HIGHLIGHTS: Record<number, readonly string[]> = {
  // Esempio (decommentare e adattare al publish):
  // 2: [
  //   "Tema Ardesia in Impostazioni (lettura più morbida al buio)",
  //   "Correzione segni liturgici nel Salmo 94 dell’invitatorio",
  // ],
};

export function getReleaseHighlights(versionCode: number): string[] {
  const list = RELEASE_HIGHLIGHTS[versionCode];
  if (!list?.length) return [];
  return [...list];
}
