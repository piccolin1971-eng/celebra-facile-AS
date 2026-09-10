/** Base URL per anteprima web locale (Expo `--port 8083` se Canzoniere usa 8081). */
export const CELEBRA_WEB_PREVIEW_PORT = 8083;

export function celebraWebPreviewBase(): string {
  if (typeof process !== "undefined" && process.env.EXPO_PUBLIC_CELEBRA_PREVIEW_URL) {
    return process.env.EXPO_PUBLIC_CELEBRA_PREVIEW_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return `http://localhost:${CELEBRA_WEB_PREVIEW_PORT}`;
}

export function celebraWebPreviewUrl(path: string): string {
  const base = celebraWebPreviewBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
