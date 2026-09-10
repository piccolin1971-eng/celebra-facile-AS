export type OreHourId =
  | "invitatorio"
  | "ufficio"
  | "lodi"
  | "ora-media"
  | "vespri"
  | "compieta";

export type MediaId = "terza" | "sesta" | "nona";
export type InvitPsalmId = "94" | "99" | "66" | "23";

export type Hymn = { label: string | null; stanzas: string[][] };

export type OreBlock =
  | { k: "title"; text: string }
  | { k: "psalmHead"; num: string; name: string; sub: string; cite: string }
  | { k: "sub"; text: string }
  | { k: "rubric"; lab: string; text: string }
  | { k: "omit"; text: string }
  | { k: "stanza"; lines: string[] }
  | { k: "hymn"; hymns: Hymn[] }
  | { k: "prose"; text: string }
  | { k: "marian"; antiphons: string[][] };

export type ParsedHour = {
  hour: OreHourId | MediaId;
  blocks: OreBlock[];
  error?: string;
};

export type DayHoursMeta = {
  dateLabel: string;
  seasonLine: string;
  psalterLine: string;
  colorHex: string;
};

export type DayHoursCache = {
  date: string;
  invitAnt: string;
  /** True solo dopo un GET invitatorio andato a buon fine (HTML ricevuto). */
  invitFetched: boolean;
  meta: DayHoursMeta;
  hours: Partial<Record<OreHourId | MediaId, ParsedHour>>;
  fetchedAt: number;
};
