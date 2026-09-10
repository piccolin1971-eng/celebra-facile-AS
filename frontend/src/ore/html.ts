export function decodeHtmlEntities(s: string): string {
  return s
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
    .replace(/&aelig;/gi, "æ")
    .replace(/&AElig;/g, "Æ")
    .replace(/&oelig;/gi, "œ")
    .replace(/&OElig;/g, "Œ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
  )
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B\uFEFF]/g, "")
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
    const slice = html.slice(i, i + 12);
    if (/^<br\s*\/?>/i.test(slice)) {
      nodes.push({ kind: "br" });
      i = html.indexOf(">", i) + 1;
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

export function hymnLineSplit(htmlOrText: string): string[] {
  return stripTags(String(htmlOrText).replace(/<br\s*\/?>/gi, "\n"))
    .split(/\n/)
    .map((s) => s.trim())
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

/** Solo il corpo liturgico CEI, senza share Facebook / sidebar. */
export function liturgicalFragment(html: string): string {
  const first = html.search(
    /<div[^>]*class="[^"]*lo_(titolo|versetto|antifona|sottotitolo|rosso)[^"]*"[^>]*>/i,
  );
  const share = html.search(/<[^>]*class="[^"]*(share-container|cci_get_social_share)/i);
  if (first >= 0) {
    const end = share > first ? share : html.length;
    return html.slice(first, end);
  }
  const openRe = /<div[^>]*class="[^"]*cci-liturgia-ore(?![-\w])[^"]*"[^>]*>/i;
  const open = html.match(openRe);
  if (open && open.index != null) {
    const el = extractMatchingElement(html, open.index);
    if (el?.inner && el.inner.length > 80) {
      return cutChrome(el.inner);
    }
  }
  return cutChrome(html);
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
