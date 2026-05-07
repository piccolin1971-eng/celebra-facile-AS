/**
 * Font family management.
 *
 * 5 opzioni offerte all'utente:
 *  - "system"   → font di sistema (default)
 *  - "atkinson" → Atkinson Hyperlegible (disegnato per ipovisione)
 *  - "lora"     → Lora (serif moderno per lettura schermo)
 *  - "varela"   → Varela Round (sans morbido, lettere arrotondate)
 *  - "patrick"  → Patrick Hand (calligrafico/scritto a mano)
 *
 * Ogni opzione carica il font Regular (peso 400). Per i bold (consacrazione,
 * dossologia in maiuscolo, ecc.) si usa fontWeight: "700"/"800" con il font
 * famiglia di base — React Native/Expo gestisce automaticamente il fallback.
 */
export type FontFamilyId =
  | "system"
  | "atkinson"
  | "lora"
  | "varela"
  | "patrick";

export const FONT_OPTIONS: {
  id: FontFamilyId;
  label: string;
  description: string;
  family: string | undefined; // string da passare a `fontFamily` o undefined per system
  sample: string;
}[] = [
  {
    id: "system",
    label: "Sistema",
    description: "Carattere di default del dispositivo",
    family: undefined,
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    description: "Consigliato per ipovisione (Braille Institute)",
    family: "AtkinsonHyperlegible_400Regular",
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "lora",
    label: "Lora",
    description: "Serif moderno, ideale per lettura su schermo",
    family: "Lora_400Regular",
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "varela",
    label: "Varela Round",
    description: "Sans morbido, lettere arrotondate e amichevoli",
    family: "VarelaRound_400Regular",
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "patrick",
    label: "Patrick Hand",
    description: "Stile manoscritto, sapore di appunti a mano",
    family: "PatrickHand_400Regular",
    sample: "Padre nostro, che sei nei cieli",
  },
];

export function getFontFamilyString(id: FontFamilyId): string | undefined {
  const opt = FONT_OPTIONS.find((o) => o.id === id);
  return opt?.family;
}
