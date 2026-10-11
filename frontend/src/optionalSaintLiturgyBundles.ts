import bundlesJson from "./data/optionalSaintLiturgyBundles.json";
import type { Liturgy } from "./localLiturgy";
import { normalizeScrapedLiturgicalColor } from "./liturgicalColorUtils";
import { optionalSaintBannerTitle, getOptionalSaintById } from "./optionalSaints";

export type OptionalSaintLiturgyBundle = {
  liturgical_color?: string;
  sourceNote?: string;
  readings: Liturgy["readings"];
};

const BUNDLES = bundlesJson as Record<string, OptionalSaintLiturgyBundle>;

const REPLACE_TYPES = new Set([
  "antifona_ingresso",
  "colletta",
  "prima_lettura",
  "salmo",
  "seconda_lettura",
  "sequenza",
  "acclamazione",
  "vangelo",
  "sulle_offerte",
  "antifona_comunione",
  "dopo_comunione",
]);

export function getOptionalSaintLiturgyBundle(saintId: string): OptionalSaintLiturgyBundle | null {
  return BUNDLES[saintId] ?? null;
}

/** Santi solo CEI (nessun bundle testi): colore liturgico noto per banner/striscia Home. */
const OPTIONAL_SAINT_COLOR_WITHOUT_BUNDLE: Record<string, string> = {
  loreto: "bianco",
};

/** Colore liturgico del santo facoltativo (bundle in app; altrimenti tabella CEI-only). */
export function optionalSaintLiturgicalColor(saintId: string): string | null {
  const bundle = getOptionalSaintLiturgyBundle(saintId);
  if (bundle) {
    return normalizeScrapedLiturgicalColor(bundle.liturgical_color) ?? "bianco";
  }
  const fallback = OPTIONAL_SAINT_COLOR_WITHOUT_BUNDLE[saintId];
  return fallback ? normalizeScrapedLiturgicalColor(fallback) : null;
}

/** Applica testi in app quando il CEI nazionale non pubblica la memoria facoltativa. */
function mergeReadingsKeepingBase(
  base: Liturgy,
  incoming: Liturgy["readings"],
): Liturgy["readings"] {
  const kept = (base.readings || []).filter((r) => !REPLACE_TYPES.has(r.type));
  const merged = [...kept, ...incoming];
  const order = [
    "antifona_ingresso",
    "colletta",
    "prima_lettura",
    "salmo",
    "seconda_lettura",
    "sequenza",
    "acclamazione",
    "vangelo",
    "sulle_offerte",
    "antifona_comunione",
    "dopo_comunione",
  ];
  merged.sort((a, b) => {
    const ia = order.indexOf(a.type);
    const ib = order.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return merged;
}

export function mergeOptionalSaintBundle(
  base: Liturgy,
  saintId: string,
): Liturgy | null {
  const bundle = getOptionalSaintLiturgyBundle(saintId);
  const saint = getOptionalSaintById(saintId);
  if (!bundle || !saint || !Array.isArray(bundle.readings) || bundle.readings.length === 0) {
    return null;
  }

  const merged = mergeReadingsKeepingBase(base, bundle.readings);
  const title = optionalSaintBannerTitle(saint);
  return {
    ...base,
    title,
    liturgical_color: bundle.liturgical_color || base.liturgical_color,
    readings: merged,
    error: null,
    optionalSaintId: saintId,
  };
}

/** Applica solo orazioni dal bundle (letture già dal lezionario o dal CEI). */
export function mergeOptionalSaintBundlePrayersOnly(
  base: Liturgy,
  saintId: string,
): Liturgy | null {
  const bundle = getOptionalSaintLiturgyBundle(saintId);
  const saint = getOptionalSaintById(saintId);
  if (!bundle || !saint || !Array.isArray(bundle.readings)) return null;

  const PRAYER_ONLY = new Set([
    "antifona_ingresso",
    "colletta",
    "sulle_offerte",
    "antifona_comunione",
    "dopo_comunione",
  ]);
  const prayers = bundle.readings.filter((r) => PRAYER_ONLY.has(r.type));
  if (prayers.length === 0) return null;

  const hasScripture = (base.readings || []).some((r) =>
    ["prima_lettura", "vangelo"].includes(r.type),
  );
  if (!hasScripture) return null;

  const merged = mergeReadingsKeepingBase(base, prayers);
  return {
    ...base,
    title: optionalSaintBannerTitle(saint),
    liturgical_color: bundle.liturgical_color || base.liturgical_color,
    readings: merged,
    error: null,
    optionalSaintId: saintId,
  };
}
