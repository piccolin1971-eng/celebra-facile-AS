/**

 * Session storage giornaliera: salva le scelte del prete (prefazio, preghiera

 * eucaristica, congedo, ecc.) con chiave per data + modalità di celebrazione.

 * Stesso giorno si possono preparare fino a due liturgie distinte (es. domenica

 * + vigilia vespertina).

 */

import AsyncStorage from "@react-native-async-storage/async-storage";



/** Modalità liturgica per la preparazione / celebrazione. */

export type CelebrationMode = "calendar_day" | "vigil_proper" | "solemnity_day";



export const CELEBRATION_MODES: CelebrationMode[] = [

  "calendar_day",

  "vigil_proper",

  "solemnity_day",

];

/** Congedo di default: «Glorificate il Signore con la vostra vita: andate in pace.» */
export const DEFAULT_CONGEDO_ID = "C";



export function parseCelebrationMode(raw: unknown): CelebrationMode {

  if (raw === "vigil_proper" || raw === "solemnity_day" || raw === "calendar_day") {

    return raw;

  }

  return "calendar_day";

}

/** Expo Router può passare string | string[] su web. */
export function routeParamStr(raw: string | string[] | undefined): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return undefined;
}

/** Query string su web (Expo Router a volte ritarda `params`). */
export function routeSearchParam(name: string): string | undefined {
  if (typeof window === "undefined" || !window.location?.search) return undefined;
  const v = new URLSearchParams(window.location.search).get(name);
  return v?.trim() ? v.trim() : undefined;
}

export function messaRouteDateParam(params: { date?: string | string[] }): string | undefined {
  const fromRouter = routeParamStr(params.date);
  if (fromRouter) return fromRouter;
  const fromUrl = routeSearchParam("date");
  return fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : undefined;
}

export function messaRouteModeParam(params: { mode?: string | string[] }): string | undefined {
  return routeParamStr(params.mode) ?? routeSearchParam("mode");
}

export function messaRouteVotiveParam(params: { votive?: string | string[] }): string | undefined {
  return routeParamStr(params.votive) ?? routeSearchParam("votive");
}



export type MassSession = {

  celebrationMode?: CelebrationMode;

  /** Titolo liturgico mostrato in home (es. «XIII Domenica…»). */

  liturgyTitle?: string;

  /** Timestamp ultimo salvataggio — per default «ultima preparata». */

  preparedAt?: number;

  showGloria?: boolean;

  showCredo?: boolean;

  showAntifone?: boolean;

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

  penitentialForm?: "A" | "B" | "C";

  penitentialSeason?: string;

  selectedCredoId?: "niceno" | "apostolico";

  orateFratresId?: string;

  peSelections?: Record<string, string>;

  useOrazionePopolo?: boolean;

  orazionePopoloId?: string;

  useSaintProperReadings?: boolean;

  /** calendar = messa a data; votive = formulario votivo. */
  liturgyKind?: "calendar" | "votive";

  votiveId?: string;

  /**
   * Origine della sessione in Home:
   * - prepara = da «Scegli / Prepara la liturgia» → mostra il riassunto
   * - subito = da «Celebra subito» → niente riassunto in Home
   * Assente = sessioni vecchie: trattate come prepara.
   */
  prepSource?: "prepara" | "subito";

};

export type SessionTarget =
  | { kind: "calendar"; dateISO: string; mode: CelebrationMode }
  | { kind: "votive"; votiveId: string };

export function sessionTargetKey(target: SessionTarget): string {
  if (target.kind === "votive") return `v:${target.votiveId}`;
  return `d:${target.dateISO}:${target.mode}`;
}



const KEY_PREFIX = "@messa_session_";

const CELEBRATE_PICK_PREFIX = "@celebrate_pick_";

const MAX_KEPT_SESSIONS = 21;



const sessionKey = (dateISO: string, mode: CelebrationMode) =>

  `${KEY_PREFIX}${dateISO}_${mode}`;

const votiveSessionKey = (votiveId: string) => `${KEY_PREFIX}votive_${votiveId}`;



const legacySessionKey = (dateISO: string) => `${KEY_PREFIX}${dateISO}`;



const celebratePickKey = (dateISO: string) => `${CELEBRATE_PICK_PREFIX}${dateISO}`;



/** Migra chiave legacy (solo data) → calendar_day. */

async function migrateLegacySession(dateISO: string): Promise<void> {

  try {

    const legacyKey = legacySessionKey(dateISO);

    const raw = await AsyncStorage.getItem(legacyKey);

    if (!raw) return;

    const newKey = sessionKey(dateISO, "calendar_day");

    const existing = await AsyncStorage.getItem(newKey);

    if (!existing) {

      const parsed = JSON.parse(raw) as MassSession;

      const migrated: MassSession = {

        ...parsed,

        celebrationMode: "calendar_day",

        preparedAt: parsed.preparedAt ?? Date.now(),

      };

      await AsyncStorage.setItem(newKey, JSON.stringify(migrated));

    }

    await AsyncStorage.removeItem(legacyKey);

  } catch (e) {

    if (__DEV__) console.log("migrateLegacySession err:", e);

  }

}



export async function loadSession(

  dateISO: string,

  mode: CelebrationMode = "calendar_day",

): Promise<MassSession | null> {

  try {

    await migrateLegacySession(dateISO);

    const raw = await AsyncStorage.getItem(sessionKey(dateISO, mode));

    if (!raw) return null;

    const parsed = JSON.parse(raw) as MassSession;

    return {

      ...parsed,

      celebrationMode: parseCelebrationMode(parsed.celebrationMode ?? mode),

      liturgyKind: parsed.liturgyKind ?? "calendar",

    };

  } catch (e) {

    if (__DEV__) console.log("loadSession err:", e);

    return null;

  }

}

export async function loadVotiveSession(votiveId: string): Promise<MassSession | null> {
  try {
    const raw = await AsyncStorage.getItem(votiveSessionKey(votiveId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MassSession;
    return {
      ...parsed,
      liturgyKind: "votive",
      votiveId,
      celebrationMode: "calendar_day",
    };
  } catch (e) {
    if (__DEV__) console.log("loadVotiveSession err:", e);
    return null;
  }
}

export async function loadSessionForTarget(target: SessionTarget): Promise<MassSession | null> {
  if (target.kind === "votive") return loadVotiveSession(target.votiveId);
  return loadSession(target.dateISO, target.mode);
}

export async function saveVotiveSession(votiveId: string, session: MassSession): Promise<void> {
  try {
    const payload: MassSession = {
      ...session,
      liturgyKind: "votive",
      votiveId,
      celebrationMode: "calendar_day",
      preparedAt: session.preparedAt ?? Date.now(),
    };
    await AsyncStorage.setItem(votiveSessionKey(votiveId), JSON.stringify(payload));
  } catch (e) {
    if (__DEV__) console.log("saveVotiveSession err:", e);
  }
}

export async function saveSessionForTarget(
  target: SessionTarget,
  session: MassSession,
): Promise<void> {
  if (target.kind === "votive") {
    await saveVotiveSession(target.votiveId, session);
    return;
  }
  await saveSession(target.dateISO, target.mode, session);
}

export async function clearVotiveSession(votiveId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(votiveSessionKey(votiveId));
  } catch (e) {
    if (__DEV__) console.log("clearVotiveSession err:", e);
  }
}



/** Sessioni da mostrare nel riassunto Home (non quelle di «Celebra subito»). */
export function isHomeSummarySession(session: MassSession): boolean {
  return session.prepSource !== "subito";
}

export function filterHomeSummarySessions(sessions: MassSession[]): MassSession[] {
  return sessions.filter(isHomeSummarySession);
}

function celebrationModeSortIndex(mode: CelebrationMode): number {
  if (mode === "calendar_day") return 0;
  return 1;
}

/** Ordine fisso: Messa del giorno sopra, vespertina / solennità sotto. */
function sortSessionsByCelebrationMode(sessions: MassSession[]): MassSession[] {
  return [...sessions].sort((a, b) => {
    const modeA = parseCelebrationMode(a.celebrationMode);
    const modeB = parseCelebrationMode(b.celebrationMode);
    const rank = celebrationModeSortIndex(modeA) - celebrationModeSortIndex(modeB);
    if (rank !== 0) return rank;
    return (a.preparedAt ?? 0) - (b.preparedAt ?? 0);
  });
}

/** Tutte le sessioni preparate per una data (0–2 in pratica). */

export async function loadSessionsForDate(dateISO: string): Promise<MassSession[]> {

  await migrateLegacySession(dateISO);

  const found: MassSession[] = [];

  for (const mode of CELEBRATION_MODES) {

    const s = await loadSession(dateISO, mode);

    if (s) found.push(s);

  }

  return sortSessionsByCelebrationMode(found);

}



/** Quante liturgie sono preparate per la data (0, 1 o 2). */

export async function countPreparedSessions(dateISO: string): Promise<number> {

  const all = await loadSessionsForDate(dateISO);

  return all.length;

}



/**

 * Carica la sessione «principale» per retrocompatibilità: calendar_day se esiste,

 * altrimenti l'unica disponibile.

 */

export async function loadSessionForDate(dateISO: string): Promise<MassSession | null> {

  const all = await loadSessionsForDate(dateISO);

  return all.find((s) => s.celebrationMode === "calendar_day") ?? all[0] ?? null;

}



/** @deprecated Usare loadSession / loadSessionsForDate. */

export async function loadSessionOrLatest(dateISO: string): Promise<MassSession | null> {

  return loadSessionForDate(dateISO);

}



export async function saveSession(

  dateISO: string,

  mode: CelebrationMode,

  session: MassSession,

): Promise<void> {

  try {

    const payload: MassSession = {

      ...session,

      celebrationMode: mode,

      preparedAt: session.preparedAt ?? Date.now(),

    };

    await AsyncStorage.setItem(sessionKey(dateISO, mode), JSON.stringify(payload));

  } catch (e) {

    if (__DEV__) console.log("saveSession err:", e);

  }

}



/** Rimuove una sessione per data + modalità. */

export async function clearSession(

  dateISO: string,

  mode: CelebrationMode = "calendar_day",

): Promise<void> {

  try {

    await AsyncStorage.removeItem(sessionKey(dateISO, mode));

    const remaining = await loadSessionsForDate(dateISO);

    if (remaining.length === 0) {

      await AsyncStorage.removeItem(celebratePickKey(dateISO));

    } else {

      const pick = await loadCelebratePick(dateISO);

      if (pick === mode) {

        const fallback = remaining[remaining.length - 1]?.celebrationMode;

        if (fallback) await saveCelebratePick(dateISO, fallback);

      }

    }

  } catch (e) {

    if (__DEV__) console.log("clearSession err:", e);

  }

}



/** Scelta esplicita dell'utente per «Celebra» quando ci sono 2 preparazioni. */

export async function loadCelebratePick(dateISO: string): Promise<CelebrationMode | null> {

  try {

    const raw = await AsyncStorage.getItem(celebratePickKey(dateISO));

    if (!raw) return null;

    return parseCelebrationMode(raw);

  } catch {

    return null;

  }

}



export async function saveCelebratePick(

  dateISO: string,

  mode: CelebrationMode | null,

): Promise<void> {

  try {

    if (!mode) {

      await AsyncStorage.removeItem(celebratePickKey(dateISO));

      return;

    }

    await AsyncStorage.setItem(celebratePickKey(dateISO), mode);

  } catch (e) {

    if (__DEV__) console.log("saveCelebratePick err:", e);

  }

}



/**

 * Modalità da usare per Celebra: pick salvato, oppure unica sessione,

 * oppure ultima preparata se due senza pick.

 */

export async function resolveCelebrateMode(dateISO: string): Promise<CelebrationMode | null> {

  const sessions = await loadSessionsForDate(dateISO);

  if (sessions.length === 0) return null;

  if (sessions.length === 1) {

    return sessions[0].celebrationMode ?? "calendar_day";

  }

  const pick = await loadCelebratePick(dateISO);

  const modes = new Set(sessions.map((s) => s.celebrationMode ?? "calendar_day"));

  if (pick && modes.has(pick)) return pick;

  const last = sessions[sessions.length - 1];

  return last?.celebrationMode ?? "calendar_day";

}



/** Pulisce sessioni vecchie tenendo solo le ultime MAX_KEPT_SESSIONS chiavi. */

export async function cleanupOldSessions(): Promise<void> {

  try {

    const allKeys = await AsyncStorage.getAllKeys();

    const sessionKeys = allKeys.filter((k) => k.startsWith(KEY_PREFIX)).sort();

    if (sessionKeys.length > MAX_KEPT_SESSIONS) {

      const toRemove = sessionKeys.slice(0, sessionKeys.length - MAX_KEPT_SESSIONS);

      await AsyncStorage.multiRemove(toRemove);

    }

  } catch (e) {

    if (__DEV__) console.log("cleanupOldSessions err:", e);

  }

}


