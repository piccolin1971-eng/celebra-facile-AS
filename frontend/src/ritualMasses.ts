/**
 * Catalogo «Messe votive e rituali»: votive generiche + defunti A–D +
 * anniversario matrimonio A/B/C. Tutte con flusso tipo «Celebra subito».
 */
import type { Liturgy } from "./api";
import ritualMassesData from "./data/ritualMasses.json";
import votiveMassesData from "./data/votiveMasses.json";
import {
  applyVotiveMassToLiturgy,
  getVotiveMassDefaultChoices,
  resolveVotivePrefaceId,
  type VotiveMassFull,
} from "./votiveLiturgy";
import { DEFAULT_PRAYER_ID } from "./defaultMassSession";
import {
  saveVotiveSession,
  loadVotiveSession,
  DEFAULT_CONGEDO_ID,
  type MassSession,
} from "./massSession";

export type RitualPeKind = "defunti" | "matrimonio" | "generico";

export type RitualMass = VotiveMassFull & {
  family: "votive" | "defunti" | "matrimonio_anniversario";
  formula: string;
  shortLabel: string;
  orazionale_id?: string;
  showGloria?: boolean;
  peKind: RitualPeKind;
  rubric?: string;
};

/** Votive storiche sostituite dai formulari rituali dedicati. */
export const VOTIVE_IDS_REPLACED_BY_RITUAL = new Set(["defunti", "sposi"]);

const RITUALS = ritualMassesData as RitualMass[];

const VOTIVE_AS_RITUAL: RitualMass[] = (votiveMassesData as VotiveMassFull[])
  .filter((m) => !VOTIVE_IDS_REPLACED_BY_RITUAL.has(m.id))
  .map((m) => ({
    ...m,
    family: "votive" as const,
    formula: "",
    shortLabel: m.title,
    peKind: "generico" as const,
    orazionale_id: undefined,
    showGloria: undefined,
  }));

const ALL_QUICK: RitualMass[] = [...VOTIVE_AS_RITUAL, ...RITUALS];

export function isRitualMassId(id: string | null | undefined): boolean {
  if (!id) return false;
  return RITUALS.some((m) => m.id === id);
}

export function isQuickMassId(id: string | null | undefined): boolean {
  if (!id) return false;
  return ALL_QUICK.some((m) => m.id === id);
}

export function getRitualMass(id: string): RitualMass | undefined {
  return RITUALS.find((m) => m.id === id);
}

/** Formulario votivo o rituale del catalogo unificato. */
export function getQuickMass(id: string): RitualMass | undefined {
  return ALL_QUICK.find((m) => m.id === id);
}

export function listRitualMasses(): RitualMass[] {
  return RITUALS;
}

export function listRitualFamilies(): {
  id: RitualMass["family"];
  title: string;
  masses: RitualMass[];
}[] {
  return [
    {
      id: "votive",
      title: "Messe votive",
      masses: VOTIVE_AS_RITUAL,
    },
    {
      id: "defunti",
      title: "Per i fedeli defunti",
      masses: RITUALS.filter((m) => m.family === "defunti"),
    },
    {
      id: "matrimonio_anniversario",
      title: "Anniversario del Matrimonio",
      masses: RITUALS.filter((m) => m.family === "matrimonio_anniversario"),
    },
  ];
}

export function ritualPeSelections(
  peKind: RitualPeKind,
  prayerId: string,
): Record<string, string> {
  if (peKind === "generico") return {};
  if (peKind === "defunti") {
    if (prayerId === "pe3") {
      return { communicantes: "ordinario", rito: "nessuno", memoria_defunti: "defunti" };
    }
    return { communicantes: "ordinario", rito: "defunti" };
  }
  return { communicantes: "ordinario", rito: "matrimonio" };
}

export function ritualAllowedPrayerIds(peKind: RitualPeKind): string[] | null {
  if (peKind === "generico") return null; // tutte le PE
  return ["pe2", "pe3"];
}

/** Prefazi ammessi per defunti / matrimonio; `null` = catalogo completo (votive generiche). */
export function filterPrefacesForRitualPeKind<T extends { id: string; title: string; category?: string; season?: string }>(
  prefaces: T[],
  peKind: RitualPeKind | undefined | null,
): T[] | null {
  if (!peKind || peKind === "generico") return null;
  if (peKind === "defunti") {
    return prefaces.filter((p) => p.category === "defunti" || p.season === "defunti");
  }
  const re = /matrimonio|alleanza nuziale/i;
  return prefaces.filter((p) => re.test(p.id) || re.test(p.title));
}

export function ritualPrefaceRestrictLabel(peKind: RitualPeKind | undefined | null): string | null {
  if (peKind === "defunti") return "Prefazi dei defunti";
  if (peKind === "matrimonio") return "Prefazi del Matrimonio";
  return null;
}

export function buildRitualMassSession(mass: RitualMass): MassSession {
  const prayerId = DEFAULT_PRAYER_ID;
  const isGenerico = mass.peKind === "generico";
  const choices = isGenerico
    ? getVotiveMassDefaultChoices(mass)
    : {
        prefaceId: mass.preface_id,
        orazionaleId: mass.orazionale_id,
        showGloria: mass.showGloria === true,
        showCredo: false,
        showOrazionalePray: true,
        penitentialSeason: "ordinario",
      };
  const prefaceId = isGenerico
    ? resolveVotivePrefaceId(mass.preface_id) || mass.preface_id
    : mass.preface_id;

  return {
    celebrationMode: "calendar_day",
    liturgyKind: "votive",
    votiveId: mass.id,
    liturgyTitle: mass.title,
    prepSource: "subito",
    showGloria: choices.showGloria,
    showCredo: choices.showCredo ?? false,
    showAntifone: true,
    showOrazionalePray: choices.showOrazionalePray ?? true,
    selectedOrazionaleId: choices.orazionaleId || mass.orazionale_id,
    selectedPrefaceId: prefaceId,
    selectedPrayerId: prayerId,
    benedizioneId: "A",
    congedoId: DEFAULT_CONGEDO_ID,
    acclamationId: "A",
    padreNostroIntroId: "I",
    useSolemnBlessing: false,
    penitentialForm: "A",
    penitentialSeason: choices.penitentialSeason || "ordinario",
    selectedCredoId: "apostolico",
    orateFratresId: "A",
    peSelections: ritualPeSelections(mass.peKind, prayerId),
    useOrazionePopolo: false,
    useSaintProperReadings: false,
  };
}

/** Crea (o ripara) la sessione subito per un formulario del catalogo. */
export async function ensureRitualCelebrateSession(ritualId: string): Promise<MassSession> {
  const mass = getQuickMass(ritualId);
  if (!mass) throw new Error(`Formulario sconosciuto: ${ritualId}`);
  const fresh = buildRitualMassSession(mass);
  const existing = await loadVotiveSession(ritualId);
  if (existing?.prepSource === "subito" && existing.selectedPrefaceId) {
    const peId =
      mass.peKind === "generico"
        ? existing.selectedPrayerId || DEFAULT_PRAYER_ID
        : existing.selectedPrayerId === "pe2" || existing.selectedPrayerId === "pe3"
          ? existing.selectedPrayerId
          : DEFAULT_PRAYER_ID;
    const repaired: MassSession = {
      ...existing,
      liturgyKind: "votive",
      votiveId: mass.id,
      liturgyTitle: mass.title,
      prepSource: "subito",
      // Campi strutturali del formulario: sempre allineati al catalogo
      selectedPrefaceId: fresh.selectedPrefaceId || existing.selectedPrefaceId,
      selectedOrazionaleId: fresh.selectedOrazionaleId || existing.selectedOrazionaleId,
      showGloria: fresh.showGloria,
      showCredo: fresh.showCredo,
      showOrazionalePray: fresh.showOrazionalePray,
      useSaintProperReadings: false,
      selectedPrayerId: peId,
      peSelections:
        mass.peKind === "generico"
          ? existing.peSelections || {}
          : ritualPeSelections(mass.peKind, peId),
    };
    const changed =
      repaired.selectedOrazionaleId !== existing.selectedOrazionaleId ||
      repaired.selectedPrefaceId !== existing.selectedPrefaceId ||
      repaired.showGloria !== existing.showGloria ||
      repaired.showCredo !== existing.showCredo ||
      repaired.showOrazionalePray !== existing.showOrazionalePray ||
      repaired.useSaintProperReadings !== existing.useSaintProperReadings ||
      repaired.selectedPrayerId !== existing.selectedPrayerId ||
      JSON.stringify(repaired.peSelections || {}) !== JSON.stringify(existing.peSelections || {}) ||
      repaired.liturgyTitle !== existing.liturgyTitle;
    if (changed) await saveVotiveSession(ritualId, repaired);
    return repaired;
  }
  await saveVotiveSession(ritualId, fresh);
  return fresh;
}

export function applyRitualMassToLiturgy(base: Liturgy, mass: RitualMass): Liturgy {
  return applyVotiveMassToLiturgy(base, mass);
}

/** @deprecated tab Calendario votive rimossa: tutte in Messe votive e rituali. */
export function filterGenericVotiveMasses<T extends { id: string }>(_masses: T[]): T[] {
  return [];
}
