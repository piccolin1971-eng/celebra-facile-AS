/**
 * /celebra — Modalità "Celebra la Messa" (lettura pulita per l'altare)
 *
 * Pensata per sacerdoti anziani ipovedenti: di default NESSUN toggle, NESSUN
 * selettore, NESSUNA scelta. Solo testo in macro-pagine orizzontali con tap
 * sx/dx per micro-pagine discrete (Engine C).
 *
 * Con l'opzione «Celebra subito» (Impostazioni) la Home apre /celebra con
 * indice overlay (parti a tasti pastello). A fine sezione si torna all'indice;
 * Prefazio/PE si cambiano dall'indice (Cambia prefazio / Cambia PE).
 *
 * Architettura del rendering (Engine C):
 *  - Segmenti nativi (<Text />) raggruppati in macro-pagine su sectionTitleBreak.
 *  - PagerView nativo per swipe orizzontale tra macro-pagine.
 *  - LiturgyPagedReader impacchetta i segmenti in micro-pagine misurate
 *    (packSegmentIndicesIntoPages; kindleBreak = salto pagina forzato).
 *  - Tap sx/dx: micro-pagina prec./succ. o macro-pagina / indice.
 *  - Font da expo-font in _layout (offline, nessun CDN).
 *
 * Le scelte (PE, prefazio, congedo, ecc.) vengono lette dalla sessione
 * giornaliera salvata da /messa (AsyncStorage).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Pressable,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
// react-native-pager-view: componente NATIVO stabile per swipe orizzontale
// tra pagine. Sostituisce la WebView (che crashava su Android+newArch) e
// non richiede motori web. Il rendering interno usa <Text /> nativi.
// IMPORTANTE: PagerView non supporta web. Importiamo via wrapper
// platform-specifico (pagerView.native.ts vs pagerView.web.ts) così Metro
// su web bundla solo lo stub null.
import PagerView from "../src/pagerView";
import { LiturgyPagedReader } from "../src/components/LiturgyPagedReader";
import { ReadingBrightnessButton, ReadingBrightnessRoot, ReadingBrightnessRow } from "../src/components/ReadingBrightnessControl";
import { PE_FIRST_PREAMBLE_ANCHORS } from "../src/peEngineSegments";
// expo-keep-awake: import LAZY tramite require() in useEffect.
// Motivo: in Expo SDK 54 + New Architecture, expo-keep-awake 15.x può
// fallire la registrazione del TurboModule all'avvio dello schermo,
// crashando l'intera app prima che useEffect parta. Con il require lazy
// dentro useEffect, un eventuale errore viene catturato dal try/catch
// senza propagare al render principale.
import { useSettings } from "../src/SettingsContext";

// ===========================================================================
// ErrorBoundary: cattura QUALUNQUE errore JS dentro CelebraScreen e mostra
// un fallback leggibile invece di crashare l'app. Critico su Android dove
// gli errori di TurboModule/Native non gestiti uccidono l'intero processo.
// ===========================================================================
class CelebraErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.warn("[celebra] ErrorBoundary caught:", error?.message, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000", padding: 24, justifyContent: "center" }}>
          <Text style={{ color: "#E57373", fontSize: 24, fontWeight: "700", marginBottom: 16, textAlign: "center" }}>
            Errore nella schermata "Celebra la Messa"
          </Text>
          <Text style={{ color: "#FFF", fontSize: 16, lineHeight: 24, marginBottom: 24, textAlign: "center" }}>
            {this.state.error?.message || "Errore sconosciuto"}
          </Text>
          <TouchableOpacity
            onPress={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset();
            }}
            style={{ backgroundColor: "#4DA8DA", padding: 16, borderRadius: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "700" }}>Torna alla Home</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children as any;
  }
}
import {
  api,
  Liturgy,
  Preface,
  EucharisticPrayer,
  MysteryAcclamation,
  SolemnBlessing,
} from "../src/api";
import { findCelebraSectionPageIndex, parseCelebraSectionId, type CelebraSectionId } from "../src/celebraIndex";
import { CelebraIndicePanel } from "../src/components/CelebraIndicePanel";
import { BrandScreenTitle } from "../src/components/BrandScreenTitle";
import { HomeCircleButton } from "../src/components/HomeCircleButton";
import { FontSizeButtons } from "../src/components/FontSizeButtons";
import { triggerAppHaptic } from "../src/appHaptics";
import { loadSession, saveSession, loadVotiveSession, saveVotiveSession, loadSessionForTarget, saveSessionForTarget, type MassSession, parseCelebrationMode, messaRouteDateParam, messaRouteModeParam, messaRouteVotiveParam, routeParamStr, type CelebrationMode, type SessionTarget } from "../src/massSession";
import { coerceCelebrationMode } from "../src/celebrationModeLabels";
import { getVigilEveContextForISO } from "../src/vigilCatalog";
import { reconcileLiturgyColors } from "../src/localLiturgy";
import { mergeSaintReadingsIntoLiturgy } from "../src/saintLectionary";
import { applyVotiveMassToLiturgy, type VotiveMassFull } from "../src/votiveLiturgy";
import { getLiturgicalSeasonKey } from "../src/prefaceUtils";
import { todayStr } from "../src/dateUtils";
import { buildSegments, preSplitSegments, type Segment } from "../src/liturgy/celebraSegments";
import { renderSegment, type LiturgyRenderColors } from "../src/liturgy/celebraRender";
import { makeStyles } from "../src/liturgy/celebraStyles";

// ===========================================================================
// Componente principale (wrapped in ErrorBoundary nell'export default)
// ===========================================================================
function CelebraScreenInner() {
  const fontSizeInitRef = useRef(true);
  const typographyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enginePaginating, setEnginePaginating] = useState(false);
  const [typographyEpoch, setTypographyEpoch] = useState(0);

  // Wakelock: tiene lo schermo acceso mentre la pagina è aperta. SOLO su
  // nativo Android: su web il browser nega il permesso e crashava
  // l'app, quindi skippiamo. LAZY require per evitare che eventuali errori
  // di registrazione TurboModule (Expo SDK 54 + newArch) crashino l'app.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = false;
    let deactivateFn: (() => void) | null = null;
    try {
      // require dinamico: se il modulo nativo non è disponibile o fallisce
      // la registrazione TurboModule, l'errore viene catturato qui sotto.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ka = require("expo-keep-awake");
      deactivateFn = ka.deactivateKeepAwake;
      ka.activateKeepAwakeAsync()
        .then(() => {
          active = true;
        })
        .catch(() => {
          // permesso negato o non supportato: prosegui senza wakelock
        });
    } catch (e) {
      // Modulo non disponibile (build senza expo-keep-awake o crash
      // TurboModule): proseguiamo senza wakelock, lo schermo si spegnerà
      // dopo il timeout di sistema. NON facciamo crashare l'app.
      console.warn("[celebra] expo-keep-awake non disponibile:", e);
    }
    return () => {
      if (active && deactivateFn) {
        try {
          deactivateFn();
        } catch {}
      }
    };
  }, []);

  const router = useRouter();
  const params = useLocalSearchParams<{
    date?: string;
    mode?: string;
    votive?: string;
    section?: string;
    from?: string;
    index?: string;
  }>();
  const { colors, fontSize, scaledFont, fontFamilyId, isBold, lineSpacing, celebraSubitoEnabled } = useSettings();

  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const baseLiturgyRef = useRef<Liturgy | null>(null);
  const [fixedParts, setFixedParts] = useState<Record<string, any> | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [acclamations, setAcclamations] = useState<MysteryAcclamation[]>([]);
  const [solemnBlessings, setSolemnBlessings] = useState<SolemnBlessing[]>([]);
  const [prayersOverPeople, setPrayersOverPeople] = useState<any[]>([]);
  const [pasquaDismissal, setPasquaDismissal] = useState<any>(null);
  const [currentSeasonKey, setCurrentSeasonKey] = useState<string>("ordinario");

  // Scelte caricate da AsyncStorage
  const [session, setSession] = useState<MassSession | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [celebrationMode, setCelebrationMode] = useState<CelebrationMode>("calendar_day");
  const [activeVotiveId, setActiveVotiveId] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  currentPageRef.current = currentPage;
  const keepPageOnRebuildRef = useRef(false);
  const pendingSectionRef = useRef<CelebraSectionId | null>(null);

  const routeDateParam = messaRouteDateParam(params);
  const routeModeParam = messaRouteModeParam(params);
  const routeVotiveParam = messaRouteVotiveParam(params);
  const routeSectionId = parseCelebraSectionId(params.section);
  /** Flusso Celebra subito: indice overlay, a fine sezione si torna all'indice. */
  const fromIndice = routeParamStr(params.from) === "indice";
  const openIndexFirst =
    fromIndice && (routeParamStr(params.index) === "1" || !routeSectionId);
  const [showIndiceModal, setShowIndiceModal] = useState(openIndexFirst);
  const [lastOpenedSection, setLastOpenedSection] = useState<CelebraSectionId | null>(
    routeSectionId,
  );

  // Sezione iniziale da URL (una sola volta); poi l'indice gestisce i salti in-page.
  useEffect(() => {
    if (routeSectionId) pendingSectionRef.current = routeSectionId;
  }, [routeSectionId]);

  // Sessione subito (AsyncStorage) così l'indice compare senza aspettare le API.
  useEffect(() => {
    if (!fromIndice || routeVotiveParam) return;
    let cancelled = false;
    (async () => {
      const dateKey = routeDateParam || todayStr();
      const mode = coerceCelebrationMode(
        parseCelebrationMode(routeModeParam),
        getVigilEveContextForISO(dateKey),
      );
      const saved = await loadSession(dateKey, mode);
      if (cancelled || !saved) return;
      setSession((prev) => prev ?? saved);
      setSessionDate((prev) => prev ?? dateKey);
      setCelebrationMode(mode);
      setHasSession(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromIndice, routeDateParam, routeModeParam, routeVotiveParam]);

  const currentSessionTarget = useMemo((): SessionTarget | null => {
    if (activeVotiveId) return { kind: "votive", votiveId: activeVotiveId };
    if (sessionDate) return { kind: "calendar", dateISO: sessionDate, mode: celebrationMode };
    return null;
  }, [activeVotiveId, sessionDate, celebrationMode]);

  const applyLiturgyForSession = useCallback(
    (base: Liturgy | null, saved: MassSession | null, mode: CelebrationMode) => {
      if (!base) {
        setLiturgy(null);
        return;
      }
      const reconciled = reconcileLiturgyColors({ ...base, celebrationMode: mode });
      setLiturgy(
        saved?.useSaintProperReadings === true
          ? mergeSaintReadingsIntoLiturgy(reconciled, true)
          : reconciled,
      );
    },
    [],
  );

  const reloadCelebrationData = useCallback(async () => {
    if (!currentSessionTarget) return;
    if (currentSessionTarget.kind === "votive") {
      const [lit, vm] = await Promise.all([api.liturgyToday("calendar_day"), api.votiveMasses()]);
      const mass = (vm.masses as VotiveMassFull[]).find(
        (m) => m.id === currentSessionTarget.votiveId,
      );
      const reconciled = mass
        ? applyVotiveMassToLiturgy(
            reconcileLiturgyColors({ ...lit, celebrationMode: "calendar_day" }),
            mass,
          )
        : reconcileLiturgyColors({ ...lit, celebrationMode: "calendar_day" });
      baseLiturgyRef.current = reconciled;
      const saved = await loadVotiveSession(currentSessionTarget.votiveId);
      if (saved) {
        setSession(saved);
        setHasSession(true);
      } else {
        setSession(null);
        setHasSession(false);
      }
      applyLiturgyForSession(reconciled, saved, "calendar_day");
      return;
    }
    const lit = await api.liturgyForDate(currentSessionTarget.dateISO, currentSessionTarget.mode);
    const reconciled = reconcileLiturgyColors({
      ...lit,
      celebrationMode: currentSessionTarget.mode,
    });
    baseLiturgyRef.current = reconciled;
    const saved = await loadSession(
      currentSessionTarget.dateISO,
      currentSessionTarget.mode,
    );
    if (saved) {
      setSession(saved);
      setHasSession(true);
    } else {
      setSession(null);
      setHasSession(false);
    }
    applyLiturgyForSession(reconciled, saved, currentSessionTarget.mode);
  }, [currentSessionTarget, applyLiturgyForSession]);

  const reloadSessionFromStorage = useCallback(async () => {
    await reloadCelebrationData();
  }, [reloadCelebrationData]);

  const patchSessionChoices = useCallback(
    (patch: Partial<MassSession>) => {
      if (!session || !currentSessionTarget) return;
      keepPageOnRebuildRef.current = true;
      const next: MassSession = { ...session, ...patch };
      setSession(next);
      void saveSessionForTarget(currentSessionTarget, next);
      if (
        typeof patch.useSaintProperReadings === "boolean" &&
        baseLiturgyRef.current
      ) {
        applyLiturgyForSession(
          baseLiturgyRef.current,
          next,
          currentSessionTarget.kind === "votive"
            ? "calendar_day"
            : currentSessionTarget.mode,
        );
      }
    },
    [session, currentSessionTarget, applyLiturgyForSession],
  );

  // Ref al PagerView nativo (per setPage in tap-to-advance).
  const pagerRef = useRef<PagerView | null>(null);

  const styles = makeStyles(colors, fontSize, fontFamilyId, isBold, lineSpacing);
  const liturgyColors = useMemo<LiturgyRenderColors>(
    () => ({
      markerCelebrant: colors.markerCelebrant,
      markerAssembly: colors.markerAssembly,
      cross: colors.rubrics,
      pePreambleNeedle:
        PE_FIRST_PREAMBLE_ANCHORS[session?.selectedPrayerId || ""] || undefined,
    }),
    [
      colors.markerCelebrant,
      colors.markerAssembly,
      colors.rubrics,
      session?.selectedPrayerId,
    ],
  );

  // ----- Caricamento dati -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (routeVotiveParam) {
          const [lit, parts, pr, pe, acc, bless, vm] = await Promise.all([
            api.liturgyToday("calendar_day"),
            api.fixedParts(),
            api.prefaces(),
            api.eucharisticPrayers(),
            api.mysteryAcclamations(),
            api.solemnBlessings(),
            api.votiveMasses(),
          ]);
          if (cancelled) return;
          const mass = (vm.masses as VotiveMassFull[]).find((m) => m.id === routeVotiveParam);
          if (!mass) {
            setHasSession(false);
            return;
          }
          setActiveVotiveId(routeVotiveParam);
          const reconciled = applyVotiveMassToLiturgy(
            reconcileLiturgyColors({ ...lit, celebrationMode: "calendar_day" }),
            mass,
          );
          setSessionDate(lit?.date || todayStr());
          setCelebrationMode("calendar_day");
          const saved = await loadVotiveSession(routeVotiveParam);
          if (cancelled) return;
          baseLiturgyRef.current = reconciled;
          applyLiturgyForSession(reconciled, saved, "calendar_day");
          setFixedParts(parts.parts);
          setPrefaces(pr.prefaces);
          setPrayers(pe.prayers);
          setAcclamations(acc.acclamations);
          setSolemnBlessings(bless.blessings);
          setPasquaDismissal((bless as any).pasqua_dismissal);
          if (Array.isArray((bless as any).prayersOverPeople)) {
            setPrayersOverPeople((bless as any).prayersOverPeople);
          }
          const seasonKey = getLiturgicalSeasonKey(reconciled?.season?.season || "");
          setCurrentSeasonKey(seasonKey);
          if (saved) {
            setSession(saved);
            setHasSession(true);
          } else {
            setHasSession(false);
          }
          return;
        }

        setActiveVotiveId(null);
        const dateParam = routeDateParam;
        const provisionalKey = dateParam || todayStr();
        const mode = coerceCelebrationMode(
          parseCelebrationMode(routeModeParam),
          getVigilEveContextForISO(provisionalKey),
        );
        const [lit, parts, pr, pe, acc, bless] = await Promise.all([
          dateParam ? api.liturgyForDate(dateParam, mode) : api.liturgyToday(mode),
          api.fixedParts(),
          api.prefaces(),
          api.eucharisticPrayers(),
          api.mysteryAcclamations(),
          api.solemnBlessings(),
        ]);
        if (cancelled) return;
        const dateKey = lit?.date || provisionalKey;
        const reconciled = reconcileLiturgyColors({ ...lit, celebrationMode: mode });
        setSessionDate(dateKey);
        setCelebrationMode(mode);
        const saved = await loadSession(dateKey, mode);
        if (cancelled) return;
        baseLiturgyRef.current = reconciled;
        applyLiturgyForSession(reconciled, saved, mode);
        setFixedParts(parts.parts);
        setPrefaces(pr.prefaces);
        setPrayers(pe.prayers);
        setAcclamations(acc.acclamations);
        setSolemnBlessings(bless.blessings);
        setPasquaDismissal((bless as any).pasqua_dismissal);
        if (Array.isArray((bless as any).prayersOverPeople)) {
          setPrayersOverPeople((bless as any).prayersOverPeople);
        }
        const seasonKey = getLiturgicalSeasonKey(reconciled?.season?.season || "");
        setCurrentSeasonKey(seasonKey);
        if (saved) {
          setSession(saved);
          setHasSession(true);
        } else {
          setHasSession(false);
        }
      } catch (e) {
        if (__DEV__) console.log("Errore caricamento celebrazione:", e);
        if (!cancelled) setHasSession(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeDateParam, routeModeParam, routeVotiveParam, applyLiturgyForSession]);

  useFocusEffect(
    useCallback(() => {
      if (!currentSessionTarget || loading) return;
      void reloadSessionFromStorage();
    }, [currentSessionTarget, loading, reloadSessionFromStorage]),
  );

  // ----- Costruisce i segmenti dell'intera celebrazione -----
  const segments: Segment[] = useMemo(() => {
    if (!fixedParts || !session) return [];
    const raw = buildSegments({
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
    return preSplitSegments(raw);
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

  const macroPages = useMemo<Segment[][]>(() => {
    if (!segments.length) return [];
    const result: Segment[][] = [[]];
    for (const seg of segments) {
      const last = result[result.length - 1];
      const isBreak = seg.kind === "sectionTitleBreak";
      if (isBreak && last.length > 0) {
        result.push([seg]);
      } else {
        last.push(seg);
      }
    }
    return result;
  }, [segments]);

  const pages = macroPages;

  const engineMicroRef = useRef<Record<number, number>>({});
  const engineTotalRef = useRef<Record<number, number>>({});
  const engineMeasuringRef = useRef<Record<number, boolean>>({});
  const enginePageBottomPad = 48;

  const triggerEngineRemeasure = (pageIdx: number, savedMicro = 0) => {
    engineMicroRef.current[pageIdx] = savedMicro;
    engineMeasuringRef.current[pageIdx] = true;
    if (pageIdx === currentPageRef.current) {
      setEnginePaginating(true);
    }
    setTypographyEpoch((n) => n + 1);
  };

  // Firma stabile del contenuto: evita reset pagina quando cambiano solo preferenze
  // di sessione che non alterano i segmenti.
  const segmentSignature = useMemo(
    () => segments.map((s) => `${s.kind}\0${s.text.length}\0${s.text.slice(0, 64)}`).join("\x1e"),
    [segments],
  );

  const goToPage = (index: number, anchor: "start" | "restore" = "restore") => {
    const safe = Math.max(0, Math.min(index, pages.length - 1));
    if (safe === currentPage) return;
    if (anchor === "start") {
      engineMicroRef.current[safe] = 0;
    }
    if (PagerView && pagerRef.current?.setPage) {
      pagerRef.current.setPage(safe);
    } else {
      setCurrentPage(safe);
    }
  };

  /** Celebra subito: a fine macro-pagina torna all'indice, non alla sezione successiva. */
  const goNextPageOrIndice = () => {
    if (fromIndice) {
      setShowIndiceModal(true);
      return;
    }
    goToPage(currentPage + 1, "start");
  };

  const openSectionFromIndice = useCallback(
    (sectionId: CelebraSectionId) => {
      setLastOpenedSection(sectionId);
      setShowIndiceModal(false);
      pendingSectionRef.current = sectionId;
      if (pages.length === 0) return;
      const idx = findCelebraSectionPageIndex(pages, sectionId);
      if (idx >= 0) {
        pendingSectionRef.current = null;
        const safe = Math.max(0, Math.min(idx, pages.length - 1));
        engineMicroRef.current[safe] = 0;
        currentPageRef.current = safe;
        if (PagerView && pagerRef.current?.setPage) {
          pagerRef.current.setPage(safe);
        }
        setCurrentPage(safe);
        triggerEngineRemeasure(safe, 0);
      }
    },
    [pages],
  );

  const tapNext = () => {
    if (enginePaginating) return;
    void triggerAppHaptic("light");
    const page = currentPage;
    const micro = engineMicroRef.current[page] ?? 0;
    const total = engineTotalRef.current[page] ?? 1;
    if (micro + 1 < total) {
      engineMicroRef.current[page] = micro + 1;
      return;
    }
    goNextPageOrIndice();
  };

  const tapPrev = () => {
    if (enginePaginating) return;
    void triggerAppHaptic("light");
    const page = currentPage;
    const micro = engineMicroRef.current[page] ?? 0;
    const total = engineTotalRef.current[page] ?? 1;
    if (micro > 0) {
      engineMicroRef.current[page] = micro - 1;
      return;
    }
    if (fromIndice) {
      setShowIndiceModal(true);
      return;
    }
    goToPage(currentPage - 1, "restore");
  };

  const renderSegmentWithLayout = (
    seg: Segment,
    i: number,
    j: number,
  ): React.ReactNode => {
    const key = `${i}-${j}-e${typographyEpoch}`;
    return renderSegment(seg, key, styles, liturgyColors);
  };

  // Reset pagina solo quando cambia il contenuto liturgico (non al ridimensionamento font).
  // Se l'utente ha appena scelto prefazio/PE, resta sulla stessa macro-pagina.
  // Con sezione da indice salta alla macro-pagina richiesta.
  useEffect(() => {
    engineMicroRef.current = {};
    engineTotalRef.current = {};
    engineMeasuringRef.current = {};

    const keep = keepPageOnRebuildRef.current;
    keepPageOnRebuildRef.current = false;
    let target = keep
      ? Math.max(0, Math.min(currentPageRef.current, Math.max(0, pages.length - 1)))
      : 0;
    const sectionId = pendingSectionRef.current;
    if (sectionId && pages.length > 0) {
      const idx = findCelebraSectionPageIndex(pages, sectionId);
      if (idx >= 0) {
        target = idx;
        pendingSectionRef.current = null;
      } else if (segments.length > 0) {
        pendingSectionRef.current = null;
      }
    }
    setCurrentPage(target);
    currentPageRef.current = target;
    if (pagerRef.current) {
      try {
        // @ts-ignore
        pagerRef.current.setPageWithoutAnimation?.(target);
      } catch {}
    }
    triggerEngineRemeasure(target, 0);
  }, [segmentSignature, pages.length]);

  // A-/A+: aspetta che i tap si fermino, poi reimpagina una volta sola.
  useEffect(() => {
    if (fontSizeInitRef.current) {
      fontSizeInitRef.current = false;
      return;
    }
    const page = currentPageRef.current;
    engineMicroRef.current[page] = 0;
    engineMeasuringRef.current[page] = true;
    setEnginePaginating(true);
    if (typographyDebounceRef.current) clearTimeout(typographyDebounceRef.current);
    typographyDebounceRef.current = setTimeout(() => {
      typographyDebounceRef.current = null;
      setTypographyEpoch((n) => n + 1);
    }, 300);
    return () => {
      if (typographyDebounceRef.current) {
        clearTimeout(typographyDebounceRef.current);
        typographyDebounceRef.current = null;
      }
    };
  }, [fontSize, fontFamilyId, isBold, lineSpacing]);

  // ----- Rendering -----
  const renderEngineReader = (pageSegments: Segment[], pageIdx: number) => (
    <LiturgyPagedReader
      key={`engine-${pageIdx}`}
      segments={pageSegments}
      microIndex={engineMicroRef.current[pageIdx] ?? 0}
      paddingBottom={enginePageBottomPad}
      contentContainerStyle={styles.nativePageContent}
      remountKey={`${typographyEpoch}`}
      fontSize={fontSize}
      renderSegment={(seg, j) => renderSegmentWithLayout(seg as Segment, pageIdx, j)}
      onPagesReady={(total) => {
        engineTotalRef.current[pageIdx] = total;
        engineMeasuringRef.current[pageIdx] = false;
        const mi = Math.min(
          engineMicroRef.current[pageIdx] ?? 0,
          Math.max(0, total - 1),
        );
        engineMicroRef.current[pageIdx] = mi;
        if (pageIdx === currentPageRef.current) {
          setEnginePaginating(false);
        }
      }}
      onMeasuring={(m) => {
        engineMeasuringRef.current[pageIdx] = m;
        if (pageIdx === currentPageRef.current) {
          setEnginePaginating(m);
        }
      }}
    />
  );

  const indicePanel = (
    <CelebraIndicePanel
      colors={colors}
      fontSize={fontSize}
      scaledFont={scaledFont}
      fontFamilyId={fontFamilyId}
      isBold={isBold}
      session={session}
      prefaces={prefaces}
      prayers={prayers}
      liturgy={liturgy}
      baseLiturgy={baseLiturgyRef.current}
      currentSeasonKey={currentSeasonKey}
      loading={loading}
      lastOpenedSection={lastOpenedSection}
      listVisible={showIndiceModal}
      onHome={() => router.replace("/")}
      onOpenSection={openSectionFromIndice}
      onPatchSession={(patch) => {
        if (!session) return;
        if (!currentSessionTarget && sessionDate) {
          const next = { ...session, ...patch };
          setSession(next);
          void saveSession(sessionDate, celebrationMode, next);
          if (
            typeof patch.useSaintProperReadings === "boolean" &&
            baseLiturgyRef.current
          ) {
            applyLiturgyForSession(baseLiturgyRef.current, next, celebrationMode);
          }
          return;
        }
        patchSessionChoices(patch);
      }}
    />
  );

  if (loading && fromIndice && showIndiceModal) {
    return (
      <SafeAreaView style={styles.container} testID="celebra-indice-loading">
        {indicePanel}
      </SafeAreaView>
    );
  }

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
          <HomeCircleButton onPress={() => router.replace("/")} testID="btn-back-home" />
          <BrandScreenTitle
            title="Celebra la Messa"
            textStyle={styles.title}
            markSize={Math.max(28, Math.round(fontSize * 0.85))}
          />
          <View style={{ width: 88 }} />
        </View>
        <View style={styles.emptyBox}>
          <Ionicons name="information-circle-outline" size={scaledFont(60)} color={colors.primary} />
          <Text style={styles.emptyTitle}>Devi prima preparare la liturgia</Text>
          <Text style={styles.emptyText}>
            Vai su <Text style={{ fontWeight: "800" }}>"Scegli la liturgia"</Text> e fai le scelte
            (prefazio, preghiera eucaristica, congedo…). In fondo al Congedo tocca{" "}
            <Text style={{ fontWeight: "800", color: colors.primary }}>
              "Preparazione completata — torna alla home"
            </Text>
            , poi da lì apri <Text style={{ fontWeight: "800" }}>"Celebra la Messa"</Text>.
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

  return (
    <SafeAreaView style={styles.container} testID="celebra-screen">
      {/* Top bar: home + indice + titolo + A−/A+ ; luminosità = 2ª riga */}
      <View>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <HomeCircleButton onPress={() => router.replace("/")} testID="btn-back-home" />
            {fromIndice ? (
              <TouchableOpacity
                style={styles.indiceBtn}
                onPress={() => setShowIndiceModal(true)}
                testID="btn-celebra-indice"
                accessibilityRole="button"
                accessibilityLabel="Torna all'indice delle parti"
              >
                <Text style={styles.indiceBtnText}>Indice</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <BrandScreenTitle
            title="Celebra la Messa"
            textStyle={styles.title}
            numberOfLines={1}
            markSize={Math.max(28, Math.round(fontSize * 0.85))}
          />
          <View style={styles.fontBtns}>
            <FontSizeButtons
              extraDisabled={enginePaginating}
              decreaseTestID="btn-font-decrease"
              increaseTestID="btn-font-increase"
            />
            <ReadingBrightnessButton />
          </View>
        </View>
        <ReadingBrightnessRow />
      </View>

      {/* Area di lettura: PagerView nativo con swipe orizzontale tra pagine.
          Sostituisce la WebView (che crashava su Android+newArch). Ogni
          pagina è un View con i segmenti renderizzati nativamente con Text.
          Tap a sinistra = pagina precedente, tap a destra = pagina successiva. */}
      <View
        style={styles.pageArea}
        testID="celebra-tap-area"
      >
        {!segments.length || pages.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            {Platform.OS === "web" || !PagerView ? (
              <View style={{ flex: 1, overflow: "hidden" }}>
                {renderEngineReader(
                  pages[Math.min(currentPage, pages.length - 1)],
                  currentPage,
                )}
              </View>
            ) : (
              <PagerView
                ref={pagerRef}
                style={{ flex: 1 }}
                initialPage={0}
                orientation="horizontal"
                scrollEnabled={!fromIndice}
                offscreenPageLimit={1}
                onPageSelected={(e: any) => {
                  const pos = e.nativeEvent.position;
                  const prev = currentPageRef.current;
                  if (pos === prev) return;
                  if (fromIndice && pos !== prev) {
                    try {
                      // @ts-ignore
                      pagerRef.current?.setPageWithoutAnimation?.(prev);
                    } catch {}
                    setShowIndiceModal(true);
                    return;
                  }
                  if (pos > prev) {
                    engineMicroRef.current[pos] = 0;
                  }
                  setCurrentPage(pos);
                }}
                testID="celebra-pager"
              >
                {pages.map((pageSegments, i) => (
                  <View key={`page-${i}`} style={{ flex: 1 }} collapsable={false}>
                    {renderEngineReader(pageSegments, i)}
                  </View>
                ))}
              </PagerView>
            )}
            {/* Tap zones (30% sx + 70% dx): micro-pagina o macro-pagina / indice. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={{ flex: 1, flexDirection: "row" }}>
                <Pressable
                  style={{ width: "30%" }}
                  onPress={tapPrev}
                  testID="celebra-tap-prev"
                  accessibilityLabel="Indietro / pagina precedente"
                />
                <Pressable
                  style={{ width: "70%" }}
                  onPress={tapNext}
                  testID="celebra-tap-next"
                  accessibilityLabel="Avanti / pagina successiva"
                />
              </View>
            </View>
            {enginePaginating ? (
              <View
                style={styles.enginePaginatingOverlay}
                pointerEvents="auto"
                testID="celebra-engine-paginating"
              >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.enginePaginatingText}>Impaginazione…</Text>
              </View>
            ) : null}
            {/* Barra di progresso rimossa (richiesta utente v2.16.2):
                copriva 1-2 righe di testo in fondo che poi confondevano lo
                scroll smart. Le pagine sono già indicate dal contatore N/M
                in alto a destra. */}
          </>
        )}
      </View>

      {fromIndice ? (
        <Modal
          visible={showIndiceModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowIndiceModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {indicePanel}
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

// Export default wrapped in ErrorBoundary: se qualunque errore JS viene
// lanciato in CelebraScreenInner (incluso TurboModule, native module mancante,
// o errori in useEffect), l'utente vede una schermata di errore con un
// pulsante "Torna alla Home" invece di un crash dell'app.
export default function CelebraScreen() {
  // Hook router al livello dell'export per il reset (l'ErrorBoundary è una
  // class component che non può usare hooks direttamente).
  const router = useRouter();
  return (
    <CelebraErrorBoundary onReset={() => router.replace("/")}>
      <ReadingBrightnessRoot>
        <CelebraScreenInner />
      </ReadingBrightnessRoot>
    </CelebraErrorBoundary>
  );
}
