/**
 * API client per comunicare con il backend Messale Digitale.
 */
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

async function fetchJson<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`API ${path} error ${res.status}`);
  return res.json() as Promise<T>;
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
};

export type Preface = { id: string; title: string; season: string; text: string };
export type EucharisticPrayer = { id: string; title: string; description: string; text: string };
export type VotiveMass = { id: string; title: string; color: string };

export const api = {
  liturgyToday: () => fetchJson<Liturgy>(`/liturgy/today`),
  liturgyForDate: (date: string) => fetchJson<Liturgy>(`/liturgy/${date}`),
  refreshLiturgy: (date: string) => fetchJson(`/liturgy/refresh/${date}`, { method: "POST" }),
  massOrder: () => fetchJson<{ order: { id: string; title: string }[] }>(`/mass/order`),
  fixedParts: () => fetchJson<{ parts: Record<string, any> }>(`/mass/fixed-parts`),
  prefaces: (season?: string) => fetchJson<{ prefaces: Preface[] }>(`/prefaces${season ? `?season=${season}` : ""}`),
  eucharisticPrayers: () => fetchJson<{ prayers: EucharisticPrayer[] }>(`/eucharistic-prayers`),
  votiveMasses: () => fetchJson<{ masses: VotiveMass[] }>(`/votive-masses`),
  saintsForDate: (date: string) => fetchJson<{ date: string; celebrations: any[] }>(`/calendar/saints/${date}`),
  allSaints: () => fetchJson<{ calendar: { date: string; celebrations: any[] }[] }>(`/calendar/saints`),
};
