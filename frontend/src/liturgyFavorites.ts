import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CelebrationMode, SessionTarget } from "./massSession";
import {
  loadSessionForTarget,
  sessionTargetKey,
} from "./massSession";

export const MAX_LITURGY_FAVORITES = 10;
const FAVORITES_KEY = "@liturgy_favorites_v1";

export type LiturgyFavoriteKind = "dated" | "votive";

export type LiturgyFavorite = {
  id: string;
  kind: LiturgyFavoriteKind;
  dateISO?: string;
  celebrationMode?: CelebrationMode;
  votiveId?: string;
  title: string;
  subtitle?: string;
  liturgicalColor?: string;
  addedAt: number;
};

export function favoriteFromTarget(
  target: SessionTarget,
  meta: {
    title: string;
    subtitle?: string;
    liturgicalColor?: string;
  },
): LiturgyFavorite {
  const addedAt = Date.now();
  if (target.kind === "votive") {
    return {
      id: sessionTargetKey(target),
      kind: "votive",
      votiveId: target.votiveId,
      title: meta.title,
      subtitle: meta.subtitle ?? "Messa votiva",
      liturgicalColor: meta.liturgicalColor,
      addedAt,
    };
  }
  return {
    id: sessionTargetKey(target),
    kind: "dated",
    dateISO: target.dateISO,
    celebrationMode: target.mode,
    title: meta.title,
    subtitle: meta.subtitle,
    liturgicalColor: meta.liturgicalColor,
    addedAt,
  };
}

export function targetFromFavorite(fav: LiturgyFavorite): SessionTarget | null {
  if (fav.kind === "votive" && fav.votiveId) {
    return { kind: "votive", votiveId: fav.votiveId };
  }
  if (fav.kind === "dated" && fav.dateISO) {
    return {
      kind: "calendar",
      dateISO: fav.dateISO,
      mode: fav.celebrationMode ?? "calendar_day",
    };
  }
  return null;
}

export async function loadLiturgyFavorites(): Promise<LiturgyFavorite[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LiturgyFavorite[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.addedAt - a.addedAt);
  } catch (e) {
    if (__DEV__) console.log("loadLiturgyFavorites err:", e);
    return [];
  }
}

async function persistFavorites(list: LiturgyFavorite[]): Promise<void> {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

export async function isLiturgyFavorite(target: SessionTarget): Promise<boolean> {
  const list = await loadLiturgyFavorites();
  const id = sessionTargetKey(target);
  return list.some((f) => f.id === id);
}

export type AddFavoriteResult =
  | { ok: true }
  | { ok: false; reason: "full" | "duplicate" };

export async function addLiturgyFavorite(fav: LiturgyFavorite): Promise<AddFavoriteResult> {
  const list = await loadLiturgyFavorites();
  if (list.some((f) => f.id === fav.id)) return { ok: false, reason: "duplicate" };
  if (list.length >= MAX_LITURGY_FAVORITES) return { ok: false, reason: "full" };
  await persistFavorites([fav, ...list]);
  return { ok: true };
}

export async function removeLiturgyFavorite(id: string): Promise<void> {
  const list = await loadLiturgyFavorites();
  await persistFavorites(list.filter((f) => f.id !== id));
}

export async function toggleLiturgyFavorite(
  fav: LiturgyFavorite,
): Promise<{ starred: boolean; error?: "full" }> {
  const list = await loadLiturgyFavorites();
  const existing = list.find((f) => f.id === fav.id);
  if (existing) {
    await removeLiturgyFavorite(fav.id);
    return { starred: false };
  }
  const res = await addLiturgyFavorite(fav);
  if (!res.ok && res.reason === "full") return { starred: false, error: "full" };
  return { starred: true };
}

export async function favoriteSessionExists(fav: LiturgyFavorite): Promise<boolean> {
  const target = targetFromFavorite(fav);
  if (!target) return false;
  const session = await loadSessionForTarget(target);
  return session != null;
}

export function celebraParamsFromFavorite(fav: LiturgyFavorite): Record<string, string> {
  if (fav.kind === "votive" && fav.votiveId) {
    return { votive: fav.votiveId };
  }
  const params: Record<string, string> = {
    mode: fav.celebrationMode ?? "calendar_day",
  };
  if (fav.dateISO) params.date = fav.dateISO;
  return params;
}
