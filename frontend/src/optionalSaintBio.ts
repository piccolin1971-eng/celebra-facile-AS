import biosJson from "./data/optionalSaintBios.json";
import { OPTIONAL_SAINT_EXTRA_LINKS } from "./data/optionalSaintExternalLinks";
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
  const extra = OPTIONAL_SAINT_EXTRA_LINKS[saintId];
  if (extra?.length) return { ...bio, extraLinks: extra };
  return bio;
}
