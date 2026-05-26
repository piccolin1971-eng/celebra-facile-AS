import { Preface } from "./api";

/** Mappa il nome stagione liturgica CEI al key usato nei prefazi. */
export function getLiturgicalSeasonKey(seasonName: string): string {
  const s = (seasonName || "").toLowerCase();
  if (s.includes("avvento")) return "avvento";
  if (s.includes("natale") || s.includes("epifania")) return "natale";
  if (s.includes("settimana santa") || s.includes("passione") || s.includes("palme")) return "passione";
  if (s.includes("quaresima")) return "quaresima";
  if (s.includes("pasqua") || s.includes("pentecoste") || s.includes("ascensione")) return "pasqua";
  return "ordinario";
}

/** Prefazi suggeriti: tempo liturgico corrente + comuni I–IX (sempre ammessi). */
export function getSuggestedPrefaces(prefaces: Preface[], seasonKey: string): Preface[] {
  const seasonal = prefaces.filter((p) => p.season === seasonKey);
  const comuni = seasonKey !== "comune" ? prefaces.filter((p) => p.season === "comune") : [];
  const seen = new Set<string>();
  const merged: Preface[] = [];
  for (const p of [...seasonal, ...comuni]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
  }
  if (seasonKey === "pasqua" || seasonKey === "ordinario") {
    return merged.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }
  return merged;
}
