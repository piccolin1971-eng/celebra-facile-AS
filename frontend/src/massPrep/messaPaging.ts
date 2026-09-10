/** Web: true se il click è su un controllo (formula, switch, Scegli…). */
export function isWebInteractiveTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return !!(target as Element).closest(
    '[data-tap-stop="true"], button, [role="button"], [role="switch"], input, textarea, select, a, [data-testid^="btn-"]',
  );
}

/** Sezione stabile di una pagina (ignora indici tipo pe-cons-2). */
export function massPageSection(key: string): string {
  if (key.startsWith("prefazio")) return "prefazio";
  if (key === "pe" || key.startsWith("pe-")) return "pe";
  if (key.startsWith("orazionale")) return "orazionale";
  if (key.startsWith("offertorio")) return "offertorio";
  return key.replace(/-\d+$/, "");
}

/**
 * Trova la pagina da mostrare dopo un ricalcolo (font, PE, letture).
 * Mai cadere in fondo al libretto (Padre nostro) solo perché l'indice numerico è rimasto indietro.
 */
export function resolveMassPageIndex(pages: { key: string }[], key: string): number {
  if (!pages.length) return 0;
  const exact = pages.findIndex((p) => p.key === key);
  if (exact >= 0) return exact;

  const stem = key.replace(/-\d+$/, "");
  const family = pages
    .map((p, i) => ({ k: p.key, i }))
    .filter((p) => p.k === stem || p.k.startsWith(`${stem}-`));
  if (family.length) {
    const n = Number((key.match(/-(\d+)$/) || [])[1]);
    if (Number.isFinite(n)) {
      return family[Math.max(0, Math.min(n, family.length - 1))].i;
    }
    return family[0].i;
  }

  const section = massPageSection(key);
  const secIdx = pages.findIndex((p) => massPageSection(p.key) === section);
  if (secIdx >= 0) return secIdx;

  return 0;
}
