/**
 * Scelta Messa del sabato: liturgia di calendario vs liturgia che inizia nei Primi vespri
 * (domenica ordinaria o vigilia di solennità).
 */
import { addDays, localDateStr, parseLocalDate } from "./dateUtils";
import { numberedSeasonSundayTitle } from "./liturgicalDates";
import type { CelebrationMode } from "./massSession";
import { getVigilEveContext, type VigilEveContext } from "./vigilCatalog";

export type SundayEveMassContext = {
  kind: "sunday";
  eveDateISO: string;
  sundayDateISO: string;
  sundayTitle: string;
};

export type MassEveningChoiceContext = VigilEveContext | SundayEveMassContext;

export function isSundayEveMassContext(ctx: MassEveningChoiceContext): ctx is SundayEveMassContext {
  return "kind" in ctx && ctx.kind === "sunday";
}

export function eveningFestiveDateISO(ctx: MassEveningChoiceContext): string {
  return isSundayEveMassContext(ctx) ? ctx.sundayDateISO : ctx.solemnityDateISO;
}

export function eveningFestiveTitle(ctx: MassEveningChoiceContext): string {
  return isSundayEveMassContext(ctx) ? ctx.sundayTitle : ctx.solemnityTitle;
}

export function getSundayEveMassContext(date: Date): SundayEveMassContext | null {
  if (date.getDay() !== 6) return null;
  if (getVigilEveContext(date)) return null;
  const sunday = addDays(date, 1);
  if (sunday.getDay() !== 0) return null;
  const sundayDateISO = localDateStr(sunday);
  const sundayTitle = numberedSeasonSundayTitle(sunday) || "Domenica";
  return {
    kind: "sunday",
    eveDateISO: localDateStr(date),
    sundayDateISO,
    sundayTitle,
  };
}

export function getMassEveningChoiceContext(date: Date): MassEveningChoiceContext | null {
  const vigil = getVigilEveContext(date);
  if (vigil) return vigil;
  return getSundayEveMassContext(date);
}

export function getMassEveningChoiceContextForISO(dateISO: string): MassEveningChoiceContext | null {
  return getMassEveningChoiceContext(parseLocalDate(dateISO));
}

/** Dalle 16:00 (locale) il sabato si propone la Messa dei Primi vespri. */
export const SATURDAY_EVENING_DEFAULT_HOUR = 16;

export function isSaturdayEveningDefaultWindow(date: Date, now: Date = new Date()): boolean {
  if (date.getDay() !== 6) return false;
  if (localDateStr(now) !== localDateStr(date)) return false;
  return now.getHours() >= SATURDAY_EVENING_DEFAULT_HOUR;
}

const PANEL_MODE_ORDER: CelebrationMode[] = [
  "calendar_day",
  "vigil_proper",
  "solemnity_day",
  "sunday_day",
];

export function availableEveningCelebrationModes(
  ctx: MassEveningChoiceContext,
): CelebrationMode[] {
  if (isSundayEveMassContext(ctx)) {
    return ["calendar_day", "sunday_day"];
  }
  const modes: CelebrationMode[] = ["calendar_day"];
  if (ctx.hasVigilProper) modes.push("vigil_proper");
  else modes.push("solemnity_day");
  return modes.sort((a, b) => PANEL_MODE_ORDER.indexOf(a) - PANEL_MODE_ORDER.indexOf(b));
}

export function coerceEveningCelebrationMode(
  mode: CelebrationMode,
  ctx: MassEveningChoiceContext | null,
): CelebrationMode {
  if (!ctx) return "calendar_day";
  const available = availableEveningCelebrationModes(ctx);
  return available.includes(mode) ? mode : "calendar_day";
}

export function defaultCelebrationModeForDate(
  date: Date,
  ctx: MassEveningChoiceContext | null,
  now: Date = new Date(),
): CelebrationMode {
  if (!ctx) return "calendar_day";
  if (!isSaturdayEveningDefaultWindow(date, now)) return "calendar_day";
  if (isSundayEveMassContext(ctx)) return "sunday_day";
  if (ctx.hasVigilProper) return "vigil_proper";
  return "solemnity_day";
}

/** Modalità serale (non calendar_day) per sabato dopo le 16 o se già preparata. */
export function preferredEveningCelebrationMode(
  ctx: MassEveningChoiceContext,
): CelebrationMode {
  if (isSundayEveMassContext(ctx)) return "sunday_day";
  if (ctx.hasVigilProper) return "vigil_proper";
  return "solemnity_day";
}
