import { fetchCeiUrl } from "../liturgyScraper";
import { DEFAULT_INVIT_ANT } from "./bundled";
import { hourHeadMeta } from "./dayHead";
import { extractInvitatoryAntiphon, parseHourHtml, splitOraMediaHtml } from "./parseHour";
import { loadDayHours, saveDayHours } from "./cache";
import { ceiHourSlug } from "./titles";
import type { DayHoursCache, MediaId, OreHourId, ParsedHour } from "./types";
import { parseLocalDate } from "../dateUtils";

const CEI_ORE = "https://www.chiesacattolica.it/la-liturgia-delle-ore/";
/** Poche pagine per volta: il CEI rifiuta raffiche da 6. */
const CEI_FETCH_CONCURRENCY = 2;

function ceiDateParam(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

export function hoursUrl(dateISO: string, slug: string): string {
  return `${CEI_ORE}?data-liturgia=${ceiDateParam(dateISO)}&ora=${encodeURIComponent(slug)}`;
}

async function fetchHourHtml(dateISO: string, slug: string): Promise<string | null> {
  return fetchCeiUrl(hoursUrl(dateISO, slug));
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = await Promise.all(items.slice(i, i + limit).map(fn));
    out.push(...chunk);
  }
  return out;
}

function emptyDay(dateISO: string, ceiTitle = ""): DayHoursCache {
  return {
    date: dateISO,
    invitAnt: "",
    invitFetched: false,
    meta: hourHeadMeta(dateISO, ceiTitle),
    hours: {},
    fetchedAt: Date.now(),
  };
}

export async function mergeDayHours(
  dateISO: string,
  patch: Partial<DayHoursCache>,
  ceiTitle = "",
): Promise<DayHoursCache> {
  const prev = (await loadDayHours(dateISO)) || emptyDay(dateISO, ceiTitle);
  const next: DayHoursCache = {
    ...prev,
    ...patch,
    hours: { ...prev.hours, ...(patch.hours || {}) },
    meta: patch.meta || prev.meta,
    invitFetched: Boolean(patch.invitFetched || prev.invitFetched),
    invitAnt: patch.invitAnt !== undefined ? patch.invitAnt : prev.invitAnt,
    fetchedAt: Date.now(),
  };
  await saveDayHours(next);
  return next;
}

type HourPatch = Partial<Record<OreHourId | MediaId, ParsedHour>> & {
  invitAnt?: string;
  invitFetched?: boolean;
};

async function ingestHtml(
  hour: OreHourId,
  html: string | null,
): Promise<HourPatch> {
  if (!html) {
    if (hour === "invitatorio") return {};
    return { [hour]: { hour, blocks: [], error: "Pagina CEI non disponibile." } };
  }
  if (hour === "invitatorio") {
    const ant = extractInvitatoryAntiphon(html);
    return { invitAnt: ant || DEFAULT_INVIT_ANT, invitFetched: true };
  }
  if (hour === "ora-media") {
    const parts = splitOraMediaHtml(html);
    const out: Partial<Record<MediaId, ParsedHour>> = {};
    (["terza", "sesta", "nona"] as MediaId[]).forEach((id) => {
      out[id] = parseHourHtml(parts[id], id);
    });
    return out;
  }
  return { [hour]: parseHourHtml(html, hour) };
}

const FETCH_HOURS: OreHourId[] = [
  "invitatorio",
  "ufficio",
  "lodi",
  "ora-media",
  "vespri",
  "compieta",
];

export async function fetchDayHours(dateISO: string, ceiTitle = ""): Promise<DayHoursCache> {
  const date = parseLocalDate(dateISO);
  const results = await mapPool(FETCH_HOURS, CEI_FETCH_CONCURRENCY, async (hour) => {
    const html = await fetchHourHtml(dateISO, ceiHourSlug(hour, date));
    return ingestHtml(hour, html);
  });
  let hours: DayHoursCache["hours"] = {};
  let invitAnt: string | undefined;
  let invitFetched = false;
  for (const p of results) {
    if (p.invitFetched) invitFetched = true;
    if (p.invitAnt) invitAnt = p.invitAnt;
    const { invitAnt: _a, invitFetched: _f, ...rest } = p;
    hours = { ...hours, ...rest };
  }
  return mergeDayHours(
    dateISO,
    {
      hours,
      ...(invitAnt !== undefined ? { invitAnt } : {}),
      invitFetched,
      meta: hourHeadMeta(dateISO, ceiTitle),
    },
    ceiTitle,
  );
}

export async function ensureHour(
  dateISO: string,
  hour: OreHourId,
  ceiTitle = "",
): Promise<DayHoursCache> {
  const existing = await loadDayHours(dateISO);
  if (hour === "invitatorio") {
    if (existing?.invitFetched) return existing;
  } else if (hour === "ora-media") {
    if (existing?.hours.terza?.blocks?.length) return existing;
  } else if (existing?.hours[hour]?.blocks?.length) {
    return existing;
  }
  const date = parseLocalDate(dateISO);
  const html = await fetchHourHtml(dateISO, ceiHourSlug(hour, date));
  const patch = await ingestHtml(hour, html);
  const { invitAnt, invitFetched, ...hourMap } = patch;
  return mergeDayHours(
    dateISO,
    {
      hours: hourMap,
      ...(invitAnt !== undefined ? { invitAnt } : {}),
      ...(invitFetched ? { invitFetched: true } : {}),
      meta: existing?.meta || hourHeadMeta(dateISO, ceiTitle),
    },
    ceiTitle,
  );
}

export function invitAntText(day: DayHoursCache | null | undefined): string {
  return (day?.invitAnt || DEFAULT_INVIT_ANT).trim() || DEFAULT_INVIT_ANT;
}
