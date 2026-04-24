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
