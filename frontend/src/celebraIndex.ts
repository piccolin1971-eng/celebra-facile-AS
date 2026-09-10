/**
 * Indice «Celebra subito»: voci e matching alle macro-pagine di /celebra.
 */
import type { MassSession } from "./massSession";

export type CelebraSectionId =
  | "riti_iniziali"
  | "atto_penitenziale"
  | "gloria"
  | "colletta"
  | "letture"
  | "credo"
  | "fedeli"
  | "offertorio"
  | "sulle_offerte"
  | "prefazio"
  | "pe"
  | "padre_nostro_pace"
  | "dopo_comunione";

export type CelebraIndexItem = {
  id: CelebraSectionId;
  label: string;
  /** Titolo sezione cercato nelle macro-pagine di Celebra */
  matchTitle: RegExp;
  kind?: "preface" | "pe" | "plain";
};

const ALL_ITEMS: CelebraIndexItem[] = [
  { id: "riti_iniziali", label: "Riti iniziali", matchTitle: /^riti di introduzione$/i },
  { id: "atto_penitenziale", label: "Atto penitenziale", matchTitle: /^atto penitenziale$/i },
  { id: "gloria", label: "Gloria", matchTitle: /^gloria$/i },
  { id: "colletta", label: "Colletta", matchTitle: /^colletta$/i },
  { id: "letture", label: "Letture", matchTitle: /^liturgia della parola$/i },
  { id: "credo", label: "Credo", matchTitle: /^professione di fede$/i },
  { id: "fedeli", label: "Preghiera dei fedeli", matchTitle: /^preghiera dei fedeli$/i },
  { id: "offertorio", label: "Offertorio", matchTitle: /^presentazione dei doni$/i },
  { id: "sulle_offerte", label: "Sulle offerte", matchTitle: /^sulle offerte$/i },
  {
    id: "prefazio",
    label: "Prefazio",
    matchTitle: /^prefazio$/i,
    kind: "preface",
  },
  {
    id: "pe",
    label: "Preghiera eucaristica",
    matchTitle: /^preghiera eucaristica$/i,
    kind: "pe",
  },
  {
    id: "padre_nostro_pace",
    label: "Padre nostro e pace",
    matchTitle: /^padre nostro$/i,
  },
  { id: "dopo_comunione", label: "Dopo la Comunione / Fine", matchTitle: /^dopo la comunione$/i },
];

/** Azzurro «Letture» e azzurro ghiaccio, più distanti tra loro. */
export const CELEBRA_INDEX_BLUE = "#4DA8DA";
export const CELEBRA_INDEX_BLUE_LIGHT = "#B8E6FA";

/** Cornice colorata per tasto indice (bianco su nero, bordo spesso). */
const INDEX_ACCENT_BY_ID: Record<CelebraSectionId, string> = {
  riti_iniziali: "#6E8796",
  atto_penitenziale: "#857794",
  gloria: "#6E8796",
  colletta: "#5A8F7A",
  letture: CELEBRA_INDEX_BLUE,
  credo: "#857794",
  fedeli: "#6A7F8E",
  offertorio: "#7A9E6E",
  sulle_offerte: "#9A8B5C",
  prefazio: "#C9A227",
  pe: "#B85C8A",
  padre_nostro_pace: "#6A7F8E",
  dopo_comunione: "#5A8282",
};

/** Colore cornice del tasto indice per sezione. */
export function celebraIndexAccentBySectionId(id: CelebraSectionId): string {
  return INDEX_ACCENT_BY_ID[id];
}

/** Azzurro letture / azzurro più chiaro, a seconda della posizione in lista. */
export function celebraIndexAccentByOrder(index: number): string {
  return index % 2 === 0 ? CELEBRA_INDEX_BLUE : CELEBRA_INDEX_BLUE_LIGHT;
}

/** Titolo corto per sottotitolo indice: senza descrizione dopo « - ». */
export function shortPrefaceLabel(title: string | null | undefined): string {
  if (!title) return "";
  const cut = title.split(/\s+[-–—]\s+/)[0]?.trim() || title.trim();
  return cut;
}

/** Voci visibili in base ai toggle della sessione. */
export function buildCelebraIndexItems(session: MassSession | null | undefined): CelebraIndexItem[] {
  return ALL_ITEMS.filter((item) => {
    if (item.id === "gloria") return session?.showGloria === true;
    if (item.id === "credo") return session?.showCredo === true;
    if (item.id === "fedeli") {
      return session?.showOrazionalePray === true && !!session?.selectedOrazionaleId;
    }
    return true;
  });
}

export function parseCelebraSectionId(raw: unknown): CelebraSectionId | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return null;
  return ALL_ITEMS.some((i) => i.id === s) ? (s as CelebraSectionId) : null;
}

type TitleSeg = { kind: string; text: string };

/** Indice macro-pagina che contiene il titolo della sezione (o -1). */
export function findCelebraSectionPageIndex(
  pages: TitleSeg[][],
  sectionId: CelebraSectionId,
): number {
  const item = ALL_ITEMS.find((i) => i.id === sectionId);
  if (!item) return -1;
  for (let i = 0; i < pages.length; i++) {
    const hit = pages[i].some(
      (seg) =>
        (seg.kind === "sectionTitle" ||
          seg.kind === "sectionTitleBreak" ||
          seg.kind === "orazioneTitle" ||
          seg.kind === "readingTitle") &&
        item.matchTitle.test((seg.text || "").trim()),
    );
    if (hit) return i;
  }
  // Prefazio incorporato nella PE: vai alla PE
  if (sectionId === "prefazio") {
    return findCelebraSectionPageIndex(pages, "pe");
  }
  return -1;
}
