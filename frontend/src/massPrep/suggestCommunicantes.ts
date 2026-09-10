import type { Liturgy } from "../api";

// === Helper: suggerisce l'opzione "communicantes" (Tempo Liturgico) per la PE
// in base alla data e alla stagione liturgica del giorno.
// Mappa la liturgia corrente alle opzioni del JSON eucharisticPrayersFull:
//   "ordinario" | "domenica" | "natale" | "epifania" | "pasqua" | "ascensione" | "pentecoste"
export function suggestCommunicantesId(
  liturgy: Liturgy | null | undefined,
  options: { id: string; label: string }[],
): string {
  const ids = new Set(options.map((o) => o.id));
  const title = ((liturgy?.title || "") + " " + (liturgy?.season?.season || "")).toLowerCase();
  const dateStr = liturgy?.date || "";
  // Giorno della settimana (0=domenica, 6=sabato) usando la data ISO YYYY-MM-DD
  let weekday = -1;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
    // Costruzione locale per evitare offset timezone
    weekday = new Date(y, m - 1, d).getDay();
  }
  // Ordine di priorità: feste specifiche → tempo → giorno settimana
  if (ids.has("pentecoste") && /pentecoste/.test(title)) return "pentecoste";
  if (ids.has("ascensione") && /ascension/.test(title)) return "ascensione";
  if (ids.has("epifania") && /epifania/.test(title)) return "epifania";
  // "Pasqua" Communicantes: solo per Veglia Pasquale, Pasqua di Risurrezione,
  // I e II Domenica di Pasqua (Ottava in Albis). Per III-VII Domenica usiamo
  // il Communicantes domenicale ordinario.
  const isEasterOctave =
    /^veglia\s+pasquale/.test(title) ||
    /^pasqua\s+di\s+risurr/.test(title) ||
    /^domenica\s+di\s+pasqua/.test(title) ||      // I Domenica (= Pasqua), senza ordinale
    /^i\s+domenica\s+di\s+pasqua/.test(title) ||
    /^ii\s+domenica\s+di\s+pasqua/.test(title) || // Ottava in Albis
    /^ottava\s+di\s+pasqua/.test(title) ||
    /lunedi.*ottava|martedi.*ottava|mercoledi.*ottava|giovedi.*ottava|venerdi.*ottava|sabato.*ottava/.test(title);
  if (ids.has("pasqua") && isEasterOctave) return "pasqua";
  // Tempo di Natale (compreso ottava): titolo o stagione
  if (ids.has("natale") && /natale|santa\s+famiglia|maria.*madre.*dio/.test(title)) return "natale";
  // Domenica generica (qualsiasi tempo, eccetto i casi sopra)
  if (ids.has("domenica") && weekday === 0) return "domenica";
  return "ordinario";
}
