import { addDays, localDateStr, parseLocalDate } from "../dateUtils";
import { isFirstVespersEve } from "./titles";
import type { OreHourId } from "./types";

/** Data per colore liturgico in Ore (Primi vespri → giorno festivo). */
export function oreLiturgicalColorDateISO(dateISO: string, hour: OreHourId): string {
  const d = parseLocalDate(dateISO);
  if ((hour === "vespri" || hour === "compieta") && isFirstVespersEve(d)) {
    return localDateStr(addDays(d, 1));
  }
  return dateISO;
}
