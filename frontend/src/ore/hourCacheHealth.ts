import type { Hymn, MediaId, OreBlock, OreHourId, ParsedHour } from "./types";

const PSALMODY_HOURS: Array<OreHourId | MediaId> = ["lodi", "vespri"];

/** Prima strofa tutta su una riga mentre le altre sono spezzate (parse INNO nel versetto, schema ≤47). */
function hymnFirstStanzaCollapsed(hymns: Hymn[]): boolean {
  const it = hymns.find((h) => !h.label || !/^oppure/i.test(h.label));
  if (!it?.stanzas.length) return false;
  const first = it.stanzas[0];
  if (first.length !== 1) return false;
  const words = first[0].split(/\s+/).filter(Boolean).length;
  if (words < 12) return false;
  return it.stanzas.some((st, i) => i > 0 && st.length >= 3);
}

export function hourParsedHymnLooksCollapsed(
  hour: OreHourId | MediaId,
  parsed: ParsedHour | undefined,
): boolean {
  if (hour !== "lodi" && hour !== "ufficio") return false;
  if (!parsed?.blocks?.length || parsed.error) return false;
  for (const b of parsed.blocks) {
    if (b.k !== "hymn") continue;
    if (hymnFirstStanzaCollapsed(b.hymns)) return true;
  }
  return false;
}

/** Salmodia CEI usa «1 ant.»; il vecchio parse LDO lasciava solo «Ant.». */
export function hourParsedLooksLikeStaleLdo(
  hour: OreHourId | MediaId,
  parsed: ParsedHour | undefined,
): boolean {
  if (!parsed?.blocks?.length || parsed.error) return false;
  if (!PSALMODY_HOURS.includes(hour)) return false;

  const blocks = parsed.blocks;
  const hasPsalmody = blocks.some(
    (b) => b.k === "psalmHead" && /^(SALMO|CANTICO)\b/i.test(`${b.num} ${b.name}`),
  );
  if (!hasPsalmody) return false;

  const numberedAnt = blocks.some((b) => b.k === "rubric" && /\d+\s*ant\./i.test(b.lab || ""));
  if (numberedAnt) return false;

  const genericAnt = blocks.some(
    (b) => b.k === "rubric" && /^ant\.?$/i.test((b.lab || "").trim()),
  );
  return genericAnt;
}

export function stripStalePsalmodiesFromDay(
  hours: Partial<Record<OreHourId | MediaId, ParsedHour>>,
): Partial<Record<OreHourId | MediaId, ParsedHour>> {
  let changed = false;
  const next = { ...hours };
  for (const id of PSALMODY_HOURS) {
    if (hourParsedLooksLikeStaleLdo(id, next[id])) {
      delete next[id];
      changed = true;
    }
  }
  for (const id of ["lodi", "ufficio"] as const) {
    if (hourParsedHymnLooksCollapsed(id, next[id])) {
      delete next[id];
      changed = true;
    }
  }
  return changed ? next : hours;
}
