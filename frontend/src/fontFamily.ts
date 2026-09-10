/**
 * Font family management.
 *
 * 4 opzioni offerte all'utente:
 *  - "system"      → font di sistema (default)
 *  - "atkinson"    → Atkinson Hyperlegible (ipovisione)
 *  - "lora"        → Lora (serif per lettura)
 *  - "playpen"     → Playpen Sans (manoscritto leggibile)
 *
 * Per i font personalizzati carichiamo Regular + Bold (700) così, con
 * «Grassetto» attivo, il testo resta nello stesso carattere.
 */
export type FontFamilyId =
  | "system"
  | "atkinson"
  | "lora"
  | "playpen";

export type AppFontWeight = "400" | "600" | "700" | "800";

export type ResolvedAppFont = {
  fontFamily?: string;
  fontWeight: AppFontWeight;
};

const FONT_FACES: Record<
  Exclude<FontFamilyId, "system">,
  { regular: string; bold?: string }
> = {
  atkinson: {
    regular: "AtkinsonHyperlegible_400Regular",
    bold: "AtkinsonHyperlegible_700Bold",
  },
  lora: {
    regular: "Lora_400Regular",
    bold: "Lora_700Bold",
  },
  playpen: {
    regular: "PlaypenSans_400Regular",
    bold: "PlaypenSans_700Bold",
  },
};

export const FONT_OPTIONS: {
  id: FontFamilyId;
  label: string;
  description: string;
  family: string | undefined;
  supportsNativeBold: boolean;
  sample: string;
}[] = [
  {
    id: "system",
    label: "Sistema",
    description: "Carattere di default del dispositivo",
    family: undefined,
    supportsNativeBold: true,
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    description: "Consigliato per ipovisione (Braille Institute)",
    family: "AtkinsonHyperlegible_400Regular",
    supportsNativeBold: true,
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "lora",
    label: "Lora",
    description: "Serif moderno, ideale per lettura su schermo",
    family: "Lora_400Regular",
    supportsNativeBold: true,
    sample: "Padre nostro, che sei nei cieli",
  },
  {
    id: "playpen",
    label: "Playpen Sans",
    description: "Scrittura a mano naturale, ottima per testi lunghi",
    family: "PlaypenSans_400Regular",
    supportsNativeBold: true,
    sample: "Padre nostro, che sei nei cieli",
  },
];

export function getFontFamilyString(id: FontFamilyId): string | undefined {
  if (id === "system") return undefined;
  return FONT_FACES[id].regular;
}

export function fontSupportsNativeBold(id: FontFamilyId): boolean {
  if (id === "system") return true;
  return !!FONT_FACES[id].bold;
}

/** Corpo del testo liturgico (rispetta l'interruttore Grassetto). */
export function resolveBodyFont(id: FontFamilyId, isBold: boolean): ResolvedAppFont {
  return resolveAppFont(id, isBold ? "bold" : "regular");
}

/** Titoli e enfasi (sempre più spessi del corpo). */
export function resolveHeadingFont(id: FontFamilyId): ResolvedAppFont {
  return resolveAppFont(id, "heavy");
}

export function resolveAppFont(
  id: FontFamilyId,
  weight: "regular" | "semibold" | "bold" | "heavy",
): ResolvedAppFont {
  if (id === "system") {
    switch (weight) {
      case "regular":
        return { fontWeight: "400" };
      case "semibold":
        return { fontWeight: "600" };
      case "bold":
        return { fontWeight: "700" };
      case "heavy":
        return { fontWeight: "800" };
    }
  }

  const faces = FONT_FACES[id];
  const useBoldFace = weight !== "regular" && !!faces.bold;

  if (useBoldFace) {
    return { fontFamily: faces.bold, fontWeight: "400" };
  }

  const syntheticWeight: AppFontWeight =
    weight === "heavy"
      ? "800"
      : weight === "semibold"
        ? "600"
        : weight === "bold"
          ? "700"
          : "400";

  return { fontFamily: faces.regular, fontWeight: syntheticWeight };
}
