/**
 * Scraper standalone per le letture del giorno da chiesacattolica.it
 * Eseguito direttamente dall'app (nessun backend richiesto).
 *
 * Note:
 * - chiesacattolica.it supporta CORS sul mobile (native fetch non applica CORS)
 * - Su web potrebbe essere necessario un proxy CORS, ma l'app finale è un APK Android
 */

export type Reading = {
  type: string;
  reference: string;
  title: string;
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
  return s
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
    .replace(/&egrave;/g, "è")
    .replace(/&eacute;/g, "é")
    .replace(/&agrave;/g, "à")
    .replace(/&ograve;/g, "ò")
    .replace(/&ugrave;/g, "ù")
    .replace(/&igrave;/g, "ì")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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
  // Fallback: prima riga se breve
  const firstNl = fullText.indexOf("\n");
  if (firstNl > 0 && firstNl < 100) {
    return [fullText.slice(0, firstNl).trim(), fullText.slice(firstNl + 1).trim()];
  }
  return ["", fullText];
}

function extractSections(html: string): Array<{ title: string; body: string }> {
  // Trova tutte le coppie: <h2 class="cci-liturgia-giorno-section-title">TITLE</h2> ... <div class="cci-liturgia-giorno-section-content">BODY</div>
  const sections: Array<{ title: string; body: string }> = [];
  // Regex globale per h2 con classe target
  const re = /<h2[^>]*class="[^"]*cci-liturgia-giorno-section-title[^"]*"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*class="[^"]*cci-liturgia-giorno-section-title|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const titleHtml = m[1];
    const afterTitle = m[2];
    // Estrai il primo div.section-content dopo il titolo
    const divMatch = afterTitle.match(/<div[^>]*class="[^"]*cci-liturgia-giorno-section-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!divMatch) continue;
    const title = cleanText(stripTags(titleHtml));
    const body = cleanText(stripTags(divMatch[1]));
    if (title && body) sections.push({ title, body });
  }
  return sections;
}

function extractOgTitle(html: string): string {
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

export async function scrapeLiturgy(targetDate: Date): Promise<{
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

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e: any) {
    return { ...result, error: `Impossibile connettersi a chiesacattolica.it: ${e?.message || e}` };
  }

  // Titolo
  result.title = extractOgTitle(html);

  // Sezioni → letture (primo match per tipo)
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
      text: body,
    });
  }

  readings.sort((a, b) => {
    const ia = ORDER.indexOf(a.type);
    const ib = ORDER.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  result.readings = readings;
  if (readings.length === 0) {
    (result as any).error = "Impossibile estrarre le letture dalla pagina.";
  }
  return result;
}
