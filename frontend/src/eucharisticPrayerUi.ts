/**
 * Colori e famiglie delle Preghiere Eucaristiche (liste di scelta).
 * Stessa famiglia → stesso colore di cornice; famiglie diverse → colori distinti.
 */
export type EucharisticPrayerFamily =
  | "canone"
  | "ordinaria_ii"
  | "ordinaria_iii"
  | "ordinaria_iv"
  | "riconciliazione"
  | "varie_necessita"
  | "fanciulli"
  | "sconosciuta";

const FAMILY_ACCENT: Record<EucharisticPrayerFamily, string> = {
  canone: "#6E8796",
  ordinaria_ii: "#B85C8A",
  ordinaria_iii: "#4DA8DA",
  ordinaria_iv: "#C9A227",
  riconciliazione: "#9B7BB8",
  varie_necessita: "#5A8F7A",
  fanciulli: "#D97B4A",
  sconosciuta: "#6A7F8E",
};

/** Famiglia liturgica della preghiera (per raggruppare i colori). */
export function eucharisticPrayerFamily(id: string): EucharisticPrayerFamily {
  if (id === "pe1") return "canone";
  if (id === "pe2") return "ordinaria_ii";
  if (id === "pe3") return "ordinaria_iii";
  if (id === "pe4") return "ordinaria_iv";
  if (id.startsWith("per_r")) return "riconciliazione";
  if (id.startsWith("pvn_")) return "varie_necessita";
  if (id.startsWith("pe_fanciulli")) return "fanciulli";
  return "sconosciuta";
}

/** Colore cornice del tasto/card per id preghiera. */
export function eucharisticPrayerAccentColor(id: string): string {
  return FAMILY_ACCENT[eucharisticPrayerFamily(id)];
}

/** Etichetta famiglia (solo per le raccolte speciali). */
export function eucharisticPrayerFamilyLabel(id: string): string | null {
  switch (eucharisticPrayerFamily(id)) {
    case "riconciliazione":
      return "Riconciliazione";
    case "varie_necessita":
      return "Varie necessità";
    case "fanciulli":
      return "Fanciulli";
    default:
      return null;
  }
}
