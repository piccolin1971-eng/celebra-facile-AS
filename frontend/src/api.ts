/**
 * API client per comunicare con il backend Messale Digitale.
 * Con fallback automatico alla cache locale (AsyncStorage) quando la rete non è disponibile.
 */
import {
  saveLiturgy,
  loadLiturgy,
  loadStaticCache,
  saveStaticCache,
  getLiturgyIndex,
  nextDates,
  StaticCacheBundle,
} from "./offlineCache";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

async function fetchJson<T>(path: string, opts?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`API ${path} error ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export type Reading = {
  type: string;
  reference: string;
  title: string;
  text: string;
};

export type Liturgy = {
  date: string;
  date_label: string;
  season: { season: string; color: string; color_hex: string };
  saints: { title: string; rank: string; color: string }[];
  readings: Reading[];
  title: string;
  liturgical_color: string;
  source_url?: string;
  cached?: boolean;
  error?: string | null;
  // Flag aggiunto dal client quando la risposta proviene dalla cache locale
  fromLocalCache?: boolean;
};

export type Preface = { id: string; title: string; season: string; text: string };
export type EucharisticPrayer = { id: string; title: string; description: string; text: string };
export type VotiveMass = { id: string; title: string; color: string };
export type MysteryAcclamation = { id: string; label: string; celebrante: string; assemblea: string };
export type SolemnBlessing = {
  id: string; season: string; title: string; rubric: string;
  invocations: { c: string; a: string }[];
  final: { c: string; a: string };
};

// ===== Liturgia con cache offline =====

function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function liturgyForDateCached(date: string): Promise<Liturgy> {
  // 1) prova rete
  try {
    const data = await fetchJson<Liturgy>(`/liturgy/${date}`);
    // salva in cache se ci sono letture vere
    if (data && Array.isArray(data.readings) && data.readings.length > 0) {
      await saveLiturgy(date, data);
    }
    return { ...data, fromLocalCache: false };
  } catch (netErr) {
    // 2) fallback su cache locale
    const local = await loadLiturgy(date);
    if (local) {
      return { ...local, fromLocalCache: true };
    }
    throw netErr;
  }
}

// ===== Cache testi statici =====

async function getStaticCached<K extends keyof StaticCacheBundle>(
  key: K,
  fetcher: () => Promise<any>
): Promise<any> {
  try {
    const data = await fetcher();
    await saveStaticCache({ [key]: data } as any);
    return data;
  } catch (e) {
    const cache = await loadStaticCache();
    if (cache && cache[key]) return cache[key];
    throw e;
  }
}

// ===== Pre-download di N giorni in avanti =====

export type PrefetchProgress = {
  total: number;
  done: number;
  current?: string;
  failed: string[];
};

export async function prefetchLiturgies(
  days: number,
  onProgress?: (p: PrefetchProgress) => void
): Promise<PrefetchProgress> {
  const dates = nextDates(days);
  const prog: PrefetchProgress = { total: dates.length, done: 0, failed: [] };
  for (const d of dates) {
    prog.current = d;
    onProgress?.(prog);
    try {
      const data = await fetchJson<Liturgy>(`/liturgy/${d}`);
      if (data && Array.isArray(data.readings) && data.readings.length > 0) {
        await saveLiturgy(d, data);
      } else {
        prog.failed.push(d);
      }
    } catch (e) {
      console.log(`prefetch ${d} failed:`, e);
      prog.failed.push(d);
    }
    prog.done += 1;
    onProgress?.(prog);
  }
  return prog;
}

// Pre-cache testi statici in un colpo solo (ordinario, prefazi, ecc.)
export async function prefetchStatic(): Promise<void> {
  await Promise.all([
    getStaticCached("order", () => fetchJson<{ order: any }>(`/mass/order`)),
    getStaticCached("fixedParts", () => fetchJson<{ parts: any }>(`/mass/fixed-parts`)),
    getStaticCached("prefaces", () => fetchJson<{ prefaces: Preface[] }>(`/prefaces`)),
    getStaticCached("eucharisticPrayers", () => fetchJson<{ prayers: EucharisticPrayer[] }>(`/eucharistic-prayers`)),
    getStaticCached("mysteryAcclamations", () => fetchJson<{ acclamations: MysteryAcclamation[] }>(`/mystery-acclamations`)),
    getStaticCached("solemnBlessings", () => fetchJson<{ blessings: SolemnBlessing[]; pasqua_dismissal: any }>(`/solemn-blessings`)),
    getStaticCached("votiveMasses", () => fetchJson<{ masses: VotiveMass[] }>(`/votive-masses`)),
  ]);
}

export const api = {
  // Liturgia giornaliera con fallback offline
  liturgyToday: () => liturgyForDateCached(todayStr()),
  liturgyForDate: (date: string) => liturgyForDateCached(date),
  refreshLiturgy: (date: string) => fetchJson(`/liturgy/refresh/${date}`, { method: "POST" }),

  // Testi statici con fallback cache
  massOrder: () =>
    getStaticCached("order", () => fetchJson<{ order: { id: string; title: string }[] }>(`/mass/order`)),
  fixedParts: () =>
    getStaticCached("fixedParts", () => fetchJson<{ parts: Record<string, any> }>(`/mass/fixed-parts`)),
  prefaces: (season?: string) =>
    season
      ? fetchJson<{ prefaces: Preface[] }>(`/prefaces?season=${season}`).catch(async () => {
          // fallback: filtra manualmente dalla cache
          const c = await loadStaticCache();
          const all: Preface[] = c?.prefaces?.prefaces || [];
          return { prefaces: all.filter((p) => p.season.toLowerCase() === season.toLowerCase() || p.season === "comune") };
        })
      : getStaticCached("prefaces", () => fetchJson<{ prefaces: Preface[] }>(`/prefaces`)),
  eucharisticPrayers: () =>
    getStaticCached("eucharisticPrayers", () => fetchJson<{ prayers: EucharisticPrayer[] }>(`/eucharistic-prayers`)),
  mysteryAcclamations: () =>
    getStaticCached("mysteryAcclamations", () => fetchJson<{ acclamations: MysteryAcclamation[] }>(`/mystery-acclamations`)),
  solemnBlessings: () =>
    getStaticCached("solemnBlessings", () =>
      fetchJson<{ blessings: SolemnBlessing[]; pasqua_dismissal: any }>(`/solemn-blessings`)
    ),
  votiveMasses: () =>
    getStaticCached("votiveMasses", () => fetchJson<{ masses: VotiveMass[] }>(`/votive-masses`)),

  // Calendario santi (richiesta on-demand, non critica per offline)
  saintsForDate: (date: string) => fetchJson<{ date: string; celebrations: any[] }>(`/calendar/saints/${date}`),
  allSaints: () => fetchJson<{ calendar: { date: string; celebrations: any[] }[] }>(`/calendar/saints`),

  // Utility offline
  getCachedIndex: () => getLiturgyIndex(),
};
