/**
 * Helper per gestione date in fuso orario LOCALE del dispositivo.
 *
 * IMPORTANTE: non usiamo MAI Date.toISOString().slice(0, 10) perché converte
 * in UTC. In Italia (UTC+1/+2) la mezzanotte locale corrisponde alla sera del
 * giorno precedente in UTC, causando il bug "oggi mi mostra la messa di ieri".
 */

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) throw new Error("Formato data non valido. Usare YYYY-MM-DD.");
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) throw new Error("Formato data non valido. Usare YYYY-MM-DD.");
  return dt;
}

const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export function italianDateLabel(d: Date): string {
  const wd = (d.getDay() + 6) % 7; // 0=Lun
  return `${GIORNI[wd]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

/** Da YYYY-MM-DD (es. cache liturgia) → «Domenica 23 agosto 2026», come in Home. */
export function italianDateLabelFromISO(dateISO: string | undefined | null): string | null {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  try {
    return italianDateLabel(parseLocalDate(dateISO));
  } catch {
    return null;
  }
}

/** Nome mese in italiano (es. «Giugno») per i tasti giorno in home. */
export function italianMonthName(d: Date): string {
  const m = MESI[d.getMonth()];
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Nome giorno in italiano (es. «Giovedì»). */
export function italianWeekdayName(d: Date): string {
  const wd = (d.getDay() + 6) % 7;
  return GIORNI[wd];
}

/** Giorni da oggi (0–7) per la striscia rapida in home; null se fuori finestra. */
export function dayOffsetFromToday(dateStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const today = parseLocalDate(localDateStr(new Date()));
  const target = parseLocalDate(dateStr);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0 || diff > 7) return null;
  return diff;
}
