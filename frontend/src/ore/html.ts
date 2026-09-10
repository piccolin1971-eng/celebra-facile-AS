export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&rsquo;|&apos;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
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

export function liturgicalFragment(html: string): string {
  const first = html.search(/<div[^>]*class="[^"]*lo_(titolo|versetto|antifona|sottotitolo)/i);
  const start = first >= 0 ? first : 0;
  let cut = html.slice(start);
  const end = cut.search(
    /<footer\b|id="footer"|class="[^"]*(comments|related|wp-block-query|site-footer)/i,
  );
  if (end > 400) cut = cut.slice(0, end);
  return cut;
}
