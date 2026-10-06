import { fetchCeiUrl } from "../liturgyScraper";
import { DEFAULT_INVIT_ANT } from "./bundled";
import { hourHeadMeta } from "./dayHead";
import { extractHoursBanner } from "./html";
import { hymnNeedsItalianAlternate, prependItalianHymn } from "./hymnLang";
import { fetchLdoDayHtml, ldoHymnForHour } from "./ldo";
import { extractInvitatoryAntiphon, migrateOreBlocks, parseHourHtml, splitOraMediaHtml } from "./parseHour";
import { ldoFallbackPatch } from "./parseLdo";
import { loadDayHours, saveDayHours } from "./cache";
import { ceiFetchDateISO, ceiHourSlug } from "./titles";
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

/** URL CEI come in fetch giornata (slug sul giorno liturgico, data fetch per primi vespri/compieta). */
export function hoursUrlForHour(dateISO: string, hour: OreHourId): string {
  const date = parseLocalDate(dateISO);
  const slug = ceiHourSlug(hour, date);
  const fetchISO = ceiFetchDateISO(dateISO, hour);
  return hoursUrl(fetchISO, slug);
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

function hourHasContent(parsed: ParsedHour | undefined | null): boolean {
  return !!(parsed && parsed.blocks && parsed.blocks.length > 0);
}

/** Non sovrascrivere un'ora già buona con un fetch fallito (blocks vuoti). */
function mergeHourMaps(
  prev: DayHoursCache["hours"],
  patch: Partial<Record<OreHourId | MediaId, ParsedHour>>,
): DayHoursCache["hours"] {
  const next: DayHoursCache["hours"] = { ...prev };
  for (const [id, parsed] of Object.entries(patch) as Array<
    [OreHourId | MediaId, ParsedHour | undefined]
  >) {
    if (!parsed) continue;
    if (hourHasContent(parsed) || !hourHasContent(next[id])) {
      next[id] = parsed;
    }
  }
  return next;
}

async function fetchHourHtmlWithRetry(
  dateISO: string,
  slug: string,
  attempts = 3,
): Promise<string | null> {
  let last: string | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchHourHtml(dateISO, slug);
    if (last && last.length > 500 && ceiHtmlMatchesSlug(last, slug)) return last;
    // HTML di un'altra ora (es. invitatorio al posto dei vespri): scarta.
    if (last && last.length > 500 && !ceiHtmlMatchesSlug(last, slug)) last = null;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return last;
}

/** True se la pagina CEI è davvero l'ora richiesta (non un fallback invitatorio). */
function ceiHtmlMatchesSlug(html: string, slug: string): boolean {
  const selected = html.match(/data-selected_ora=["']([^"']+)["']/i)?.[1]?.trim().toLowerCase();
  if (selected && selected !== slug.toLowerCase()) return false;
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
  // Titolo «… - Invitatorio - …» mentre chiediamo vespri/compieta.
  if (/invitatorio/i.test(title) && !/^invitatorio$/i.test(slug)) return false;
  return true;
}

async function fetchHourPatch(dateISO: string, hour: OreHourId): Promise<HourPatch> {
  const date = parseLocalDate(dateISO);
  const slug = ceiHourSlug(hour, date);
  const fetchISO = ceiFetchDateISO(dateISO, hour);
  const html = await fetchHourHtmlWithRetry(fetchISO, slug);
  const patch = await enrichLatinHymns(await ingestHtml(hour, html, dateISO), dateISO);
  // Banner del giorno festivo non deve sovrascrivere il meta della sera di calendario.
  if (fetchISO !== dateISO) {
    const { hoursBanner: _b, ...rest } = patch;
    return rest;
  }
  return patch;
}

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
  const parsed = parseHourHtml(html, hour, dateISO);
  return { [hour]: hour === "ufficio" ? { ...parsed, blocks: migrateOreBlocks(parsed.blocks) } : parsed, hoursBanner };
}

function migrateCachedParsed(hour: OreHourId, parsed: ParsedHour): ParsedHour {
  if (hour !== "ufficio" || !parsed.blocks?.length) return parsed;
  const blocks = migrateOreBlocks(parsed.blocks);
  if (JSON.stringify(blocks) === JSON.stringify(parsed.blocks)) return parsed;
  return { ...parsed, blocks };
}

function migrateHourPatch(patch: HourPatch): HourPatch {
  const u = patch.ufficio;
  if (!u) return patch;
  const migrated = migrateCachedParsed("ufficio", u);
  if (migrated === u) return patch;
  return { ...patch, ufficio: migrated };
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

function patchHourComplete(patch: HourPatch, hour: OreHourId): boolean {
  if (hour === "invitatorio") return !!(patch.invitFetched && (patch.invitAnt || "").trim());
  if (hour === "ora-media") {
    return (["terza", "sesta", "nona"] as MediaId[]).every((id) => hourHasContent(patch[id]));
  }
  return hourHasContent(patch[hour]);
}

/** Se il CEI non ha dato contenuto, completa da liturgiadelleore.it. */
async function withLdoFallback(hour: OreHourId, patch: HourPatch, dateISO: string): Promise<HourPatch> {
  if (patchHourComplete(patch, hour)) return patch;
  const ldo = await fetchLdoDayHtml(dateISO);
  if (!ldo) return patch;
  const existing: Partial<Record<OreHourId | MediaId, ParsedHour>> & {
    invitAnt?: string;
    invitFetched?: boolean;
  } = { ...patch };
  const fill = ldoFallbackPatch(ldo, hour, dateISO, existing);
  if (!Object.keys(fill).length) return patch;
  const next: HourPatch = { ...patch, ...fill };
  // Ora-media: merge pezzo per pezzo (CEI può averne già alcune).
  if (hour === "ora-media") {
    for (const id of ["terza", "sesta", "nona"] as MediaId[]) {
      if (!hourHasContent(patch[id]) && hourHasContent(fill[id])) next[id] = fill[id];
      else if (hourHasContent(patch[id])) next[id] = patch[id];
    }
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
  const prev = (await loadDayHours(dateISO)) || emptyDay(dateISO, ceiTitle);
  const results = await mapPool(FETCH_HOURS, CEI_FETCH_CONCURRENCY, async (hour) => {
    if (hour === "compieta") {
      const bundled = getBundledCompline(dateISO);
      if (bundled?.blocks?.length) return { compieta: bundled };
    }
    // Se l'ora è già in cache, non rischiare di rovinarla con un CEI ballerino.
    const cached = cachedHoursPatch(prev, hour);
    if (cached && !hourPatchNeedsItalian(cached)) return migrateHourPatch(cached);
    return withLdoFallback(hour, await fetchHourPatch(dateISO, hour), dateISO);
  });
  let hours: DayHoursCache["hours"] = { ...prev.hours };
  let invitAnt: string | undefined;
  let invitFetched = false;
  let hoursBanner = "";
  for (const p of results) {
    if (p.invitFetched) invitFetched = true;
    if (p.invitAnt) invitAnt = p.invitAnt;
    if (p.hoursBanner && !hoursBanner) hoursBanner = p.hoursBanner;
    const { invitAnt: _a, invitFetched: _f, hoursBanner: _b, ...rest } = p;
    hours = mergeHourMaps(hours, rest as Partial<Record<OreHourId | MediaId, ParsedHour>>);
  }
  return mergeDayHours(
    dateISO,
    {
      hours,
      ...(invitAnt !== undefined ? { invitAnt } : {}),
      invitFetched: invitFetched || prev.invitFetched,
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
      const migrated = migrateHourPatch(cached);
      const ufficioMigrated =
        hour === "ufficio" &&
        migrated.ufficio &&
        JSON.stringify(migrated.ufficio.blocks) !== JSON.stringify(existing.hours.ufficio?.blocks);
      if (!hourPatchNeedsItalian(migrated)) {
        if (ufficioMigrated) {
          return mergeDayHours(dateISO, { hours: { ufficio: migrated.ufficio } }, ceiTitle);
        }
        return existing;
      }
      const enriched = await enrichLatinHymns(migrated, dateISO);
      if (hymnFingerprint(enriched) === hymnFingerprint(migrated) && !ufficioMigrated) return existing;
      const { invitAnt: _a, invitFetched: _f, hoursBanner: _b, ...hourMap } = enriched;
      return mergeDayHours(dateISO, { hours: hourMap }, ceiTitle);
    }
  }
  const patch = await withLdoFallback(hour, await fetchHourPatch(dateISO, hour), dateISO);
  const { invitAnt, invitFetched, hoursBanner, ...hourMap } = patch;
  const prevHours = existing?.hours || {};
  return mergeDayHours(
    dateISO,
    {
      hours: mergeHourMaps(
        prevHours,
        hourMap as Partial<Record<OreHourId | MediaId, ParsedHour>>,
      ),
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
