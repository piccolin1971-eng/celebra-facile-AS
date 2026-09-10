/**
 * Sessione liturgica di default (Gloria/Credo/prefazio/PE II, ecc.)
 * allineata a «Scegli la liturgia» quando non c'è ancora una preparazione.
 */
import { api, type Liturgy, type Preface, type SolemnBlessing } from "./api";
import { liturgyTitleForMode } from "./celebrationModeLabels";
import { getMassToggleDefaults } from "./massToggleDefaults";
import {
  loadSession,
  saveSession,
  type CelebrationMode,
  type MassSession,
  DEFAULT_CONGEDO_ID,
} from "./massSession";
import { suggestPrayerForLiturgy } from "./orazionale";
import { getLiturgicalSeasonKey, getSuggestedPrefacesForLiturgy } from "./prefaceUtils";
import { getVigilEveContextForISO, type VigilEveContext } from "./vigilCatalog";

export const DEFAULT_PRAYER_ID = "pe2";

export function buildDefaultMassSession(args: {
  liturgy: Liturgy;
  mode: CelebrationMode;
  prefaces: Preface[];
  solemnBlessings: SolemnBlessing[];
  vigilEve: VigilEveContext | null;
}): MassSession {
  const { liturgy, mode, prefaces, solemnBlessings, vigilEve } = args;
  const seasonKey = getLiturgicalSeasonKey(liturgy?.season?.season || "");
  const penitentialSeason = seasonKey === "passione" ? "quaresima" : seasonKey;
  const suggested = getSuggestedPrefacesForLiturgy(prefaces, liturgy);
  const preface = suggested[0] || prefaces[0];
  const toggleDefaults = getMassToggleDefaults(liturgy);
  const suggestedOrId = suggestPrayerForLiturgy(liturgy);
  const seasBless =
    solemnBlessings.find((b) => b.id === seasonKey) ||
    solemnBlessings.find((b) => b.season === seasonKey);
  const liturgyTitle = liturgyTitleForMode(mode, liturgy.title || "", vigilEve);

  return {
    celebrationMode: mode,
    liturgyKind: "calendar",
    liturgyTitle,
    showGloria: toggleDefaults.showGloria,
    showCredo: toggleDefaults.showCredo,
    showAntifone: false,
    showOrazionalePray: toggleDefaults.showOrazionalePray,
    selectedOrazionaleId: suggestedOrId,
    selectedPrefaceId: preface?.id,
    selectedPrayerId: DEFAULT_PRAYER_ID,
    benedizioneId: "A",
    congedoId: seasonKey === "pasqua" ? "pasqua_alleluia" : DEFAULT_CONGEDO_ID,
    acclamationId: "A",
    padreNostroIntroId: "I",
    useSolemnBlessing: false,
    solemnBlessingId: seasBless?.id,
    penitentialForm: "A",
    penitentialSeason,
    selectedCredoId: "niceno",
    orateFratresId: "A",
    peSelections: {},
    useOrazionePopolo: false,
    useSaintProperReadings: false,
  };
}

/** Se manca una sessione per data+modo, la crea con i default del giorno. Non sovrascrive. */
export async function ensureQuickCelebrateSession(
  dateISO: string,
  mode: CelebrationMode,
): Promise<MassSession> {
  const existing = await loadSession(dateISO, mode);
  if (existing) return existing;

  const [lit, pr, bless] = await Promise.all([
    api.liturgyForDate(dateISO, mode),
    api.prefaces(),
    api.solemnBlessings(),
  ]);
  const session = buildDefaultMassSession({
    liturgy: lit,
    mode,
    prefaces: pr.prefaces,
    solemnBlessings: bless.blessings || [],
    vigilEve: getVigilEveContextForISO(dateISO),
  });
  await saveSession(dateISO, mode, session);
  return session;
}
