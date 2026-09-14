import { getFullLiturgyByDateStr } from "../localLiturgy";
import { nextDates, saveLiturgy } from "../offlineCache";
import type { PrefetchProgress } from "../api";
import { fetchDayHours } from "./scraper";
import { hoursLookComplete } from "./cache";
import { pruneOldHours } from "./cache";

export type { PrefetchProgress };

export async function prefetchMassAndHours(
  days = 10,
  onProgress?: (p: PrefetchProgress) => void,
  opts?: { includeHours?: boolean },
): Promise<PrefetchProgress> {
  const includeHours = opts?.includeHours !== false;
  const dates = nextDates(days);
  const prog: PrefetchProgress = { total: dates.length, done: 0, failed: [] };
  await pruneOldHours();
  for (const d of dates) {
    prog.current = d;
    onProgress?.(prog);
    let massOk = false;
    let hoursOk = !includeHours;
    try {
      const data = await getFullLiturgyByDateStr(d);
      if (data && Array.isArray(data.readings) && data.readings.length > 0) {
        await saveLiturgy(d, data);
        massOk = true;
      }
      if (includeHours) {
        const title = typeof data?.title === "string" ? data.title : "";
        const hours = await fetchDayHours(d, title);
        hoursOk = hoursLookComplete(hours);
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
