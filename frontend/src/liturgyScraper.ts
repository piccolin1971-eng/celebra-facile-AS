/**
 * Scraper standalone per le letture del giorno da chiesacattolica.it
 * Eseguito direttamente dall'app (nessun backend richiesto).
 *
 * Note:
 * - chiesacattolica.it supporta CORS sul mobile (native fetch non applica CORS)
 * - Su web potrebbe essere necessario un proxy CORS, ma l'app finale è un APK Android
 */
import {
  resolveCeiPrimaryCelebration,
  extractCelebrationColorBlocksFromHtml,
  pickCeiMassBlockForMode,
  celebrationTitlesMatch,
  isVigilOrVespertineMass,
} from "./liturgicalColorUtils";
import { getVigilEveContext } from "./vigilCatalog";
import type { CelebrationMode } from "./massSession";
import { localDateStr, parseLocalDate } from "./dateUtils";
import { normalizeTypewriterCapAccents } from "./litTextNormalize";

export type Reading = {
  type: string;
  reference: string;
  title: string;
  /** Sottotitolo CEI (h3), es. «Abbiate in voi…». */
  subtitle?: string;
  text: string;
};

export type ScrapedLiturgy = {
  date: string;          // YYYY-MM-DD
  date_label: string;
  season: { season: string; color: string; color_hex: string };
  saints: { title: string; rank: string; color: string }[];
  readings: Reading[];
  title: string;
  liturgical_color: string;
  source_url: string;
  error?: string;
};

const SECTION_TYPES: Array<[RegExp, string]> = [
  [/^antifona\s+d?['’ ]?ingresso|^antifona$/i, "antifona_ingresso"],
  [/^colletta/i, "colletta"],
  [/^prima lettura/i, "prima_lettura"],
  [/^salmo/i, "salmo"],
  [/^seconda lettura/i, "seconda_lettura"],
  [/^sequenza/i, "sequenza"],
  [/^acclamazione|^canto al vangelo/i, "acclamazione"],
  [/^vangelo/i, "vangelo"],
  [/^sulle offerte|^preghiera sulle offerte/i, "sulle_offerte"],
  [/^antifona alla comunione|^antifona di comunione/i, "antifona_comunione"],
  [/^dopo la comunione|^preghiera dopo la comunione/i, "dopo_comunione"],
];

const TYPE_LABELS: Record<string, string> = {
  antifona_ingresso: "Antifona d'ingresso",
  colletta: "Colletta",
  prima_lettura: "Prima Lettura",
  salmo: "Salmo Responsoriale",
  seconda_lettura: "Seconda Lettura",
  sequenza: "Sequenza",
  acclamazione: "Acclamazione al Vangelo",
  vangelo: "Vangelo",
  sulle_offerte: "Sulle offerte",
  antifona_comunione: "Antifona alla Comunione",
  dopo_comunione: "Dopo la Comunione",
};

const ORDER = [
  "antifona_ingresso", "colletta", "prima_lettura", "salmo", "seconda_lettura",
  "sequenza", "acclamazione", "vangelo", "sulle_offerte",
  "antifona_comunione", "dopo_comunione",
];

function decodeHtmlEntities(s: string): string {
  return normalizeTypewriterCapAccents(
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&rsquo;/g, "’")
      .replace(/&lsquo;/g, "‘")
      .replace(/&ldquo;/g, "“")
      .replace(/&rdquo;/g, "”")
      .replace(/&Egrave;/g, "È")
      .replace(/&egrave;/g, "è")
      .replace(/&Eacute;/g, "É")
      .replace(/&eacute;/g, "é")
      .replace(/&Agrave;/g, "À")
      .replace(/&agrave;/g, "à")
      .replace(/&Ograve;/g, "Ò")
      .replace(/&ograve;/g, "ò")
      .replace(/&Ugrave;/g, "Ù")
      .replace(/&ugrave;/g, "ù")
      .replace(/&Igrave;/g, "Ì")
      .replace(/&igrave;/g, "ì")
      .replace(/&Uuml;/g, "Ü")
      .replace(/&uuml;/gi, "ü")
      .replace(/&Iuml;/g, "Ï")
      .replace(/&iuml;/gi, "ï")
      .replace(/&Auml;/g, "Ä")
      .replace(/&auml;/gi, "ä")
      .replace(/&Ouml;/g, "Ö")
      .replace(/&ouml;/gi, "ö")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
  );
}

function stripTags(html: string, insertNewlines = true): string {
  if (!html) return "";
  let s = html;
  // Converte <br> e blocchi in newline
  if (insertNewlines) {
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, "\n");
    s = s.replace(/<(p|div|li|h[1-6]|section|article)[^>]*>/gi, "\n");
  }
  // Rimuove tutti i tag restanti
  s = s.replace(/<[^>]+>/g, "");
  // Decodifica entità
  s = decodeHtmlEntities(s);
  return s;
}

function cleanText(text: string): string {
  if (!text) return "";
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  // Ricompone parentesi spezzate su più righe
  t = t.replace(/\(\s*\n\s*([^()\n]+?)\s*\n\s*\)/g, "($1)");
  t = t.replace(/\(\s*\n+\s*/g, "(");
  t = t.replace(/\s*\n+\s*\)/g, ")");
  // Trim ogni riga mantenendo gli a-capo
  t = t.split("\n").map((line) => line.trim()).join("\n");
  return t.trim();
}

function classify(title: string): string | null {
  const t = title.trim();
  for (const [pattern, key] of SECTION_TYPES) {
    if (pattern.test(t)) return key;
  }
  return null;
}

/**
 * Sigla su riga propria: «Lc 9,43b-45», «Fm 7-20», «2Gv 1a.3-9», «1Ts 4,13-14».
 */
export function isBibleSiglaLine(line: string): boolean {
  return /^(?:[1-3]\s*)?[A-ZÈÉ][a-zèéì]{0,6}\.?\s*\d+(?:[,.:;][\dA-Za-z.\-–;,\s]*|[a-zA-Z][,.:][\dA-Za-z.\-–;,\s]*|[-–]\d[\dA-Za-z.\-–;,\s]*)$/.test(
    line.trim(),
  );
}

const GLUED_ABBR =
  "1Cor|2Cor|1Ts|2Ts|1Tm|2Tm|1Pt|2Pt|1Gv|2Gv|3Gv|1Sam|2Sam|1Re|2Re|1Cr|2Cr|1Mac|2Mac|Mt|Mc|Lc|Gv|At|Rm|Gal|Ef|Fil|Col|Tt|Fm|Eb|Gc|Gd|Ap|Gen|Es|Lv|Nm|Dt|Gs|Gdc|Rt|Esd|Ne|Tb|Gdt|Est|Gb|Sal|Pr|Qo|Ct|Sap|Sir|Is|Ger|Lam|Bar|Ez|Dn|Os|Gl|Am|Abd|Gio|Mi|Na|Ab|Sof|Ag|Zc|Ml";

/** «MatteoMt 25,31-46» o «LucaLc 21,1-4 In quel tempo…»: la sigla è incollata al titolo. */
function splitGluedSigla(line: string): { intro: string; sigla: string; rest: string } | null {
  const re = new RegExp(
    `^(Dal(?:la|l['’])?|Dagli?|Dall['’]?)\\s+(.+?[a-zàèéìòù])((?:[1-3])?(?:${GLUED_ABBR}))\\s*(\\d[\\d,.:a-zA-Z\\-–;]*)(?:\\s+([\\s\\S]+))?$`,
  );
  const m = line.trim().match(re);
  if (!m) return null;
  const intro = `${m[1]} ${m[2].replace(/\s+/g, " ").trim()}`;
  const sigla = `${m[3]} ${m[4]}`.replace(/\s+/g, " ").trim();
  return { intro, sigla, rest: (m[5] || "").trim() };
}

function extractReference(fullText: string, rtype: string): [string, string] {
  if (!["prima_lettura", "seconda_lettura", "vangelo"].includes(rtype)) {
    return ["", fullText];
  }
  // Pattern: "Dal/Dagli/Dalla ... <Abbr bibl.> <Testo...>"
  const m = fullText.match(
    /^(Dal(?:la|l')?|Dagli?|Dall['’]?)\s+([^.]{2,80}?)\s+([1-3]?\s?[A-ZÈÉ][a-zèéì]{0,4}\.?\s*\d+[,.:]\s?[\d\-\.\,aA–\s]+)\s+([\s\S]+)$/,
  );
  if (m) {
    const intro = `${m[1]} ${m[2].replace(/\s+/g, " ").trim()}`;
    const refBody = m[3].trim();
    const body = m[4].trim();
    return [`${intro} (${refBody})`, body];
  }
  const lines = fullText.split("\n");
  const introLine = (lines[0] || "").trim();
  const glued = splitGluedSigla(introLine);
  if (glued) {
    const after = lines.slice(1).join("\n").trim();
    const body = [glued.rest, after].filter(Boolean).join("\n").trim();
    return [`${glued.intro} (${glued.sigla})`, body];
  }
  // Il CEI mette spesso la sigla a capo, anche con lettere (43b), «;» o senza virgola («Fm 7-20»).
  if (/^(Dal|Dalla|Dagli|Dall['’])/i.test(introLine)) {
    let i = 1;
    while (i < lines.length && !lines[i].trim()) i += 1;
    const sigla = (lines[i] || "").trim();
    if (isBibleSiglaLine(sigla)) {
      i += 1;
      while (i < lines.length && !lines[i].trim()) i += 1;
      return [`${introLine} (${sigla})`, lines.slice(i).join("\n").trim()];
    }
  }
  // Fallback: prima riga se breve
  const firstNl = fullText.indexOf("\n");
  if (firstNl > 0 && firstNl < 100) {
    return [fullText.slice(0, firstNl).trim(), fullText.slice(firstNl + 1).trim()];
  }
  return ["", fullText];
}

function extractH3Chunks(html: string): Array<{ title: string; chunk: string }> {
  const h3Re = /<h3[^>]*class="[^"]*single_title[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;
  const headers: Array<{ title: string; after: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = h3Re.exec(html)) !== null) {
    if (/visually-hidden/i.test(m[1])) continue;
    const title = cleanText(stripTags(m[1]));
    if (!title) continue;
    headers.push({ title, start: m.index, after: m.index + m[0].length });
  }
  return headers.map((h, i) => ({
    title: h.title,
    chunk: html.slice(h.after, i + 1 < headers.length ? headers[i + 1].start : html.length),
  }));
}

function readingsFromHtmlChunk(chunkHtml: string): Reading[] {
  const sections = extractSections(chunkHtml);
  const seen = new Set<string>();
  const readings: Reading[] = [];
  for (const sec of sections) {
    const rtype = classify(sec.title);
    if (!rtype || seen.has(rtype)) continue;
    seen.add(rtype);
    const [reference, body] = extractReference(sec.body, rtype);
    readings.push({
      type: rtype,
      title: TYPE_LABELS[rtype] || sec.title,
      reference,
      subtitle: sec.subtitle || "",
      text: body,
    });
  }
  readings.sort((a, b) => {
    const ia = ORDER.indexOf(a.type);
    const ib = ORDER.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return readings;
}

function pickChunkForMode(
  chunks: Array<{ title: string; chunk: string }>,
  colorBlock: { title: string } | null,
  mode: CelebrationMode,
  vigilEve: ReturnType<typeof getVigilEveContext>,
): { title: string; chunk: string } | null {
  if (chunks.length === 0) return null;

  if (colorBlock) {
    const matched = chunks.find((c) => celebrationTitlesMatch(c.title, colorBlock.title));
    if (matched) return matched;
  }

  if (vigilEve && mode === "vigil_proper") {
    const vigil = chunks.find(
      (c) =>
        isVigilOrVespertineMass(c.title) &&
        celebrationTitlesMatch(c.title, vigilEve.solemnityTitle),
    );
    if (vigil) return vigil;
    return chunks.find((c) => isVigilOrVespertineMass(c.title)) ?? null;
  }

  if (vigilEve && mode === "solemnity_day") {
    const sol = chunks.find(
      (c) =>
        !isVigilOrVespertineMass(c.title) &&
        celebrationTitlesMatch(c.title, vigilEve.solemnityTitle),
    );
    if (sol) return sol;
    return null;
  }

  if (vigilEve) {
    const fallback = chunks.find(
      (c) =>
        !isVigilOrVespertineMass(c.title) &&
        !celebrationTitlesMatch(c.title, vigilEve.solemnityTitle),
    );
    if (fallback) return fallback;
  }

  return chunks[0];
}

function resolveLiturgyFromCeiHtmlInternal(
  html: string,
  targetDate: Date,
  mode: CelebrationMode,
): { title: string; liturgical_color: string; readings: Reading[] } | null {
  const chunks = extractH3Chunks(html);
  if (chunks.length === 0) return null;

  const colorBlocks = extractCelebrationColorBlocksFromHtml(html);
  const vigilEve = getVigilEveContext(targetDate);
  const colorBlock = pickCeiMassBlockForMode(colorBlocks, mode, vigilEve);
  const primaryChunk = pickChunkForMode(chunks, colorBlock, mode, vigilEve);
  if (!primaryChunk) return null;

  const readings = readingsFromHtmlChunk(primaryChunk.chunk);
  const title = colorBlock?.title || primaryChunk.title;
  const liturgical_color =
    colorBlock?.color ||
    resolveCeiPrimaryCelebration(html, extractOgTitle(html)).color ||
    "";

  if (!title && readings.length === 0) return null;
  return { title, liturgical_color, readings };
}

/** Risolve titolo, colore e letture da HTML CEI (testabile / offline). */
export function resolveLiturgyFromCeiHtml(
  html: string,
  targetDate: Date,
  mode: CelebrationMode = "calendar_day",
): { title: string; liturgical_color: string; readings: Reading[] } {
  const fromBlocks = resolveLiturgyFromCeiHtmlInternal(html, targetDate, mode);

  if (fromBlocks && fromBlocks.readings.length > 0) {
    return fromBlocks;
  }

  const vigilEve = getVigilEveContext(targetDate);
  if (vigilEve && mode !== "calendar_day") {
    return {
      title: fromBlocks?.title || "",
      liturgical_color: fromBlocks?.liturgical_color || "",
      readings: [],
    };
  }

  const pageTitle = extractOgTitle(html);
  const ceiPrimary = resolveCeiPrimaryCelebration(html, pageTitle);
  const sections = extractSections(html);
  const seen = new Set<string>();
  const readings: Reading[] = [];
  for (const sec of sections) {
    const rtype = classify(sec.title);
    if (!rtype || seen.has(rtype)) continue;
    seen.add(rtype);
    const [reference, body] = extractReference(sec.body, rtype);
    readings.push({
      type: rtype,
      title: TYPE_LABELS[rtype] || sec.title,
      reference,
      subtitle: sec.subtitle || "",
      text: body,
    });
  }
  readings.sort((a, b) => {
    const ia = ORDER.indexOf(a.type);
    const ib = ORDER.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return {
    title: fromBlocks?.title || ceiPrimary.title,
    liturgical_color: fromBlocks?.liturgical_color || ceiPrimary.color || "",
    readings: fromBlocks?.readings?.length ? fromBlocks.readings : readings,
  };
}

function resolvePrimaryFromMassBlocks(
  html: string,
  targetDate: Date,
  _pageTitle: string,
  mode: CelebrationMode = "calendar_day",
): { title: string; liturgical_color: string; readings: Reading[] } | null {
  return resolveLiturgyFromCeiHtmlInternal(html, targetDate, mode);
}

function extractSections(html: string): Array<{ title: string; subtitle: string; body: string }> {
  const sections: Array<{ title: string; subtitle: string; body: string }> = [];
  const re = /<h2[^>]*class="[^"]*cci-liturgia-giorno-section-title[^"]*"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*class="[^"]*cci-liturgia-giorno-section-title|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const titleHtml = m[1];
    const afterTitle = m[2];
    const divMatch = afterTitle.match(/<div[^>]*class="[^"]*cci-liturgia-giorno-section-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!divMatch) continue;
    const title = cleanText(stripTags(titleHtml));
    const subMatch = afterTitle.match(
      /<h3[^>]*class="[^"]*cci-liturgia-giorno-section-subtitle[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
    );
    const subtitle = subMatch ? cleanText(stripTags(subMatch[1])) : "";
    const body = cleanText(stripTags(divMatch[1]));
    if (title && body) sections.push({ title, subtitle, body });
  }
  return sections;
}

function extractOgTitle(html: string): string {
  // 1) Prima prova: <title>...</title> (contiene il nome del santo/celebrazione)
  //    Es: "Liturgia del giorno 02 Maggio 2026 - SANT'ATANASIO, VESCOVO E DOTTORE DELLA CHIESA - MEMORIA - sito ufficiale della CEI - Chiesacattolica.it"
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    let t = decodeHtmlEntities(stripTags(titleMatch[1])).trim();
    // Rimuovi suffisso "- sito ufficiale..."
    t = t.replace(/\s*[-–—]\s*sito\s+ufficiale.*$/i, "").trim();
    // Rimuovi prefisso "Liturgia del giorno DD Mese YYYY -"
    t = t.replace(/^Liturgi[ae]?\s+del(?:l['’]a)?\s+giorno\s+\d{1,2}\s+\w+\s+\d{4}\s*[-–—]\s*/i, "").trim();
    // Rimuovi "Chiesacattolica.it" finale se presente
    t = t.replace(/\s*[-–—]\s*Chiesacattolica\.it\s*$/i, "").trim();
    if (t && !/^\d{6,8}$/.test(t) && !/^Liturgi[ae]\s+del/i.test(t)) {
      return t;
    }
  }
  // 2) Fallback: og:title (di solito contiene solo la data)
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (!m) return "";
  let content = decodeHtmlEntities(m[1]).trim();
  content = content.replace(/^(Liturgi[ae])\s+(del|di|dei)\s+/i, "").trim();
  content = content.replace(/\s*[-–—]\s*\d{6,8}\s*$/, "").trim();
  if (/^\d{6,8}$/.test(content)) content = "";
  return content;
}

function buildUrl(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `https://www.chiesacattolica.it/liturgia-del-giorno/?data-liturgia=${y}${mo}${da}`;
}

// Su web (browser/preview Expo) il fetch cross-origin è bloccato dal CORS.
// Su React Native (APK Android) non c'è CORS e il fetch è diretto.
// Usiamo proxy CORS pubblici solo in browser, in parallelo (prima risposta valida).
const CORS_PROXIES: Array<(u: string) => string> = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${u}`,
];

const CEI_ACCEPT_HEADERS = {
  "Accept-Language": "it-IT,it;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
} as const;

const CEI_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  ...CEI_ACCEPT_HEADERS,
} as const;

/** Timeout per singolo tentativo. Le Ore CEI pesano ~300 KB (immagine in pagina). */
const CEI_FETCH_TIMEOUT_MS = 25_000;

export function isCeiWebFetch(): boolean {
  // @ts-ignore - "document" esiste solo nei browser
  return typeof document !== "undefined";
}

function isWebEnvironment(): boolean {
  return isCeiWebFetch();
}

const ceiHtmlCache = new Map<string, string>();
const ceiHtmlInflight = new Map<string, Promise<string | null>>();

/** Fetch HTML CEI (Ore, letture). Su APK: diretto; su web: proxy CORS. */
export async function fetchCeiUrl(url: string): Promise<string | null> {
  if (!isWebEnvironment()) {
    try {
      return await fetchCeiHtmlViaCandidate(url);
    } catch (e) {
      if (__DEV__) console.log("fetchCeiUrl err:", e);
      return null;
    }
  }
  try {
    return await Promise.any(CORS_PROXIES.map((p) => fetchCeiHtmlViaCandidate(p(url))));
  } catch (e) {
    if (__DEV__) console.log("fetchCeiUrl web err:", e);
    return null;
  }
}

async function fetchCeiHtmlOnce(
  candidate: string,
  headers: Record<string, string>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CEI_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(candidate, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    if (txt.length < 500 || /\"error\":/i.test(txt.substring(0, 200))) {
      throw new Error("Risposta proxy non valida");
    }
    return txt;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchCeiHtmlViaCandidate(candidate: string): Promise<string> {
  try {
    return await fetchCeiHtmlOnce(candidate, { ...CEI_FETCH_HEADERS });
  } catch (e) {
    // Su alcuni Android vecchi User-Agent è un header vietato e il fetch fallisce.
    return await fetchCeiHtmlOnce(candidate, { ...CEI_ACCEPT_HEADERS });
  }
}

async function fetchCeiHtmlUncached(targetDate: Date): Promise<string | null> {
  const url = buildUrl(targetDate);
  if (!isWebEnvironment()) {
    try {
      return await fetchCeiHtmlViaCandidate(url);
    } catch (e) {
      if (__DEV__) console.log("fetchCeiHtml err:", e);
      return null;
    }
  }

  // 1) Proxy locale Metro (stesso origin del preview web) — affidabile in DEV.
  try {
    const y = targetDate.getFullYear();
    const mo = String(targetDate.getMonth() + 1).padStart(2, "0");
    const da = String(targetDate.getDate()).padStart(2, "0");
    const localProxy = `/cei-liturgia?data-liturgia=${y}${mo}${da}`;
    const localTxt = await fetchCeiHtmlViaCandidate(localProxy);
    if (localTxt) return localTxt;
  } catch (e) {
    if (__DEV__) console.log("fetchCeiHtml local proxy:", e);
  }

  // 2) Fallback: proxy CORS pubblici
  const candidates = CORS_PROXIES.map((p) => p(url));
  try {
    return await Promise.any(candidates.map((candidate) => fetchCeiHtmlViaCandidate(candidate)));
  } catch (e) {
    if (__DEV__) console.log("fetchCeiHtml err:", e);
    return null;
  }
}

/** Scarica HTML grezzo dalla pagina CEI del giorno (o via proxy su web). */
export async function fetchCeiHtml(targetDate: Date): Promise<string | null> {
  const iso = localDateStr(targetDate);
  const cached = ceiHtmlCache.get(iso);
  if (cached) return cached;

  let inflight = ceiHtmlInflight.get(iso);
  if (!inflight) {
    inflight = fetchCeiHtmlUncached(targetDate).then((txt) => {
      ceiHtmlInflight.delete(iso);
      if (txt) ceiHtmlCache.set(iso, txt);
      return txt;
    });
    ceiHtmlInflight.set(iso, inflight);
  }
  return inflight;
}

export async function scrapeLiturgy(
  targetDate: Date,
  mode: CelebrationMode = "calendar_day",
): Promise<{
  date: string;
  title: string;
  liturgical_color: string;
  readings: Reading[];
  source_url: string;
  error?: string;
}> {
  const url = buildUrl(targetDate);
  const y = targetDate.getFullYear();
  const mo = String(targetDate.getMonth() + 1).padStart(2, "0");
  const da = String(targetDate.getDate()).padStart(2, "0");
  const iso = `${y}-${mo}-${da}`;
  const result = {
    date: iso,
    title: "",
    liturgical_color: "",
    readings: [] as Reading[],
    source_url: url,
  };

  const vigilEve = getVigilEveContext(targetDate);
  const html = await fetchCeiHtml(targetDate);
  if (!html) {
    return {
      ...result,
      error: "Impossibile connettersi a chiesacattolica.it",
    };
  }

  let resolved = resolveLiturgyFromCeiHtml(html, targetDate, mode);

  if (
    mode === "solemnity_day" &&
    vigilEve &&
    resolved.readings.length === 0
  ) {
    const solDate = parseLocalDate(vigilEve.solemnityDateISO);
    const htmlSol = await fetchCeiHtml(solDate);
    if (htmlSol) {
      const fromSol = resolveLiturgyFromCeiHtml(htmlSol, solDate, "calendar_day");
      if (fromSol.readings.length > 0) {
        resolved = fromSol;
        result.source_url = buildUrl(solDate);
      }
    }
  }

  result.title = resolved.title;
  if (resolved.liturgical_color) result.liturgical_color = resolved.liturgical_color;
  result.readings = resolved.readings;

  if (result.readings.length === 0) {
    (result as { error?: string }).error = "Impossibile estrarre le letture dalla pagina.";
  }
  return result;
}