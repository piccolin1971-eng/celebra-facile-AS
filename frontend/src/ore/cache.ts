import AsyncStorage from "@react-native-async-storage/async-storage";
import { nextDates, loadLiturgy } from "../offlineCache";
import type { DayHoursCache, MediaId, OreHourId } from "./types";

const PREFIX = "ore_day_v4_";

function key(date: string): string {
  return `${PREFIX}${date}`;
}

export async function saveDayHours(data: DayHoursCache): Promise<void> {
  try {
    await AsyncStorage.setItem(key(data.date), JSON.stringify(data));
  } catch (e) {
    console.log("saveDayHours error:", e);
  }
}

export async function loadDayHours(date: string): Promise<DayHoursCache | null> {
  try {
    const raw = await AsyncStorage.getItem(key(date));
    if (!raw) return null;
    const data = JSON.parse(raw) as DayHoursCache;
    return { ...data, invitFetched: !!data.invitFetched };
  } catch (e) {
    console.log("loadDayHours error:", e);
    return null;
  }
}

export function hoursLookComplete(data: DayHoursCache | null): boolean {
  if (!data) return false;
  const need: Array<OreHourId | MediaId> = ["ufficio", "lodi", "terza", "vespri", "compieta"];
  return need.every((h) => {
    const hour = data.hours[h];
    return !!(hour && hour.blocks && hour.blocks.length > 0);
  });
}

export async function unifiedCacheDaysLeft(): Promise<number> {
  const dates = nextDates(10);
  let n = 0;
  for (const d of dates) {
    const mass = await loadLiturgy(d);
    const hours = await loadDayHours(d);
    const massOk = !!(mass && Array.isArray(mass.readings) && mass.readings.length > 0);
    if (massOk && hoursLookComplete(hours)) n += 1;
    else break;
  }
  return n;
}

export async function pruneOldHours(keepFromToday = 0): Promise<void> {
  const keep = new Set(nextDates(10 + keepFromToday));
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => k.startsWith(PREFIX) && !keep.has(k.slice(PREFIX.length)));
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch (e) {
    console.log("pruneOldHours error:", e);
  }
}
