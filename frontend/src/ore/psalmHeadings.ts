import headingsData from "./data/psalmHeadings.json";
import type { OreBlock } from "./types";

export type PsalmHeading = { name: string; sub: string; cite: string };

const DATA = headingsData as Record<string, PsalmHeading>;

export function normalizePsalmKey(raw: string): string {
  let t = String(raw || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  t = t.replace(/^salmo\s+/i, "");
  t = t.replace(/^cantico(?:\s+(?:di|dei|degli|dell[aeio]'?|delle|del)\s+[a-zà-ÿ'’ ]+)?\s+/i, "cant:");
  t = t.replace(/\bcfr\.?\s*/gi, "");
  t = t.replace(/\s*\((?:i{1,3}|iv)\)\s*/gi, " ");
  t = t.replace(/[–—]/g, "-");
  t = t.replace(/\s+/g, "");
  return t;
}

export function lookupPsalmHeading(num: string): PsalmHeading | null {
  const key = normalizePsalmKey(num);
  if (!key) return null;
  if (DATA[key]) return DATA[key];
  const noRange = key.replace(/,.*$/, "");
  if (noRange !== key && DATA[noRange]) return DATA[noRange];
  return null;
}

function citeAlreadyInNum(num: string, cite: string): boolean {
  const c = cite.replace(/\s+/g, " ").trim().toLowerCase();
  if (c.length < 4) return false;
  const n = num.replace(/\s+/g, " ").trim().toLowerCase();
  return n.includes(c) || n.includes(c.replace(/^cfr\.?\s*/i, ""));
}

/** Cantico biblico «Cfr.»: titolo CEI unico (oro) + tematica in name; niente cite grigia duplicata. */
function peelCfrCanticleHead(
  b: Extract<OreBlock, { k: "psalmHead" }>,
): Extract<OreBlock, { k: "psalmHead" }> {
  const cfr = b.num.match(/^CANTICO\s+Cfr\.?\s+(.+)$/i);
  if (cfr) {
    const citeFromNum = cfr[1].replace(/\s+/g, " ").trim();
    const thematic = b.name.trim() || b.sub.trim();
    return {
      ...b,
      num: `CANTICO Cfr. ${citeFromNum}`,
      cite: "",
      name: thematic,
      sub: "",
    };
  }
  if (/^CANTICO$/i.test(b.num.trim()) && b.cite.trim()) {
    const thematic = b.name.trim() || b.sub.trim();
    return {
      ...b,
      num: `CANTICO Cfr. ${b.cite.trim()}`,
      cite: "",
      name: thematic,
      sub: "",
    };
  }
  return b;
}

function mergeHitCite(num: string, blockCite: string, hitCite: string): string {
  const fromBlock = blockCite.trim();
  if (fromBlock && !citeAlreadyInNum(num, fromBlock)) return fromBlock;
  const fromHit = hitCite.trim();
  if (fromHit && !citeAlreadyInNum(num, fromHit)) return fromHit;
  return "";
}

export function enrichPsalmHead(b: Extract<OreBlock, { k: "psalmHead" }>): Extract<OreBlock, { k: "psalmHead" }> {
  b = peelCfrCanticleHead(b);
  if (b.name && b.sub) return b;
  let hit = lookupPsalmHeading(b.num);
  if (!hit && b.cite.trim() && /^CANTICO$/i.test(b.num.trim())) {
    hit = lookupPsalmHeading(`CANTICO Cfr. ${b.cite}`);
  }
  if (!hit) return b;
  const sameCaption = (a: string, c: string) =>
    a.replace(/['’]/g, "'").trim() === c.replace(/['’]/g, "'").trim();
  // Cantico «Cfr.»: lo_sottotitolonoi + lo_rosso sul CEI → `name` (oro in app).
  if (!b.name && hit.name && b.sub && sameCaption(b.sub, hit.name) && !hit.sub.trim()) {
    return {
      ...b,
      name: hit.name,
      sub: "",
      cite: mergeHitCite(b.num, b.cite, hit.cite),
    };
  }
  // Nome tematico a volte finisce in `sub` (lo_sottotitolonoi trattato come frase-tono).
  if (!b.name && hit.name && b.sub && sameCaption(b.sub, hit.name) && hit.sub.trim()) {
    return {
      ...b,
      name: hit.name,
      sub: hit.sub,
      cite: mergeHitCite(b.num, b.cite, hit.cite),
    };
  }
  const name = b.name || (hit.name && !sameCaption(hit.name, b.sub) ? hit.name : b.name);
  const sub = b.sub || hit.sub;
  const cite = mergeHitCite(b.num, b.cite, hit.cite);
  return { ...b, name, sub, cite };
}

export function enrichPsalmHeads(blocks: OreBlock[]): OreBlock[] {
  return blocks.map((b) => (b.k === "psalmHead" ? enrichPsalmHead(b) : b));
}
