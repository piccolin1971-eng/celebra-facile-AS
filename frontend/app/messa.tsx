import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Switch, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, Liturgy, Preface, EucharisticPrayer, MysteryAcclamation, SolemnBlessing } from "../src/api";
import { getOrazionaleSections, getPrayerById, suggestPrayerForLiturgy, OrazionalePrayer } from "../src/orazionale";
import { loadSession, saveSession, cleanupOldSessions, MassSession } from "../src/massSession";
import peFullData from "../src/data/eucharisticPrayersFull.json";

// === Helper: suggerisce l'opzione "communicantes" (Tempo Liturgico) per la PE
// in base alla data e alla stagione liturgica del giorno.
// Mappa la liturgia corrente alle opzioni del JSON eucharisticPrayersFull:
//   "ordinario" | "domenica" | "natale" | "epifania" | "pasqua" | "ascensione" | "pentecoste"
function suggestCommunicantesId(
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

type ReadingType =
  | "antifona_ingresso" | "colletta"
  | "prima_lettura" | "salmo" | "seconda_lettura" | "sequenza" | "acclamazione" | "vangelo"
  | "sulle_offerte" | "antifona_comunione" | "dopo_comunione";

export default function MessaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; preface?: string; votive?: string }>();
  const { colors, fontSize, scaledFont, readingMode } = useSettings();
  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [fixedParts, setFixedParts] = useState<Record<string, any> | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [acclamations, setAcclamations] = useState<MysteryAcclamation[]>([]);
  const [solemnBlessings, setSolemnBlessings] = useState<SolemnBlessing[]>([]);
  const [pasquaDismissal, setPasquaDismissal] = useState<any>(null);
  const [currentSeasonKey, setCurrentSeasonKey] = useState<string>("ordinario");
  const [loading, setLoading] = useState(true);

  // selezioni utente
  const [penitentialForm, setPenitentialForm] = useState<"A" | "B" | "C">("A");
  const [penitentialSeason, setPenitentialSeason] = useState<string>("ordinario");
  const [selectedPrefaceId, setSelectedPrefaceId] = useState<string>("");
  const [selectedPrayerId, setSelectedPrayerId] = useState<string>("pe2");
  // Selettori per i propri della PE: mappa selectorKey → optionId
  // Per pe1: { communicantes, hanc_igitur }; per pe2/pe3: { communicantes, rito }; per pe4: { rito }
  const [peSelections, setPeSelections] = useState<Record<string, string>>({});
  // Modale per scegliere un'opzione di un selettore PE (es. "Tempo Liturgico")
  const [pePickerKey, setPePickerKey] = useState<string | null>(null);
  const [selectedCredoId, setSelectedCredoId] = useState<"niceno" | "apostolico">("niceno");
  const [orateFratresId, setOrateFratresId] = useState<string>("A");
  const [padreNostroIntroId, setPadreNostroIntroId] = useState<string>("A");
  const [acclamationId, setAcclamationId] = useState<string>("A");
  const [useSolemnBlessing, setUseSolemnBlessing] = useState<boolean>(false);
  const [solemnBlessingId, setSolemnBlessingId] = useState<string>("");
  // Orazione sul popolo (Messale 2020, 28 formule)
  const [useOrazionePopolo, setUseOrazionePopolo] = useState<boolean>(false);
  const [orazionePopoloId, setOrazionePopoloId] = useState<string>("");
  const [prayersOverPeople, setPrayersOverPeople] = useState<{ id: string; num: number; text: string }[]>([]);
  const [showGloria, setShowGloria] = useState<boolean>(true);
  const [showCredo, setShowCredo] = useState<boolean>(true);
  const [congedoId, setCongedoId] = useState("A");
  const [benedizioneId, setBenedizioneId] = useState("A");

  const [showPrefaces, setShowPrefaces] = useState(false);
  const [showPrayers, setShowPrayers] = useState(false);
  const [showOrazionale, setShowOrazionale] = useState(false);

  // Preghiera dei fedeli (Orazionale)
  const [selectedOrazionaleId, setSelectedOrazionaleId] = useState<string>("");
  const [showOrazionalePray, setShowOrazionalePray] = useState<boolean>(true);
  const [orazionaleSection, setOrazionaleSection] = useState<string | null>(null);

  // Paginazione: tap-to-advance per facilitare la celebrazione
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Date corrente per session storage (key: data ISO)
  const [sessionDate, setSessionDate] = useState<string>("");
  // True quando le scelte iniziali sono state caricate (default + sessione salvata).
  // Solo dopo questo flag, il save automatico è attivo.
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const styles = makeStyles(colors, fontSize);

  useEffect(() => {
    (async () => {
      try {
        const dateParam = typeof params.date === "string" ? params.date : undefined;
        const [lit, parts, pr, pe, acc, bless] = await Promise.all([
          dateParam ? api.liturgyForDate(dateParam) : api.liturgyToday(),
          api.fixedParts(),
          api.prefaces(),
          api.eucharisticPrayers(),
          api.mysteryAcclamations(),
          api.solemnBlessings(),
        ]);
        setLiturgy(lit);
        setFixedParts(parts.parts);
        setPrefaces(pr.prefaces);
        setPrayers(pe.prayers);
        setAcclamations(acc.acclamations);
        setSolemnBlessings(bless.blessings);
        setPasquaDismissal(bless.pasqua_dismissal);
        // Orazioni sul popolo (28 formule del Messale 2020)
        if (Array.isArray((bless as any).prayersOverPeople)) {
          setPrayersOverPeople((bless as any).prayersOverPeople);
        }
        const seasonName = (lit?.season?.season || "").toLowerCase();
        const seasonKey = seasonName.includes("avvento") ? "avvento"
          : seasonName.includes("natale") ? "natale"
          : seasonName.includes("quaresima") ? "quaresima"
          : seasonName.includes("pasqua") ? "pasqua"
          : "ordinario";
        setCurrentSeasonKey(seasonKey);
        const match = pr.prefaces.find(p => p.season === seasonKey) || pr.prefaces[0];
        if (match) setSelectedPrefaceId(match.id);
        // Override prefazio se passato esplicitamente (es. messa votiva)
        const prefaceParam = typeof params.preface === "string" ? params.preface : "";
        if (prefaceParam) {
          const forced = pr.prefaces.find(p => p.id === prefaceParam);
          if (forced) setSelectedPrefaceId(forced.id);
        }
        setPenitentialSeason(seasonKey);
        if (seasonKey === "avvento" || seasonKey === "quaresima") setShowGloria(false);
        // Benedizione solenne: preseleziona quella della stagione se disponibile
        const seasBless = bless.blessings.find(b => b.id === seasonKey) || bless.blessings.find(b => b.season === seasonKey);
        if (seasBless) setSolemnBlessingId(seasBless.id);
        // Congedo di Pasqua automatico
        if (seasonKey === "pasqua") setCongedoId("pasqua_alleluia");

        // Suggerisci la Preghiera dei fedeli (Orazionale CEI)
        const suggestedOrId = suggestPrayerForLiturgy(lit);
        if (suggestedOrId) setSelectedOrazionaleId(suggestedOrId);

        // === SESSION RESTORE ===
        // Carica le scelte salvate per la giornata corrente (se esistono),
        // sovrascrivendo i default suggeriti. Se l'utente apre l'app il
        // mattino e imposta tutto, ritrova le stesse scelte la sera.
        const dateKey = lit?.date || dateParam || new Date().toISOString().slice(0, 10);
        setSessionDate(dateKey);
        const saved = await loadSession(dateKey);
        if (saved) {
          if (typeof saved.showGloria === "boolean") setShowGloria(saved.showGloria);
          if (typeof saved.showCredo === "boolean") setShowCredo(saved.showCredo);
          if (typeof saved.showOrazionalePray === "boolean") setShowOrazionalePray(saved.showOrazionalePray);
          if (saved.selectedOrazionaleId) setSelectedOrazionaleId(saved.selectedOrazionaleId);
          if (saved.selectedPrefaceId) setSelectedPrefaceId(saved.selectedPrefaceId);
          if (saved.selectedPrayerId) setSelectedPrayerId(saved.selectedPrayerId);
          if (saved.peSelections && typeof saved.peSelections === "object") setPeSelections(saved.peSelections);
          if (typeof (saved as any).useOrazionePopolo === "boolean") setUseOrazionePopolo((saved as any).useOrazionePopolo);
          if ((saved as any).orazionePopoloId) setOrazionePopoloId((saved as any).orazionePopoloId);
          if (saved.benedizioneId) setBenedizioneId(saved.benedizioneId);
          if (saved.congedoId) setCongedoId(saved.congedoId);
          if (saved.acclamationId) setAcclamationId(saved.acclamationId);
          if (saved.padreNostroIntroId) setPadreNostroIntroId(saved.padreNostroIntroId);
          if (typeof saved.useSolemnBlessing === "boolean") setUseSolemnBlessing(saved.useSolemnBlessing);
          if (saved.solemnBlessingId) setSolemnBlessingId(saved.solemnBlessingId);
          if (saved.penitentialForm) setPenitentialForm(saved.penitentialForm);
          if (saved.penitentialSeason) setPenitentialSeason(saved.penitentialSeason);
          if (saved.selectedCredoId) setSelectedCredoId(saved.selectedCredoId);
          if (saved.orateFratresId) setOrateFratresId(saved.orateFratresId);
        }
        // Pulisce sessioni vecchie in background
        cleanupOldSessions();
        setSessionLoaded(true);
      } catch (e) {
        console.log("Errore:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.date, params.preface]);

  // === SESSION AUTO-SAVE ===
  // Salva automaticamente le scelte del prete su AsyncStorage ogni volta
  // che cambiano. La chiave è la data della liturgia in corso.
  useEffect(() => {
    if (!sessionLoaded || !sessionDate) return;
    const session: MassSession = {
      showGloria, showCredo, showOrazionalePray,
      selectedOrazionaleId, selectedPrefaceId, selectedPrayerId,
      benedizioneId, congedoId, acclamationId, padreNostroIntroId,
      useSolemnBlessing, solemnBlessingId,
      penitentialForm, penitentialSeason, selectedCredoId, orateFratresId,
      peSelections,
      useOrazionePopolo, orazionePopoloId,
    } as any;
    saveSession(sessionDate, session);
  }, [sessionLoaded, sessionDate, showGloria, showCredo, showOrazionalePray,
      selectedOrazionaleId, selectedPrefaceId, selectedPrayerId,
      benedizioneId, congedoId, acclamationId, padreNostroIntroId,
      useSolemnBlessing, solemnBlessingId,
      penitentialForm, penitentialSeason, selectedCredoId, orateFratresId,
      peSelections,
      useOrazionePopolo, orazionePopoloId]);

  // === PE FULL: espansione dei blocchi `var` in base a peSelections ===
  // IMPORTANTE: questi hook devono stare PRIMA di qualunque early-return
  // per rispettare le regole di React (stesso numero di hook ad ogni render).
  type Block = { type: string; text?: string; selector?: string; title?: string };
  const peFull = useMemo(() => {
    return ((peFullData as any[]) || []).find((p) => p.id === selectedPrayerId) || null;
  }, [selectedPrayerId]);

  const peSelectorEntries = useMemo(() => {
    if (!peFull?.selectors) return [] as { key: string; label: string; current: string; options: { id: string; label: string }[] }[];
    return Object.entries(peFull.selectors as Record<string, any>).map(([key, def]: [string, any]) => {
      const friendly =
        key === "communicantes" ? "Tempo Liturgico"
        : key === "hanc_igitur" ? "Rito Particolare"
        : key === "rito" ? "Rito Particolare"
        : (def.label || key);
      const current = peSelections[key] || def.options?.[0]?.id || "";
      return { key, label: friendly, current, options: def.options || [] };
    });
  }, [peFull, peSelections]);

  // Inizializza i selettori PE con i default quando cambia la PE selezionata,
  // se l'utente non ha già scelto qualcosa.
  // Il default per `communicantes` (Tempo Liturgico) viene calcolato in base
  // alla data corrente: Domenica → "domenica", Pasqua → "pasqua", ecc.
  // IMPORTANTE: aspettiamo che `liturgy` sia caricata, altrimenti il
  // suggerimento ricade sempre su "ordinario".
  useEffect(() => {
    if (!peFull?.selectors) return;
    if (!liturgy) return; // aspetta che la liturgia del giorno sia caricata
    setPeSelections((prev) => {
      const updated = { ...prev };
      let changed = false;
      Object.entries(peFull.selectors as Record<string, any>).forEach(([key, def]: [string, any]) => {
        if (!updated[key]) {
          if (key === "communicantes") {
            const candidate = suggestCommunicantesId(liturgy, def.options || []);
            updated[key] = candidate || def.options?.[0]?.id || "";
          } else {
            updated[key] = def.options?.[0]?.id || "";
          }
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [peFull?.id, liturgy?.date, liturgy?.title]);

  // Espande i blocchi `var` con la variante selezionata e converte tutto in
  // un singolo testo piatto. Mantiene i marker `[rubric]` solo per pe1.
  const expandedPrayerText = useMemo(() => {
    if (!peFull) {
      const apiText = prayers.find(p => p.id === selectedPrayerId)?.text || "";
      // Stripping rubrics here in-line (non-pe1)
      if (selectedPrayerId === "pe1") return apiText;
      return apiText
        .replace(/\[[^\]]*\]\s*\n?/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    const out: Block[] = [];
    for (const b of (peFull.blocks as Block[])) {
      if (b.type === "var" && b.selector && peFull.selectors?.[b.selector]) {
        const def = peFull.selectors[b.selector];
        const optId = peSelections[b.selector] || def.options?.[0]?.id;
        const variantBlocks: Block[] = def.variants?.[optId] || def.variants?.[def.options?.[0]?.id] || [];
        out.push(...variantBlocks);
      } else {
        out.push(b);
      }
    }
    const isPe1 = peFull.id === "pe1";
    const parts: string[] = [];
    for (const b of out) {
      if (b.type === "title") continue;
      // Salta i blocchi acclamazione: l'utente sceglie l'acclamazione separatamente
      // nella pagina "Mistero della Fede" (3 forme), quindi includerle qui le duplica.
      if (b.type === "acc") continue;
      const t = (b.text || "").trim();
      if (!t) continue;
      if (b.type === "r" || b.type === "rubric_section") {
        if (isPe1) parts.push(`[${t}]`);
      } else {
        parts.push(t);
      }
    }
    return parts.join("\n\n");
  }, [peFull, peSelections, prayers, selectedPrayerId]);

  if (loading || !fixedParts) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const selectedPreface = prefaces.find(p => p.id === selectedPrefaceId);
  const selectedPrayer = prayers.find(p => p.id === selectedPrayerId);
  const selectedOrazionale = selectedOrazionaleId ? getPrayerById(selectedOrazionaleId) : undefined;
  const getReading = (type: ReadingType) => liturgy?.readings?.find(r => r.type === type);

  // Basic text renderers
  const R = ({ children, kind = "normal" }: { children: React.ReactNode; kind?: "normal" | "rubric" | "celebrante" | "assemblea" | "title" | "subtitle" }) => {
    const s = kind === "rubric" ? styles.rubric
      : kind === "celebrante" ? styles.celebrante
      : kind === "assemblea" ? styles.assemblea
      : kind === "title" ? styles.sectionTitle
      : kind === "subtitle" ? styles.subtitle
      : styles.text;
    return <Text style={s} selectable>{children}</Text>;
  };

  const renderSection = (section: any, idx: number) => {
    if (section.type === "rubric") return <R key={idx} kind="rubric">{section.text}</R>;
    if (section.type === "dialogue") {
      return (
        <View key={idx} style={styles.block}>
          <R kind="celebrante">C. {section.celebrante}</R>
          <R kind="assemblea">A. {section.assemblea}</R>
        </View>
      );
    }
    if (section.type === "monologue") return <R key={idx} kind="celebrante">{section.celebrante}</R>;
    if (section.type === "prayer") {
      return (
        <View key={idx} style={styles.block}>
          {section.rubric && <R kind="rubric">{section.rubric}</R>}
          {section.celebrante && <R kind="celebrante">{section.celebrante}</R>}
          {section.text && <R>{section.text}</R>}
          {section.assemblea && <R kind="assemblea">A. {section.assemblea}</R>}
        </View>
      );
    }
    if (section.type === "kyrie") {
      return (
        <View key={idx} style={styles.block}>
          {section.rubric && <R kind="rubric">{section.rubric}</R>}
          {section.dialogue.map((d: any, i: number) => (
            <View key={i} style={styles.dialogBlock}>
              <R kind="celebrante">C. {d.c}</R>
              <R kind="assemblea">A. {d.a}</R>
            </View>
          ))}
        </View>
      );
    }
    return null;
  };

  // Versione che SALTA tutte le rubriche in rosso (per sezioni dove l'utente
  // ha chiesto di rimuoverle: riti iniziali, gloria, pace, comunione, ecc.)
  const renderSectionNoRubric = (section: any, idx: number) => {
    if (section.type === "rubric") return null;
    if (section.type === "prayer" || section.type === "kyrie") {
      const cleaned = { ...section };
      delete cleaned.rubric;
      return renderSection(cleaned, idx);
    }
    return renderSection(section, idx);
  };

  // === Helpers Preghiera Eucaristica: gestione rubriche e marker [Santo] ===
  // Per la PE I (Canone Romano) le rubriche tra parentesi quadre vengono mostrate
  // come piccolo testo rosso. Per tutte le altre PE i marker [xxx] (es. [Santo])
  // vengono completamente rimossi dal testo visualizzato.
  const processPrayerText = (text: string, prayerId: string): string => {
    if (!text) return "";
    if (prayerId === "pe1") return text;
    // Rimuove tutti i marker [xxx] e ricompatta gli spazi/righe vuote in eccesso
    return text
      .replace(/\[[^\]]*\]\s*\n?/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // Renderizza un chunk di testo della Preghiera Eucaristica, splittando su [xxx]
  // marker per emetterli come rubriche piccole rosse. Usato solo per la PE I.
  const renderPe1Chunk = (chunk: string, keyPrefix: string) => {
    const parts = chunk.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[([^\]]+)\]$/);
      if (m) {
        return <R key={`${keyPrefix}-r-${i}`} kind="rubric">{m[1]}</R>;
      }
      const trimmed = part.replace(/^\n+|\n+$/g, "");
      if (!trimmed) return null;
      return <R key={`${keyPrefix}-t-${i}`}>{trimmed}</R>;
    });
  };

  // === Helpers paginazione automatica testo ===
  // Stima quanti caratteri possono stare in una schermata dato il fontSize attuale.
  // Più aggressivo per evitare overflow oltre il fondo schermo con font grandi.
  // Stima caratteri per schermata per modalità tap.
  // Aumentato per riempire meglio lo schermo senza spazi vuoti inutili.
  const charsPerPage = Math.max(280, Math.min(2000, Math.round(18000 / Math.max(16, fontSize))));

  // Splitta un testo lungo in chunk rispettando i paragrafi (\n\n).
  // Algoritmo "greedy fill": riempie ogni chunk il più possibile per minimizzare
  // il numero di pagine ed evitare spazio vuoto in fondo.
  // Se un singolo paragrafo eccede maxChars, lo splitta su frasi (.) o virgole (,).
  const splitTextIntoChunks = (text: string, maxChars = charsPerPage): string[] => {
    if (!text) return [];
    if (text.length <= maxChars) return [text];
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = "";
    // Tolleranza: accetta lievi sforamenti per evitare pagine semi-vuote
    const HARD_LIMIT = Math.round(maxChars * 1.15);
    const MIN_FILL = Math.round(maxChars * 0.55); // se il chunk è < 55% pieno, prova a unire

    const splitParagraphLong = (p: string): string[] => {
      const pieces: string[] = [];
      const sentences = p.split(/(?<=[\.\?\!])\s+/);
      let buf = "";
      for (const s of sentences) {
        const cand = buf ? `${buf} ${s}` : s;
        if (cand.length > maxChars && buf) {
          pieces.push(buf.trim());
          buf = s;
        } else {
          buf = cand;
        }
      }
      if (buf) pieces.push(buf.trim());
      return pieces;
    };

    for (const p of paragraphs) {
      if (p.length > HARD_LIMIT) {
        // Paragrafo troppo lungo: splittalo
        if (current) {
          chunks.push(current);
          current = "";
        }
        const pieces = splitParagraphLong(p);
        for (const piece of pieces) {
          chunks.push(piece);
        }
        continue;
      }
      const candidate = current ? `${current}\n\n${p}` : p;
      if (candidate.length <= HARD_LIMIT) {
        current = candidate;
      } else if (current.length < MIN_FILL && candidate.length <= HARD_LIMIT * 1.2) {
        // Chunk attuale troppo vuoto: unisci anche se sfora un po'
        current = candidate;
      } else {
        chunks.push(current);
        current = p;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };

  // === Reading renderer (daily) ===
  const renderReading = (type: ReadingType, titleOverride?: string) => {
    const r = getReading(type);
    if (!r || !r.text) return null;
    return (
      <View style={styles.readingBlock} testID={`reading-${type}`}>
        <R kind="subtitle">{titleOverride || r.title}</R>
        {r.reference ? <R kind="rubric">{r.reference}</R> : null}
        <R>{r.text}</R>
      </View>
    );
  };

  // Versione "chunked" per modalità Tap: mostra solo una porzione del testo
  const renderReadingChunk = (type: ReadingType, chunkIndex: number, totalChunks: number, titleOverride?: string) => {
    const r = getReading(type);
    if (!r || !r.text) return null;
    const chunks = splitTextIntoChunks(r.text);
    const t = chunks[chunkIndex] || "";
    const baseTitle = titleOverride || r.title;
    const showTitle = chunkIndex === 0;
    const suffix = totalChunks > 1 ? ` (${chunkIndex + 1}/${totalChunks})` : "";
    return (
      <View style={styles.readingBlock} testID={`reading-${type}-${chunkIndex}`}>
        {showTitle ? <R kind="subtitle">{baseTitle}{suffix}</R> : <R kind="subtitle">{baseTitle}{suffix} (continua)</R>}
        {showTitle && r.reference ? <R kind="rubric">{r.reference}</R> : null}
        <R>{t}</R>
      </View>
    );
  };

  // === Atto Penitenziale ===
  const renderAttoPenitenziale = () => {
    const atto = fixedParts["atto_penitenziale"];
    const choice = atto.sections.find((s: any) => s.type === "choice");
    const selectedOpt = choice?.options.find((o: any) => o.id === penitentialForm);
    const seasonVariant = selectedOpt?.season_variants?.[penitentialSeason];

    return (
      <View testID="section-atto-penitenziale">
        <R kind="title">Atto Penitenziale</R>
        {atto.sections.filter((s: any) => s.type !== "choice" && s.type !== "kyrie").map(renderSection)}

        <R kind="subtitle">Scegli formula</R>
        <View style={styles.choiceRow}>
          {(["A", "B", "C"] as const).map(id => (
            <TouchableOpacity
              key={id}
              style={[styles.choiceBtn, penitentialForm === id && styles.choiceBtnActive]}
              onPress={() => setPenitentialForm(id)}
              testID={`btn-penitential-${id}`}
            >
              <Text style={[styles.choiceBtnText, penitentialForm === id && { color: "#FFFFFF" }]}>Formula {id}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Formula C: sub-selettore tempo liturgico */}
        {selectedOpt?.season_variants && (
          <View>
            <R kind="subtitle">Tempo liturgico (tropari)</R>
            <View style={styles.choiceRow}>
              {Object.entries(selectedOpt.season_variants).map(([key, v]: [string, any]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.choiceBtn, penitentialSeason === key && styles.choiceBtnActive]}
                  onPress={() => setPenitentialSeason(key)}
                  testID={`btn-pen-season-${key}`}
                >
                  <Text style={[styles.choiceBtnText, penitentialSeason === key && { color: "#FFFFFF" }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {selectedOpt && (
          <View style={styles.block}>
            <R kind="subtitle">{selectedOpt.label}</R>
            {selectedOpt.assemblea && <R kind="assemblea">A. {selectedOpt.assemblea}</R>}
            {selectedOpt.dialogue && selectedOpt.dialogue.map((d: any, i: number) => (
              <View key={i} style={styles.dialogBlock}>
                <R kind="celebrante">C. {d.c}</R>
                <R kind="assemblea">A. {d.a}</R>
              </View>
            ))}
            {/* Formula C: tutte le formule del tempo liturgico selezionato, una sotto l'altra */}
            {seasonVariant?.formulas && Array.isArray(seasonVariant.formulas) && (
              <>
                {seasonVariant.formulas.map((formula: any, fi: number) => (
                  <View key={`formula-${fi}`} style={styles.penitentialFormulaBox}>
                    {formula.label && <R kind="subtitle">{formula.label}</R>}
                    {formula.dialogue?.map((d: any, i: number) => (
                      <View key={`f${fi}-${i}`} style={styles.dialogBlock}>
                        <R kind="celebrante">C. {d.c}</R>
                        <R kind="assemblea">A. {d.a}</R>
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}
            {/* Compatibilità retro: vecchio schema con singola dialogue per stagione */}
            {seasonVariant?.dialogue && seasonVariant.dialogue.map((d: any, i: number) => (
              <View key={`sv-${i}`} style={styles.dialogBlock}>
                <R kind="celebrante">C. {d.c}</R>
                <R kind="assemblea">A. {d.a}</R>
              </View>
            ))}
            {selectedOpt.celebrante && <R kind="celebrante">C. {selectedOpt.celebrante}</R>}
            {selectedOpt.risposta && <R kind="assemblea">A. {selectedOpt.risposta}</R>}
          </View>
        )}

        {penitentialForm !== "C" && atto.sections.find((s: any) => s.type === "kyrie") &&
          renderSection(atto.sections.find((s: any) => s.type === "kyrie"), 99)}
      </View>
    );
  };

  // === Credo ===
  const renderCredo = () => {
    const credo = fixedParts["credo"];
    const choice = credo.sections[0];
    const sel = choice.options.find((o: any) => o.id === selectedCredoId);
    return (
      <View testID="section-credo">
        <R kind="title">Professione di Fede (Credo)</R>
        <View style={styles.choiceRow}>
          {choice.options.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, selectedCredoId === o.id && styles.choiceBtnActive]}
              onPress={() => setSelectedCredoId(o.id)}
              testID={`btn-credo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, selectedCredoId === o.id && { color: "#FFFFFF" }]}>
                {o.id === "niceno" ? "Niceno" : "Apostolico"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {sel && <R>{sel.text}</R>}
      </View>
    );
  };

  // === Offertorio ===
  const renderOffertorio = () => {
    const off = fixedParts["offertorio"];
    const orateChoice = off.sections.find((s: any) => s.type === "choice_orate");
    const selectedOrate = orateChoice?.options.find((o: any) => o.id === orateFratresId);
    return (
      <View testID="part-offertorio">
        <R kind="title">Liturgia Eucaristica – Presentazione dei doni</R>
        {off.sections
          .filter((s: any) => s.type !== "choice_orate" && s.type !== "rubric")
          .map(renderSection)}

        {orateChoice && (
          <View style={styles.block}>
            <R kind="subtitle">Invito e risposta</R>
            <View style={styles.choiceRow}>
              {orateChoice.options.map((o: any) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.choiceBtn, orateFratresId === o.id && styles.choiceBtnActive]}
                  onPress={() => setOrateFratresId(o.id)}
                  testID={`btn-orate-${o.id}`}
                >
                  <Text style={[styles.choiceBtnText, orateFratresId === o.id && { color: "#FFFFFF" }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedOrate && (
              <View style={styles.block}>
                <R kind="celebrante">C. {selectedOrate.celebrante}</R>
                <R kind="assemblea">A. {selectedOrate.assemblea}</R>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // === Padre Nostro (con 4 introduzioni) ===
  const renderPadreNostro = () => {
    const pn = fixedParts["padre_nostro"];
    const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
    const selectedIntro = introChoice?.options.find((o: any) => o.id === padreNostroIntroId);
    return (
      <View testID="part-padre-nostro">
        <R kind="title">Riti di Comunione</R>

        {introChoice && (
          <View style={styles.block}>
            <R kind="subtitle">Monizione d'introduzione</R>
            <View style={styles.choiceRow}>
              {introChoice.options.map((o: any) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.choiceBtn, padreNostroIntroId === o.id && styles.choiceBtnActive]}
                  onPress={() => setPadreNostroIntroId(o.id)}
                  testID={`btn-pn-intro-${o.id}`}
                >
                  <Text style={[styles.choiceBtnText, padreNostroIntroId === o.id && { color: "#FFFFFF" }]}>Forma {o.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedIntro && <R kind="celebrante">C. {selectedIntro.text}</R>}
          </View>
        )}

        {pn.sections.filter((s: any) => s.type !== "choice_intro").map(renderSection)}
      </View>
    );
  };

  // === Riti di Conclusione ===
  // Suddivisi in due funzioni: Benedizione e Congedo (su pagine separate)

  // Lista congedi (i 4 standard + eventualmente quello pasquale)
  const getCongedoOptions = () => {
    const rc = fixedParts["riti_conclusione"];
    const congedoChoice = rc.sections[2];
    const opts = [...congedoChoice.options];
    if (pasquaDismissal && currentSeasonKey === "pasqua") {
      opts.push({
        id: pasquaDismissal.id,
        label: "Pasqua",
        celebrante: pasquaDismissal.celebrante,
        assemblea: pasquaDismissal.assemblea,
      });
    }
    return opts;
  };

  // Sotto-blocco riutilizzabile: Toggle "Usa benedizione solenne" + scelta semplice/solenne
  // Viene mostrato:
  //   - nella pagina "Benedizione" se l'orazione sul popolo NON è attiva
  //   - nella pagina "Orazione sul popolo" se l'orazione sul popolo è attiva
  //     (in entrambi i casi sotto al testo principale, prima del Congedo)
  const renderBlessingChoiceBlock = () => {
    const rc = fixedParts["riti_conclusione"];
    const benedChoice = rc.sections[1];
    const bened = benedChoice.options.find((o: any) => o.id === benedizioneId);
    const selectedSolemn = solemnBlessings.find(b => b.id === solemnBlessingId);
    return (
      <>
        {/* Toggle Benedizione Solenne */}
        {solemnBlessings.length > 0 && (
          <View style={[styles.block, styles.solemnToggle]} testID="solemn-toggle">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Usa benedizione solenne</Text>
              <Switch
                value={useSolemnBlessing}
                onValueChange={setUseSolemnBlessing}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }}
                testID="switch-solemn-blessing"
              />
            </View>
          </View>
        )}

        {useSolemnBlessing ? (
          <View testID="section-solemn-blessing">
            <R kind="subtitle">Scegli Benedizione Solenne (Messale 2020)</R>
            <View style={[styles.choiceRow, { flexWrap: "wrap" }]}>
              {solemnBlessings.map((b: any) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.solemnChoiceBtn, solemnBlessingId === b.id && styles.choiceBtnActive]}
                  onPress={() => setSolemnBlessingId(b.id)}
                  testID={`btn-solemn-${b.id}`}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.solemnChoiceText, solemnBlessingId === b.id && { color: "#FFFFFF" }]} numberOfLines={2}>
                    {b.num ? `${b.num}. ` : ""}{b.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedSolemn && (
              <Text style={styles.solemnHint}>
                Selezionata: {selectedSolemn.num ? `${selectedSolemn.num}. ` : ""}{selectedSolemn.title}.
                Il testo completo apparirà nella prossima pagina.
              </Text>
            )}
          </View>
        ) : (
          <View>
            <R kind="subtitle">Benedizione</R>
            <View style={styles.choiceRow}>
              {benedChoice.options.map((o: any) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.choiceBtn, benedizioneId === o.id && styles.choiceBtnActive]}
                  onPress={() => setBenedizioneId(o.id)}
                  testID={`btn-bened-${o.id}`}
                >
                  <Text style={[styles.choiceBtnText, benedizioneId === o.id && { color: "#FFFFFF" }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {bened && (
              <View style={styles.block}>
                <R kind="celebrante">C. {bened.celebrante}</R>
                <R kind="assemblea">A. {bened.assemblea}</R>
              </View>
            )}
          </View>
        )}
      </>
    );
  };

  const renderConclusioneBenedizione = () => {
    const rc = fixedParts["riti_conclusione"];
    const dialogue = rc.sections[0];
    const selectedOrazPopolo = prayersOverPeople.find(p => p.id === orazionePopoloId);

    return (
      <View testID="section-benedizione">
        <R kind="title">Benedizione</R>
        {renderSection(dialogue, 0)}

        {/* Toggle Orazione sul popolo */}
        {prayersOverPeople.length > 0 && (
          <View style={[styles.block, styles.solemnToggle]} testID="orazione-popolo-toggle">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Aggiungi orazione sul popolo</Text>
              <Switch
                value={useOrazionePopolo}
                onValueChange={(v) => {
                  setUseOrazionePopolo(v);
                  if (v && !orazionePopoloId && prayersOverPeople.length > 0) {
                    setOrazionePopoloId(prayersOverPeople[0].id);
                  }
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }}
                testID="switch-orazione-popolo"
              />
            </View>
            {useOrazionePopolo && (
              <View style={{ marginTop: 14 }}>
                <R kind="subtitle">Scegli orazione sul popolo (1-{prayersOverPeople.length})</R>
                <View style={[styles.choiceRow, { flexWrap: "wrap" }]}>
                  {prayersOverPeople.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.numChoiceBtn, orazionePopoloId === p.id && styles.choiceBtnActive]}
                      onPress={() => setOrazionePopoloId(p.id)}
                      testID={`btn-orazione-popolo-${p.id}`}
                    >
                      <Text style={[styles.numChoiceText, orazionePopoloId === p.id && { color: "#FFFFFF" }]}>
                        {p.num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {selectedOrazPopolo && (
                  <Text style={styles.solemnHint}>
                    Selezionata n. {selectedOrazPopolo.num}. Il testo apparirà nella prossima pagina,
                    dove potrai anche scegliere la benedizione.
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Quando l'orazione sul popolo NON è attiva, la scelta della benedizione
            (semplice/solenne) appare qui, sotto al toggle. Quando è attiva, la
            scelta viene spostata sulla pagina dedicata all'orazione, dopo il
            testo, per rispettare la sequenza liturgica corretta. */}
        {!useOrazionePopolo && renderBlessingChoiceBlock()}
      </View>
    );
  };

  const renderConclusioneCongedo = () => {
    const congedoOptions = getCongedoOptions();
    const selectedCongedo = congedoOptions.find((o: any) => o.id === congedoId) || congedoOptions[0];

    return (
      <View testID="section-congedo">
        <R kind="title">Congedo</R>
        <View style={styles.choiceRow}>
          {congedoOptions.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, congedoId === o.id && styles.choiceBtnActive]}
              onPress={() => setCongedoId(o.id)}
              testID={`btn-congedo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, congedoId === o.id && { color: "#FFFFFF" }]}>
                {o.label || o.id}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedCongedo && (
          <View style={styles.block}>
            <R kind="celebrante">C. {selectedCongedo.celebrante}</R>
            <R kind="assemblea">A. {selectedCongedo.assemblea}</R>
          </View>
        )}
      </View>
    );
  };

  // (manteniamo la vecchia funzione per compatibilità con la modalità scroll)
  const renderConclusione = () => (
    <>
      {renderConclusioneBenedizione()}
      {renderConclusioneCongedo()}
    </>
  );

  return (
    <SafeAreaView style={styles.container} testID="mass-screen">
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="btn-back">
          <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Santa Messa</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/impostazioni")} testID="btn-settings-mass">
          <Ionicons name="settings-outline" size={scaledFont(36)} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Definizione delle pagine della messa */}
      {(() => {
        // Costruisce dinamicamente le pagine in base ai toggle
        const pages: { key: string; title: string; render: () => React.ReactNode; disableTapAdvance?: boolean }[] = [];

        // PAGINA 0: Frontespizio
        pages.push({
          key: "intro",
          title: "Inizio",
          disableTapAdvance: true, // Evita avanzamento accidentale mentre si toccano i toggle Gloria/Credo
          render: () => (
            <View style={styles.partBox}>
              <View style={[styles.dayHeader, { borderColor: liturgy?.season?.color_hex || colors.border }]}>
                <Text style={styles.dayDate} testID="mass-date">{liturgy?.date_label}</Text>
                {liturgy?.title ? <Text style={styles.dayTitle}>{liturgy.title}</Text> : null}
                <Text style={styles.daySeason}>{liturgy?.season?.season} · Colore liturgico: {liturgy?.liturgical_color || liturgy?.season?.color}</Text>
              </View>
              <View style={styles.togglesBox}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Mostra Gloria</Text>
                  <Switch value={showGloria} onValueChange={setShowGloria} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Mostra Credo</Text>
                  <Switch value={showCredo} onValueChange={setShowCredo} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Preghiera dei fedeli</Text>
                  <Switch value={showOrazionalePray} onValueChange={setShowOrazionalePray} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
              </View>
              <TouchableOpacity
                style={styles.startCelebrationBtn}
                onPress={advance}
                testID="btn-start-celebration"
                accessibilityRole="button"
                accessibilityLabel="Inizia la celebrazione"
              >
                <Ionicons name="play-circle" size={scaledFont(40)} color="#FFFFFF" />
                <Text style={styles.startCelebrationBtnText}>Inizia la celebrazione</Text>
              </TouchableOpacity>
              <Text style={[styles.toggleLabel, { textAlign: "center", marginTop: 12, fontStyle: "italic", fontSize: Math.round(fontSize * 0.55) }]}>
                Durante la messa: tocca a destra per avanzare, a sinistra per tornare indietro
              </Text>
            </View>
          ),
        });

        // PAGINA: Riti di Introduzione + Colletta combinati (Colletta chiude i riti iniziali)
        pages.push({
          key: "riti-iniziali",
          title: "Riti di Introduzione",
          render: () => (
            <View style={styles.partBox}>
              {renderReading("antifona_ingresso", "Antifona d'ingresso")}
              <R kind="title">Riti di Introduzione</R>
              {fixedParts["riti_iniziali"].sections.map(renderSectionNoRubric)}
            </View>
          ),
        });

        // PAGINA: Atto Penitenziale
        pages.push({
          key: "penitenziale",
          title: "Atto Penitenziale",
          render: () => <View style={styles.partBox}>{renderAttoPenitenziale()}</View>,
        });

        // PAGINA: Gloria
        if (showGloria) {
          pages.push({
            key: "gloria",
            title: "Gloria",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Gloria</R>
                {fixedParts["gloria"].sections.map(renderSectionNoRubric)}
              </View>
            ),
          });
        }

        // PAGINA: Colletta del giorno
        pages.push({
          key: "colletta",
          title: "Colletta",
          render: () => (
            <View style={styles.partBox}>
              {renderReading("colletta", "Colletta (Orazione del giorno)") || (
                <R kind="rubric">Colletta non disponibile per oggi.</R>
              )}
            </View>
          ),
        });

        // PAGINE: Liturgia della Parola (suddivisa in più schermate, con auto-pagination per testi lunghi)
        const readings = liturgy?.readings || [];
        const hasReading = (type: string) => readings.some(r => r.type === type);

        // ===== LETTURE & SALMO =====
        // Una pagina sola per ciascuna lettura - lo scroll verticale gestisce
        // testi lunghi (richiesta utente: niente chunking, niente spazio vuoto).
        const addReadingPage = (type: ReadingType, title: string) => {
          const r = readings.find(rr => rr.type === type);
          if (!r || !r.text) return;
          pages.push({
            key: `read-${type}`,
            title,
            render: () => (
              <View style={styles.partBox}>
                {renderReading(type, title)}
              </View>
            ),
          });
        };

        addReadingPage("prima_lettura", "Prima Lettura");
        addReadingPage("salmo", "Salmo Responsoriale");
        addReadingPage("seconda_lettura", "Seconda Lettura");
        addReadingPage("sequenza", "Sequenza");
        // Acclamazione + Vangelo: una sola pagina (scroll), oppure separate se manca uno
        const accl = readings.find(r => r.type === "acclamazione");
        const vang = readings.find(r => r.type === "vangelo");
        if (accl && vang) {
          pages.push({
            key: "vangelo-page",
            title: "Vangelo",
            render: () => (
              <View style={styles.partBox}>
                {renderReading("acclamazione", "Acclamazione al Vangelo")}
                {renderReading("vangelo", "Vangelo")}
              </View>
            ),
          });
        } else if (vang) {
          addReadingPage("vangelo", "Vangelo");
        } else if (accl) {
          addReadingPage("acclamazione", "Acclamazione al Vangelo");
        }
        if (!hasReading("prima_lettura") && !hasReading("vangelo")) {
          pages.push({
            key: "letture-vuote",
            title: "Liturgia della Parola",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Liturgia della Parola</R>
                <R kind="rubric">Letture non disponibili. Verifica connessione internet.</R>
              </View>
            ),
          });
        }

        // PAGINA: Credo
        if (showCredo) {
          pages.push({
            key: "credo",
            title: "Professione di Fede",
            render: () => <View style={styles.partBox}>{renderCredo()}</View>,
          });
        }

        // PAGINE: Preghiera dei fedeli (Orazionale CEI)
        if (showOrazionalePray && selectedOrazionale) {
          const orChunks = splitTextIntoChunks(selectedOrazionale.body);
          orChunks.forEach((_, i) => {
            pages.push({
              key: `orazionale-${i}`,
              title: orChunks.length > 1 ? `Preghiera dei fedeli (${i + 1}/${orChunks.length})` : "Preghiera dei fedeli",
              render: () => (
                <View style={styles.partBox}>
                  {i === 0 ? (
                    <>
                      <R kind="title">Preghiera dei fedeli</R>
                      <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowOrazionale(true)} testID="btn-select-orazionale">
                        <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                        <Text style={styles.selectorBtnText}>Scegli Preghiera</Text>
                      </TouchableOpacity>
                      <R kind="subtitle">{selectedOrazionale.title}</R>
                    </>
                  ) : (
                    <R kind="subtitle">{selectedOrazionale.title} (continua)</R>
                  )}
                  <R>{orChunks[i]}</R>
                </View>
              ),
            });
          });
        } else if (showOrazionalePray && !selectedOrazionale) {
          pages.push({
            key: "orazionale-empty",
            title: "Preghiera dei fedeli",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Preghiera dei fedeli</R>
                <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowOrazionale(true)} testID="btn-select-orazionale">
                  <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                  <Text style={styles.selectorBtnText}>Scegli Preghiera</Text>
                </TouchableOpacity>
                <R kind="rubric">Tocca per scegliere la Preghiera universale dall'Orazionale.</R>
              </View>
            ),
          });
        }

        // PAGINE: Presentazione dei Doni (3 pagine)
        // P1: Pane + acqua/vino + vino
        // P2: "Umili e pentiti" + Lavabo + "Pregate fratelli e sorelle"
        // P3: Sulle offerte (orazione)
        const off = fixedParts["offertorio"];
        const orateChoice = off.sections.find((s: any) => s.type === "choice_orate");
        const selectedOrate = orateChoice?.options.find((o: any) => o.id === orateFratresId);
        // Sezioni iniziali (rubriche + Benedetti) fino all'indice della "Umili e pentiti"
        // La sezione 4 (in JSON) è "Umili e pentiti" col rubric "Inchinato..."
        // Le sezioni precedenti (0-3) sono le offerte di pane e vino.
        const allSections = off.sections;
        const idxInchinato = allSections.findIndex((s: any) =>
          s.type === "prayer" && s.rubric && /inchinato/i.test(s.rubric),
        );
        const headSections = idxInchinato > 0 ? allSections.slice(0, idxInchinato) : allSections.slice(0, 4);
        const inchinatoSection = idxInchinato >= 0 ? allSections[idxInchinato] : null;

        // P1: Presentazione doni (pane + vino)
        pages.push({
          key: "offertorio-1",
          title: "Presentazione dei Doni",
          render: () => (
            <View style={styles.partBox} testID="part-offertorio-1">
              <R kind="title">Liturgia Eucaristica – Presentazione dei doni</R>
              {headSections
                .filter((s: any) => s.type !== "rubric" || true)  // mostra anche rubriche
                .map(renderSection)}
            </View>
          ),
        });

        // P2: Inchinato + Lavabo + Pregate fratelli e sorelle
        pages.push({
          key: "offertorio-2",
          title: "Inchinato e Pregate",
          render: () => (
            <View style={styles.partBox} testID="part-offertorio-2">
              <R kind="title">Presentazione dei doni (continua)</R>
              {inchinatoSection && renderSection(inchinatoSection, 0)}
              {orateChoice && (
                <View style={styles.block}>
                  {orateChoice.rubric && <R kind="rubric">{orateChoice.rubric}</R>}
                  <R kind="subtitle">Invito e risposta</R>
                  <View style={styles.choiceRow}>
                    {orateChoice.options.map((o: any) => (
                      <TouchableOpacity
                        key={o.id}
                        style={[styles.choiceBtn, orateFratresId === o.id && styles.choiceBtnActive]}
                        onPress={() => setOrateFratresId(o.id)}
                        testID={`btn-orate-${o.id}`}
                      >
                        <Text style={[styles.choiceBtnText, orateFratresId === o.id && { color: "#FFFFFF" }]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {selectedOrate && (
                    <View style={styles.block}>
                      <R kind="celebrante">C. {selectedOrate.celebrante}</R>
                      <R kind="assemblea">A. {selectedOrate.assemblea}</R>
                    </View>
                  )}
                </View>
              )}
            </View>
          ),
        });

        // P3: Sulle offerte (orazione del giorno)
        pages.push({
          key: "offertorio-3",
          title: "Sulle offerte",
          render: () => (
            <View style={styles.partBox} testID="part-offertorio-3">
              {renderReading("sulle_offerte", "Sulle offerte") || (
                <>
                  <R kind="title">Sulle offerte</R>
                  <R kind="rubric">Orazione non disponibile per oggi.</R>
                </>
              )}
            </View>
          ),
        });

        // PAGINA: Prefazio + Santo (uniti, si chunkano insieme: il Santo finisce
        // sull'ultima pagina del prefazio o appena dopo se non entra)
        if (selectedPreface) {
          const SANTO_TEXT = "Santo, Santo, Santo il Signore Dio dell'universo.\nI cieli e la terra sono pieni della tua gloria.\nOsanna nell'alto dei cieli.\nBenedetto colui che viene nel nome del Signore.\nOsanna nell'alto dei cieli.";
          const fullText = selectedPreface.text.trimEnd() + "\n\n" + SANTO_TEXT;
          const prefChunks = splitTextIntoChunks(fullText);
          prefChunks.forEach((_, i) => {
            pages.push({
              key: `prefazio-${i}`,
              title: prefChunks.length > 1 ? `Prefazio (${i + 1}/${prefChunks.length})` : "Prefazio",
              render: () => (
                <View style={styles.partBox}>
                  {i === 0 ? (
                    <>
                      <R kind="title">Prefazio</R>
                      <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrefaces(true)} testID="btn-select-preface">
                        <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                        <Text style={styles.selectorBtnText}>Scegli Prefazio</Text>
                      </TouchableOpacity>
                      <R kind="subtitle">{selectedPreface.title}</R>
                    </>
                  ) : (
                    <R kind="subtitle">{selectedPreface.title} (continua)</R>
                  )}
                  <R>{prefChunks[i]}</R>
                </View>
              ),
            });
          });
        } else {
          pages.push({
            key: "prefazio",
            title: "Prefazio",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Prefazio</R>
                <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrefaces(true)} testID="btn-select-preface">
                  <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                  <Text style={styles.selectorBtnText}>Scegli Prefazio</Text>
                </TouchableOpacity>
              </View>
            ),
          });
        }

        // PAGINE: Preghiera Eucaristica (suddivisa: Consacrazione | Mistero della Fede + Dossologia)
        if (selectedPrayer) {
          const isPe1 = selectedPrayer.id === "pe1";
          const marker = "Mistero della fede.";
          const text = expandedPrayerText || processPrayerText(selectedPrayer.text, selectedPrayer.id);
          const idx = text.indexOf(marker);
          let beforePart = text;
          let afterPart = "";
          if (idx >= 0) {
            beforePart = text.substring(0, idx).trimEnd();
            const rest = text.substring(idx + marker.length);
            const nextBreak = rest.indexOf("\n\n");
            afterPart = nextBreak > 0 ? rest.substring(nextBreak + 2).trimStart() : rest.trimStart();
          }
          const selAcc = acclamations.find(x => x.id === acclamationId);

          // Pagina 1+: Selettore + parte iniziale fino alla Consacrazione (chunked se lungo)
          // Per la PE usiamo un chunk size più piccolo (~50%) per evitare scroll
          // e avere più pagine da tappare, come richiesto.
          const peCharsPerPage = Math.round(charsPerPage * 0.50);
          const beforeChunks = splitTextIntoChunks(beforePart, peCharsPerPage);
          beforeChunks.forEach((_, i) => {
            pages.push({
              key: `pe-cons-${i}`,
              title: beforeChunks.length > 1
                ? `Preghiera Eucaristica – Consacrazione (${i + 1}/${beforeChunks.length})`
                : "Preghiera Eucaristica – Consacrazione",
              render: () => (
                <View style={styles.partBox}>
                  {i === 0 ? (
                    <>
                      <R kind="title">Preghiera Eucaristica</R>
                      <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrayers(true)} testID="btn-select-prayer">
                        <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                        <Text style={styles.selectorBtnText}>Scegli Preghiera Eucaristica</Text>
                      </TouchableOpacity>
                      {/* Selettori per i propri della PE (Tempo Liturgico / Rito Particolare) */}
                      {peSelectorEntries.length > 0 && (
                        <View style={styles.peSelectorsRow}>
                          {peSelectorEntries.map((sel) => {
                            const opt = sel.options.find((o: { id: string; label: string }) => o.id === sel.current);
                            return (
                              <TouchableOpacity
                                key={sel.key}
                                style={styles.peSelectorBtn}
                                onPress={() => setPePickerKey(sel.key)}
                                testID={`btn-pe-selector-${sel.key}`}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.peSelectorLabel}>{sel.label}</Text>
                                <View style={styles.peSelectorValueRow}>
                                  <Text style={styles.peSelectorValue} numberOfLines={2}>{opt?.label || "—"}</Text>
                                  <Ionicons name="chevron-down" size={scaledFont(22)} color="#7B3F00" />
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      <R kind="subtitle">{selectedPrayer.title}</R>
                    </>
                  ) : (
                    <R kind="subtitle">{selectedPrayer.title} (continua)</R>
                  )}
                  {isPe1 ? renderPe1Chunk(beforeChunks[i], `pe1-b${i}`) : <R>{beforeChunks[i]}</R>}
                </View>
              ),
            });
          });

          // Pagina Acclamazione + Mistero della Fede + Anamnesi/Dossologia (chunked se lungo)
          if (afterPart || acclamations.length > 0) {
            // Pagine seguenti: anamnesi + dossologia (chunked con stesso fattore aggressivo della consacrazione)
            const afterChunks = splitTextIntoChunks(afterPart, peCharsPerPage);
            // Prima pagina: acclamazione (selettore + dialogo)
            if (acclamations.length > 0) {
              pages.push({
                key: "pe-acclamazione",
                title: "Mistero della Fede",
                render: () => (
                  <View style={styles.partBox}>
                    <R kind="title">Mistero della Fede</R>
                    <View style={styles.acclamationBox}>
                      <R kind="subtitle">Forma dell'acclamazione</R>
                      <View style={styles.choiceRow}>
                        {acclamations.map(a => (
                          <TouchableOpacity key={a.id} style={[styles.choiceBtn, acclamationId === a.id && styles.choiceBtnActive]} onPress={() => setAcclamationId(a.id)} testID={`btn-acclamation-${a.id}`}>
                            <Text style={[styles.choiceBtnText, acclamationId === a.id && { color: "#FFFFFF" }]}>Forma {a.id}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {selAcc && (
                        <View style={styles.block}>
                          <R kind="celebrante">C. {selAcc.celebrante}</R>
                          <R kind="assemblea">A. {selAcc.assemblea}</R>
                        </View>
                      )}
                    </View>
                  </View>
                ),
              });
            }
            // Pagine seguenti: anamnesi + dossologia (chunked)
            afterChunks.forEach((_, i) => {
              pages.push({
                key: `pe-after-${i}`,
                title: afterChunks.length > 1
                  ? `Anamnesi e Dossologia (${i + 1}/${afterChunks.length})`
                  : "Anamnesi e Dossologia",
                render: () => (
                  <View style={styles.partBox}>
                    <R kind="title">{i === 0 ? "Anamnesi e Dossologia" : "Anamnesi e Dossologia (continua)"}</R>
                    {isPe1 ? renderPe1Chunk(afterChunks[i], `pe1-a${i}`) : <R>{afterChunks[i]}</R>}
                  </View>
                ),
              });
            });
          }
        } else {
          pages.push({
            key: "pe",
            title: "Preghiera Eucaristica",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Preghiera Eucaristica</R>
                <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrayers(true)} testID="btn-select-prayer">
                  <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                  <Text style={styles.selectorBtnText}>Scegli Preghiera Eucaristica</Text>
                </TouchableOpacity>
              </View>
            ),
          });
        }

        // PAGINA: Padre Nostro (solo Pater + monizione + embolismo)
        pages.push({
          key: "padre-nostro",
          title: "Padre Nostro",
          render: () => {
            const pn = fixedParts["padre_nostro"];
            const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
            const selectedIntro = introChoice?.options.find((o: any) => o.id === padreNostroIntroId);
            // Le prime 3 sezioni: monizione, Pater, embolismo. Saltiamo la rubrica iniziale "Il sacerdote..."
            const padreSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(0, 2); // Pater + embolismo
            return (
              <View testID="part-padre-nostro">
                <R kind="title">Padre Nostro</R>
                {introChoice && (
                  <View style={styles.block}>
                    <R kind="subtitle">Monizione d'introduzione</R>
                    <View style={styles.choiceRow}>
                      {introChoice.options.map((o: any) => (
                        <TouchableOpacity
                          key={o.id}
                          style={[styles.choiceBtn, padreNostroIntroId === o.id && styles.choiceBtnActive]}
                          onPress={() => setPadreNostroIntroId(o.id)}
                          testID={`btn-pn-intro-${o.id}`}
                        >
                          <Text style={[styles.choiceBtnText, padreNostroIntroId === o.id && { color: "#FFFFFF" }]}>Forma {o.id}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {selectedIntro && <R kind="celebrante">C. {selectedIntro.text}</R>}
                  </View>
                )}
                {/* Padre nostro (abbreviato) + Embolismo */}
                <View style={styles.block}>
                  <R>Padre nostro...</R>
                </View>
                {padreSections.slice(1).map((s: any, i: number) => renderSection(s, i + 1))}
              </View>
            );
          },
        });

        // PAGINA: Rito della Pace (senza rubriche)
        pages.push({
          key: "pace",
          title: "Rito della Pace",
          render: () => {
            const pn = fixedParts["padre_nostro"];
            // Sezioni 3, 4, 5: preghiera Signore Gesù Cristo + saluto pace + scambio
            const peaceSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(2);
            return (
              <View>
                <R kind="title">Rito della Pace</R>
                {peaceSections.map(renderSectionNoRubric)}
              </View>
            );
          },
        });

        // PAGINA: Frazione del Pane (Agnello di Dio) - senza rubriche
        pages.push({
          key: "frazione",
          title: "Frazione del Pane",
          render: () => {
            const com = fixedParts["comunione"];
            // Prime 2 sezioni: rubrica frazione + Agnello di Dio
            return (
              <View testID="part-frazione">
                <R kind="title">Frazione del Pane</R>
                {com.sections.slice(0, 2).map(renderSectionNoRubric)}
              </View>
            );
          },
        });

        // PAGINA: Comunione (Beati invitati + antifona) - senza rubriche
        pages.push({
          key: "comunione",
          title: "Comunione",
          render: () => {
            const com = fixedParts["comunione"];
            return (
              <View testID="part-comunione">
                <R kind="title">Comunione</R>
                {com.sections.slice(2).map((s: any, i: number) => renderSectionNoRubric(s, i + 2))}
                {renderReading("antifona_comunione", "Antifona alla Comunione")}
              </View>
            );
          },
        });

        // PAGINA: Dopo la Comunione
        pages.push({
          key: "dopo-comunione",
          title: "Dopo la Comunione",
          render: () => <View style={styles.partBox}>{renderReading("dopo_comunione", "Dopo la Comunione")}</View>,
        });

        // PAGINA: Riti di Conclusione - Benedizione (scelte: toggle + bottoni, NON il testo)
        pages.push({
          key: "conclusione-benedizione",
          title: "Benedizione",
          render: () => <View style={styles.partBox}>{renderConclusioneBenedizione()}</View>,
        });

        // PAGINA CONDIZIONALE: Orazione sul popolo (testo della formula scelta)
        // Quando l'orazione sul popolo è attiva, in questa pagina mostriamo
        // ANCHE la scelta della benedizione (semplice/solenne), spostata qui
        // dalla pagina precedente per rispettare la sequenza liturgica.
        if (useOrazionePopolo && orazionePopoloId) {
          const sel = prayersOverPeople.find(p => p.id === orazionePopoloId);
          if (sel) {
            pages.push({
              key: "conclusione-orazione-popolo",
              title: "Orazione sul popolo",
              render: () => (
                <View style={styles.partBox} testID="part-orazione-popolo">
                  <R kind="title">Orazione sul popolo</R>
                  <R kind="rubric">
                    Il sacerdote, allargando le braccia, dice l'orazione sul popolo:
                  </R>
                  <View style={styles.block}>
                    <R kind="subtitle">{sel.num}.</R>
                    <R>{sel.text}</R>
                    <View style={styles.dialogBlock}>
                      <R kind="assemblea">A. Amen.</R>
                    </View>
                  </View>
                  {/* Sotto al testo dell'orazione: scelta della benedizione */}
                  {renderBlessingChoiceBlock()}
                </View>
              ),
            });
          }
        }

        // PAGINA CONDIZIONALE: Benedizione Solenne (testo completo)
        if (useSolemnBlessing && solemnBlessingId) {
          const sel = solemnBlessings.find(b => b.id === solemnBlessingId);
          if (sel) {
            pages.push({
              key: "conclusione-benedizione-solenne",
              title: "Benedizione Solenne",
              render: () => (
                <View style={styles.partBox} testID="part-benedizione-solenne">
                  <R kind="title">{(sel as any).num ? `${(sel as any).num}. ` : ""}{sel.title}</R>
                  {(sel as any).rubric ? <R kind="rubric">{(sel as any).rubric}</R> : null}
                  {sel.invocations.map((inv: any, i: number) => (
                    <View key={i} style={styles.dialogBlock}>
                      <R kind="celebrante">C. {inv.c}</R>
                      <R kind="assemblea">A. {inv.a}</R>
                    </View>
                  ))}
                  <View style={styles.dialogBlock}>
                    <R kind="celebrante">C. {sel.final.c}</R>
                    <R kind="assemblea">A. {sel.final.a}</R>
                  </View>
                </View>
              ),
            });
          }
        }

        // PAGINA: Congedo (separata)
        pages.push({
          key: "conclusione-congedo",
          title: "Congedo",
          render: () => <View style={styles.partBox}>{renderConclusioneCongedo()}</View>,
        });

        const total = pages.length;
        const safeIdx = Math.max(0, Math.min(currentPage, total - 1));
        const cur = pages[safeIdx];
        const prev = () => {
          const next = Math.max(0, safeIdx - 1);
          setCurrentPage(next);
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        };
        const advance = () => {
          const next = Math.min(total - 1, safeIdx + 1);
          setCurrentPage(next);
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        };

        // ===== MODALITÀ "scroll": tutta la messa in scorrimento continuo =====
        if (readingMode === "scroll") {
          return (
            <ScrollView contentContainerStyle={styles.content} testID="mass-scroll-continuous">
              {pages.map((p) => (
                <View key={p.key}>{p.render()}</View>
              ))}
              <View style={{ height: 80 }} />
            </ScrollView>
          );
        }

        // ===== MODALITÀ "tap": una pagina alla volta + tap Kindle (sx/dx) =====
        // Strategia anti-conflitti:
        //  - ScrollView esterna permette lo scroll verticale (drag)
        //  - Pressable interno cattura il tap singolo (senza movimento)
        //  - I bottoni TouchableOpacity interni (Scegli Prefazio, ecc.) hanno
        //    sempre priorità (deeper touchable wins in React Native)
        //  - In base a locationX/pageX decidiamo se è sinistra (indietro) o
        //    destra (avanti). Rapporto: 35% sinistra, 65% destra.
        const TAP_LEFT_RATIO = 0.35;
        const tapLeftWidth = Math.round(screenWidth * TAP_LEFT_RATIO);

        const handlePagePress = (e: any) => {
          // Su web (browser/preview Expo), il Pressable parent riceve il click
          // anche dopo che un controllo interattivo (Switch, Button, TouchableOpacity)
          // è stato toccato, causando avanzamento di pagina indesiderato.
          // Filtra: se il target del tap è un controllo interattivo (o discendente),
          // NON avanzare/indietreggiare.
          // Su React Native nativo, il deeper touchable wins di default e questo
          // controllo è no-op.
          const target: any = e?.nativeEvent?.target ?? (e as any)?.target;
          if (target && typeof target === "object") {
            try {
              // DOM check (web)
              const closest = (target as any).closest;
              if (typeof closest === "function") {
                const interactive = closest.call(
                  target,
                  'input, button, a, select, textarea, [role="switch"], [role="button"], [role="checkbox"], [role="radio"], [data-tap-stop="true"]',
                );
                if (interactive) return;
              }
              // Fallback per check su tagName/role
              const tag = ((target as any).tagName || "").toLowerCase();
              if (tag === "input" || tag === "button" || tag === "a" || tag === "select" || tag === "textarea") return;
              const role = (target as any).getAttribute?.("role");
              if (role === "switch" || role === "button" || role === "checkbox" || role === "radio") return;
            } catch (_e) {
              // non-web environment: continua con il tap-advance
            }
          }
          const x = e?.nativeEvent?.pageX ?? e?.nativeEvent?.locationX ?? 0;
          if (x < tapLeftWidth) prev();
          else advance();
        };

        return (
          <>
            {/* Contenuto scrollabile: ScrollView esterna + Pressable interno per tap */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={[styles.content, { paddingBottom: 60 }]}
              testID="mass-scroll"
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {cur.disableTapAdvance ? (
                <View testID="page-no-tap">
                  {cur.render()}
                </View>
              ) : (
                <Pressable
                  onPress={handlePagePress}
                  testID="page-tap-area"
                  android_disableSound
                  style={{ minHeight: screenHeight - 200, flexGrow: 1 }}
                >
                  {cur.render()}
                </Pressable>
              )}
            </ScrollView>

            {/* Suggerimento navigazione (solo prima pagina) */}
            {safeIdx === 1 ? (
              <View style={styles.tapHint} pointerEvents="none">
                <Text style={styles.tapHintText}>← Tocca a sinistra per indietro · Tocca a destra per avanti →</Text>
              </View>
            ) : null}
          </>
        );
      })()}

      {/* Modal Prefazi */}
      <Modal visible={showPrefaces} animationType="slide" onRequestClose={() => setShowPrefaces(false)}>
        <SafeAreaView style={styles.container} testID="modal-prefaces">
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowPrefaces(false)} testID="btn-close-prefaces">
              <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>Chiudi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Scegli Prefazio</Text>
            <View style={{ width: 100 }} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {(() => {
              // Ordina prefazi: tempo corrente in cima, poi comune, poi gli altri
              const sorted = [...prefaces].sort((a, b) => {
                const rank = (p: Preface) => p.season === currentSeasonKey ? 0
                  : p.season === "comune" ? 1
                  : 2;
                const ra = rank(a), rb = rank(b);
                if (ra !== rb) return ra - rb;
                return 0;
              });
              return sorted.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.listItem, selectedPrefaceId === p.id && styles.listItemActive]}
                  onPress={() => { setSelectedPrefaceId(p.id); setShowPrefaces(false); }}
                  testID={`preface-item-${p.id}`}
                >
                  {p.season === currentSeasonKey && (
                    <Text style={styles.badgeSeasonal}>▸ TEMPO CORRENTE</Text>
                  )}
                  <Text style={styles.listItemText}>{p.title}</Text>
                  <Text style={styles.listItemSub}>Tempo: {p.season}</Text>
                </TouchableOpacity>
              ));
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Preghiere Eucaristiche */}
      <Modal visible={showPrayers} animationType="slide" onRequestClose={() => setShowPrayers(false)}>
        <SafeAreaView style={styles.container} testID="modal-prayers">
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowPrayers(false)} testID="btn-close-prayers">
              <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>Chiudi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Preghiere Eucaristiche</Text>
            <View style={{ width: 100 }} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {prayers.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.listItem, selectedPrayerId === p.id && styles.listItemActive]}
                onPress={() => { setSelectedPrayerId(p.id); setShowPrayers(false); }}
                testID={`prayer-item-${p.id}`}
              >
                <Text style={styles.listItemText}>{p.title}</Text>
                <Text style={styles.listItemSub}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Orazionale - Preghiera dei fedeli */}
      <Modal visible={showOrazionale} animationType="slide" onRequestClose={() => setShowOrazionale(false)}>
        <SafeAreaView style={styles.container} testID="modal-orazionale">
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => {
              if (orazionaleSection) { setOrazionaleSection(null); }
              else { setShowOrazionale(false); }
            }} testID="btn-close-orazionale">
              <Ionicons name={orazionaleSection ? "chevron-back" : "close"} size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>{orazionaleSection ? "Sezioni" : "Chiudi"}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{orazionaleSection
              ? (getOrazionaleSections().find(s => s.key === orazionaleSection)?.label || "Orazionale")
              : "Scegli Preghiera"}</Text>
            <View style={{ width: 100 }} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {!orazionaleSection ? (
              <>
                {selectedOrazionale ? (
                  <View style={[styles.listItem, styles.listItemActive]}>
                    <Text style={styles.badgeSeasonal}>▸ ATTUALMENTE SELEZIONATA</Text>
                    <Text style={styles.listItemText}>{selectedOrazionale.title}</Text>
                  </View>
                ) : null}
                {getOrazionaleSections().map(s => (
                  <TouchableOpacity
                    key={s.key}
                    style={styles.listItem}
                    onPress={() => setOrazionaleSection(s.key as string)}
                    testID={`oraz-section-${s.key}`}
                  >
                    <Text style={styles.listItemText}>{s.label}</Text>
                    <Text style={styles.listItemSub}>{s.description} · {s.prayers.length} preghiere</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              (getOrazionaleSections().find(s => s.key === orazionaleSection)?.prayers || []).map((p: OrazionalePrayer) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.listItem, selectedOrazionaleId === p.id && styles.listItemActive]}
                  onPress={() => {
                    setSelectedOrazionaleId(p.id);
                    setOrazionaleSection(null);
                    setShowOrazionale(false);
                  }}
                  testID={`oraz-prayer-${p.id}`}
                >
                  <Text style={styles.listItemText}>{p.title}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal selettore Tempo Liturgico / Rito Particolare per la PE */}
      <Modal
        visible={pePickerKey !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPePickerKey(null)}
      >
        <Pressable style={styles.peModalBackdrop} onPress={() => setPePickerKey(null)}>
          <Pressable style={styles.peModalCard} onPress={() => { /* prevent close */ }}>
            {(() => {
              const def = pePickerKey && peFull?.selectors?.[pePickerKey];
              if (!def) return null;
              const friendly =
                pePickerKey === "communicantes" ? "Tempo Liturgico"
                : pePickerKey === "hanc_igitur" ? "Rito Particolare"
                : pePickerKey === "rito" ? "Rito Particolare"
                : (def.label || pePickerKey || "");
              const currentId = peSelections[pePickerKey!] || def.options?.[0]?.id;
              return (
                <>
                  <Text style={styles.peModalTitle}>{friendly}</Text>
                  <ScrollView style={{ maxHeight: 460 }}>
                    {def.options?.map((o: any) => {
                      const isSel = currentId === o.id;
                      return (
                        <TouchableOpacity
                          key={o.id}
                          style={[styles.peModalOption, isSel && styles.peModalOptionActive]}
                          onPress={() => {
                            setPeSelections((prev) => ({ ...prev, [pePickerKey!]: o.id }));
                            setPePickerKey(null);
                          }}
                          testID={`pe-picker-option-${o.id}`}
                        >
                          <Text style={[styles.peModalOptionText, isSel && { color: "#7B3F00", fontWeight: "800" }]}>
                            {o.label}
                          </Text>
                          {isSel ? <Ionicons name="checkmark" size={scaledFont(28)} color="#7B3F00" /> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity style={styles.peModalClose} onPress={() => setPePickerKey(null)}>
                    <Text style={styles.peModalCloseText}>Chiudi</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    minWidth: 100,
  },
  backBtnText: { fontSize: Math.round(fontSize * 0.65), color: colors.textPrimary, fontWeight: "600" },
  title: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  content: { padding: 20, paddingBottom: 40 },
  dayHeader: {
    padding: 20,
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  dayDate: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  dayTitle: { fontSize: Math.round(fontSize * 0.8), color: colors.textPrimary, fontStyle: "italic", marginTop: 8 },
  daySeason: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 6 },
  togglesBox: {
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 24,
    gap: 14,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: Math.round(fontSize * 0.75), color: colors.textPrimary, fontWeight: "600" },
  partBox: {
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: Math.round(fontSize * 1.1),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 14,
    marginTop: 8,
  },
  subtitle: {
    fontSize: Math.round(fontSize * 0.85),
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  text: {
    fontSize: fontSize,
    lineHeight: fontSize * 1.55,
    color: colors.textPrimary,
    marginVertical: 8,
  },
  rubric: {
    fontSize: Math.round(fontSize * 0.75),
    fontStyle: "italic",
    color: colors.rubrics,
    marginVertical: 8,
    lineHeight: fontSize * 1.3,
  },
  celebrante: {
    fontSize: fontSize,
    color: colors.textPrimary,
    marginVertical: 6,
    lineHeight: fontSize * 1.5,
  },
  assemblea: {
    fontSize: fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
    marginVertical: 6,
    lineHeight: fontSize * 1.5,
  },
  block: { marginVertical: 10 },
  // Bottoni per scegliere fra 26 benedizioni solenni: layout flex-wrap
  solemnChoiceBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 56,
    flexBasis: "48%",
    flexGrow: 1,
  },
  solemnChoiceText: {
    color: colors.textPrimary,
    fontSize: Math.round(fontSize * 0.55),
    fontWeight: "700",
  },
  // Bottoni numerati (per orazioni sul popolo 1-28): griglia compatta
  numChoiceBtn: {
    minWidth: 56,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  numChoiceText: {
    color: colors.textPrimary,
    fontSize: Math.round(fontSize * 0.7),
    fontWeight: "800",
  },
  // Suggerimento sulla prossima pagina
  solemnHint: {
    marginTop: 14,
    color: colors.primary,
    fontSize: Math.round(fontSize * 0.55),
    fontStyle: "italic",
    fontWeight: "600",
  },
  // Box per ogni formula dell'atto penitenziale C (separazione visiva)
  penitentialFormulaBox: {
    marginTop: 18,
    paddingTop: 14,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dialogBlock: { marginVertical: 6 },
  readingBlock: { marginVertical: 14 },
  pageStatusBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  pageStatusText: {
    fontSize: Math.round(fontSize * 0.7),
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  navBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  navBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: Math.round(fontSize * 0.8),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  tapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  tapHint: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  tapHintText: {
    fontSize: Math.round(fontSize * 0.45),
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: "hidden",
    fontStyle: "italic",
    fontWeight: "600",
    textAlign: "center",
  },
  startCelebrationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.primary,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 24,
    minHeight: 88,
  },
  startCelebrationBtnText: {
    fontSize: Math.round(fontSize * 0.8),
    fontWeight: "700",
    color: "#FFFFFF",
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 14 },
  choiceBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 64,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  choiceBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceBtnText: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "700" },
  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 10,
    marginVertical: 10,
    minHeight: 64,
  },
  selectorBtnText: { fontSize: Math.round(fontSize * 0.75), color: colors.primary, fontWeight: "700" },
  // === Selettori Tempo Liturgico / Rito Particolare (PE) - colore ambra ===
  peSelectorsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  peSelectorBtn: {
    flex: 1,
    minWidth: 180,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#FFF3CD",   // ambra chiaro di sfondo per alto contrasto
    borderWidth: 3,
    borderColor: "#FFA000",       // ambra/arancione bordo
    minHeight: 76,
  },
  peSelectorLabel: {
    fontSize: Math.round(fontSize * 0.5),
    color: "#7B3F00",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  peSelectorValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  peSelectorValue: {
    color: "#7B3F00",
    fontSize: Math.round(fontSize * 0.7),
    fontWeight: "700",
    flex: 1,
  },
  // Modale picker per i selettori PE
  peModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 24,
  },
  peModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 3,
    borderColor: "#FFA000",
  },
  peModalTitle: {
    color: colors.textPrimary,
    fontSize: Math.round(fontSize * 0.85),
    fontWeight: "800",
    marginBottom: 18,
  },
  peModalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 10,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  peModalOptionActive: { backgroundColor: "#FFF3CD" },
  peModalOptionText: { color: colors.textPrimary, fontSize: Math.round(fontSize * 0.75), flex: 1, fontWeight: "600" },
  peModalClose: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 10,
    backgroundColor: "#FFA000",
    borderRadius: 10,
    minHeight: 60,
    justifyContent: "center",
  },
  peModalCloseText: { color: "#FFFFFF", fontWeight: "800", fontSize: Math.round(fontSize * 0.75) },
  listItem: {
    padding: 22,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: 12,
    minHeight: 90,
  },
  listItemActive: { borderColor: colors.primary, borderWidth: 4 },
  listItemText: { fontSize: Math.round(fontSize * 0.8), color: colors.textPrimary, fontWeight: "700" },
  listItemSub: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 6 },
  badgeSeasonal: { fontSize: Math.round(fontSize * 0.5), color: colors.primary, fontWeight: "800", marginBottom: 6, letterSpacing: 1 },
  solemnToggle: { borderWidth: 2, borderColor: colors.border, borderRadius: 10, padding: 16, backgroundColor: colors.surface },
  acclamationBox: {
    marginVertical: 18,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
});
