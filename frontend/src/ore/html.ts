export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#8203;|&#x200[bB];/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&rsquo;/gi, "’")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&dagger;/gi, "†")
    .replace(/&Dagger;/g, "‡")
    .replace(/&hellip;/gi, "…")
    .replace(/&agrave;/gi, "à")
    .replace(/&aacute;/gi, "á")
    .replace(/&acirc;/gi, "â")
    .replace(/&egrave;/gi, "è")
    .replace(/&eacute;/gi, "é")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&igrave;/gi, "ì")
    .replace(/&iacute;/gi, "í")
    .replace(/&icirc;/gi, "î")
    .replace(/&ograve;/gi, "ò")
    .replace(/&oacute;/gi, "ó")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ucirc;/gi, "û")
    .replace(/&uuml;/gi, "ü")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&aelig;/gi, "æ")
    .replace(/&AElig;/g, "Æ")
    .replace(/&oelig;/gi, "œ")
    .replace(/&OElig;/g, "Œ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (code === 8203) return "";
      if (code === 160) return " ";
      return String.fromCharCode(code);
    })
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      if (code === 0x200b) return "";
      if (code === 0xa0) return " ";
      return String.fromCharCode(code);
    })
    .replace(/[\u200B\uFEFF\u200C\u200D]/g, "");
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<br\s*(?=<|$)/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/<[^>]*$/g, ""),
  )
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B\uFEFF\u200C\u200D]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasClass(cls: string, name: string): boolean {
  return cls.split(/\s+/).includes(name);
}

export function hasClassPrefix(cls: string, prefix: string): boolean {
  return cls.split(/\s+/).some((c) => c === prefix || c.startsWith(`${prefix}`));
}

export type HtmlNode =
  | { kind: "text"; text: string }
  | { kind: "br" }
  | { kind: "el"; tag: string; cls: string; inner: string };

export function extractMatchingElement(
  html: string,
  start: number,
): { inner: string; end: number; tag: string } | null {
  if (html[start] !== "<") return null;
  const open = html.slice(start).match(/^<([a-zA-Z][\w:-]*)([^>]*)>/);
  if (!open) return null;
  const tag = open[1];
  const tagLower = tag.toLowerCase();
  const openLen = open[0].length;
  if (/\/\s*$/.test(open[2]) || /^(br|img|hr|meta|input|link|source|area)$/i.test(tagLower)) {
    return { inner: "", end: start + openLen, tag: tagLower };
  }
  let depth = 1;
  let i = start + openLen;
  const openPat = new RegExp(`^<${tag}\\b[^>]*>`, "i");
  const closePat = new RegExp(`^</${tag}\\s*>`, "i");
  while (i < html.length && depth > 0) {
    const nextLt = html.indexOf("<", i);
    if (nextLt < 0) break;
    const rest = html.slice(nextLt);
    const close = rest.match(closePat);
    if (close) {
      depth -= 1;
      if (depth === 0) {
        return {
          inner: html.slice(start + openLen, nextLt),
          end: nextLt + close[0].length,
          tag: tagLower,
        };
      }
      i = nextLt + close[0].length;
      continue;
    }
    const nested = rest.match(openPat);
    if (nested) {
      if (!/\/\s*>$/.test(nested[0])) depth += 1;
      i = nextLt + nested[0].length;
      continue;
    }
    i = nextLt + 1;
  }
  return { inner: html.slice(start + openLen), end: html.length, tag: tagLower };
}

function classFromOpenTag(openAttrs: string): string {
  const m = openAttrs.match(/class\s*=\s*"([^"]*)"/i) || openAttrs.match(/class\s*=\s*'([^']*)'/i);
  return m ? m[1] : "";
}

export function topLevelNodes(html: string): HtmlNode[] {
  const nodes: HtmlNode[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const text = next < 0 ? html.slice(i) : html.slice(i, next);
      nodes.push({ kind: "text", text });
      i = next < 0 ? html.length : next;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    // <!doctype …>, <?xml …> — non saltare il '<' o resta "!doctype html>"
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const slice = html.slice(i, i + 12);
    if (/^<br\b/i.test(slice)) {
      nodes.push({ kind: "br" });
      const gt = html.indexOf(">", i);
      const nextLt = html.indexOf("<", i + 1);
      if (gt >= 0 && (nextLt < 0 || gt < nextLt)) i = gt + 1;
      else i = nextLt >= 0 ? nextLt : html.length;
      continue;
    }
    const open = html.slice(i).match(/^<([a-zA-Z][\w:-]*)([^>]*)>/);
    if (!open) {
      i += 1;
      continue;
    }
    const el = extractMatchingElement(html, i);
    if (!el) {
      i += 1;
      continue;
    }
    nodes.push({ kind: "el", tag: el.tag, cls: classFromOpenTag(open[2]), inner: el.inner });
    i = el.end;
  }
  return nodes;
}

export function nodesToHtml(nodes: HtmlNode[]): string {
  return nodes
    .map((n) => {
      if (n.kind === "text") return n.text;
      if (n.kind === "br") return "<br/>";
      return `<${n.tag} class="${n.cls}">${n.inner}</${n.tag}>`;
    })
    .join("");
}

/** Solo `<br>` è un verso: i newline dell’HTML CEI (es. `(Hæ)` in lo_rosso) restano sulla stessa riga. */
export function hymnLineSplit(htmlOrText: string): string[] {
  return String(htmlOrText)
    .split(/<br\s*\/?>/i)
    .map((s) =>
      stripTags(s)
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim(),
    )
    .filter(Boolean);
}

const JUNK_CLASS =
  /share|social|facebook|twitter|widget|breadcrumb|fontsize|sidebar|navbar|cookie|comment|related|footer|header-share|cci_get_social/i;
const JUNK_TAG = /^(script|style|nav|footer|form|iframe|svg|noscript)$/i;

export function isJunkNode(n: HtmlNode): boolean {
  if (n.kind !== "el") return false;
  if (JUNK_TAG.test(n.tag)) return true;
  if (JUNK_CLASS.test(n.cls)) return true;
  return false;
}

export function isLiturgyClass(cls: string): boolean {
  return cls.split(/\s+/).some((c) => c.startsWith("lo_"));
}

export function extractHoursBanner(html: string): string {
  const m = html.match(
    /<div[^>]*class="[^"]*cci-opere-giorni-liturgia[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (!m) return "";
  return stripTags(m[1]).replace(/\s+/g, " ").trim();
}

/** True se la pagina CEI contiene il markup delle Ore (non solo il guscio del sito). */
export function hasHoursMarkup(html: string): boolean {
  return classTokenIndex(html, "lo_titolo") >= 0 || classTokenIndex(html, "lo_versetto") >= 0;
}

/**
 * Toglie script, CSS e le JPEG in base64 della pagina CEI (~200 KB).
 * Su telefoni vecchi regex/parse sull'HTML intero finivano per mostrare il chrome del sito.
 */
export function stripHeavyCeiAssets(html: string): string {
  let s = removeBetween(html, "<script", "</script>");
  s = removeBetween(s, "<SCRIPT", "</SCRIPT>");
  s = removeBetween(s, "<style", "</style>");
  s = removeBetween(s, "<STYLE", "</STYLE>");
  return removeDataImages(s);
}

function removeBetween(html: string, open: string, close: string): string {
  let out = "";
  let i = 0;
  const openLen = open.length;
  const closeLen = close.length;
  while (i < html.length) {
    const start = html.indexOf(open, i);
    if (start < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, start);
    const end = html.indexOf(close, start + openLen);
    i = end < 0 ? html.length : end + closeLen;
  }
  return out;
}

function removeDataImages(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const data = html.indexOf("data:image", i);
    if (data < 0) {
      out += html.slice(i);
      break;
    }
    const tagStart = html.lastIndexOf("<", data);
    if (tagStart < i || tagStart < 0) {
      out += html.slice(i, data + 10);
      i = data + 10;
      continue;
    }
    out += html.slice(i, tagStart);
    const tagEnd = html.indexOf(">", data);
    i = tagEnd < 0 ? html.length : tagEnd + 1;
  }
  return out;
}

/** Indice di una class CSS intera, senza regex su pagine da 300 KB. */
function classTokenIndex(html: string, name: string, from = 0): number {
  let i = from;
  while (i < html.length) {
    const at = html.indexOf(name, i);
    if (at < 0) return -1;
    const prev = at > 0 ? html[at - 1] : "";
    const next = html[at + name.length] || "";
    const prevOk = prev === '"' || prev === "'" || prev === " " || prev === "=";
    const nextOk = next === '"' || next === "'" || next === " " || next === "";
    if (prevOk && nextOk) return at;
    i = at + name.length;
  }
  return -1;
}

function tagStartBefore(html: string, at: number): number {
  const open = html.lastIndexOf("<", at);
  return open >= 0 ? open : at;
}

/** Solo il corpo liturgico CEI, senza share Facebook / sidebar. */
export function liturgicalFragment(html: string): string {
  const src = stripHeavyCeiAssets(html);
  const keys = ["lo_versetto", "lo_titolo", "lo_antifona", "lo_sottotitolo", "lo_rosso"];
  let first = -1;
  for (const key of keys) {
    const at = classTokenIndex(src, key);
    if (at < 0) continue;
    const open = tagStartBefore(src, at);
    if (first < 0 || open < first) first = open;
  }
  const shareAt = classTokenIndex(src, "share-container");
  const shareAt2 = classTokenIndex(src, "cci_get_social_share");
  const share = [shareAt, shareAt2].filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (first >= 0) {
    const end = share > first ? share : src.length;
    return dropIncompleteTail(src.slice(first, end));
  }
  const cci = classTokenIndex(src, "cci-liturgia-ore");
  if (cci >= 0) {
    const el = extractMatchingElement(src, tagStartBefore(src, cci));
    if (el?.inner && (classTokenIndex(el.inner, "lo_titolo") >= 0 || classTokenIndex(el.inner, "lo_versetto") >= 0)) {
      return dropIncompleteTail(cutChrome(el.inner));
    }
  }
  // Mai restituire il guscio della pagina (doctype, menu, "Nessun Contenuto Trovato").
  return "";
}

/** La pagina CEI a volte taglia l'HTML a metà di un tag (`<div class="`). */
function dropIncompleteTail(html: string): string {
  const cut = html.search(/<[a-zA-Z][\w:-]*\b[^>]*$/);
  if (cut > 0) return html.slice(0, cut);
  return html;
}

function cutChrome(html: string): string {
  let cut = html;
  const end = cut.search(
    /<[^>]*class="[^"]*(share-container|cci_get_social_share|site-footer)|<footer\b|id="footer"/i,
  );
  if (end > 200) cut = cut.slice(0, end);
  return cut;
}

/** Linearizza wrapper HTML: restano nodi lo_* e testo liturgico. */
export function flattenLiturgyNodes(html: string): HtmlNode[] {
  const out: HtmlNode[] = [];
  const walk = (nodes: HtmlNode[]) => {
    for (const n of nodes) {
      if (n.kind === "br") {
        out.push(n);
        continue;
      }
      if (n.kind === "text") {
        if (n.text.replace(/\s+/g, " ").trim()) out.push(n);
        continue;
      }
      if (isJunkNode(n)) continue;
      if (isLiturgyClass(n.cls)) {
        out.push(n);
        continue;
      }
      walk(topLevelNodes(n.inner));
    }
  };
  walk(topLevelNodes(html));
  return out;
}
