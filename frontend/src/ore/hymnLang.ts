import type { Hymn } from "./types";

function hymnBlob(h: Hymn): string {
  return h.stanzas.flat().join(" ");
}

const IT_WORDS =
  /\b(che|della|delle|nella|nello|degli|alla|alle|allo|sono|perché|perche|nel|dal|sul|sulla|una|questo|questa|tuo|tua|nostro|cuore|presso|madre|figlio|signore|pace|cielo|stelle)\b/gi;

const LATIN_ORTHO = /[æœǽáéíóúý]/gi;
const LATIN_WORDS =
  /\b(Stabat|Eia|mater|amóris|amoris|lúgeam|lugeam|vírginum|virginum|términum|terminum|hóram|horam|cæli|coeli|cœli|Christe|Domin[eu]s|nobis|tibi)\b/i;

export function looksLatinText(text: string): boolean {
  const t = String(text || "").normalize("NFC");
  if (!t.trim()) return false;
  const latinOrtho = (t.match(LATIN_ORTHO) || []).length;
  const italian = (t.match(IT_WORDS) || []).length;
  if (LATIN_WORDS.test(t) && italian <= 2) return true;
  if (latinOrtho >= 3 && italian <= 2) return true;
  if (latinOrtho >= 1 && italian === 0) return true;
  return false;
}

export function looksItalianText(text: string): boolean {
  const t = String(text || "").normalize("NFC");
  const italian = (t.match(IT_WORDS) || []).length;
  return italian >= 3 && !looksLatinText(t);
}

export function hymnNeedsItalianAlternate(hymns: Hymn[]): boolean {
  if (!hymns.length) return false;
  if (hymns.some((h) => looksItalianText(hymnBlob(h)))) return false;
  return hymns.every((h) => looksLatinText(hymnBlob(h)));
}

function incipit(h: Hymn): string {
  const line = h.stanzas[0]?.[0] || "";
  return line
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-zàèéìòùäöüæœ]+/g, "")
    .slice(0, 28);
}

export function prependItalianHymn(hymns: Hymn[], italian: Hymn): Hymn[] {
  if (!italian.stanzas.length) return hymns;
  const itKey = incipit(italian);
  if (itKey && hymns.some((h) => incipit(h) === itKey)) return hymns;
  // liturgiadelleore.it dà l'inno del giorno in italiano, non la traduzione
  // del latino CEI: lo accettiamo salvo che sia a sua volta latino.
  if (looksLatinText(hymnBlob(italian))) return hymns;
  const rest = hymns.map((h, i) => {
    if (i === 0 && !h.label) return { ...h, label: "Oppure:" };
    return h;
  });
  return [{ label: null, stanzas: italian.stanzas }, ...rest];
}
