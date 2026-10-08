import { getFullLiturgyByDateStr } from "../localLiturgy";
import { nextDates, pruneOldLiturgies, saveLiturgy } from "../offlineCache";
import type { PrefetchProgress } from "../api";
import { sleepMs } from "../fetchRetry";
import { fetchDayHours } from "./scraper";
import { hoursLookComplete, pruneOldHours } from "./cache";

export type { PrefetchProgress };

async function fetchMassOnce(dateISO: string): Promise<any | null> {
  try {
    const data = await getFullLiturgyByDateStr(dateISO);
    if (data && Array.isArray(data.readings) && data.readings.length > 0) return data;
  } catch (e) {
    console.log(`prefetch mass ${dateISO}:`, e);
  }
  return null;
}

export async function prefetchMassAndHours(
  days = 10,
  onProgress?: (p: PrefetchProgress) => void,
  opts?: { includeHours?: boolean },
): Promise<PrefetchProgress> {
  const includeHours = opts?.includeHours !== false;
  const dates = nextDates(days);
  const prog: PrefetchProgress = { total: dates.length, done: 0, failed: [] };
  await Promise.all([pruneOldHours(), pruneOldLiturgies(3)]);
  for (const d of dates) {
    prog.current = d;
    onProgress?.(prog);
    let massOk = false;
    let hoursOk = !includeHours;
    let data: any = null;
    try {
      data = await fetchMassOnce(d);
      if (!data) {
        await sleepMs(500);
        data = await fetchMassOnce(d);
      }
      if (data) {
        await saveLiturgy(d, data);
        massOk = true;
      }
      if (includeHours) {
        const title = typeof data?.title === "string" ? data.title : "";
        let hours = await fetchDayHours(d, title);
        hoursOk = hoursLookComplete(hours);
        // Secondo passaggio: CEI a singhiozzo → ritenta; LDO completa le ore vuote.
        if (!hoursOk) {
          await sleepMs(700);
          hours = await fetchDayHours(d, title);
          hoursOk = hoursLookComplete(hours);
        }
        if (!hoursOk) {
          await sleepMs(900);
          hours = await fetchDayHours(d, title);
          hoursOk = hoursLookComplete(hours);
        }
      }
    } catch (e) {
      console.log(`prefetch mass+hours ${d}:`, e);
    }
    if (!massOk || !hoursOk) prog.failed.push(d);
    prog.done += 1;
    onProgress?.(prog);
  }
  return prog;
}
