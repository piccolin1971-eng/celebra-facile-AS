import { getVigilEveContext } from "../vigilCatalog";
import type { OreHourId } from "./types";

const HOUR_FIXED: Record<Exclude<OreHourId, "vespri">, string> = {
  invitatorio: "Invitatorio",
  ufficio: "Ufficio delle letture",
  lodi: "Lodi mattutine",
  "ora-media": "Ora media",
  compieta: "Compieta",
};

export const INDEX_HOURS: OreHourId[] = [
  "invitatorio",
  "ufficio",
  "lodi",
  "ora-media",
  "vespri",
  "compieta",
];

export function isSolemnityVigilEvening(date: Date): boolean {
  return getVigilEveContext(date) != null;
}

export function vespersTitle(date: Date, solemnityVigil = isSolemnityVigilEvening(date)): string {
  if (solemnityVigil) return "Primi vespri";
  const d = date.getDay();
  if (d === 6) return "Primi vespri";
  if (d === 0) return "Secondi vespri";
  return "Vespri";
}

export function hourTitle(
  hour: OreHourId,
  date: Date,
  solemnityVigil = isSolemnityVigilEvening(date),
): string {
  if (hour === "vespri") return vespersTitle(date, solemnityVigil);
  return HOUR_FIXED[hour];
}

/** Slug CEI: sabato/vigilia → primi vespri; domenica → secondi. */
export function vespersCeiSlug(date: Date, solemnityVigil = isSolemnityVigilEvening(date)): string {
  if (solemnityVigil || date.getDay() === 6) return "primi-vespri";
  if (date.getDay() === 0) return "secondi-vespri";
  return "vespri";
}

export function complineCeiSlug(date: Date, solemnityVigil = isSolemnityVigilEvening(date)): string {
  if (solemnityVigil || date.getDay() === 6) return "compieta-dopo-i-primi-vespri";
  if (date.getDay() === 0) return "compieta-dopo-i-secondi-vespri";
  return "compieta";
}

export function ceiHourSlug(hour: OreHourId, date: Date): string {
  if (hour === "invitatorio") return "invitatorio";
  if (hour === "ufficio") return "ufficio-delle-letture";
  if (hour === "lodi") return "lodi-mattutine";
  if (hour === "ora-media") return "ora-media";
  if (hour === "vespri") return vespersCeiSlug(date);
  return complineCeiSlug(date);
}
