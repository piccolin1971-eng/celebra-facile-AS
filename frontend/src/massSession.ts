/**
 * Session storage giornaliera: salva le scelte del prete (prefazio, preghiera
 * eucaristica, congedo, ecc.) con chiave per data. Quando l'app viene riaperta
 * lo stesso giorno, le scelte vengono ripristinate. Al cambio data le sessioni
 * vecchie non vengono caricate (la liturgia cambia, le scelte non sono più valide).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type MassSession = {
  showGloria?: boolean;
  showCredo?: boolean;
  showOrazionalePray?: boolean;
  selectedOrazionaleId?: string;
  selectedPrefaceId?: string;
  selectedPrayerId?: string;
  benedizioneId?: string;
  congedoId?: string;
  acclamationId?: string;
  padreNostroIntroId?: string;
  useSolemnBlessing?: boolean;
  solemnBlessingId?: string;
  // === NUOVE scelte aggiunte (v2.2.0) ===
  penitentialForm?: "A" | "B" | "C";
  penitentialSeason?: string;
  selectedCredoId?: "niceno" | "apostolico";
  orateFratresId?: string;
  // === Scelte per i propri della Preghiera Eucaristica (v2.5.0) ===
  // Mappa selectorKey → optionId. Esempio: { communicantes: "domenica", hanc_igitur: "matrimonio" }
  // Le chiavi dipendono dalla PE selezionata (vedi eucharisticPrayersFull.json)
  peSelections?: Record<string, string>;
  // === Orazione sul popolo (v2.7.1) ===
  useOrazionePopolo?: boolean;
  orazionePopoloId?: string;
  // === Auto-scroll PE (v2.6.0+) ===
  // v2.6: indice ciclo 0=Lento, 1=Off, 2=Medio, 3=Off (LEGACY)
  autoScrollCycleIdx?: number;
  // v2.7+: toggle ON/OFF (Auto/Off). La velocità è in Settings.
  peAutoScrollEnabled?: boolean;
};

const KEY_PREFIX = "@messa_session_";
// Quante sessioni passate tenere prima di pulire (non strettamente necessario,
// ma evita di accumulare entry vecchie senza limite).
const MAX_KEPT_SESSIONS = 7;

const sessionKey = (dateISO: string) => `${KEY_PREFIX}${dateISO}`;

export async function loadSession(dateISO: string): Promise<MassSession | null> {
  try {
    const raw = await AsyncStorage.getItem(sessionKey(dateISO));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    if (__DEV__) console.log("loadSession err:", e);
    return null;
  }
}

/**
 * Carica la sessione del giorno richiesto. Se non esiste (es. oggi non è
 * stata ancora preparata), restituisce l'ULTIMA sessione preparata in
 * precedenza (anche se per un giorno diverso). In questo modo se l'utente
 * prepara la liturgia stasera per domani, domani al primo ingresso la
 * trova già impostata finché non ne prepara una nuova.
 */
export async function loadSessionOrLatest(
  dateISO: string,
): Promise<MassSession | null> {
  // Prima prova: sessione esatta del giorno
  const today = await loadSession(dateISO);
  if (today) return today;
  // Fallback: ultima sessione salvata (ordinamento ISO funziona come date sort)
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const sessionKeys = allKeys
      .filter((k) => k.startsWith(KEY_PREFIX))
      .sort();
    if (sessionKeys.length === 0) return null;
    const latestKey = sessionKeys[sessionKeys.length - 1];
    const raw = await AsyncStorage.getItem(latestKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    if (__DEV__) console.log("loadSessionOrLatest err:", e);
    return null;
  }
}

export async function saveSession(dateISO: string, session: MassSession): Promise<void> {
  try {
    await AsyncStorage.setItem(sessionKey(dateISO), JSON.stringify(session));
  } catch (e) {
    if (__DEV__) console.log("saveSession err:", e);
  }
}

/** Pulisce sessioni vecchie tenendo solo le ultime MAX_KEPT_SESSIONS. */
export async function cleanupOldSessions(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const sessionKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX)).sort();
    if (sessionKeys.length > MAX_KEPT_SESSIONS) {
      const toRemove = sessionKeys.slice(0, sessionKeys.length - MAX_KEPT_SESSIONS);
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch (e) {
    if (__DEV__) console.log("cleanupOldSessions err:", e);
  }
}
