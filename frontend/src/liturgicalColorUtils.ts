import type { CelebrationMode } from "./massSession";
import type { VigilEveContext } from "./vigilCatalog";

const MOVEABLE_FEAST_COLORS: { keywords: string[]; color: string }[] = [
  { keywords: ["corpus", "corpo e sangue", "santissimo corpo"], color: "bianco" },
  { keywords: ["santissima trinit"], color: "bianco" },
  { keywords: ["sacro cuore", "sacratissimo cuore"], color: "bianco" },
  { keywords: ["cuore immacolato"], color: "bianco" },
  { keywords: ["cristo re", "re dell'universo", "re delluniverso"], color: "bianco" },
  { keywords: ["tutti i santi"], color: "bianco" },
  { keywords: ["pentecoste"], color: "rosso" },
  { keywords: ["ascensione del signore", "ascensione"], color: "bianco" },
  { keywords: ["epifania"], color: "bianco" },
  { keywords: ["ceneri", "mercoledi delle ceneri"], color: "viola" },
  { keywords: ["palme", "domenica delle palme"], color: "rosso" },
  { keywords: ["passione del signore", "venerdi santo"], color: "rosso" },
];

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Colore da titolo CEI per feste mobili; null se nessuna corrispondenza. */
export function liturgicalColorFromMoveableFeastTitle(title: string | undefined): string | null {
  if (!title?.trim()) return null;
  const t = normalizeTitle(title);
  for (const rule of MOVEABLE_FEAST_COLORS) {
    if (rule.keywords.some((kw) => t.includes(normalizeTitle(kw)))) {
      return rule.color;
    }
  }
  return null;
}

/** Normalizza colore eventualmente fornito dallo scraper CEI. */
export function normalizeScrapedLiturgicalColor(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const c = raw.toLowerCase().trim();
  if (["verde", "viola", "bianco", "rosso", "rosa"].includes(c)) return c;
  if (c.includes("verd")) return "verde";
  if (c.includes("viol")) return "viola";
  if (c.includes("bianc")) return "bianco";
  if (c.includes("ross")) return "rosso";
  if (c.includes("ros")) return "rosa";
  return null;
}

export type CeiCelebrationColorBlock = { title: string; color: string };

const COLORE_LITURGICO_RE = /Colore\s+Liturgico\s+(bianco|verde|rosso|viola|rosa)/i;

function stripAnnoSuffix(title: string): string {
  return title.replace(/\s*-\s*anno\s+[abc]\s*$/i, "").trim();
}

function decodeMinimalEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&eacute;/gi, "é")
    .replace(/&igrave;/gi, "ì")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vigilia vespertina / veglia: non è la Messa del giorno sul calendario. */
export function isVigilOrVespertineMass(title: string): boolean {
  const t = normalizeTitle(title);
  return /\bvigil|\bvespertin|\bveglia\b/.test(t);
}

export function celebrationTitlesMatch(a: string, b: string): boolean {
  const na = stripAnnoSuffix(normalizeTitle(a));
  const nb = stripAnnoSuffix(normalizeTitle(b));
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const fa = na.split(/\s*-\s*/)[0] ?? na;
  const fb = nb.split(/\s*-\s*/)[0] ?? nb;
  return fa === fb || fa.includes(fb) || fb.includes(fa);
}

/** Estrae coppie titolo celebrazione (h3) → colore dalla pagina CEI. */
export function extractCelebrationColorBlocksFromHtml(html: string): CeiCelebrationColorBlock[] {
  const blocks: CeiCelebrationColorBlock[] = [];
  const seen = new Set<string>();
  const h3Re = /<h3[^>]*class="[^"]*single_title[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;
  const headers: Array<{ title: string; start: number; afterIndex: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = h3Re.exec(html)) !== null) {
    const title = decodeMinimalEntities(m[1]);
    if (!title || /visually-hidden/i.test(m[1])) continue;
    headers.push({ title, start: m.index, afterIndex: m.index + m[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    const { title, afterIndex } = headers[i];
    const chunkEnd = i + 1 < headers.length ? headers[i + 1].start : afterIndex + 8000;
    const chunk = html.slice(afterIndex, chunkEnd);
    const spanMatch = chunk.match(/Colore\s+Liturgico\s*<span[^>]*>\s*([^<]+)\s*<\/span>/i);
    const color = spanMatch
      ? normalizeScrapedLiturgicalColor(spanMatch[1])
      : normalizeScrapedLiturgicalColor(chunk.match(COLORE_LITURGICO_RE)?.[1]);
    if (!color) continue;
    const key = `${normalizeTitle(title)}|${color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({ title, color });
  }

  return blocks;
}

/** Sceglie il colore della Messa del giorno (esclude vigilie vespertine). */
export function selectLiturgicalColorFromCeiBlocks(
  blocks: CeiCelebrationColorBlock[],
  mainCelebrationTitle?: string,
): string | null {
  if (blocks.length === 0) return null;

  if (mainCelebrationTitle?.trim()) {
    for (const block of blocks) {
      if (
        !isVigilOrVespertineMass(block.title) &&
        celebrationTitlesMatch(block.title, mainCelebrationTitle)
      ) {
        return block.color;
      }
    }
  }

  for (const block of blocks) {
    if (!isVigilOrVespertineMass(block.title)) return block.color;
  }

  return blocks[0]?.color ?? null;
}

/**
 * Sceglie il blocco CEI da usare come «Messa del giorno» di calendario.
 * In vigilia vespertina esclude vigilia propria e anticipazione della solennità del giorno dopo.
 */
export function pickPrimaryCeiMassBlock(
  blocks: CeiCelebrationColorBlock[],
  vigilEve: { solemnityTitle: string } | null | undefined,
): CeiCelebrationColorBlock | null {
  if (blocks.length === 0) return null;

  const pickNonVigil = () => blocks.find((b) => !isVigilOrVespertineMass(b.title)) ?? blocks[0];

  if (!vigilEve) return pickNonVigil();

  for (const block of blocks) {
    if (isVigilOrVespertineMass(block.title)) continue;
    if (celebrationTitlesMatch(block.title, vigilEve.solemnityTitle)) continue;
    return block;
  }

  return pickNonVigil();
}

/**
 * Sceglie il blocco CEI in base alla modalità di celebrazione (vigilia vespertina).
 */
export function pickCeiMassBlockForMode(
  blocks: CeiCelebrationColorBlock[],
  mode: CelebrationMode,
  vigilEve: VigilEveContext | null | undefined,
): CeiCelebrationColorBlock | null {
  if (blocks.length === 0) return null;
  if (!vigilEve || mode === "calendar_day") {
    return pickPrimaryCeiMassBlock(blocks, vigilEve);
  }

  if (mode === "vigil_proper") {
    const vigil = blocks.find(
      (b) =>
        isVigilOrVespertineMass(b.title) &&
        celebrationTitlesMatch(b.title, vigilEve.solemnityTitle),
    );
    if (vigil) return vigil;
    return blocks.find((b) => isVigilOrVespertineMass(b.title)) ?? null;
  }

  if (mode === "solemnity_day") {
    const sol = blocks.find(
      (b) =>
        !isVigilOrVespertineMass(b.title) &&
        celebrationTitlesMatch(b.title, vigilEve.solemnityTitle),
    );
    if (sol) return sol;
    return null;
  }

  return pickPrimaryCeiMassBlock(blocks, vigilEve);
}

/** Titolo della Messa del giorno: primo h3 della pagina CEI (non il <title> HTML). */
export function extractPrimaryCelebrationTitleFromCeiHtml(html: string): string | null {
  const h3Re = /<h3[^>]*class="[^"]*single_title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i;
  const m = html.match(h3Re);
  if (!m) return null;
  if (/visually-hidden/i.test(m[1])) return null;
  const title = decodeMinimalEntities(m[1]);
  return title || null;
}

/**
 * Titolo e colore della Messa del giorno secondo CEI.
 * Il tag <title> può indicare una memoria facoltativa alternativa; il primo h3 è la Messa primaria.
 */
export function resolveCeiPrimaryCelebration(
  html: string,
  pageTitle?: string,
): { title: string; color: string | null } {
  const ogTitle = (pageTitle || "").trim();
  const primaryH3 = extractPrimaryCelebrationTitleFromCeiHtml(html);
  let title = ogTitle || primaryH3 || "";

  if (primaryH3) {
    const ogIsFacultative = /\bmemoria\s+facoltativa\b/i.test(ogTitle);
    const primaryIsFacultative = /\bmemoria\s+facoltativa\b/i.test(primaryH3);
    if ((ogIsFacultative && !primaryIsFacultative) || !ogTitle) {
      title = primaryH3;
    }
  }

  const color = extractLiturgicalColorFromCeiHtml(html, title);
  return { title, color };
}

/** Colore liturgico ufficiale CEI dalla pagina HTML (priorità su calcolo interno). */
export function extractLiturgicalColorFromCeiHtml(
  html: string,
  mainCelebrationTitle?: string,
): string | null {
  const blocks = extractCelebrationColorBlocksFromHtml(html);
  if (blocks.length > 0) {
    return selectLiturgicalColorFromCeiBlocks(blocks, mainCelebrationTitle);
  }
  const global =
    html.match(/Colore\s+Liturgico\s*<span[^>]*>\s*([^<]+)\s*<\/span>/i) ||
    html.match(COLORE_LITURGICO_RE);
  return global ? normalizeScrapedLiturgicalColor(global[1]) : null;
}
