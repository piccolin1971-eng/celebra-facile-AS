/**
 * /celebra — Modalità "Celebra la Messa" (lettura pulita per l'altare)
 *
 * Pensata per sacerdoti anziani ipovedenti: NESSUN toggle, NESSUN selettore,
 * NESSUNA scelta. Solo testo continuo in una colonna unica, scrollabile,
 * con AUTO-SCROLL automatico secondo le impostazioni dell'utente
 * (autoScrollPxPerSec, autoScrollDelaySec).
 *
 * Comportamento:
 *  - All'apertura, attende `autoScrollDelaySec` secondi → poi scorre da solo
 *    a `autoScrollPxPerSec` pixel al secondo.
 *  - Se il prete tocca lo schermo / scrolla a mano → l'auto-scroll si pausa.
 *  - Dopo `autoScrollDelaySec` secondi di inattività → riprende.
 *  - Quando arriva in fondo → si ferma (resta visibile l'ultima frase).
 *
 * Niente più paginazione (era fragile su dispositivi diversi). Tutto è una
 * lunga "pergamena" verticale che si srotola da sola.
 *
 * Le scelte (PE, prefazio, congedo, ecc.) vengono lette dalla sessione
 * giornaliera salvata da /messa (AsyncStorage).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import {
  api,
  Liturgy,
  Preface,
  EucharisticPrayer,
  MysteryAcclamation,
  SolemnBlessing,
} from "../src/api";
import { getPrayerById } from "../src/orazionale";
import { loadSession } from "../src/massSession";
import peFullData from "../src/data/eucharisticPrayersFull.json";

// ===========================================================================
// Tipi: segmenti rendering + helpers
// ===========================================================================

type SegKind =
  | "sectionTitle"
  | "antifonaTitle"
  | "readingTitle"
  | "orazioneTitle"
  | "subtitle"
  | "normal"
  | "rubric"
  | "celebrante"
  | "assemblea"
  | "umili"
  | "peTitle"
  | "peText"
  | "peDossologia"
  | "salmo"
  | "spacer";

type Segment = {
  kind: SegKind;
  text: string;
};

// ===========================================================================
// Block type per JSON eucharisticPrayersFull
// ===========================================================================
type Block = {
  type: "title" | "t" | "c" | "r" | "rubric_section" | "var" | "acc";
  text?: string;
  selector?: string;
};

// PE con prefazio incorporato (Messale Romano 2020)
const PE_WITH_PROPER_PREFACE = ["pe4", "per_r1", "per_r2", "pvn_1", "pvn_2", "pvn_3", "pvn_4"];

const PREFACE_INTRO =
  "Il Signore sia con voi.\nE con il tuo spirito.\n\nIn alto i nostri cuori.\nSono rivolti al Signore.\n\nRendiamo grazie al Signore, nostro Dio.\nÈ cosa buona e giusta.";

const SANTO_TEXT =
  "Santo, Santo, Santo il Signore Dio dell'universo.\nI cieli e la terra sono pieni della tua gloria.\nOsanna nell'alto dei cieli.\nBenedetto colui che viene nel nome del Signore.\nOsanna nell'alto dei cieli.";

// Override per ID-specifici: dopo quale frase deve apparire il Santo nelle PE
// con prefazio incorporato (allineato a /messa).
const PE_SANTO_OVERRIDE: Record<string, RegExp> = {
  per_r2: /l'inno di benedizione e di lode/i,
  pvn_3: /cantando con gioia/i,
};

// ===========================================================================
// Espande il testo della PE (replica della logica in messa.tsx)
// ===========================================================================
function expandPrayerText(
  peFull: any,
  peSelections: Record<string, string>,
): string {
  if (!peFull) return "";
  const out: Block[] = [];
  for (const b of peFull.blocks as Block[]) {
    if (b.type === "var" && b.selector && peFull.selectors?.[b.selector]) {
      const def = peFull.selectors[b.selector];
      const optId = peSelections[b.selector] || def.options?.[0]?.id;
      const variantBlocks: Block[] =
        def.variants?.[optId] || def.variants?.[def.options?.[0]?.id] || [];
      out.push(...variantBlocks);
    } else {
      out.push(b);
    }
  }
  const isPe1 = peFull.id === "pe1";
  const hasProperPreface = PE_WITH_PROPER_PREFACE.includes(peFull.id);
  const santoOverrideRe = PE_SANTO_OVERRIDE[peFull.id];

  const parts: string[] = [];
  if (hasProperPreface) parts.push(PREFACE_INTRO);
  let dossologiaSeen = false;
  let santoInserted = false;

  for (const b of out) {
    if (b.type === "title") {
      const tt = (b.text || "").trim().toLowerCase();
      if (tt.includes("dossologia") && !dossologiaSeen) {
        parts.push("<<DOSSOLOGIA>>");
        dossologiaSeen = true;
      }
      continue;
    }
    if (b.type === "acc") continue;
    if (b.type === "c") {
      const t = (b.text || "").trim();
      if (!t) continue;
      const isDossology = /^per cristo, con cristo/i.test(t);
      if (isDossology) {
        if (!dossologiaSeen) {
          parts.push("<<DOSSOLOGIA>>");
          dossologiaSeen = true;
        }
        parts.push(t.toUpperCase());
      } else {
        if (hasProperPreface && !santoInserted && !santoOverrideRe) {
          parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
          santoInserted = true;
        }
        parts.push(t);
      }
      continue;
    }
    const t = (b.text || "").trim();
    if (!t) continue;
    if (b.type === "r" || b.type === "rubric_section") {
      if (isPe1) parts.push(`[${t}]`);
      continue;
    }
    parts.push(t);
    if (
      hasProperPreface &&
      !santoInserted &&
      santoOverrideRe &&
      santoOverrideRe.test(t)
    ) {
      parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
      santoInserted = true;
      continue;
    }
    if (hasProperPreface && !santoInserted && !santoOverrideRe) {
      if (/cantiamo\b[^.]{0,80}[:\.\,]?\s*$/i.test(t)) {
        parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
        santoInserted = true;
      }
    }
  }

  const sentenceEnders = /[\.\!\?]$/;
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    if (i === 0) {
      result = cur;
      continue;
    }
    const prev = parts[i - 1];
    const prevLast = prev.replace(/\s+$/, "").slice(-1);
    const sep = sentenceEnders.test(prevLast) ? "\n\n" : "\n";
    result += sep + cur;
  }
  result = result.replace(/<<SANTO_BLANK>>/g, "\n\n");
  return result;
}

// ===========================================================================
// Componente principale
// ===========================================================================
export default function CelebraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { colors, fontSize, scaledFont, fontFamily, autoScrollDelaySec, autoScrollPxPerSec } = useSettings();
  const { width: screenWidth } = useWindowDimensions();

  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [fixedParts, setFixedParts] = useState<Record<string, any> | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [acclamations, setAcclamations] = useState<MysteryAcclamation[]>([]);
  const [solemnBlessings, setSolemnBlessings] = useState<SolemnBlessing[]>([]);
  const [prayersOverPeople, setPrayersOverPeople] = useState<any[]>([]);
  const [pasquaDismissal, setPasquaDismissal] = useState<any>(null);
  const [currentSeasonKey, setCurrentSeasonKey] = useState<string>("ordinario");

  // Scelte caricate da AsyncStorage
  const [session, setSession] = useState<any>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Paginazione "Kindle": tap dx 70% = avanza, sx 30% = indietro.
  const [currentPage, setCurrentPage] = useState(0);
  const [containerH, setContainerH] = useState(0);

  // Auto-scroll state (attivo SOLO quando la pagina corrente supera l'altezza
  // del viewport, ovvero quando il contenuto eccede e va in overflow).
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef<number>(0);             // posizione corrente
  const contentHRef = useRef<number>(0);            // altezza contenuto totale
  const containerHRef = useRef<number>(0);          // altezza viewport
  const lastUserActionRef = useRef<number>(Date.now());
  const lastTickRef = useRef<number>(Date.now());
  // Tap tracking: registra inizio tocco per riconoscere tap "secchi"
  // (movimento < 10px, durata < 350ms) vs drag verticali.
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const styles = makeStyles(colors, fontSize, fontFamily);

  // ----- Caricamento dati -----
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
        setPasquaDismissal((bless as any).pasqua_dismissal);
        if (Array.isArray((bless as any).prayersOverPeople)) {
          setPrayersOverPeople((bless as any).prayersOverPeople);
        }
        const seasonName = (lit?.season?.season || "").toLowerCase();
        const seasonKey = seasonName.includes("avvento")
          ? "avvento"
          : seasonName.includes("natale")
          ? "natale"
          : seasonName.includes("quaresima")
          ? "quaresima"
          : seasonName.includes("pasqua")
          ? "pasqua"
          : "ordinario";
        setCurrentSeasonKey(seasonKey);

        const dateKey =
          lit?.date || dateParam || new Date().toISOString().slice(0, 10);
        const saved = await loadSession(dateKey);
        if (saved) {
          setSession(saved);
          setHasSession(true);
        } else {
          setHasSession(false);
        }
      } catch (e) {
        console.log("Errore caricamento celebrazione:", e);
        setHasSession(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.date]);

  // ----- Costruisce i segmenti dell'intera celebrazione -----
  const segments: Segment[] = useMemo(() => {
    if (!fixedParts || !session) return [];
    return buildSegments({
      liturgy,
      fixedParts,
      prefaces,
      prayers,
      acclamations,
      solemnBlessings,
      prayersOverPeople,
      pasquaDismissal,
      currentSeasonKey,
      session,
    });
  }, [
    liturgy,
    fixedParts,
    prefaces,
    prayers,
    acclamations,
    solemnBlessings,
    prayersOverPeople,
    pasquaDismissal,
    currentSeasonKey,
    session,
  ]);

  // ----- Paginazione "Kindle": pacchettizza i segmenti in pagine ottimizzate
  // per altezza schermo. Le pagine NON spezzano frasi; preferiscono andare in
  // overflow piuttosto che perdere coerenza. L'overflow si gestisce con lo
  // scroll automatico nella ScrollView della pagina corrente.
  const pages: Segment[][] = useMemo(() => {
    if (!segments.length || containerH < 100) return [];
    return paginate(segments, containerH, fontSize, screenWidth);
  }, [segments, containerH, fontSize, screenWidth]);

  // Reset pagina (e scroll auto) quando il numero di pagine cambia.
  useEffect(() => {
    if (currentPage >= pages.length && pages.length > 0) {
      setCurrentPage(0);
    }
  }, [pages.length, currentPage]);

  // Reset scroll alla cima quando si cambia pagina + reset timer auto-scroll.
  useEffect(() => {
    scrollYRef.current = 0;
    contentHRef.current = 0;
    lastUserActionRef.current = Date.now(); // riparte il delay sull'arrivo
    lastTickRef.current = Date.now();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentPage]);

  // ----- Auto-scroll loop -----
  // Si attiva SOLO quando la pagina corrente eccede l'altezza dello schermo
  // (contentH > containerH). Tick ogni 50ms, scrolla a `autoScrollPxPerSec`
  // px/s. Si pausa per `autoScrollDelaySec` secondi dopo un'interazione utente.
  // Si ferma in fondo (resta visibile l'ultima frase).
  useEffect(() => {
    if (loading || hasSession === false) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const dtMs = now - lastTickRef.current;
      lastTickRef.current = now;
      const idleMs = now - lastUserActionRef.current;
      const delayMs = Math.max(0, autoScrollDelaySec * 1000);
      if (idleMs < delayMs) return;
      const maxY = Math.max(0, contentHRef.current - containerHRef.current);
      if (maxY <= 0) return; // pagina entra tutta, niente da scrollare
      if (scrollYRef.current >= maxY - 1) return;
      const stepPx = (autoScrollPxPerSec * dtMs) / 1000;
      const nextY = Math.min(maxY, scrollYRef.current + stepPx);
      scrollYRef.current = nextY;
      scrollRef.current?.scrollTo({ y: nextY, animated: false });
    }, 50);
    return () => clearInterval(interval);
  }, [loading, hasSession, autoScrollPxPerSec, autoScrollDelaySec, currentPage]);

  // ----- Rendering -----
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (hasSession === false) {
    return (
      <SafeAreaView style={styles.container} testID="celebra-no-session">
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace("/")}
            testID="btn-back-home"
          >
            <Ionicons name="home" size={scaledFont(36)} color={colors.textPrimary} />
            <Text style={styles.backBtnText}>Home</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Celebra la Messa</Text>
          <View style={{ width: 88 }} />
        </View>
        <View style={styles.emptyBox}>
          <Ionicons name="information-circle-outline" size={scaledFont(60)} color={colors.primary} />
          <Text style={styles.emptyTitle}>Devi prima preparare la liturgia</Text>
          <Text style={styles.emptyText}>
            Vai su <Text style={{ fontWeight: "800" }}>"Scegli la liturgia"</Text> e fai le scelte
            (prefazio, preghiera eucaristica, congedo…). Poi tocca{"\n"}
            <Text style={{ fontWeight: "800", color: colors.primary }}>
              "Scelte per la liturgia odierna completate"
            </Text>{" "}
            in fondo alla pagina del Congedo, oppure torna qui.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace("/messa")}
            testID="btn-go-prepare"
          >
            <Ionicons name="settings" size={scaledFont(28)} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Scegli la liturgia</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const total = pages.length;
  const safeIdx = Math.max(0, Math.min(currentPage, Math.max(0, total - 1)));
  const currentSegments = pages[safeIdx] || [];

  const prev = () => setCurrentPage(Math.max(0, safeIdx - 1));
  const advance = () => setCurrentPage(Math.min(total - 1, safeIdx + 1));

  // Tap zone: 30% sx → indietro, 70% dx → avanti. Implementato a basso livello
  // con touch tracking (start/end) per evitare conflitti con il drag della
  // ScrollView e con i Text `selectable` che catturerebbero i click di un
  // Pressable. touchStartRef è dichiarato in alto insieme agli altri ref.
  const TAP_LEFT_RATIO = 0.3;
  const tapLeftWidth = Math.round(screenWidth * TAP_LEFT_RATIO);

  const onTouchStart = (e: any) => {
    const t = e?.nativeEvent?.touches?.[0] ?? e?.nativeEvent;
    touchStartRef.current = {
      x: t?.pageX ?? 0,
      y: t?.pageY ?? 0,
      t: Date.now(),
    };
    lastUserActionRef.current = Date.now();
  };
  const onTouchEnd = (e: any) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e?.nativeEvent?.changedTouches?.[0] ?? e?.nativeEvent;
    const endX = t?.pageX ?? 0;
    const endY = t?.pageY ?? 0;
    const dx = Math.abs(endX - start.x);
    const dy = Math.abs(endY - start.y);
    const dt = Date.now() - start.t;
    touchStartRef.current = null;
    // Riconoscimento tap "secco": meno di 10px di movimento, meno di 350ms.
    if (dx < 10 && dy < 10 && dt < 350) {
      if (endX < tapLeftWidth) prev();
      else advance();
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="celebra-screen">
      {/* Top bar: home + data + indicatore di pagina */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/")}
          testID="btn-back-home"
          accessibilityLabel="Torna alla home"
        >
          <Ionicons name="home" size={scaledFont(36)} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {liturgy?.date_label || "Celebrazione"}
        </Text>
        <View style={styles.pageIndicator}>
          <Text style={styles.pageIndicatorText}>
            {total > 0 ? `${safeIdx + 1}/${total}` : ""}
          </Text>
        </View>
      </View>

      {/* Area di lettura: ScrollView per la pagina corrente.
          - Se il contenuto entra → niente scroll (pagina statica come prima).
          - Se eccede → scroll automatico al ritmo impostato dall'utente.
          - Tap dx 70% → pagina successiva, sx 30% → precedente.
          - Drag verticale dell'utente → pausa auto-scroll per X secondi. */}
      <View
        style={styles.pageArea}
        onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}
        testID="celebra-tap-area"
      >
        {pages.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.pageScroll}
            contentContainerStyle={styles.pageContent}
            onLayout={(e) => {
              containerHRef.current = e.nativeEvent.layout.height;
            }}
            onContentSizeChange={(_, h) => {
              contentHRef.current = h;
            }}
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            onScrollBeginDrag={() => {
              lastUserActionRef.current = Date.now();
            }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            scrollEventThrottle={50}
            testID={`celebra-page-${safeIdx}`}
          >
            {/* Pressable interno alla ScrollView: gestisce il tap a dx/sx
                per cambiare pagina su web (mouse click). Il drag verticale
                viene assorbito dalla ScrollView. I Text figli sono
                selectable={false} per non intercettare i click. */}
            <Pressable
              style={{ flex: 1, minHeight: containerH }}
              onPress={(e: any) => {
                const x = e?.nativeEvent?.pageX ?? 0;
                if (x < tapLeftWidth) prev();
                else advance();
                lastUserActionRef.current = Date.now();
              }}
              testID="celebra-tap-pressable"
            >
              {currentSegments.map((seg, i) => (
                <SegmentRenderer key={i} seg={seg} styles={styles} />
              ))}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

// ===========================================================================
// SegmentRenderer: rende un singolo segmento secondo il suo `kind`
// ===========================================================================
function SegmentRenderer({ seg, styles }: { seg: Segment; styles: any }) {
  if (seg.kind === "spacer") {
    return <View style={{ height: 22 }} />;
  }
  if (seg.kind === "salmo") {
    return <SalmoRenderer text={seg.text} styles={styles} />;
  }
  if (seg.kind === "peText") {
    return <PeTextRenderer text={seg.text} styles={styles} />;
  }
  const styleMap: Record<SegKind, any> = {
    sectionTitle: styles.sectionTitle,
    antifonaTitle: styles.antifonaTitle,
    readingTitle: styles.readingTitle,
    orazioneTitle: styles.orazioneTitle,
    subtitle: styles.subtitle,
    normal: styles.text,
    rubric: styles.rubric,
    celebrante: styles.celebrante,
    assemblea: styles.assemblea,
    umili: styles.umili,
    peTitle: styles.peTitle,
    peText: styles.text,
    peDossologia: styles.peDossologia,
    salmo: styles.text,
    spacer: {},
  };
  // selectable={false} è IMPORTANTE: evita che Text catturi gli eventi mouse
  // (su web) impedendo al Pressable di registrare il tap. In modalità
  // celebrazione non serve selezionare il testo (è solo lettura).
  return (
    <Text style={styleMap[seg.kind]} selectable={false}>
      {seg.text}
    </Text>
  );
}

// Renderer salmo: evidenzia "R." in rosso
function SalmoRenderer({ text, styles }: { text: string; styles: any }) {
  const lines = text.replace(/\n{3,}/g, "\n\n").split("\n");
  return (
    <Text style={styles.salmoText} selectable={false}>
      {lines.map((ln, i) => {
        const m = ln.match(/^(\s*)(R\/?\.)(.*)$/);
        const isLast = i === lines.length - 1;
        if (m) {
          return (
            <Text key={i}>
              {m[1]}
              <Text style={styles.salmoRit}>{m[2]}</Text>
              <Text>{m[3]}</Text>
              {!isLast ? "\n" : ""}
            </Text>
          );
        }
        return (
          <Text key={i}>
            {ln}
            {!isLast ? "\n" : ""}
          </Text>
        );
      })}
    </Text>
  );
}

// Renderer testo PE: linee MAIUSCOLE = parole consacrazione (azzurro brillante)
function PeTextRenderer({ text, styles }: { text: string; styles: any }) {
  if (!text) return null;
  // Split su <<DOSSOLOGIA>> per gestione speciale: prima del marker = testo
  // PE normale; dopo il marker = testo della dossologia ("PER CRISTO, CON
  // CRISTO E IN CRISTO...") preceduto da un titolo "Dossologia" in azzurro
  // (stesso stile delle sectionTitle) per coerenza con /messa.
  const dosMarker = "<<DOSSOLOGIA>>";
  const dosIdx = text.indexOf(dosMarker);
  if (dosIdx >= 0) {
    const before = text.slice(0, dosIdx).replace(/\n+$/, "");
    const after = text.slice(dosIdx + dosMarker.length).replace(/^\n+/, "");
    return (
      <View>
        {before ? <PeTextNormal text={before} styles={styles} /> : null}
        {after ? (
          <>
            {/* Titolo "Dossologia" sopra il testo "PER CRISTO..." */}
            <Text style={styles.sectionTitle} selectable={false}>
              Dossologia
            </Text>
            <Text style={styles.peDossologia} selectable={false}>
              {after}
            </Text>
          </>
        ) : null}
      </View>
    );
  }
  return <PeTextNormal text={text} styles={styles} />;
}

function PeTextNormal({ text, styles }: { text: string; styles: any }) {
  if (!text) return null;
  const isUpperLitLine = (ln: string): boolean => {
    const alphaChars = ln.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    return alphaChars.length >= 5 && alphaChars === alphaChars.toUpperCase();
  };
  // Supporta marker [rubric] inline (PE I)
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <View>
      {parts.map((part, idx) => {
        const m = part.match(/^\[([^\]]+)\]$/);
        if (m) {
          return (
            <Text key={idx} style={styles.rubric} selectable={false}>
              {m[1]}
            </Text>
          );
        }
        const trimmed = part.replace(/^\n+|\n+$/g, "");
        if (!trimmed) return null;
        const lines = trimmed.split("\n");
        return (
          <Text style={styles.text} selectable={false} key={idx}>
            {lines.map((ln, i) => {
              const isCon = isUpperLitLine(ln);
              const prevWasCon = i > 0 && isUpperLitLine(lines[i - 1]);
              const nextIsCon = i < lines.length - 1 && isUpperLitLine(lines[i + 1]);
              const isLast = i === lines.length - 1;
              const needSpaceBefore = isCon && !prevWasCon && i > 0;
              const needSpaceAfter = isCon && !nextIsCon && !isLast;
              const tail = isLast ? "" : needSpaceAfter ? "\n\n" : "\n";
              if (isCon) {
                return (
                  <Text key={i}>
                    {needSpaceBefore ? "\n" : ""}
                    <Text style={styles.peConsecration}>{ln}</Text>
                    {tail}
                  </Text>
                );
              }
              return (
                <Text key={i}>
                  {ln}
                  {tail}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
}

// ===========================================================================
// buildSegments: costruisce l'intera Messa come array di Segment
// ===========================================================================
type BuildArgs = {
  liturgy: Liturgy | null;
  fixedParts: Record<string, any>;
  prefaces: Preface[];
  prayers: EucharisticPrayer[];
  acclamations: MysteryAcclamation[];
  solemnBlessings: SolemnBlessing[];
  prayersOverPeople: any[];
  pasquaDismissal: any;
  currentSeasonKey: string;
  session: any;
};

function buildSegments(args: BuildArgs): Segment[] {
  const {
    liturgy,
    fixedParts,
    prefaces,
    prayers,
    acclamations,
    solemnBlessings,
    prayersOverPeople,
    pasquaDismissal,
    currentSeasonKey,
    session,
  } = args;
  const out: Segment[] = [];
  const push = (kind: SegKind, text: string) => {
    if (text != null && text !== "") out.push({ kind, text });
  };
  const sp = () => out.push({ kind: "spacer", text: "" });

  // Helper: aggiunge una sezione (rubrica/dialogo/orazione/kyrie) come segmenti
  const addSection = (s: any, opts?: { skipRubric?: boolean }) => {
    if (!s) return;
    if (s.type === "rubric") {
      if (opts?.skipRubric) return;
      push("rubric", s.text);
      return;
    }
    if (s.type === "dialogue") {
      push("celebrante", `C. ${s.celebrante}`);
      push("assemblea", `A. ${s.assemblea}`);
      return;
    }
    if (s.type === "monologue") {
      push("celebrante", s.celebrante);
      return;
    }
    if (s.type === "prayer") {
      if (s.rubric && !opts?.skipRubric) push("rubric", s.rubric);
      if (s.celebrante) push("celebrante", s.celebrante);
      if (s.text) push("normal", s.text);
      if (s.assemblea) push("assemblea", `A. ${s.assemblea}`);
      return;
    }
    if (s.type === "kyrie") {
      if (s.rubric && !opts?.skipRubric) push("rubric", s.rubric);
      const pairs = s.dialogue || [];
      for (let i = 0; i < pairs.length; i++) {
        // Spazio tra le tre coppie del Kyrie (Signore pietà / Cristo pietà /
        // Signore pietà) per separazione visiva, come da richiesta utente.
        if (i > 0) sp();
        const d = pairs[i];
        push("celebrante", `C. ${d.c}`);
        push("assemblea", `A. ${d.a}`);
      }
      return;
    }
  };

  const addReading = (
    type: string,
    titleKind: "antifonaTitle" | "readingTitle" | "orazioneTitle",
    titleOverride?: string,
  ) => {
    const r = liturgy?.readings?.find((rr: any) => rr.type === type);
    if (!r || !r.text) return;
    push(titleKind, titleOverride || r.title);
    if (r.reference) push("rubric", r.reference);
    if (type === "salmo") push("salmo", r.text);
    else push("normal", r.text);
    sp();
  };

  // ===== INTESTAZIONE =====
  if (liturgy?.date_label) push("sectionTitle", liturgy.date_label);
  if (liturgy?.title) push("subtitle", liturgy.title);
  if (liturgy?.season?.season) {
    push(
      "rubric",
      `${liturgy.season.season}${
        liturgy.liturgical_color ? ` · Colore: ${liturgy.liturgical_color}` : ""
      }`,
    );
  }
  sp();

  // ===== ANTIFONA D'INGRESSO =====
  addReading("antifona_ingresso", "antifonaTitle", "Antifona d'ingresso");

  // ===== RITI DI INTRODUZIONE =====
  push("sectionTitle", "Riti di Introduzione");
  for (const s of fixedParts["riti_iniziali"]?.sections || []) {
    addSection(s, { skipRubric: true });
  }
  sp();

  // ===== ATTO PENITENZIALE =====
  push("sectionTitle", "Atto Penitenziale");
  const atto = fixedParts["atto_penitenziale"];
  if (atto) {
    // Rubrica iniziale + invito
    for (const s of atto.sections.filter(
      (x: any) => x.type !== "choice" && x.type !== "kyrie",
    )) {
      addSection(s);
    }
    const choice = atto.sections.find((s: any) => s.type === "choice");
    const penForm = (session.penitentialForm as "A" | "B" | "C") || "A";
    const penSeason = session.penitentialSeason || "ordinario";
    const selectedOpt = choice?.options.find((o: any) => o.id === penForm);
    if (selectedOpt) {
      push("subtitle", selectedOpt.label);
      if (selectedOpt.assemblea) push("assemblea", `A. ${selectedOpt.assemblea}`);
      if (selectedOpt.dialogue) {
        for (const d of selectedOpt.dialogue) {
          push("celebrante", `C. ${d.c}`);
          push("assemblea", `A. ${d.a}`);
        }
      }
      const seasonVariant = selectedOpt.season_variants?.[penSeason];
      if (seasonVariant?.formulas && Array.isArray(seasonVariant.formulas)) {
        for (let fi = 0; fi < seasonVariant.formulas.length; fi++) {
          // Spazio tra le formule (1, 2, 3...) per separazione visiva
          if (fi > 0) sp();
          const formula = seasonVariant.formulas[fi];
          if (formula.label) push("subtitle", formula.label);
          for (const d of formula.dialogue || []) {
            push("celebrante", `C. ${d.c}`);
            push("assemblea", `A. ${d.a}`);
          }
        }
      }
      if (seasonVariant?.dialogue) {
        for (const d of seasonVariant.dialogue) {
          push("celebrante", `C. ${d.c}`);
          push("assemblea", `A. ${d.a}`);
        }
      }
      if (selectedOpt.celebrante) push("celebrante", `C. ${selectedOpt.celebrante}`);
      if (selectedOpt.risposta) push("assemblea", `A. ${selectedOpt.risposta}`);
    }
    if (penForm !== "C") {
      const kyrie = atto.sections.find((s: any) => s.type === "kyrie");
      if (kyrie) addSection(kyrie, { skipRubric: true });
    }
  }
  sp();

  // ===== GLORIA =====
  if (session.showGloria !== false) {
    push("sectionTitle", "Gloria");
    for (const s of fixedParts["gloria"]?.sections || []) {
      addSection(s, { skipRubric: true });
    }
    sp();
  }

  // ===== COLLETTA =====
  addReading("colletta", "orazioneTitle", "Colletta");

  // ===== LITURGIA DELLA PAROLA =====
  push("sectionTitle", "Liturgia della Parola");
  sp();
  addReading("prima_lettura", "readingTitle", "Prima Lettura");
  addReading("salmo", "readingTitle", "Salmo Responsoriale");
  addReading("seconda_lettura", "readingTitle", "Seconda Lettura");
  addReading("sequenza", "antifonaTitle", "Sequenza");
  addReading("acclamazione", "antifonaTitle", "Acclamazione al Vangelo");
  addReading("vangelo", "readingTitle", "Vangelo");

  // ===== CREDO =====
  if (session.showCredo !== false) {
    push("sectionTitle", "Professione di Fede");
    const credo = fixedParts["credo"];
    if (credo) {
      const credoChoice = credo.sections[0];
      const credoId = (session.selectedCredoId as "niceno" | "apostolico") || "niceno";
      const sel = credoChoice?.options.find((o: any) => o.id === credoId);
      if (sel) push("normal", sel.text);
    }
    sp();
  }

  // ===== PREGHIERA DEI FEDELI =====
  if (session.showOrazionalePray !== false && session.selectedOrazionaleId) {
    push("sectionTitle", "Preghiera dei Fedeli");
    const orPrayer = getPrayerById(session.selectedOrazionaleId);
    if (orPrayer) {
      push("subtitle", orPrayer.title);
      push("normal", orPrayer.body);
    }
    sp();
  }

  // ===== PRESENTAZIONE DEI DONI =====
  push("sectionTitle", "Presentazione dei Doni");
  const off = fixedParts["offertorio"];
  if (off) {
    const allSections = off.sections;
    const idxInchinato = allSections.findIndex(
      (s: any) => s.type === "prayer" && s.rubric && /inchinato/i.test(s.rubric),
    );
    const headSections =
      idxInchinato > 0 ? allSections.slice(0, idxInchinato) : allSections.slice(0, 4);
    const inchinatoSection = idxInchinato >= 0 ? allSections[idxInchinato] : null;

    // Pane/vino: solo orazioni (no rubriche)
    for (const s of headSections.filter((x: any) => x.type !== "rubric")) {
      addSection(s, { skipRubric: true });
    }
    // "Umili e pentiti" — rosso italic
    if (inchinatoSection?.text) {
      push("umili", inchinatoSection.text);
    }
    // Orate fratres
    const orateChoice = off.sections.find((s: any) => s.type === "choice_orate");
    const orateId = session.orateFratresId || "A";
    const selectedOrate = orateChoice?.options.find((o: any) => o.id === orateId);
    if (selectedOrate) {
      push("celebrante", `C. ${selectedOrate.celebrante}`);
      push("assemblea", `A. ${selectedOrate.assemblea}`);
    }
    sp();
  }

  // ===== SULLE OFFERTE =====
  addReading("sulle_offerte", "orazioneTitle", "Sulle offerte");

  // ===== PREFAZIO + SANTO =====
  const selectedPreface = prefaces.find((p) => p.id === session.selectedPrefaceId);
  const selectedPrayer = prayers.find((p) => p.id === session.selectedPrayerId);
  const isPe1 = selectedPrayer?.id === "pe1";
  const hasProperPreface = selectedPrayer
    ? PE_WITH_PROPER_PREFACE.includes(selectedPrayer.id)
    : false;

  // Per le 7 PE con prefazio incorporato, NON ripetiamo il prefazio del giorno:
  // il prefazio è dentro la PE stessa (con introduzione + Santo).
  if (selectedPreface && !hasProperPreface) {
    push("sectionTitle", "Prefazio");
    // Titolo del prefazio in VERDE (peTitle), coerente con /messa.
    push("peTitle", selectedPreface.title);
    push("normal", PREFACE_INTRO + "\n\n" + selectedPreface.text.trimEnd() + "\n\n" + SANTO_TEXT);
    sp();
  }

  // ===== PREGHIERA EUCARISTICA =====
  if (selectedPrayer) {
    push("sectionTitle", "Preghiera Eucaristica");
    push("peTitle", selectedPrayer.title);

    // Costruzione testo PE: usa expandPrayerText (per 7 PE Messale 2020)
    // o processPrayerText per le altre.
    const peFull = (peFullData as any[]).find((p) => p.id === selectedPrayer.id);
    let peText: string;
    if (peFull) {
      peText = expandPrayerText(peFull, session.peSelections || {});
    } else {
      // Fallback: testo grezzo dalla preghiera, rimuovendo rubriche [xxx] tranne PE I
      peText = isPe1
        ? selectedPrayer.text
        : selectedPrayer.text
            .replace(/\[[^\]]*\]\s*\n?/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    // Inserisce il Mistero della Fede (acclamazione scelta) nel punto giusto.
    const marker = "Mistero della fede.";
    const idxMarker = peText.indexOf(marker);
    let beforePart = peText;
    let afterPart = "";
    if (idxMarker >= 0) {
      beforePart = peText.substring(0, idxMarker).trimEnd();
      const rest = peText.substring(idxMarker + marker.length);
      const nextBreak = rest.indexOf("\n\n");
      afterPart = nextBreak > 0 ? rest.substring(nextBreak + 2).trimStart() : rest.trimStart();
    }

    // Pre Mistero della Fede
    push("peText", beforePart);

    // Mistero della Fede
    if (idxMarker >= 0 || acclamations.length > 0) {
      sp();
      push("subtitle", "Mistero della Fede");
      const accId = session.acclamationId || "A";
      const selAcc = acclamations.find((x) => x.id === accId);
      if (selAcc) {
        push("celebrante", `C. ${selAcc.celebrante}`);
        push("assemblea", `A. ${selAcc.assemblea}`);
      }
      sp();
    }

    // Post Mistero della Fede (Anamnesi + Dossologia)
    if (afterPart) {
      push("peText", afterPart);
    }
    sp();
  }

  // ===== PADRE NOSTRO =====
  push("sectionTitle", "Padre Nostro");
  const pn = fixedParts["padre_nostro"];
  if (pn) {
    const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
    const introId = session.padreNostroIntroId || "I";
    const selectedIntro = introChoice?.options.find((o: any) => o.id === introId);
    if (selectedIntro) {
      push("celebrante", `C. ${selectedIntro.text}`);
    }
    push("normal", "Padre nostro, che sei nei cieli, sia santificato il tuo nome, venga il tuo regno, sia fatta la tua volontà, come in cielo così in terra. Dacci oggi il nostro pane quotidiano, e rimetti a noi i nostri debiti come anche noi li rimettiamo ai nostri debitori, e non abbandonarci alla tentazione, ma liberaci dal male.");
    // Embolismo (sezioni 1: monizione+pater | 2: embolismo)
    const pnSections = pn.sections.filter((s: any) => s.type !== "choice_intro");
    // Embolismo è normalmente in pnSections[1] (dopo pater)
    if (pnSections[1]) addSection(pnSections[1]);
    sp();
  }

  // ===== RITO DELLA PACE =====
  push("sectionTitle", "Rito della Pace");
  if (pn) {
    const peaceSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(2);
    for (const s of peaceSections) addSection(s, { skipRubric: true });
  }
  sp();

  // ===== FRAZIONE DEL PANE (Agnello) =====
  push("sectionTitle", "Frazione del Pane");
  const com = fixedParts["comunione"];
  if (com) {
    for (const s of com.sections.slice(0, 2)) addSection(s, { skipRubric: true });
  }
  sp();

  // ===== COMUNIONE =====
  push("sectionTitle", "Comunione");
  if (com) {
    for (const s of com.sections.slice(2)) addSection(s, { skipRubric: true });
  }
  addReading("antifona_comunione", "antifonaTitle", "Antifona alla Comunione");

  // ===== DOPO LA COMUNIONE =====
  addReading("dopo_comunione", "orazioneTitle", "Dopo la Comunione");

  // ===== RITI DI CONCLUSIONE =====
  push("sectionTitle", "Riti di Conclusione");
  const rc = fixedParts["riti_conclusione"];
  if (rc) {
    // Saluto iniziale (dialogue) — sezione 0
    addSection(rc.sections[0]);

    // Orazione sul popolo (se attiva)
    if (session.useOrazionePopolo && session.orazionePopoloId) {
      const sel = prayersOverPeople.find((p) => p.id === session.orazionePopoloId);
      if (sel) {
        push("subtitle", `Orazione sul popolo n. ${sel.num}`);
        push("normal", sel.text);
        push("assemblea", "A. Amen.");
        sp();
      }
    }

    // Benedizione: solenne o semplice
    if (session.useSolemnBlessing && session.solemnBlessingId) {
      const sb = solemnBlessings.find((b) => b.id === session.solemnBlessingId);
      if (sb) {
        push(
          "subtitle",
          `Benedizione Solenne — ${(sb as any).num ? `${(sb as any).num}. ` : ""}${sb.title}`,
        );
        if ((sb as any).rubric) push("rubric", (sb as any).rubric);
        const invs = sb.invocations || [];
        for (let ii = 0; ii < invs.length; ii++) {
          if (ii > 0) sp();
          const inv = invs[ii];
          push("celebrante", `C. ${inv.c}`);
          push("assemblea", `A. ${inv.a}`);
        }
        if (sb.final) {
          sp();
          push("celebrante", `C. ${sb.final.c}`);
          push("assemblea", `A. ${sb.final.a}`);
        }
      }
    } else {
      // Benedizione semplice: sezione 1 (choice options A/B)
      const benedChoice = rc.sections[1];
      const benedId = session.benedizioneId || "A";
      const bened = benedChoice?.options?.find((o: any) => o.id === benedId);
      if (bened) {
        push("subtitle", "Benedizione");
        push("celebrante", `C. ${bened.celebrante}`);
        push("assemblea", `A. ${bened.assemblea}`);
      }
    }
    sp();

    // Congedo
    push("subtitle", "Congedo");
    const congedoChoice = rc.sections[2];
    let congedoOpts = [...(congedoChoice?.options || [])];
    if (pasquaDismissal && currentSeasonKey === "pasqua") {
      congedoOpts.push({
        id: pasquaDismissal.id,
        label: "Pasqua",
        celebrante: pasquaDismissal.celebrante,
        assemblea: pasquaDismissal.assemblea,
      });
    }
    const congedoId = session.congedoId || "A";
    const selectedCongedo =
      congedoOpts.find((o: any) => o.id === congedoId) || congedoOpts[0];
    if (selectedCongedo) {
      push("celebrante", `C. ${selectedCongedo.celebrante}`);
      push("assemblea", `A. ${selectedCongedo.assemblea}`);
    }
  }
  sp();

  return out;
}

// ===========================================================================
// paginate: distribuisce i segmenti in pagine, spezzando lunghi blocchi di
// testo SOLO ai segni di punteggiatura (.!?:;) e mai a metà frase.
// ===========================================================================
function paginate(
  segments: Segment[],
  containerH: number,
  fontSize: number,
  screenW: number,
): Segment[][] {
  // ----- Stima caratteri-per-riga -----
  const HORIZONTAL_PADDING = 32; // padding interno pageContent
  const usableW = Math.max(280, screenW - HORIZONTAL_PADDING);
  const avgCharW = Math.max(8, fontSize * 0.52);
  const charsPerLine = Math.max(20, Math.floor(usableW / avgCharW));
  const lineH = Math.max(20, Math.round(fontSize * 1.45));
  const usableH = Math.max(200, containerH - 16);

  // Altezza extra (titolo, paragrafo, spacer): in unità "righe equivalenti"
  // Ogni segmento ha:
  //   - una propria fontSize relativa al base fontSize
  //   - un margin verticale (mb)
  // Per stima: convertiamo tutto in pixel.
  const segHeightPx = (seg: Segment): number => {
    if (seg.kind === "spacer") return 22;

    // fontSize multiplier per kind
    const m: Record<SegKind, number> = {
      sectionTitle: 1.05,
      antifonaTitle: 0.85,
      readingTitle: 0.85,
      orazioneTitle: 0.85,
      subtitle: 0.85,
      normal: 1.0,
      rubric: 0.7,
      celebrante: 1.0,
      assemblea: 1.0,
      umili: 0.85,
      peTitle: 1.1,
      peText: 1.0,
      peDossologia: 1.0,
      salmo: 1.0,
      spacer: 1.0,
    };
    // Margin top extra per i titoli (per riflettere i marginTop reali degli
    // stili e dare alla paginazione una stima accurata dell'altezza occupata).
    const titleMarginTop: Record<string, number> = {
      sectionTitle: 14,
      antifonaTitle: 10,
      readingTitle: 10,
      orazioneTitle: 10,
      subtitle: 8,
      peTitle: 6,
    };
    const marginTop = titleMarginTop[seg.kind] || 0;
    const fs = Math.round(fontSize * m[seg.kind]);
    // Line-height stimato: 1.65× per testi del corpo (riflette il nuovo
    // 1.7× applicato negli stili a text/celebrante/assemblea/peText/dossologia
    // — tenuto leggermente più basso per non sprecare pagine), 1.45× per
    // titoli e rubriche che hanno line-height più stretto.
    const isBody =
      seg.kind === "normal" ||
      seg.kind === "celebrante" ||
      seg.kind === "assemblea" ||
      seg.kind === "peText" ||
      seg.kind === "peDossologia" ||
      seg.kind === "salmo" ||
      seg.kind === "umili";
    const lhFactor = isBody ? 1.65 : 1.4;
    const segLineH = Math.max(20, Math.round(fs * lhFactor));
    // Char per linea ricalcolato per font size del segmento
    const segCharsPerLine = Math.max(
      20,
      Math.floor(usableW / Math.max(8, fs * 0.52)),
    );
    // Numero di righe: rispetta gli \n del testo
    const text = seg.text.replace(/<<DOSSOLOGIA>>/g, "");
    const explicitLines = text.split("\n");
    let totalLines = 0;
    for (const ln of explicitLines) {
      if (!ln) {
        totalLines += 1;
        continue;
      }
      totalLines += Math.max(1, Math.ceil(ln.length / segCharsPerLine));
    }
    const margin = 8; // marginBottom medio
    return marginTop + totalLines * segLineH + margin;
  };

  // Spezza un segmento di testo lungo in più segmenti dello stesso kind,
  // tagliando solo a fine frase (.!?:;), preservando paragrafi (\n\n).
  const splitSegByPunct = (seg: Segment, maxPx: number): Segment[] => {
    const splittableKinds: SegKind[] = ["normal", "celebrante", "assemblea", "peText", "peDossologia"];
    if (!splittableKinds.includes(seg.kind)) return [seg];
    const oneH = segHeightPx({ kind: seg.kind, text: "X" });
    if (oneH >= maxPx) return [seg]; // troppo piccolo per spezzare

    // Split su paragrafi prima
    const paragraphs = seg.text.split(/\n\n+/);
    const pieces: string[] = [];
    let buf = "";
    for (const p of paragraphs) {
      const candidate = buf ? `${buf}\n\n${p}` : p;
      if (segHeightPx({ kind: seg.kind, text: candidate }) <= maxPx) {
        buf = candidate;
      } else {
        if (buf) pieces.push(buf);
        // Se p singolo è troppo grande, split su frasi
        if (segHeightPx({ kind: seg.kind, text: p }) > maxPx) {
          // Split su sentence-enders (.!?:;), mantieni il delimiter sulla frase precedente
          const sentences = p.split(/(?<=[\.\!\?\:\;])\s+/);
          let sBuf = "";
          for (const s of sentences) {
            const cand = sBuf ? `${sBuf} ${s}` : s;
            if (segHeightPx({ kind: seg.kind, text: cand }) <= maxPx) {
              sBuf = cand;
            } else {
              if (sBuf) pieces.push(sBuf);
              // Se anche la singola frase è troppo grande, fallback: \n
              if (segHeightPx({ kind: seg.kind, text: s }) > maxPx) {
                const lines = s.split("\n");
                let lnBuf = "";
                for (const ln of lines) {
                  const lnCand = lnBuf ? `${lnBuf}\n${ln}` : ln;
                  if (segHeightPx({ kind: seg.kind, text: lnCand }) <= maxPx) {
                    lnBuf = lnCand;
                  } else {
                    if (lnBuf) pieces.push(lnBuf);
                    lnBuf = ln;
                  }
                }
                if (lnBuf) pieces.push(lnBuf);
                sBuf = "";
              } else {
                sBuf = s;
              }
            }
          }
          if (sBuf) pieces.push(sBuf);
          buf = "";
        } else {
          buf = p;
        }
      }
    }
    if (buf) pieces.push(buf);
    // Per peText, preserva il marker <<DOSSOLOGIA>> nel suo pezzo
    return pieces.map((t) => ({ kind: seg.kind, text: t }));
  };

  // ----- Pacchetta segmenti in pagine -----
  // ORPHAN PROTECTION: se l'ultima cosa che abbiamo messo nella pagina
  // corrente è un titolo (sezione/sottotitolo/titolo lettura, ecc.) e il
  // segmento successivo non ci sta, spostiamo il titolo nella pagina
  // successiva insieme al suo testo. Evita "titoli orfani" in fondo.
  const isTitle = (k: SegKind): boolean =>
    k === "sectionTitle" ||
    k === "subtitle" ||
    k === "antifonaTitle" ||
    k === "readingTitle" ||
    k === "orazioneTitle" ||
    k === "peTitle";

  const pages: Segment[][] = [];
  let curPage: Segment[] = [];
  let curH = 0;
  // Memorizza l'ultimo "header di sezione" visto (readingTitle / peTitle /
  // antifonaTitle / orazioneTitle / sectionTitle). Quando una pagina inizia
  // con la PROSECUZIONE di un body (lettura/PE/orazione lunga), aggiungiamo
  // un titolo sintetico "{Header} (continua)" così il prete sa che pagina è.
  let lastSectionHeader: Segment | null = null;
  let lastSectionRubric: Segment | null = null; // riferimento bibblico associato
  const SECTION_HEADER_KINDS: SegKind[] = [
    "readingTitle",
    "antifonaTitle",
    "orazioneTitle",
    "peTitle",
    "sectionTitle",
  ];

  const flushSimple = (toPush: Segment[]) => {
    if (toPush.length > 0) pages.push(toPush);
  };

  // Aggiunge un titolo "(continua)" all'inizio della pagina corrente quando
  // la pagina sta iniziando con un body senza il proprio header.
  const ensureContinuationHeader = () => {
    if (!lastSectionHeader) return;
    if (curPage.length > 0) return;
    // Solo per readingTitle / orazioneTitle / antifonaTitle (le sezioni con
    // contenuto che può essere splittato). sectionTitle/peTitle non si ripete
    // perché quei titoli sono "padre" (Liturgia della Parola, Preghiera
    // Eucaristica) — il sotto-titolo specifico (Prima Lettura, ecc.) è quello
    // che vogliamo ripetere.
    const kindsToRepeat: SegKind[] = ["readingTitle", "orazioneTitle", "antifonaTitle"];
    if (!kindsToRepeat.includes(lastSectionHeader.kind)) return;
    const ghost: Segment = {
      kind: lastSectionHeader.kind,
      text: `${lastSectionHeader.text} (continua)`,
    };
    curPage.push(ghost);
    curH += segHeightPx(ghost);
    if (lastSectionRubric) {
      curPage.push(lastSectionRubric);
      curH += segHeightPx(lastSectionRubric);
    }
  };

  for (const seg of segments) {
    let parts: Segment[] = [seg];
    const segH = segHeightPx(seg);
    if (segH > usableH) {
      parts = splitSegByPunct(seg, usableH);
    }
    // Aggiorna il tracker dell'ultimo header sezione.
    if (SECTION_HEADER_KINDS.includes(seg.kind)) {
      lastSectionHeader = seg;
      lastSectionRubric = null;
    } else if (
      seg.kind === "rubric" &&
      lastSectionHeader &&
      curPage.length > 0 &&
      curPage[curPage.length - 1].kind === lastSectionHeader.kind
    ) {
      // La rubrica appena dopo un readingTitle è il riferimento bibblico.
      lastSectionRubric = seg;
    } else if (
      seg.kind !== "spacer" &&
      seg.kind !== "rubric" &&
      !SECTION_HEADER_KINDS.includes(seg.kind)
    ) {
      // I body successivi non sono "nuovi header" — manteniamo il tracker.
    }
    for (let pIdx = 0; pIdx < parts.length; pIdx++) {
      const p = parts[pIdx];
      const h = segHeightPx(p);
      if (curH + h > usableH && curPage.length > 0) {
        // Strip dei titoli/spacer in coda (orphan protection): li spostiamo
        // sulla pagina successiva insieme al loro testo. Anche eventuali
        // <spacer> finali vengono scartati (non ha senso uno spacer in fondo).
        const orphans: Segment[] = [];
        // 1) rimuovi spacer in coda (estetica)
        while (
          curPage.length > 0 &&
          curPage[curPage.length - 1].kind === "spacer"
        ) {
          curPage.pop();
        }
        // 2) coppia [titolo + rubrica] in coda → entrambi orfani
        //    (esempio: "Prima Lettura" + "Dagli Atti degli Apostoli (At ...)")
        //    Senza questo, il riferimento bibblico resterebbe attaccato al
        //    titolo ma il testo della lettura partirebbe dalla pagina dopo.
        let peeling = true;
        while (peeling && curPage.length > 0) {
          const last = curPage[curPage.length - 1];
          if (isTitle(last.kind)) {
            orphans.unshift(curPage.pop()!);
            while (
              curPage.length > 0 &&
              curPage[curPage.length - 1].kind === "spacer"
            ) {
              curPage.pop();
            }
            continue;
          }
          if (
            last.kind === "rubric" &&
            curPage.length >= 2 &&
            isTitle(curPage[curPage.length - 2].kind)
          ) {
            orphans.unshift(curPage.pop()!); // rubrica
            orphans.unshift(curPage.pop()!); // titolo
            while (
              curPage.length > 0 &&
              curPage[curPage.length - 1].kind === "spacer"
            ) {
              curPage.pop();
            }
            continue;
          }
          peeling = false;
        }
        if (curPage.length > 0) {
          flushSimple(curPage);
        }
        // GLI ORPHANS (titoli rimasti in coda) vengono SEMPRE mantenuti per
        // la pagina successiva, MAI flushati come pagina a sé stante (che
        // sarebbe una pagina vuota di soli titoli, e il body successivo
        // perderebbe il proprio titolo). Anche se la pagina precedente era
        // composta SOLO da titoli, questi rimangono in attesa del body.
        curPage = orphans;
        curH = orphans.reduce((acc, s) => acc + segHeightPx(s), 0);
      }
      // "(continua)" header: SOLO quando questo segmento è una sub-parte
      // (pIdx > 0) di un body originariamente splittato in più pezzi
      // (lettura/orazione/PE talmente lunga che NON entra in una sola pagina
      // e abbiamo dovuto splittarla a fine frase). In questo caso il prete
      // sta leggendo un body che continua dalla pagina precedente, e il
      // titolo "(continua)" gli ricorda quale sezione è. Per la PRIMA parte
      // (pIdx === 0) o per pagine che iniziano una nuova sezione, niente
      // "(continua)" — il titolo proprio è già presente normalmente.
      if (pIdx > 0 && curPage.length === 0) {
        ensureContinuationHeader();
      }
      curPage.push(p);
      curH += h;
    }
  }
  // Ultima pagina: rimuovi spacer in coda (estetica)
  while (
    curPage.length > 0 &&
    curPage[curPage.length - 1].kind === "spacer"
  ) {
    curPage.pop();
  }
  if (curPage.length > 0) flushSimple(curPage);

  return pages;
}

// ===========================================================================
// Stili (allineati a quelli di /messa.tsx)
// ===========================================================================
// fontFamily si applica SOLO ai testi del corpo della celebrazione (text,
// celebrante, assemblea, peText, peDossologia, salmo, umili). I titoli/UI
// restano nel font di sistema per coerenza con le altre schermate.
const makeStyles = (
  colors: any,
  fontSize: number,
  fontFamily: string | undefined,
) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      minHeight: 56,
      minWidth: 56,
    },
    backBtnText: {
      fontSize: Math.round(fontSize * 0.55),
      color: colors.textPrimary,
      fontWeight: "600",
    },
    title: {
      fontSize: Math.round(fontSize * 0.65),
      fontWeight: "700",
      color: colors.textPrimary,
      flex: 1,
      textAlign: "center",
      marginHorizontal: 8,
    },
    pageIndicator: {
      minWidth: 88,
      alignItems: "flex-end",
      paddingRight: 8,
    },
    pageIndicatorText: {
      fontSize: Math.round(fontSize * 0.55),
      color: colors.textSecondary,
      fontWeight: "600",
    },
    pageArea: {
      flex: 1,
    },
    // ScrollView interna alla pageArea, una per pagina. Se la pagina entra
    // tutta nello schermo, la ScrollView si comporta come una View statica;
    // se eccede, l'auto-scroll la fa scorrere automaticamente.
    pageScroll: {
      flex: 1,
    },
    pageContent: {
      flexGrow: 1,           // ← contentContainer riempie tutto lo spazio
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 24,
    },
    // ----- Tipografia (stessi colori/taglie di /messa) -----
    // I titoli sezione e PE hanno marginTop per respiro visivo quando seguono
    // testo precedente (l'orphan protection garantisce che il titolo non
    // resti mai solo in fondo a una pagina).
    sectionTitle: {
      fontSize: Math.round(fontSize * 1.05),
      fontWeight: "800",
      color: "#4DA8DA",
      marginTop: 14,
      marginBottom: 8,
      lineHeight: Math.round(fontSize * 1.15),
    },
    antifonaTitle: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "800",
      color: "#FFB74D",
      marginTop: 10,
      marginBottom: 6,
      lineHeight: Math.round(fontSize * 0.95),
    },
    readingTitle: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "800",
      color: "#81C784",
      marginTop: 10,
      marginBottom: 6,
      lineHeight: Math.round(fontSize * 0.95),
    },
    orazioneTitle: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "800",
      color: "#CE93D8",
      marginTop: 10,
      marginBottom: 6,
      lineHeight: Math.round(fontSize * 0.95),
    },
    subtitle: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: 8,
      marginBottom: 6,
      lineHeight: Math.round(fontSize * 0.95),
    },
    peTitle: {
      fontSize: Math.round(fontSize * 1.1),
      fontWeight: "800",
      color: "#66BB6A",
      marginTop: 6,
      marginBottom: 10,
      lineHeight: Math.round(fontSize * 1.2),
    },
    peConsecration: {
      color: "#29B6F6",
      fontWeight: "800",
    },
    peDossologia: {
      fontSize: fontSize,
      lineHeight: fontSize * 1.7,
      color: colors.textPrimary,
      fontWeight: "400",
      fontFamily,
      marginTop: 4,
      marginBottom: 8,
    },
    umili: {
      fontSize: Math.round(fontSize * 0.85),
      fontStyle: "italic",
      color: colors.rubrics,
      fontFamily,
      marginVertical: 6,
      lineHeight: fontSize * 1.55,
    },
    text: {
      fontSize: fontSize,
      lineHeight: fontSize * 1.7,
      color: colors.textPrimary,
      fontFamily,
      marginTop: 0,
      marginBottom: 8,
    },
    rubric: {
      fontSize: Math.round(fontSize * 0.7),
      fontStyle: "italic",
      color: colors.rubrics,
      marginVertical: 4,
      lineHeight: fontSize * 1.2,
    },
    salmoRit: {
      color: colors.rubrics,
      fontWeight: "800",
    },
    salmoText: {
      fontSize: fontSize,
      lineHeight: fontSize * 1.55,
      color: colors.textPrimary,
      fontFamily,
      marginVertical: 4,
    },
    celebrante: {
      fontSize: fontSize,
      color: colors.textPrimary,
      fontFamily,
      marginVertical: 6,
      lineHeight: fontSize * 1.7,
    },
    assemblea: {
      fontSize: Math.max(12, fontSize - 1),
      fontStyle: "italic",
      color: colors.textPrimary,
      fontFamily,
      marginVertical: 6,
      lineHeight: fontSize * 1.7,
    },
    // ----- Empty state -----
    emptyBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 20,
    },
    emptyTitle: {
      fontSize: Math.round(fontSize * 0.9),
      fontWeight: "800",
      color: colors.textPrimary,
      textAlign: "center",
    },
    emptyText: {
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: fontSize * 1.3,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
      minHeight: 64,
    },
    primaryBtnText: {
      fontSize: Math.round(fontSize * 0.75),
      fontWeight: "700",
      color: "#FFFFFF",
    },
  });
