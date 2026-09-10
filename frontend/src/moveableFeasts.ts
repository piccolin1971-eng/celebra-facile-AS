/**
 * Feste mobili CEI (Italia: Ascensione e Corpus Domini alla domenica).
 * Foglia: solo date liturgiche, senza scraper né vigilie.
 */
import { addDays, localDateStr } from "./dateUtils";
import { computeEasterSunday, firstAdventSunday } from "./liturgicalDates";

export type MoveableFeast = { title: string; rank: string; color: string };

export function getMoveableFeastsForYear(year: number): Map<string, MoveableFeast> {
  const easter = computeEasterSunday(year);
  const map = new Map<string, MoveableFeast>();

  const put = (date: Date, feast: MoveableFeast) => {
    map.set(localDateStr(date), feast);
  };

  put(addDays(easter, -46), {
    title: "Mercoledì delle Ceneri",
    rank: "solennita",
    color: "viola",
  });
  put(addDays(easter, -7), {
    title: "Domenica delle Palme — Passione del Signore",
    rank: "solennita",
    color: "rosso",
  });
  put(easter, {
    title: "Domenica di Pasqua — Risurrezione del Signore",
    rank: "solennita",
    color: "bianco",
  });
  put(addDays(easter, 42), {
    title: "Ascensione del Signore",
    rank: "solennita",
    color: "bianco",
  });
  put(addDays(easter, 49), {
    title: "Pentecoste",
    rank: "solennita",
    color: "rosso",
  });
  put(addDays(easter, 56), {
    title: "Santissima Trinità",
    rank: "solennita",
    color: "bianco",
  });
  put(addDays(easter, 63), {
    title: "Solennità del Corpo e Sangue del Signore",
    rank: "solennita",
    color: "bianco",
  });
  put(addDays(easter, 68), {
    title: "Sacratissimo Cuore di Gesù",
    rank: "solennita",
    color: "bianco",
  });

  put(addDays(firstAdventSunday(year), -7), {
    title: "Gesù Cristo, Re dell'universo",
    rank: "solennita",
    color: "bianco",
  });

  return map;
}
