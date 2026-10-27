import type { MediaId, OreBlock, OreHourId, ParsedHour } from "./types";

const PSALMODY_HOURS: Array<OreHourId | MediaId> = ["lodi", "vespri"];

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
  return changed ? next : hours;
}
