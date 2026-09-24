/** Croce di congiunzione CEI (`lo_rosso` con solo †), distinta dalla flessa † nel versetto. */
export const JOIN_CROSS_MARK = "\uFFF0";

export function hasJoinCross(s: string): boolean {
  return s.includes(JOIN_CROSS_MARK);
}

export function stripJoinCross(s: string): string {
  return s.split(JOIN_CROSS_MARK).join("").replace(/\s+/g, " ").trim();
}
