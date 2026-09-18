import { fetchCeiUrl } from "../liturgyScraper";
import { DEFAULT_INVIT_ANT } from "./bundled";
import { hourHeadMeta } from "./dayHead";
import { extractHoursBanner } from "./html";
import { hymnNeedsItalianAlternate, prependItalianHymn } from "./hymnLang";
import { fetchLdoDayHtml, ldoHymnForHour } from "./ldo";
import { extractInvitatoryAntiphon, parseHourHtml, splitOraMediaHtml } from "./parseHour";
import { loadDayHours, saveDayHours } from "./cache";
import { ceiHourSlug } from "./titles";
import { getBundledCompline } from "./complineBundled";
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
  if (typeof document !== "undefined") {
    try {
      const local = `/cei-ore?data-liturgia=${ceiDateParam(dateISO)}&ora=${encodeURIComponent(slug)}`;
      const res = await fetch(local);
      if (res.ok) {
        const txt = await res.text();
        if (txt.length > 500) return txt;
      }
    } catch {
      /* fallback CORS */
    }
  }
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
  hoursBanner?: string;
};

async function ingestHtml(
  hour: OreHourId,
  html: string | null,
  dateISO?: string,
): Promise<HourPatch> {
  if (!html) {
    if (hour === "invitatorio") return {};
    return { [hour]: { hour, blocks: [], error: "Pagina CEI non disponibile." } };
  }
  const hoursBanner = extractHoursBanner(html);
  if (hour === "invitatorio") {
    const ant = extractInvitatoryAntiphon(html);
    return { invitAnt: ant || DEFAULT_INVIT_ANT, invitFetched: true, hoursBanner };
  }
  if (hour === "ora-media") {
    const parts = splitOraMediaHtml(html);
    const out: Partial<Record<MediaId, ParsedHour>> = {};
    (["terza", "sesta", "nona"] as MediaId[]).forEach((id) => {
      out[id] = parseHourHtml(parts[id], id, dateISO);
    });
    return { ...out, hoursBanner };
  }
  return { [hour]: parseHourHtml(html, hour, dateISO), hoursBanner };
}

function parsedNeedsItalianHymn(parsed: ParsedHour | undefined): boolean {
  if (!parsed?.blocks?.length) return false;
  return parsed.blocks.some((b) => b.k === "hymn" && hymnNeedsItalianAlternate(b.hymns));
}

function hourPatchNeedsItalian(patch: HourPatch): boolean {
  return Object.entries(patch).some(([k, v]) => {
    if (k === "invitAnt" || k === "invitFetched" || k === "hoursBanner") return false;
    return parsedNeedsItalianHymn(v as ParsedHour);
  });
}

function cachedHoursPatch(existing: DayHoursCache, hour: OreHourId): HourPatch | null {
  if (hour === "ora-media") {
    const ids: MediaId[] = ["terza", "sesta", "nona"];
    if (!ids.every((id) => existing.hours[id]?.blocks?.length)) return null;
    return {
      terza: existing.hours.terza,
      sesta: existing.hours.sesta,
      nona: existing.hours.nona,
    };
  }
  const parsed = existing.hours[hour];
  if (!parsed?.blocks?.length) return null;
  return { [hour]: parsed };
}

function hymnFingerprint(patch: HourPatch): string {
  const hymns: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "invitAnt" || k === "invitFetched" || k === "hoursBanner") continue;
    const parsed = v as ParsedHour | undefined;
    hymns[k] = parsed?.blocks?.filter((b) => b.k === "hymn") ?? [];
  }
  return JSON.stringify(hymns);
}

function applyItalianHymn(parsed: ParsedHour, italian: ReturnType<typeof ldoHymnForHour>): ParsedHour {
  if (!italian) return parsed;
  return {
    ...parsed,
    blocks: parsed.blocks.map((b) => {
      if (b.k !== "hymn" || !hymnNeedsItalianAlternate(b.hymns)) return b;
      return { k: "hymn" as const, hymns: prependItalianHymn(b.hymns, italian) };
    }),
  };
}

async function enrichLatinHymns(patch: HourPatch, dateISO: string): Promise<HourPatch> {
  const hours = Object.entries(patch).filter(([k, v]) => {
    if (k === "invitAnt" || k === "invitFetched" || k === "hoursBanner") return false;
    return parsedNeedsItalianHymn(v as ParsedHour);
  }) as Array<[OreHourId | MediaId, ParsedHour]>;
  if (!hours.length) return patch;
  const ldo = await fetchLdoDayHtml(dateISO);
  if (!ldo) return patch;
  const next: HourPatch = { ...patch };
  for (const [id, parsed] of hours) {
    (next as Record<string, unknown>)[id] = applyItalianHymn(parsed, ldoHymnForHour(ldo, id));
  }
  return next;
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
    if (hour === "compieta") {
      const bundled = getBundledCompline(dateISO);
      if (bundled?.blocks?.length) return { compieta: bundled };
    }
    const html = await fetchHourHtml(dateISO, ceiHourSlug(hour, date));
    return enrichLatinHymns(await ingestHtml(hour, html, dateISO), dateISO);
  });
  let hours: DayHoursCache["hours"] = {};
  let invitAnt: string | undefined;
  let invitFetched = false;
  let hoursBanner = "";
  for (const p of results) {
    if (p.invitFetched) invitFetched = true;
    if (p.invitAnt) invitAnt = p.invitAnt;
    if (p.hoursBanner && !hoursBanner) hoursBanner = p.hoursBanner;
    const { invitAnt: _a, invitFetched: _f, hoursBanner: _b, ...rest } = p;
    hours = { ...hours, ...rest };
  }
  return mergeDayHours(
    dateISO,
    {
      hours,
      ...(invitAnt !== undefined ? { invitAnt } : {}),
      invitFetched,
      meta: hourHeadMeta(dateISO, ceiTitle, hoursBanner),
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
  if (hour === "compieta") {
    const bundled = getBundledCompline(dateISO);
    if (bundled?.blocks?.length) {
      return mergeDayHours(dateISO, { hours: { compieta: bundled } }, ceiTitle);
    }
  }
  if (hour === "invitatorio") {
    if (existing?.invitFetched) return existing;
  } else if (existing) {
    const cached = cachedHoursPatch(existing, hour);
    if (cached) {
      if (!hourPatchNeedsItalian(cached)) return existing;
      const enriched = await enrichLatinHymns(cached, dateISO);
      if (hymnFingerprint(enriched) === hymnFingerprint(cached)) return existing;
      const { invitAnt: _a, invitFetched: _f, hoursBanner: _b, ...hourMap } = enriched;
      return mergeDayHours(dateISO, { hours: hourMap }, ceiTitle);
    }
  }
  const date = parseLocalDate(dateISO);
  const html = await fetchHourHtml(dateISO, ceiHourSlug(hour, date));
  const patch = await enrichLatinHymns(await ingestHtml(hour, html, dateISO), dateISO);
  const { invitAnt, invitFetched, hoursBanner, ...hourMap } = patch;
  return mergeDayHours(
    dateISO,
    {
      hours: hourMap,
      ...(invitAnt !== undefined ? { invitAnt } : {}),
      ...(invitFetched ? { invitFetched: true } : {}),
      meta: hourHeadMeta(dateISO, ceiTitle, hoursBanner || ""),
    },
    ceiTitle,
  );
}

export function invitAntText(day: DayHoursCache | null | undefined): string {
  return (day?.invitAnt || DEFAULT_INVIT_ANT).trim() || DEFAULT_INVIT_ANT;
}
