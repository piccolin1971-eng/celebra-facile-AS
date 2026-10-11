import { italianDateLabel, parseLocalDate } from "./dateUtils";
import { fetchCeiHtml, resolveLiturgyFromCeiHtmlForOptionalSaint } from "./liturgyScraper";
import {
  getFullLiturgyByDateStr,
  reconcileLiturgyColors,
  type Liturgy,
} from "./localLiturgy";
import {
  fillMissingFeastSecondReading,
  mergeOptionalSaintLectionaryIntoLiturgy,
} from "./saintLectionary";
import { getOptionalSaintById, optionalSaintBannerTitle } from "./optionalSaints";
import {
  loadOptionalSaintLiturgy,
  saveOptionalSaintLiturgy,
} from "./offlineCache";
import {
  mergeOptionalSaintBundle,
  mergeOptionalSaintBundlePrayersOnly,
} from "./optionalSaintLiturgyBundles";

async function scrapeOptionalSaintLiturgy(
  dateStr: string,
  saintId: string,
): Promise<{
  title: string;
  liturgical_color: string;
  readings: Liturgy["readings"];
  source_url: string;
  error?: string | null;
}> {
  const saint = getOptionalSaintById(saintId);
  if (!saint) {
    return {
      title: "",
      liturgical_color: "",
      readings: [],
      source_url: "",
      error: "Santo non trovato nel catalogo.",
    };
  }

  const d = parseLocalDate(dateStr);
  const url = `https://www.chiesacattolica.it/celebration/${dateStr}/`;
  const html = await fetchCeiHtml(d);
  if (!html) {
    return {
      title: optionalSaintBannerTitle(saint),
      liturgical_color: "",
      readings: [],
      source_url: url,
      error: "Impossibile connettersi a chiesacattolica.it",
    };
  }

  const resolved = resolveLiturgyFromCeiHtmlForOptionalSaint(html, d, saint.title);
  const title = resolved.title || optionalSaintBannerTitle(saint);

  return {
    title,
    liturgical_color: resolved.liturgical_color,
    readings: resolved.readings,
    source_url: url,
    error: null,
  };
}

/** Liturgia per memoria facoltativa scelta (cache separata dal calendario). */
export async function getOptionalSaintFullLiturgy(
  dateStr: string,
  saintId: string,
): Promise<Liturgy> {
  const cached = await loadOptionalSaintLiturgy(dateStr, saintId);
  if (cached && Array.isArray(cached.readings) && cached.readings.length > 0) {
    return reconcileLiturgyColors({
      ...cached,
      fromLocalCache: true,
      optionalSaintId: saintId,
    });
  }

  const [calendarBase, scraped] = await Promise.all([
    getFullLiturgyByDateStr(dateStr, "calendar_day"),
    scrapeOptionalSaintLiturgy(dateStr, saintId),
  ]);

  const d = parseLocalDate(dateStr);
  let mergedReadings = scraped.readings;
  let mergedTitle = scraped.title;
  let mergedColor = scraped.liturgical_color || calendarBase.liturgical_color;
  let mergedError: string | null = null;

  if (mergedReadings.length === 0) {
    const saint = getOptionalSaintById(saintId);
    const fromBundle = mergeOptionalSaintBundle(calendarBase, saintId);
    if (fromBundle && fromBundle.readings.length > 0) {
      mergedReadings = fromBundle.readings;
      mergedTitle = fromBundle.title;
      mergedColor = fromBundle.liturgical_color;
      mergedError = null;
    } else if (saint) {
      const fromLec = mergeOptionalSaintLectionaryIntoLiturgy(calendarBase, saint.title);
      if (fromLec && fromLec.readings.length > 0) {
        const withPrayers = mergeOptionalSaintBundlePrayersOnly(fromLec, saintId) ?? fromLec;
        mergedReadings = withPrayers.readings;
        mergedTitle = withPrayers.title || optionalSaintBannerTitle(saint);
        mergedColor = withPrayers.liturgical_color || calendarBase.liturgical_color;
        mergedError = withPrayers.error ?? null;
      } else {
        mergedError = saint.custom
          ? "Liturgia locale non ancora in app: verifica il Messale diocesano."
          : "Letture e orazioni del santo non sono sulla pagina CEI nazionale; bundle in app non ancora disponibile.";
      }
    }
  }

  const liturgy = fillMissingFeastSecondReading({
    ...calendarBase,
    date: dateStr,
    date_label: italianDateLabel(d),
    readings: mergedReadings,
    title: mergedTitle,
    liturgical_color: mergedColor,
    source_url: scraped.source_url,
    error: mergedError,
    celebrationMode: "calendar_day",
    optionalSaintId: saintId,
  });

  const reconciled = reconcileLiturgyColors(liturgy);

  if (mergedReadings.length > 0) {
    await saveOptionalSaintLiturgy(dateStr, saintId, reconciled);
  }

  return { ...reconciled, fromLocalCache: false, optionalSaintId: saintId };
}
