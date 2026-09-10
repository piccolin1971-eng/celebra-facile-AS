/**
 * Schede biografiche del Proprio dei Santi (Messale Romano).
 * Dati generati da: npx tsx scripts/build-saint-bios.ts
 */
import saintBiosJson from "./data/saintBios.json";

/** `santo` = persona; `festa` = mistero del Signore / mariana / commemorazione. */
export type SaintBioKind = "santo" | "festa";

export type SaintBioPreview = {
  title: string;
  rank: string;
  kind: SaintBioKind;
  biography: string;
  sourceNote: string;
  wikipediaUrl: string;
  santiebeatiUrl: string;
};

/** Contesto del banner: la scheda si mostra solo se coincide con la celebrazione visibile. */
export type SaintBioBannerContext = {
  rankLabel: string;
  displayTitle: string;
};

const BIOS = saintBiosJson as Record<string, SaintBioPreview>;

const VISIBLE_RANKS = new Set(["Solennità", "Festa", "Memoria"]);

export function saintBioButtonLabel(kind: SaintBioKind): string {
  return kind === "festa" ? "Informazioni sulla Festa" : "Informazioni sul Santo";
}

function monthDayKey(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Allineamento soft tra titolo banner e titolo scheda (CEI vs calendario). */
export function saintBioTitlesAlign(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const skip = new Set([
    "san",
    "santo",
    "santa",
    "santi",
    "sante",
    "sant",
    "beata",
    "beato",
    "della",
    "delle",
    "del",
    "dei",
    "di",
    "e",
    "la",
    "il",
    "vergine",
    "maria",
  ]);
  const wa = na.split(" ").filter((w) => w.length > 2 && !skip.has(w));
  const wb = nb.split(" ").filter((w) => w.length > 2 && !skip.has(w));
  if (wa.length === 0 || wb.length === 0) return false;
  const hit = wa.filter((w) => wb.some((x) => x === w || x.startsWith(w) || w.startsWith(x)));
  return hit.length >= 1 && hit.length >= Math.min(2, Math.min(wa.length, wb.length));
}

/**
 * Scheda del giorno se esiste nel Messale e coincide con la celebrazione
 * effettivamente mostrata nel banner (niente bio per memorie soppresse da domenica/tempo).
 */
export function getSaintBioPreview(
  date: Date,
  banner?: SaintBioBannerContext,
): SaintBioPreview | null {
  const bio = BIOS[monthDayKey(date)] ?? null;
  if (!bio) return null;
  if (!banner) return bio;
  if (!VISIBLE_RANKS.has(banner.rankLabel)) return null;
  if (!saintBioTitlesAlign(banner.displayTitle, bio.title)) return null;
  return bio;
}

export function saintBioCount(): number {
  return Object.keys(BIOS).length;
}
