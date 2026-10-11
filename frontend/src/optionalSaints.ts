import catalogJson from "./data/optionalSaintsCatalog.json";
import { localDateStr, parseLocalDate } from "./dateUtils";

export type OptionalSaintEntry = {
  id: string;
  date: string; // MM-DD
  title: string;
  custom?: boolean;
};

const CATALOG = (catalogJson as { saints: OptionalSaintEntry[] }).saints;

const BY_ID = new Map(CATALOG.map((s) => [s.id, s]));
const BY_DATE = new Map<string, OptionalSaintEntry[]>();
for (const s of CATALOG) {
  const list = BY_DATE.get(s.date) ?? [];
  list.push(s);
  BY_DATE.set(s.date, list);
}

export function optionalSaintsCatalog(): readonly OptionalSaintEntry[] {
  return CATALOG;
}

export function getOptionalSaintById(id: string): OptionalSaintEntry | null {
  return BY_ID.get(id) ?? null;
}

export function monthDayFromDate(date: Date): string {
  const iso = localDateStr(date);
  return iso.slice(5); // MM-DD
}

export function monthDayFromDateISO(dateISO: string): string {
  return dateISO.slice(5);
}

/** Santo attivato in impostazioni per questa data (al massimo uno per MM-DD). */
export function getEnabledOptionalSaintForDate(
  date: Date,
  selectedByMonthDay: Record<string, string>,
): OptionalSaintEntry | null {
  const md = monthDayFromDate(date);
  const id = selectedByMonthDay[md];
  if (!id) return null;
  return getOptionalSaintById(id);
}

export function optionalSaintBannerTitle(saint: OptionalSaintEntry): string {
  const base = saint.title.trim();
  if (/\bmemoria\b/i.test(base)) return base;
  return `${base} — MEMORIA`;
}

export function sortOptionalSaintsForList(
  saints: readonly OptionalSaintEntry[],
): OptionalSaintEntry[] {
  return [...saints].sort((a, b) => {
    const [am, ad] = a.date.split("-").map(Number);
    const [bm, bd] = b.date.split("-").map(Number);
    if (am !== bm) return am - bm;
    return ad - bd;
  });
}

export function formatOptionalSaintListDate(mmdd: string): string {
  const [mm, dd] = mmdd.split("-");
  const d = parseLocalDate(`2000-${mm}-${dd}`);
  const months = [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
  ];
  return `${Number(dd)} ${months[d.getMonth()]}`;
}

/** Altri santi nella lista con la stessa data (per avviso sostituzione). */
export function otherSaintOnSameDate(
  saintId: string,
  mmdd: string,
): OptionalSaintEntry | null {
  const list = BY_DATE.get(mmdd) ?? [];
  return list.find((s) => s.id !== saintId) ?? null;
}
