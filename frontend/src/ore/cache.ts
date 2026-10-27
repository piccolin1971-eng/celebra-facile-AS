/**
 * Cache offline Liturgia delle Ore.
 *
 * Chiave stabile (non cambiare al bump di parser):
 *   ore_day_<YYYY-MM-DD>
 *
 * Prefissi legacy `ore_day_vN_<data>` (v4…v36): in lettura si migrano sulla chiave stabile
 * e si rimuovono, così un aggiornamento APK non “cancella” i giorni scaricati.
 *
 * `schemaVersion` nel JSON: alza questo numero se cambia il formato dei blocchi;
 * non rinominare la chiave AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { nextDates, loadLiturgy } from "../offlineCache";
import { stripStalePsalmodiesFromDay } from "./hourCacheHealth";
import type { DayHoursCache, MediaId, OreHourId } from "./types";

/** Prefisso fisso. Non bumpare: usare SCHEMA_VERSION nel JSON. */
const PREFIX = "ore_day_";

/**
 * Schema contenuto attuale. Alza e migra se il parse CEI cambia (es. strofe cantico Tb
 * con più righe nello stesso lo_versetto: «benedite il Signore della giustizia», ecc.).
 * 38: testo orfano con <br><br> spezza la strofa (Salmo 45, ritornello finale);
 * spazio prima del punto («la terra .»).
 * 39: rientro CEI del wrap (es. «al modo di Melchisedek», «mi chiameranno beata»).
 * 40: «Quando il seguente cantico si canta…» resta rubrica rossa.
 * 41: vespri — «N., —» nella stessa rubrica; titolo del cantico «Cfr.» sulla stessa riga;
 * a capo di colonna in letture e responsori; responsorio «Oppure» fuori dal versetto.
 * 42: testata «Commemorazione» (2 novembre) senza ripetere «Liturgia propria».
 * 43: la sera del 1° novembre non è vigilia dei defunti (restano i Secondi vespri di Tutti i Santi).
 * 44: vespri/lodi — antifone numerate (non solo «Ant.» da LDO); cache LDO obsoleta svuotata.
 */
export const ORE_CACHE_SCHEMA_VERSION = 44;

const STABLE_KEY_RE = /^ore_day_(\d{4}-\d{2}-\d{2})$/;
const LEGACY_KEY_RE = /^ore_day_v(\d+)_(\d{4}-\d{2}-\d{2})$/;

function key(date: string): string {
  return `${PREFIX}${date}`;
}

function dateFromStorageKey(storageKey: string): string | null {
  const stable = storageKey.match(STABLE_KEY_RE);
  if (stable) return stable[1];
  const legacy = storageKey.match(LEGACY_KEY_RE);
  if (legacy) return legacy[2];
  return null;
}

function stamp(data: DayHoursCache): DayHoursCache {
  return {
    ...data,
    invitFetched: !!data.invitFetched,
    schemaVersion: ORE_CACHE_SCHEMA_VERSION,
  };
}

/** Cache con schema vecchio: non riscrivere solo il numero, svuota le ore e riscarica dal CEI. */
function migrateStaleContent(parsed: DayHoursCache): DayHoursCache {
  const ver = parsed.schemaVersion ?? 0;
  if (ver >= ORE_CACHE_SCHEMA_VERSION) {
    const hours = stripStalePsalmodiesFromDay(parsed.hours);
    if (hours === parsed.hours) return parsed;
    return { ...parsed, hours };
  }
  return {
    ...parsed,
    hours: {},
    invitFetched: false,
    schemaVersion: ORE_CACHE_SCHEMA_VERSION,
  };
}

async function removeLegacyKeysForDate(date: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => {
      const m = k.match(LEGACY_KEY_RE);
      return !!(m && m[2] === date);
    });
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch (e) {
    console.log("removeLegacyKeysForDate error:", e);
  }
}

/** Tra più chiavi legacy per la stessa data, preferisce la v più alta. */
async function findBestLegacyKey(date: string): Promise<string | null> {
  const keys = await AsyncStorage.getAllKeys();
  let best: { key: string; ver: number } | null = null;
  for (const k of keys) {
    const m = k.match(LEGACY_KEY_RE);
    if (!m || m[2] !== date) continue;
    const ver = Number(m[1]);
    if (!Number.isFinite(ver)) continue;
    if (!best || ver > best.ver) best = { key: k, ver };
  }
  return best?.key ?? null;
}

export async function saveDayHours(data: DayHoursCache): Promise<void> {
  try {
    const stamped = stamp(data);
    await AsyncStorage.setItem(key(data.date), JSON.stringify(stamped));
    await removeLegacyKeysForDate(data.date);
  } catch (e) {
    console.log("saveDayHours error:", e);
  }
}

export async function loadDayHours(date: string): Promise<DayHoursCache | null> {
  try {
    const stableKey = key(date);
    let raw = await AsyncStorage.getItem(stableKey);
    let fromLegacy = false;

    if (!raw) {
      const legacyKey = await findBestLegacyKey(date);
      if (!legacyKey) return null;
      raw = await AsyncStorage.getItem(legacyKey);
      if (!raw) return null;
      fromLegacy = true;
    }

    const parsed = JSON.parse(raw) as DayHoursCache;
    const migrated = migrateStaleContent({ ...parsed, date, invitFetched: !!parsed.invitFetched });
    const data = stamp(migrated);
    const contentMigrated = (parsed.schemaVersion ?? 0) < ORE_CACHE_SCHEMA_VERSION;

    // Migra su chiave stabile; se il parse è cambiato, hours è già vuoto → nuovo download.
    if (fromLegacy || contentMigrated || parsed.schemaVersion !== ORE_CACHE_SCHEMA_VERSION) {
      await AsyncStorage.setItem(stableKey, JSON.stringify(data));
      if (fromLegacy) await removeLegacyKeysForDate(date);
    }

    return data;
  } catch (e) {
    console.log("loadDayHours error:", e);
    return null;
  }
}

export function hoursLookComplete(data: DayHoursCache | null): boolean {
  if (!data) return false;
  const need: Array<OreHourId | MediaId> = [
    "ufficio",
    "lodi",
    "terza",
    "sesta",
    "nona",
    "vespri",
    "compieta",
  ];
  return need.every((h) => {
    const hour = data.hours[h];
    return !!(hour && hour.blocks && hour.blocks.length > 0 && !hour.error);
  });
}

export async function unifiedCacheDaysLeft(includeHours = true): Promise<number> {
  const dates = nextDates(10);
  let n = 0;
  for (const d of dates) {
    const mass = await loadLiturgy(d);
    const massOk = !!(mass && Array.isArray(mass.readings) && mass.readings.length > 0);
    if (!massOk) break;
    if (includeHours) {
      const hours = await loadDayHours(d);
      if (!hoursLookComplete(hours)) break;
    }
    n += 1;
  }
  return n;
}

export async function pruneOldHours(keepFromToday = 0): Promise<void> {
  const keep = new Set(nextDates(10 + keepFromToday));
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => {
      const date = dateFromStorageKey(k);
      return date != null && !keep.has(date);
    });
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch (e) {
    console.log("pruneOldHours error:", e);
  }
}
