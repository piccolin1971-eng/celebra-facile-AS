import biosJson from "./data/optionalSaintBios.json";
import type { SaintBioPreview } from "./saintBioPreview";
import { saintBioTitlesAlign } from "./saintBioPreview";

const BIOS = biosJson as Record<string, SaintBioPreview>;

export function getOptionalSaintBioPreview(
  saintId: string,
  displayTitle: string,
): SaintBioPreview | null {
  const bio = BIOS[saintId];
  if (!bio) return null;
  if (!saintBioTitlesAlign(displayTitle, bio.title)) return null;
  return bio;
}
