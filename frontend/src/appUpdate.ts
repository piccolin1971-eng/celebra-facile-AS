/**
 * Aggiornamento APK guidato (sideload).
 * Fail-soft: errori di rete/API non bloccano l'app.
 */
import { Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const DISMISS_KEY = "apk_update_dismissed_code";
const DEFAULT_REPO = "piccolin1971-eng/celebra-facile-AS";

export type AppUpdateInfo = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releaseUrl: string;
  body?: string;
};

function githubRepo(): string {
  const extra = Constants.expoConfig?.extra as { githubRepo?: string } | undefined;
  return (extra?.githubRepo || DEFAULT_REPO).trim();
}

export function currentAppVersionCode(): number {
  const n = Constants.expoConfig?.android?.versionCode;
  return typeof n === "number" && n > 0 ? n : 1;
}

export function currentAppVersionName(): string {
  return Constants.expoConfig?.version || "1.0.0";
}

export function isAppUpdateSupported(): boolean {
  return Platform.OS === "android" && !Platform.isTV;
}

type GhRelease = {
  html_url?: string;
  body?: string;
  tag_name?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
};

type ParsedRelease = AppUpdateInfo & { manifestUrl?: string };

function parseVersionFromRelease(rel: GhRelease): ParsedRelease | null {
  const assets = rel.assets || [];
  const apk = assets.find((a) => /\.apk$/i.test(a.name || "") && a.browser_download_url);
  if (!apk?.browser_download_url) return null;

  const manifest = assets.find((a) => /^version\.json$/i.test(a.name || "") && a.browser_download_url);

  let code = 0;
  const tag = rel.tag_name || "";
  const mTag = tag.match(/(\d+)\s*$/);
  if (mTag) code = Number(mTag[1]);
  const mName = (apk.name || "").match(/v(\d+)/i);
  if (mName) code = Math.max(code, Number(mName[1]));

  return {
    versionCode: code,
    versionName: tag.replace(/^v/i, "") || `1.0.${code}`,
    apkUrl: apk.browser_download_url,
    releaseUrl: rel.html_url || apk.browser_download_url,
    body: (rel.body || "").trim() || undefined,
    manifestUrl: manifest?.browser_download_url,
  };
}

async function enrichFromManifest(info: ParsedRelease): Promise<AppUpdateInfo> {
  const { manifestUrl, ...base } = info;
  if (!manifestUrl) return base;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(manifestUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return base;
    const j = (await res.json()) as { versionCode?: number; versionName?: string; apkUrl?: string };
    return {
      versionCode: Number(j.versionCode) || base.versionCode,
      versionName: String(j.versionName || base.versionName),
      apkUrl: String(j.apkUrl || base.apkUrl),
      releaseUrl: base.releaseUrl,
      body: base.body,
    };
  } catch {
    return base;
  }
}

/** Controlla GitHub Releases. Null = nessuno update (o non supportato). Throw su errore rete/API. */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isAppUpdateSupported()) return null;
  const repo = githubRepo();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: ctrl.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
  clearTimeout(t);
  if (!res.ok) {
    throw new Error(`GitHub releases: HTTP ${res.status}`);
  }
  const rel = (await res.json()) as GhRelease;
  const parsed = parseVersionFromRelease(rel);
  if (!parsed || parsed.versionCode <= 0) {
    throw new Error("Release senza APK o versionCode");
  }
  const info = await enrichFromManifest(parsed);
  if (info.versionCode <= currentAppVersionCode()) return null;
  return info;
}

export async function getDismissedUpdateCode(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY);
    const n = Number(raw || "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function dismissUpdateUntil(versionCode: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISS_KEY, String(versionCode));
  } catch {
    /* ignore */
  }
}

export async function openApkDownload(info: AppUpdateInfo): Promise<boolean> {
  try {
    const url = info.apkUrl || info.releaseUrl;
    const can = await Linking.canOpenURL(url);
    if (!can) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
