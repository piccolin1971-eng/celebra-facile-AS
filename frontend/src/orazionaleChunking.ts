/**
 * Normalizza e pagina le Preghiere dei fedeli rispettando i confini delle intenzioni.
 */

export const FEDELI_CHARS_PER_PAGE = 900;

/** Inserisce \n\n tra intenzioni se mancanti (dati legacy o stile «Tu che…»). */
export function normalizeFedeliParagraphs(text: string): string {
  if (!text) return "";
  let t = text.replace(/\r\n/g, "\n").trim();
  t = t.replace(/(Preghiamo\. R\/\.|Noi ti preghiamo\. R\/\.)\n(Per |Perché)/gi, "$1\n\n$2");
  t = t.replace(/(R\/\. [^\n]+)\n(Per |Perché)/g, "$1\n\n$2");
  t = t.replace(/(Noi ti preghiamo\. R\/\.|Preghiamo\. R\/\.)\n(Tu che )/gi, "$1\n\n$2");
  t = t.replace(/([^\n])\n(Tu che )/g, "$1\n\n$2");
  t = t.replace(/(Preghiamo\. R\/\.|Noi ti preghiamo\. R\/\.)\n(?!\n)([A-ZÀÈÉÌÒÙ])/g, "$1\n\n$2");
  return t.replace(/\n{3,}/g, "\n\n");
}

/**
 * Spezza il testo della Preghiera dei fedeli in chunk per la paginazione,
 * preferendo confini di paragrafo e intenzioni liturgiche.
 */
export function splitFedeliTextIntoChunks(text: string, maxChars: number): string[] {
  const normalized = normalizeFedeliParagraphs(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const HARD_LIMIT = Math.round(maxChars * 1.1);
  const paragraphs = normalized.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  const splitLongParagraph = (p: string): string[] => {
    if (p.length <= HARD_LIMIT) return [p];
    const boundaryRe = /(?=(?:^|\n)(?:Per |Perché |Tu che |Preghiamo\.|Noi ti preghiamo\.|Ricordati,|Accogli,|O Dio|Signore ))/gm;
    const parts = p.split(boundaryRe).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const out: string[] = [];
      let buf = "";
      for (const part of parts) {
        const cand = buf ? `${buf}\n\n${part}` : part;
        if (cand.length > maxChars && buf) {
          out.push(buf.trim());
          buf = part;
        } else {
          buf = cand;
        }
      }
      if (buf) out.push(buf.trim());
      return out;
    }
    const sentences = p.split(/(?<=[\.\?\!\:])\s+/);
    const pieces: string[] = [];
    let buf = "";
    for (const s of sentences) {
      const cand = buf ? `${buf} ${s}` : s;
      if (cand.length > maxChars && buf) {
        pieces.push(buf.trim());
        buf = s;
      } else {
        buf = cand;
      }
    }
    if (buf) pieces.push(buf.trim());
    return pieces;
  };

  for (const para of paragraphs) {
    const segments = splitLongParagraph(para);
    for (const seg of segments) {
      const cand = current ? `${current}\n\n${seg}` : seg;
      if (cand.length > maxChars && current) {
        flush();
        current = seg;
      } else {
        current = cand;
      }
    }
  }
  flush();

  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    if (last.length < maxChars * 0.35) {
      const prev = chunks[chunks.length - 2];
      const merged = `${prev}\n\n${last}`;
      if (merged.length <= HARD_LIMIT) {
        chunks.splice(-2, 2, merged);
      }
    }
  }

  return chunks.length ? chunks : [normalized];
}
