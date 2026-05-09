/**
 * /celebra — Modalità "Celebra la Messa" (lettura pulita per l'altare)
 *
 * Pensata per sacerdoti anziani ipovedenti: NESSUN toggle, NESSUN selettore,
 * NESSUNA scelta. Solo testo continuo distribuito in pagine orizzontali
 * stile "lettore Kindle".
 *
 * Architettura del rendering:
 *  - L'array di Segment costruito da buildSegments() viene serializzato in
 *    HTML completo da segmentsToHtml() (titoli colorati, rubriche italico,
 *    consacrazione azzurra, dossologia, salmo R. rosso, ecc.).
 *  - L'HTML è iniettato in una WebView (su Android nativo) o in un <iframe
 *    srcDoc> (su web preview): codice HTML/CSS/JS identico in entrambi i casi.
 *  - Il browser interno usa CSS columns (`column-width: 100vw, column-gap: 0,
 *    column-fill: auto, height: 100vh`) per impaginare il testo in colonne
 *    larghe esattamente quanto lo schermo. Niente chunking manuale.
 *  - `scroll-snap-type: x mandatory` garantisce snap netto tra pagine.
 *
 * Comportamento utente:
 *  - Tap metà sinistra → pagina precedente; tap metà destra → successiva.
 *  - Effetto fade 200ms (100ms out + 100ms in) al cambio pagina.
 *  - Bottoni A- / A+ in alto modificano dinamicamente body.fontSize: i figli
 *    in 'em' si scalano e le CSS columns si ricalcolano automaticamente.
 *  - Wakelock attivo (useKeepAwake): lo schermo non si spegne durante la Messa.
 *  - Barra di progresso oro in fondo, sincronizzata via postMessage.
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
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
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
import { loadSession, loadSessionOrLatest } from "../src/massSession";
import peFullData from "../src/data/eucharisticPrayersFull.json";

// ===========================================================================
// Tipi: segmenti rendering + helpers
// ===========================================================================

type SegKind =
  | "sectionTitle"
  | "sectionTitleBreak" // identico a sectionTitle ma forza salto pagina (CSS column-break)
  | "antifonaTitle"
  | "readingTitle"
  | "orazioneTitle"
  | "subtitle"
  | "normal"
  | "rubric"
  | "readingRef" // riferimento biblico sotto Lettura/Vangelo (rosso, ma più grande della rubric)
  | "celebrante"
  | "assemblea"
  | "umili"
  | "peTitle"
  | "peText"
  | "peDossologia"
  | "salmo"
  | "preghieraFedeli" // R/. in rosso + riga vuota dopo ogni R/.
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
  // Wakelock: tiene lo schermo acceso mentre la pagina è aperta. SOLO su
  // native (Android/iOS): su web il browser nega il permesso e crashava
  // l'app, quindi skippiamo. Wrappato in try/catch per sicurezza.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = false;
    activateKeepAwakeAsync()
      .then(() => {
        active = true;
      })
      .catch(() => {
        // permesso negato o non supportato: prosegui senza wakelock
      });
    return () => {
      if (active) {
        try {
          deactivateKeepAwake();
        } catch {}
      }
    };
  }, []);

  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { colors, fontSize: settingsFontSize, scaledFont, fontFamily } = useSettings();
  const { width: screenWidth } = useWindowDimensions();

  // Stato locale fontSize (override delle impostazioni globali, valido solo
  // per questa sessione di celebrazione). Inizializzato da settings, può
  // essere modificato con i bottoni A- / A+ in alto.
  const [fontSize, setFontSize] = useState(settingsFontSize);
  // Sincronizza quando l'utente cambia il font dalle Impostazioni mentre
  // la celebrazione NON è ancora aperta (solo se non è stato customizzato qui).
  useEffect(() => {
    setFontSize(settingsFontSize);
  }, [settingsFontSize]);
  const FONT_MIN = 14;
  const FONT_MAX = 60;
  const FONT_STEP = 2;
  const decreaseFont = () =>
    setFontSize((f) => Math.max(FONT_MIN, f - FONT_STEP));
  const increaseFont = () =>
    setFontSize((f) => Math.min(FONT_MAX, f + FONT_STEP));

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

  // Paginazione "Kindle": tap dx 50% = avanza, sx 50% = indietro.
  // Le pagine sono renderizzate come slide orizzontali in una FlatList con
  // pagingEnabled (snap netto, niente scroll verticale, niente scrollbar).
  const [currentPage, setCurrentPage] = useState(0);
  const [containerH, setContainerH] = useState(0);

  // Ref alla WebView (per future injectJavaScript se necessario).
  const webViewRef = useRef<WebView | null>(null);

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
        const saved = await loadSessionOrLatest(dateKey);
        if (saved) {
          setSession(saved);
          setHasSession(true);
        } else {
          setHasSession(false);
        }
      } catch (e) {
        if (__DEV__) console.log("Errore caricamento celebrazione:", e);
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

  // ----- HTML completo per la WebView (CSS columns) -----
  // Il browser interno alla WebView impagina il testo in colonne larghe 100vw,
  // riempiendo perfettamente ogni pagina. Tap a sinistra/destra → scroll
  // orizzontale di una larghezza schermo. La WebView posta {page, total} via
  // postMessage; React Native aggiorna currentPage/totalPages per la barra
  // di progresso nativa.
  const html: string = useMemo(() => {
    if (!segments.length) return "";
    return segmentsToHtml(segments, fontSize, fontFamily, colors);
  }, [segments, fontSize, fontFamily, colors]);

  // Stato pagina/totale: aggiornato dai messaggi postati dalla WebView.
  const [totalPages, setTotalPages] = useState(0);

  // Reset pagina quando l'HTML cambia (nuovo testo da impaginare)
  useEffect(() => {
    setCurrentPage(0);
    setTotalPages(0);
  }, [html]);

  // Invia un comando setFontSize alla WebView/iframe quando l'utente preme
  // A- / A+. La WebView aggiorna document.body.style.fontSize: tutti i figli
  // usano 'em' quindi si scalano automaticamente. Le CSS columns ricalcolano
  // il layout, e la WebView ri-posta {page,total} per aggiornare la barra
  // di progresso nativa.
  // NOTA: invio SOLO quando fontSize cambia rispetto al valore iniziale
  // dell'HTML (settingsFontSize), perché l'HTML al primo render è già
  // costruito con quel valore.
  useEffect(() => {
    const msg = JSON.stringify({ type: "setFontSize", size: fontSize });
    if (Platform.OS === "web") {
      // iframe web: post al contentWindow
      try {
        const iframes = (typeof document !== "undefined"
          ? document.querySelectorAll('iframe[data-testid="celebra-iframe"]')
          : []) as any;
        iframes.forEach((ifr: any) => {
          if (ifr?.contentWindow?.postMessage) {
            ifr.contentWindow.postMessage(msg, "*");
          }
        });
      } catch {}
    } else {
      // WebView native: postMessage dispatcha un evento 'message' nel JS interno
      try {
        // @ts-ignore
        webViewRef.current?.postMessage?.(msg);
        // Backup via injectJavaScript per sicurezza
        webViewRef.current?.injectJavaScript?.(
          `(function(){try{document.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(msg)}}));}catch(e){}})();true;`,
        );
      } catch {}
    }
  }, [fontSize]);

  // Listener per messaggi dall'iframe (solo web). Ascolta i postMessage che
  // l'HTML interno alla WebView/iframe invia per aggiornare la barra di
  // progresso nativa. Su native questo è gestito dalla prop onMessage della
  // WebView; su web (iframe) serve window.addEventListener('message').
  // IMPORTANTE: deve essere dichiarato PRIMA degli early return per rispettare
  // le regole degli hook (stesso ordine ad ogni render).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handler = (ev: MessageEvent) => {
      try {
        const data =
          typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (data && data.type === "state") {
          if (typeof data.total === "number" && data.total > 0) {
            setTotalPages(data.total);
          }
          if (typeof data.page === "number" && data.page >= 0) {
            setCurrentPage(data.page);
          }
        }
      } catch {
        // ignora
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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

  const total = totalPages;
  const safeIdx = Math.max(0, Math.min(currentPage, Math.max(0, total - 1)));

  return (
    <SafeAreaView style={styles.container} testID="celebra-screen">
      {/* Top bar: home + data + bottoni font + indicatore di pagina */}
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
        {/* Bottoni A-/A+ per dimensione font (vicino alla data, prima
            dell'indicatore di pagina). Disabilitati ai limiti. */}
        <View style={styles.fontBtns}>
          <TouchableOpacity
            style={[
              styles.fontBtn,
              fontSize <= FONT_MIN && styles.fontBtnDisabled,
            ]}
            onPress={decreaseFont}
            disabled={fontSize <= FONT_MIN}
            testID="btn-font-decrease"
            accessibilityLabel="Riduci dimensione testo"
          >
            <Text style={styles.fontBtnText}>A-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.fontBtn,
              fontSize >= FONT_MAX && styles.fontBtnDisabled,
            ]}
            onPress={increaseFont}
            disabled={fontSize >= FONT_MAX}
            testID="btn-font-increase"
            accessibilityLabel="Aumenta dimensione testo"
          >
            <Text style={styles.fontBtnText}>A+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pageIndicator}>
          <Text style={styles.pageIndicatorText}>
            {total > 0 ? `${safeIdx + 1}/${total}` : ""}
          </Text>
        </View>
      </View>

      {/* Area di lettura: WebView con HTML iniettato che usa CSS columns
          (column-width: 100vw) per impaginare il testo PERFETTAMENTE. Il
          motore CSS del browser calcola le colonne in modo nativo: nessuno
          spazio vuoto, nessun chunking manuale. Tap dx/sx (gestiti dentro la
          WebView via JS) → scrollBy(±100vw) con scroll-snap. La WebView
          posta {page, total} via postMessage; React Native aggiorna
          currentPage/totalPages per la barra di progresso nativa. */}
      <View
        style={styles.pageArea}
        onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}
        testID="celebra-tap-area"
      >
        {!html ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            {Platform.OS === "web" ? (
              // Su web preview, react-native-webview non è supportato.
              // Usa un iframe HTML diretto con srcDoc. Il JavaScript
              // interno comunica via window.parent.postMessage (gestito
              // dal listener 'message' nel useEffect sopra).
              React.createElement("iframe", {
                // Hash semplice basato su lunghezza + primi/ultimi caratteri
                // per garantire rerender dell'iframe quando l'HTML cambia
                // (es. cambio fontFamily che produce HTML di stessa length).
                key: `${html.length}-${html.charCodeAt(100) || 0}-${html.charCodeAt(html.length - 100) || 0}`,
                srcDoc: html,
                style: {
                  flex: 1,
                  width: "100%",
                  height: "100%",
                  border: 0,
                  background: colors.background,
                  display: "block",
                },
                title: "celebra",
                "data-testid": "celebra-iframe",
              })
            ) : (
              <WebView
                ref={webViewRef}
                originWhitelist={["*"]}
                source={{ html }}
                style={[styles.webview, { backgroundColor: colors.background }]}
                containerStyle={{ backgroundColor: colors.background }}
                androidLayerType="hardware"
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                decelerationRate="fast"
                setSupportMultipleWindows={false}
                javaScriptEnabled
                domStorageEnabled={false}
                opaque={false}
                allowsLinkPreview={false}
                automaticallyAdjustContentInsets={false}
                hideKeyboardAccessoryView
                {...({ scalesPageToFit: false } as any)}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data && data.type === "state") {
                      if (typeof data.total === "number" && data.total > 0) {
                        setTotalPages(data.total);
                      }
                      if (typeof data.page === "number" && data.page >= 0) {
                        setCurrentPage(data.page);
                      }
                    }
                  } catch {
                    // ignora messaggi non JSON
                  }
                }}
                testID="celebra-webview"
              />
            )}
            {/* Barra di progresso fissa in fondo (3px di altezza, sollevata
                di 10px dal bordo per non essere coperta dai tasti di sistema
                Android). Sfondo grigio scuro, riempimento color oro. */}
            <View style={styles.progressTrack} pointerEvents="none">
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      total > 0 ? ((safeIdx + 1) / total) * 100 : 0
                    }%`,
                  },
                ]}
              />
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// (Codice morto rimosso: SegmentRenderer/SalmoRenderer/PeTextRenderer/PeTextNormal —
//  sostituiti dal rendering HTML/CSS columns dentro la WebView via segmentsToHtml().)

// ===========================================================================
// buildSegments: costruisce l'intera Messa come array di Segment
// ===========================================================================
// segmentsToHtml: converte un array di Segment in stringa HTML completa
// pronta per essere iniettata in una WebView con CSS columns.
// ===========================================================================
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Renderizza un segmento "salmo": evidenzia la "R." iniziale in rosso.
// Consolida i newline multipli (es. "\n\n") in un singolo <br> per uniformità.
function salmoToHtml(text: string): string {
  const cleaned = text.replace(/^\n+|\n+$/g, "").replace(/\n+/g, "\n");
  const lines = cleaned.split("\n").map((ln) => {
    const m = ln.match(/^(\s*)(R\.)(\s*)(.*)$/);
    if (m) {
      return `${escapeHtml(m[1])}<span class="salmo-r">${escapeHtml(m[2])}</span>${escapeHtml(m[3])}${escapeHtml(m[4])}`;
    }
    return escapeHtml(ln);
  });
  return lines.join("<br>");
}

// Renderizza il testo della Preghiera dei Fedeli: evidenzia "R/." in rosso
// e aggiunge una riga vuota dopo ogni "R/." per migliorare la leggibilità.
function preghieraFedeliToHtml(text: string): string {
  const cleaned = text.replace(/^\n+|\n+$/g, "").replace(/\n+/g, "\n");
  const out: string[] = [];
  const lines = cleaned.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // Match "R/." sia all'inizio della linea, sia preceduto da spazi.
    const m = ln.match(/^(\s*)(R\/\.?)(\s*)(.*)$/);
    if (m) {
      out.push(
        `${escapeHtml(m[1])}<span class="resp-r">${escapeHtml(m[2])}</span>${escapeHtml(m[3])}${escapeHtml(m[4])}`,
      );
      // Riga vuota DOPO ogni R/. (un solo <br> aggiuntivo, non doppio)
      out.push("");
    } else {
      out.push(escapeHtml(ln));
    }
  }
  return out.join("<br>");
}


// stile speciale alle parole della Consacrazione (in azzurro).
function peTextToHtml(text: string): string {
  const parts = text.split("<<DOSSOLOGIA>>");
  // Trim newline iniziali/finali su entrambi i parts per evitare <br>
  // fantasma all'inizio/fine (es. spazio sotto il titolo "Dossologia").
  const main = (parts[0] || "").replace(/^\n+|\n+$/g, "");
  const doss = (parts[1] || "").replace(/^\n+|\n+$/g, "");

  const formatMain = (s: string): string => {
    let out = escapeHtml(s);
    const consPatterns = [
      /(Prendete[^.]*?è il mio Corpo[^.]*?)\./gi,
      /(Prendete[^.]*?è il calice del mio Sangue[^.]*?)\./gi,
      /(Prendete[^.]*?dato per voi)\./gi,
      /(Fate questo in memoria di me)\./gi,
    ];
    for (const p of consPatterns) {
      out = out.replace(p, '<span class="pe-consacration">$1.</span>');
    }
    // Consolida newline multipli in un singolo <br> per uniformità
    return out.replace(/\n+/g, "<br>");
  };

  let html = `<div class="pe-main">${formatMain(main)}</div>`;
  if (doss) {
    html += `<div class="pe-dossologia-label">Dossologia</div>`;
    html += `<div class="pe-dossologia">${escapeHtml(doss).replace(/\n+/g, "<br>")}</div>`;
  }
  return html;
}

function segmentsToHtml(
  segments: Segment[],
  fontSize: number,
  fontFamily: string | undefined,
  colors: any,
): string {
  // Mappa il nome del font expo-font (es. "AtkinsonHyperlegible_400Regular")
  // al nome leggibile + URL Google Fonts. Necessario perché il browser
  // dentro l'iframe/WebView NON ha caricati i font dell'app: dobbiamo
  // importarli esplicitamente via Google Fonts CDN.
  const fontMap: Record<string, { name: string; gf: string }> = {
    AtkinsonHyperlegible_400Regular: {
      name: "Atkinson Hyperlegible",
      gf: "Atkinson+Hyperlegible:wght@400;700",
    },
    Lora_400Regular: {
      name: "Lora",
      gf: "Lora:wght@400;700",
    },
    VarelaRound_400Regular: {
      name: "Varela Round",
      gf: "Varela+Round",
    },
    PatrickHand_400Regular: {
      name: "Patrick Hand",
      gf: "Patrick+Hand",
    },
  };
  const fmap = fontFamily ? fontMap[fontFamily] : undefined;
  const fontHref = fmap
    ? `https://fonts.googleapis.com/css2?family=${fmap.gf}&display=swap`
    : null;
  const fontName = fmap?.name;
  // Helper: trim newline iniziali/finali e converte ogni sequenza di
  // newline (uno o più) in un singolo <br>. Evita "righe vuote fantasma"
  // tra strofe e tra titolo e testo seguente.
  const txt = (s: string) =>
    escapeHtml(s.replace(/^\n+|\n+$/g, "")).replace(/\n+/g, "<br>");

  // Post-processing: la PRIMA "rubric" che segue un readingTitle (es.
  // "Dalla lettera...") va trattata come "readingRef" — più grande, stessa
  // dimensione del body. Le altre rubric restano piccole.
  let lastNonSpacerKind: SegKind | null = null;
  const processed: Segment[] = segments.map((seg) => {
    if (seg.kind === "rubric" && lastNonSpacerKind === "readingTitle") {
      lastNonSpacerKind = "rubric";
      return { kind: "readingRef", text: seg.text };
    }
    if (seg.kind !== "spacer") {
      lastNonSpacerKind = seg.kind;
    }
    return seg;
  });

  const body = processed
    .map((seg) => {
      switch (seg.kind) {
        case "spacer":
          return ``;
        case "sectionTitle":
          return `<h2 class="section-title">${escapeHtml(seg.text)}</h2>`;
        case "sectionTitleBreak":
          // Forza un salto pagina (CSS columns) prima di questo titolo.
          // Per maggiore affidabilità del browser, usiamo un div dedicato
          // con break-before:column SEPARATO dal titolo h2.
          return `<div class="page-break-spacer"></div><h2 class="section-title">${escapeHtml(seg.text)}</h2>`;
        case "antifonaTitle":
          return `<h3 class="antifona-title">${escapeHtml(seg.text)}</h3>`;
        case "readingTitle":
          return `<h3 class="reading-title">${escapeHtml(seg.text)}</h3>`;
        case "orazioneTitle":
          return `<h3 class="orazione-title">${escapeHtml(seg.text)}</h3>`;
        case "subtitle":
          return `<h3 class="subtitle">${escapeHtml(seg.text)}</h3>`;
        case "peTitle":
          return `<h3 class="pe-title">${escapeHtml(seg.text)}</h3>`;
        case "rubric":
          return `<p class="rubric">${txt(seg.text)}</p>`;
        case "readingRef":
          // Riferimento biblico sotto Lettura/Vangelo: rosso ma di
          // dimensione uguale al body (era 0.7em → ora 1em).
          return `<p class="reading-ref">${txt(seg.text)}</p>`;
        case "celebrante":
          return `<p class="celebrante">${txt(seg.text)}</p>`;
        case "assemblea":
          return `<p class="assemblea">${txt(seg.text)}</p>`;
        case "umili":
          return `<p class="umili">${txt(seg.text)}</p>`;
        case "salmo":
          return `<p class="salmo">${salmoToHtml(seg.text.replace(/^\n+|\n+$/g, ""))}</p>`;
        case "preghieraFedeli":
          return `<p class="preghiera-fedeli">${preghieraFedeliToHtml(seg.text)}</p>`;
        case "peText":
          return `<div class="pe-text">${peTextToHtml(seg.text.replace(/^\n+|\n+$/g, ""))}</div>`;
        case "peDossologia":
          return `<p class="pe-dossologia">${txt(seg.text)}</p>`;
        default:
          return `<p>${txt(seg.text)}</p>`;
      }
    })
    .join("");

  const ff = fontName ? `'${fontName}', ` : "";
  const bg = colors?.background || "#000000";
  const textColor = colors?.textPrimary || "#FFFFFF";
  const fs = Math.round(fontSize);

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover">
${fontHref ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontHref}">` : ""}
<style>
  * { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
  html, body { margin: 0; padding: 0; height: 100vh; width: 100vw; overflow: hidden; background: ${bg}; color: ${textColor}; }
  body {
    font-family: ${ff}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: ${fs}px;
    line-height: 1.7;
    overscroll-behavior: none;
  }
  #book {
    height: 100vh;
    width: 100vw;
    column-width: 100vw;
    column-gap: 0;
    column-fill: auto;
    padding: 0;
    margin: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -ms-overflow-style: none;
    scrollbar-width: none;
    touch-action: pan-x;
    overscroll-behavior-x: contain;
  }
  #book::-webkit-scrollbar { display: none; height: 0; width: 0; }
  #book > * { scroll-snap-align: start; padding-left: 16px; padding-right: 16px; }
  /* Top/bottom spacing applied as margin on first/last so columns are always exactly 100vw wide */
  #book > *:first-child { margin-top: 8px; }
  #book > *:last-child { margin-bottom: 28px; }

  /* Tutti i font-size dei figli sono in 'em' (relativi al body.font-size).
     Così basta cambiare document.body.style.fontSize per scalare TUTTO
     dinamicamente senza dover rigenerare l'HTML. */
  h2.section-title { font-size: 1.05em; font-weight: 800; color: #4DA8DA; margin: 16px 0 4px 0; line-height: 1.15; break-after: avoid-column; }
  h3.antifona-title { font-size: 0.85em; font-weight: 800; color: #FFB74D; margin: 24px 0 4px 0; line-height: 1.1; break-after: avoid-column; }
  h3.reading-title { font-size: 0.85em; font-weight: 800; color: #81C784; margin: 14px 0 4px 0; line-height: 1.1; break-after: avoid-column; }
  h3.orazione-title { font-size: 0.85em; font-weight: 800; color: #CE93D8; margin: 14px 0 4px 0; line-height: 1.1; break-after: avoid-column; }
  h3.subtitle { font-size: 0.85em; font-weight: 700; color: ${textColor}; margin: 12px 0 4px 0; line-height: 1.1; break-after: avoid-column; }
  h3.pe-title { font-size: 0.78em; font-weight: 800; color: #66BB6A; margin: 12px 0 6px 0; line-height: 1.1; break-after: avoid-column; }
  h2 + *, h3 + * { margin-top: 0 !important; }
  #book > *:first-child { margin-top: 0 !important; }

  p { margin: 4px 0 8px 0; }
  p.rubric { color: #E57373; font-style: italic; font-size: 0.7em; line-height: 1.2; margin: 6px 0; }
  /* Riferimento biblico sotto Lettura/Vangelo: rosso (italico),
     stessa dimensione del body per migliore leggibilità. */
  p.reading-ref { color: #E57373; font-style: italic; font-size: 1em; line-height: 1.4; margin: 4px 0 8px 0; }
  p.celebrante { font-size: 1em; color: ${textColor}; margin: 4px 0 10px 0; }
  p.assemblea { font-size: 0.95em; color: ${textColor}; font-style: italic; margin: 4px 0 10px 0; }
  p.umili { font-size: 0.85em; color: ${textColor}; margin: 4px 0 10px 0; line-height: 1.55; }
  p.salmo { font-size: 1em; color: ${textColor}; line-height: 1.55; margin: 6px 0; }
  span.salmo-r { color: #E57373; font-weight: 700; }
  /* Preghiera dei Fedeli: R/. in rosso, riga vuota dopo (gestita da
     preghieraFedeliToHtml che inserisce un <br> aggiuntivo). */
  p.preghiera-fedeli { font-size: 1em; color: ${textColor}; line-height: 1.7; margin: 6px 0; }
  span.resp-r { color: #E57373; font-weight: 700; }
  div.pe-text { font-size: 1em; color: ${textColor}; }
  span.pe-consacration { color: #29B6F6; padding: 0 4px; }
  div.pe-dossologia-label { font-size: 0.78em; font-weight: 800; color: #29B6F6; margin: 12px 0 0 0; line-height: 1.1; }
  div.pe-dossologia-label + * { margin-top: 0 !important; }
  div.pe-dossologia { font-size: 1em; color: ${textColor}; text-transform: uppercase; line-height: 1.5; margin: 0 0 12px 0; }
  p.pe-dossologia { text-transform: uppercase; line-height: 1.5; }
  div.spacer { height: 16px; }
  /* Forza un salto di pagina (column-break) prima di un elemento.
     Usato per: Liturgia della Parola (Prima Lettura), Prefazio.
     Lo spacer è un div dedicato con break-before:column — funziona
     più affidabilmente di break-before sull'h2 stesso. */
  div.page-break-spacer { break-before: column !important; -webkit-column-break-before: always !important; page-break-before: always !important; height: 0; margin: 0; padding: 0; display: block; }
  .force-page-break { break-before: column !important; -webkit-column-break-before: always !important; page-break-before: always !important; }
</style>
</head>
<body>
<div id="book">${body}</div>
<script>
  (function() {
    var book = document.getElementById('book');
    function W() { return window.innerWidth; }
    function totalPages() { return Math.max(1, Math.round(book.scrollWidth / W())); }
    function currentPage() { return Math.round(book.scrollLeft / W()); }
    function postState() {
      var msg = JSON.stringify({
        type: 'state',
        page: currentPage(),
        total: totalPages()
      });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.parent && window.parent !== window) {
        // Su web preview siamo in un iframe: postMessage al parent
        try { window.parent.postMessage(msg, '*'); } catch (e) {}
      }
    }
    // Slide animato 250ms con curva ease-out (cubic).
    // Anima scrollLeft con requestAnimationFrame per controllare durata
    // (scroll-behavior:smooth nativo dura ~500ms, troppo lento).
    var isAnimating = false;
    function animateScroll(targetX, duration) {
      if (isAnimating) return;
      isAnimating = true;
      var startX = book.scrollLeft;
      var dx = targetX - startX;
      if (dx === 0) { isAnimating = false; return; }
      var startT = performance.now();
      function tick(now) {
        var p = Math.min(1, (now - startT) / duration);
        // ease-out cubic: veloce all'inizio, morbida alla fine
        var eased = 1 - Math.pow(1 - p, 3);
        book.scrollLeft = startX + dx * eased;
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          isAnimating = false;
          postState();
        }
      }
      requestAnimationFrame(tick);
    }
    function navigate(direction) {
      if (isAnimating) return;
      var W = window.innerWidth;
      var current = Math.round(book.scrollLeft / W);
      var total = Math.round(book.scrollWidth / W);
      var target = Math.max(0, Math.min(total - 1, current + direction));
      animateScroll(target * W, 250);
    }
    document.addEventListener('click', function(e) {
      var x = e.clientX;
      var w = window.innerWidth;
      navigate(x < w / 2 ? -1 : 1);
    }, { passive: true });

    // Swipe orizzontale: il browser nativo fa già lo scroll grazie a
    // overflow-x:auto + touch-action:pan-x + scroll-snap-type:x mandatory.
    // Quando l'utente solleva il dito, scroll-snap allinea automaticamente.
    // Quindi NON serve JS aggiuntivo per lo swipe — è già fluido.
    var scrollDebounce;
    book.addEventListener('scroll', function() {
      clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(postState, 80);
    }, { passive: true });
    function initialPost() {
      postState();
      setTimeout(postState, 300);
      setTimeout(postState, 800);
    }
    if (document.readyState === 'complete') initialPost();
    else window.addEventListener('load', initialPost);

    // Listener per messaggi da React Native (cambio dinamico fontSize).
    // Aggiorna document.body.style.fontSize: i figli usano 'em' quindi
    // si scalano automaticamente. Le CSS columns ricalcolano il layout
    // e la posizione di scroll viene riallineata alla pagina corrente.
    function applySetFontSize(size) {
      var prevW = W();
      var prevPage = Math.round(book.scrollLeft / prevW);
      document.body.style.fontSize = size + 'px';
      // Aspetta il reflow del browser (CSS columns ricalcolate)
      setTimeout(function() {
        var newW = window.innerWidth;
        var totalNow = Math.max(1, Math.round(book.scrollWidth / newW));
        var safeP = Math.min(prevPage, totalNow - 1);
        book.scrollLeft = safeP * newW;
        postState();
      }, 60);
    }
    function handleHostMessage(raw) {
      try {
        var m = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (m && m.type === 'setFontSize' && typeof m.size === 'number') {
          applySetFontSize(m.size);
        }
      } catch (e) {}
    }
    // WebView native: react-native-webview iniezione tramite document evt
    document.addEventListener('message', function(e) { handleHostMessage(e.data); });
    // Iframe web: parent posta via window.postMessage
    window.addEventListener('message', function(e) { handleHostMessage(e.data); });

    document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  })();
</script>
</body></html>`;
}


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
  // sectionTitleBreak forza un salto pagina (CSS column-break-before)
  // così Prima Lettura inizia sempre in una pagina nuova.
  push("sectionTitleBreak", "Liturgia della Parola");
  sp();
  addReading("prima_lettura", "readingTitle", "Prima Lettura");
  addReading("salmo", "readingTitle", "Salmo Responsoriale");
  addReading("seconda_lettura", "readingTitle", "Seconda Lettura");
  addReading("sequenza", "antifonaTitle", "Sequenza");
  // Acclamazione al Vangelo: verde come Salmo Responsoriale (era arancione)
  addReading("acclamazione", "readingTitle", "Acclamazione al Vangelo");
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
      // Kind dedicato: "preghieraFedeli" applica colore rosso a R/. e
      // garantisce una riga vuota dopo ogni R/.
      push("preghieraFedeli", orPrayer.body);
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
    // sectionTitleBreak: forza salto pagina prima del Prefazio (CSS column-break)
    push("sectionTitleBreak", "Prefazio");
    // Titolo del prefazio in VERDE (peTitle), coerente con /messa.
    push("peTitle", selectedPreface.title);
    push("normal", PREFACE_INTRO + "\n\n" + selectedPreface.text.trimEnd() + "\n\n" + SANTO_TEXT);
    sp();
  }

  // ===== PREGHIERA EUCARISTICA =====
  if (selectedPrayer) {
    // Se non c'è il sectionTitle "Prefazio" (caso PE con prefazio incorporato),
    // forziamo il salto pagina direttamente sul titolo "Preghiera Eucaristica".
    const peKind: SegKind =
      selectedPreface && !hasProperPreface ? "sectionTitle" : "sectionTitleBreak";
    push(peKind, "Preghiera Eucaristica");
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

// (Codice morto rimosso: paginate() e helper di chunking — non più necessari
//  con il rendering CSS columns nella WebView che impagina nativamente.)

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
    // Bottoni A- / A+ per dimensione font (vicino alla data nella topBar).
    fontBtns: {
      flexDirection: "row",
      gap: 14,           // più spazio tra A- e A+
      marginRight: 14,
      marginLeft: 6,
    },
    fontBtn: {
      minWidth: 64,           // più larghi (era 50)
      paddingHorizontal: 16,  // più padding (era 12)
      paddingVertical: 10,    // più alti (era 6)
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    fontBtnDisabled: {
      opacity: 0.35,
    },
    fontBtnText: {
      fontSize: Math.round(fontSize * 0.75),  // testo più grande (era 0.6)
      fontWeight: "800",
      color: "#FFFFFF",
    },
    pageArea: {
      flex: 1,
      overflow: "hidden",
    },
    // Stile della WebView: occupa tutta la pageArea, sfondo trasparente per
    // evitare il flash bianco al caricamento (il colore di sfondo viene
    // dato dal CSS interno della WebView via colors.background).
    webview: {
      flex: 1,
      backgroundColor: "transparent",
    },
    // Barra di progresso fissa in fondo alla pageArea. Sollevata di 10px dal
    // bordo per non essere coperta dai tasti di sistema su Android.
    progressTrack: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 10,
      height: 3,
      backgroundColor: "#2A2A2A", // grigio scuro elegante su sfondo nero
    },
    progressFill: {
      height: 3,
      backgroundColor: "#D4AF37", // oro liturgico, sobrio
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
      fontSize: Math.round(fontSize * 0.78),
      fontWeight: "800",
      color: "#66BB6A",
      marginTop: 6,
      marginBottom: 10,
      lineHeight: Math.round(fontSize * 0.95),
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
