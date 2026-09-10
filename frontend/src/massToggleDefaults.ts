/**
 * Default per Gloria / Credo / Preghiera dei fedeli in base al giorno liturgico.
 * L'utente può sempre sovrascrivere con gli switch in Scegli la liturgia.
 */
import { parseLocalDate } from "./dateUtils";
import { getLiturgicalSeasonKey, LiturgyLike } from "./prefaceUtils";
import { parseBannerCelebration } from "./homeBannerUtils";
import { getVigilEveContext } from "./vigilCatalog";
import type { CelebrationMode } from "./massSession";

export type MassToggleDefaults = {
  showGloria: boolean;
  showCredo: boolean;
  showOrazionalePray: boolean;
};

function contextDateForToggles(liturgy: LiturgyLike): Date {
  const dateStr = liturgy.date;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date();
  const vigilDate = parseLocalDate(dateStr);
  const mode = (liturgy as { celebrationMode?: CelebrationMode }).celebrationMode;
  if (mode && mode !== "calendar_day") {
    const vigilEve = getVigilEveContext(vigilDate);
    if (vigilEve) return parseLocalDate(vigilEve.solemnityDateISO);
  }
  return vigilDate;
}

function isSunday(liturgy: LiturgyLike): boolean {
  return contextDateForToggles(liturgy).getDay() === 0;
}

function celebrationRankLabel(liturgy: LiturgyLike): string {
  const date = contextDateForToggles(liturgy);
  return parseBannerCelebration(
    liturgy.title,
    liturgy.season?.season || "",
    date,
  ).rankLabel;
}

function isSolemnity(liturgy: LiturgyLike): boolean {
  if (celebrationRankLabel(liturgy) === "Solennità") return true;
  return (liturgy.saints || []).some((s) => s.rank === "solennita");
}

function isFesta(liturgy: LiturgyLike): boolean {
  if (celebrationRankLabel(liturgy) === "Festa") return true;
  return (liturgy.saints || []).some((s) => s.rank === "festa");
}

/**
 * Regole:
 * - Domenica ordinaria → Gloria, Credo, Preghiera fedeli ON
 * - Feria → tutti OFF
 * - Festa in feria → Gloria ON (no Avvento), Credo OFF, Preghiera ON
 * - Festa in feria in Avvento → Gloria OFF
 * - Festa in feria in Quaresima → Gloria ON
 * - Avvento/Quaresima → Gloria OFF (salvo solennità/festa in Quaresima)
 * - Solennità → Gloria ON (no Avvento in feria), Credo ON, Preghiera ON
 */
export function getMassToggleDefaults(
  liturgy: LiturgyLike | null | undefined,
): MassToggleDefaults {
  if (!liturgy) {
    return { showGloria: false, showCredo: false, showOrazionalePray: false };
  }

  const seasonKey = getLiturgicalSeasonKey(liturgy.season?.season || "");
  const sunday = isSunday(liturgy);
  const solemnity = isSolemnity(liturgy);
  const festa = !sunday && !solemnity && isFesta(liturgy);
  const feria = !sunday && !solemnity && !festa;

  const showCredo = sunday || solemnity;
  const showOrazionalePray = !feria;

  let showGloria: boolean;
  if (sunday || solemnity) {
    if (seasonKey === "avvento") {
      showGloria = solemnity;
    } else if (seasonKey === "quaresima") {
      showGloria = solemnity || festa;
    } else {
      showGloria = true;
    }
  } else if (festa) {
    // Festa in feria: Gloria ON tranne in Avvento; in Quaresima ON.
    showGloria = seasonKey !== "avvento";
  } else {
    showGloria = false;
  }

  return { showGloria, showCredo, showOrazionalePray };
}
