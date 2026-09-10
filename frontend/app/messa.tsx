import React, { useCallback, useEffect, useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Switch, Pressable, Platform, useWindowDimensions, TextInput, type GestureResponderEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useSettings } from "../src/SettingsContext";
import { api, Liturgy, Preface, EucharisticPrayer, MysteryAcclamation, SolemnBlessing } from "../src/api";
import { PrefaceSelectorModal } from "../src/components/PrefaceSelectorModal";
import { getOrazionaleSections, getPrayerById, suggestPrayerForLiturgy, OrazionalePrayer } from "../src/orazionale";
import { splitFedeliTextIntoChunks } from "../src/orazionaleChunking";
import { loadSession, saveSession, loadVotiveSession, saveVotiveSession, saveSessionForTarget, loadSessionForTarget, cleanupOldSessions, MassSession, parseCelebrationMode, messaRouteDateParam, messaRouteModeParam, messaRouteVotiveParam, type CelebrationMode, type SessionTarget, DEFAULT_CONGEDO_ID } from "../src/massSession";
import { todayStr, parseLocalDate, italianDateLabel } from "../src/dateUtils";
import { LiturgyDayBanner } from "../src/components/LiturgyDayBanner";
import { BrandScreenTitle } from "../src/components/BrandScreenTitle";
import { HomeCircleButton } from "../src/components/HomeCircleButton";
import { FontSizeButtons } from "../src/components/FontSizeButtons";
import { MessaVigilIntroSection } from "../src/components/MessaVigilIntroSection";
import { getVigilEveContextForISO } from "../src/vigilCatalog";
import {
  availableCelebrationModes,
  coerceCelebrationMode,
  liturgyTitleForMode,
  celebrationKindLabel,
} from "../src/celebrationModeLabels";
import {
  favoriteFromTarget,
  isLiturgyFavorite,
  toggleLiturgyFavorite,
  MAX_LITURGY_FAVORITES,
} from "../src/liturgyFavorites";
import { reconcileLiturgyColors } from "../src/localLiturgy";
import { getLiturgicalSeasonKey, getSuggestedPrefacesForLiturgy } from "../src/prefaceUtils";
import { getMassToggleDefaults } from "../src/massToggleDefaults";
import {
  mergeSaintReadingsIntoLiturgy,
  shouldOfferSaintProperToggle,
} from "../src/saintLectionary";
import {
  applyVotiveMassToLiturgy,
  getVotiveMassDefaultChoices,
  resolveVotivePrefaceId,
  votiveSessionNeedsDefaultRepair,
  type VotiveMassFull,
} from "../src/votiveLiturgy";
import {
  BODY_LINE_HEIGHT,
  liturgyLineHeight,
} from "../src/liturgyTypography";
import peFullData from "../src/data/eucharisticPrayersFull.json";
import {
  renderSalmoResponsorialText,
  renderOrazionaleOrFedeliText,
} from "../src/responsorialRendering";
import { DialogueLine } from "../src/components/DialogueLine";
import { PREFACE_DIALOGUES } from "../src/liturgy/prefaceIntro";
import { isPeConsecrationLine, isPe1RubricLine, PE1_RUBRIC_PREFIX, renderPeLineWithRedCross, unwrapPe1RubricLine } from "../src/liturgy/peLineRendering";

import {
  isWebInteractiveTarget,
  massPageSection,
  resolveMassPageIndex,
} from "../src/massPrep/messaPaging";
import { suggestCommunicantesId } from "../src/massPrep/suggestCommunicantes";
import { makeStyles } from "../src/massPrep/messaStyles";

type ReadingType =
  | "antifona_ingresso" | "colletta"
  | "prima_lettura" | "salmo" | "seconda_lettura" | "sequenza" | "acclamazione" | "vangelo"
  | "sulle_offerte" | "antifona_comunione" | "dopo_comunione";

export default function MessaScreen() {
  // Wakelock: tiene lo schermo acceso mentre la pagina di preparazione è
  // aperta. SOLO su native: su web il browser nega il permesso e
  // crashava l'app, quindi skippiamo. Wrappato in try/catch per sicurezza.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = false;
    activateKeepAwakeAsync()
      .then(() => {
        active = true;
      })
      .catch(() => {});
    return () => {
      if (active) {
        try {
          deactivateKeepAwake();
        } catch {}
      }
    };
  }, []);

  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; preface?: string; votive?: string; mode?: string }>();
  const {
    colors,
    fontSize,
    scaledFont,
    fontFamilyId,
    isBold,
    lineSpacing,
  } = useSettings();
  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [fixedParts, setFixedParts] = useState<Record<string, any> | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [acclamations, setAcclamations] = useState<MysteryAcclamation[]>([]);
  const [solemnBlessings, setSolemnBlessings] = useState<SolemnBlessing[]>([]);
  const [pasquaDismissal, setPasquaDismissal] = useState<any>(null);
  const [currentSeasonKey, setCurrentSeasonKey] = useState<string>("ordinario");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  const [padreNostroIntroId, setPadreNostroIntroId] = useState<string>("I");
  const [acclamationId, setAcclamationId] = useState<string>("A");
  const [useSolemnBlessing, setUseSolemnBlessing] = useState<boolean>(false);
  const [solemnBlessingId, setSolemnBlessingId] = useState<string>("");
  // Orazione sul popolo (Messale 2020, 28 formule)
  const [useOrazionePopolo, setUseOrazionePopolo] = useState<boolean>(false);
  const [orazionePopoloId, setOrazionePopoloId] = useState<string>("");
  const [prayersOverPeople, setPrayersOverPeople] = useState<{ id: string; num: number; text: string }[]>([]);
  const [showGloria, setShowGloria] = useState<boolean>(false);
  const [showCredo, setShowCredo] = useState<boolean>(false);
  const [showAntifone, setShowAntifone] = useState<boolean>(false);
  const [congedoId, setCongedoId] = useState(DEFAULT_CONGEDO_ID);
  const [benedizioneId, setBenedizioneId] = useState("A");

  const [showPrefaces, setShowPrefaces] = useState(false);
  const [expandedPrefaceSeason, setExpandedPrefaceSeason] = useState<string | null>(null);
  const [prefaceSearch, setPrefaceSearch] = useState("");
  const [showPrayers, setShowPrayers] = useState(false);
  const [showOrazionale, setShowOrazionale] = useState(false);

  // Preghiera dei fedeli (Orazionale)
  const [selectedOrazionaleId, setSelectedOrazionaleId] = useState<string>("");
  const [showOrazionalePray, setShowOrazionalePray] = useState<boolean>(false);
  const [useSaintProperReadings, setUseSaintProperReadings] = useState<boolean>(false);
  const [orazionaleSection, setOrazionaleSection] = useState<string | null>(null);

  // Paginazione: identità per chiave, non per indice (l'elenco pagine cambia con font/PE/letture).
  const [pageKey, setPageKey] = useState("intro");
  const scrollRef = React.useRef<ScrollView | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const advancePageRef = React.useRef<(() => void) | null>(null);
  const suppressSessionSaveRef = React.useRef(false);

  // Date corrente per session storage (key: data ISO)
  const [sessionDate, setSessionDate] = useState<string>("");
  const [activeVotiveId, setActiveVotiveId] = useState<string | null>(null);
  const [activeVotiveMeta, setActiveVotiveMeta] = useState<{ title: string; color: string } | null>(
    null,
  );
  const [celebrationMode, setCelebrationMode] = useState<CelebrationMode>("calendar_day");

  useEffect(() => {
    setPageKey("intro");
  }, [sessionDate, activeVotiveId, celebrationMode]);

  useEffect(() => {
    setPageKey((k) => (massPageSection(k) === "pe" ? "pe-cons-0" : k));
  }, [selectedPrayerId]);

  const goHomeWithDate = useCallback(() => {
    const date = sessionDate || messaRouteDateParam(params);
    router.replace(date ? { pathname: "/", params: { date } } : "/");
  }, [sessionDate, params, router]);
  /** Liturgia del giorno di calendario (fissa in vigilia: banner in alto + etichette pannello). */
  const [calendarDayLiturgy, setCalendarDayLiturgy] = useState<Liturgy | null>(null);
  /** Liturgia della modalità vespertina/solennità (separata dal giorno di calendario). */
  const [vigilModeLiturgy, setVigilModeLiturgy] = useState<Liturgy | null>(null);
  const calendarDayLiturgyRef = React.useRef(calendarDayLiturgy);
  calendarDayLiturgyRef.current = calendarDayLiturgy;
  const vigilModeLiturgyRef = React.useRef(vigilModeLiturgy);
  vigilModeLiturgyRef.current = vigilModeLiturgy;
  const liturgyLoadGenRef = React.useRef(0);
  const userPickedCelebrationModeRef = React.useRef(false);
  const prefacesRef = React.useRef<Preface[]>([]);
  const celebrationModeRef = React.useRef(celebrationMode);
  celebrationModeRef.current = celebrationMode;
  const applySessionFromStorageRef = React.useRef(
    (_saved: MassSession) => {},
  );
  const resetMassSessionChoicesRef = React.useRef(() => {});

  const vigilEve = useMemo(
    () => (sessionDate ? getVigilEveContextForISO(sessionDate) : null),
    [sessionDate],
  );

  // True quando le scelte iniziali sono state caricate (default + sessione salvata).
  // Solo dopo questo flag, il save automatico è attivo.
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [favoriteHint, setFavoriteHint] = useState<string | null>(null);

  const currentSessionTarget = useMemo((): SessionTarget | null => {
    if (activeVotiveId) return { kind: "votive", votiveId: activeVotiveId };
    if (sessionDate) return { kind: "calendar", dateISO: sessionDate, mode: celebrationMode };
    return null;
  }, [activeVotiveId, sessionDate, celebrationMode]);

  const styles = makeStyles(colors, fontSize, fontFamilyId, isBold, lineSpacing);

  const resetMassSessionChoices = useCallback(() => {
    setPenitentialForm("A");
    setPenitentialSeason("ordinario");
    setSelectedPrefaceId("");
    setSelectedPrayerId("pe2");
    setPeSelections({});
    setPePickerKey(null);
    setSelectedCredoId("niceno");
    setOrateFratresId("A");
    setPadreNostroIntroId("I");
    setAcclamationId("A");
    setUseSolemnBlessing(false);
    setSolemnBlessingId("");
    setUseOrazionePopolo(false);
    setOrazionePopoloId("");
    setShowGloria(false);
    setShowCredo(false);
    setShowAntifone(false);
    setCongedoId(DEFAULT_CONGEDO_ID);
    setBenedizioneId("A");
    setSelectedOrazionaleId("");
    setShowOrazionalePray(false);
    setUseSaintProperReadings(false);
  }, []);

  const applySessionFromStorage = useCallback(
    (saved: MassSession) => {
      if (typeof saved.showGloria === "boolean") setShowGloria(saved.showGloria);
      if (typeof saved.showCredo === "boolean") setShowCredo(saved.showCredo);
      if (typeof saved.showAntifone === "boolean") setShowAntifone(saved.showAntifone);
      if (typeof saved.showOrazionalePray === "boolean") setShowOrazionalePray(saved.showOrazionalePray);
      if (typeof saved.useSaintProperReadings === "boolean") {
        setUseSaintProperReadings(saved.useSaintProperReadings);
      }
      if (saved.selectedOrazionaleId) setSelectedOrazionaleId(saved.selectedOrazionaleId);
      if (saved.selectedPrefaceId) setSelectedPrefaceId(saved.selectedPrefaceId);
      if (saved.selectedPrayerId) setSelectedPrayerId(saved.selectedPrayerId);
      if (saved.peSelections && typeof saved.peSelections === "object") setPeSelections(saved.peSelections);
      if (typeof saved.useOrazionePopolo === "boolean") setUseOrazionePopolo(saved.useOrazionePopolo);
      if (saved.orazionePopoloId) setOrazionePopoloId(saved.orazionePopoloId);
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
    },
    [],
  );
  applySessionFromStorageRef.current = applySessionFromStorage;
  resetMassSessionChoicesRef.current = resetMassSessionChoices;

  const applyLiturgyChoicesFor = useCallback((lit: Liturgy) => {
    const seasonKey = getLiturgicalSeasonKey(lit?.season?.season || "");
    setCurrentSeasonKey(seasonKey);
    const suggested = getSuggestedPrefacesForLiturgy(prefacesRef.current, lit);
    const match = suggested[0] || prefacesRef.current[0];
    if (match) setSelectedPrefaceId(match.id);
    setPenitentialSeason(seasonKey === "passione" ? "quaresima" : seasonKey);
    const toggleDefaults = getMassToggleDefaults(lit);
    setShowGloria(toggleDefaults.showGloria);
    setShowCredo(toggleDefaults.showCredo);
    setShowOrazionalePray(toggleDefaults.showOrazionalePray);
    const suggestedOrId = suggestPrayerForLiturgy(lit);
    if (suggestedOrId) setSelectedOrazionaleId(suggestedOrId);
  }, []);

  const applyVotiveChoicesFor = useCallback((mass: VotiveMassFull, seasonName: string) => {
    const seasonKey = getLiturgicalSeasonKey(seasonName);
    setCurrentSeasonKey(seasonKey);
    const choices = getVotiveMassDefaultChoices(mass, seasonName);
    setPenitentialSeason(choices.penitentialSeason);
    setShowGloria(choices.showGloria);
    setShowCredo(choices.showCredo);
    setShowOrazionalePray(choices.showOrazionalePray);
    if (choices.prefaceId) {
      const forced = prefacesRef.current.find((p) => p.id === choices.prefaceId);
      if (forced) setSelectedPrefaceId(forced.id);
    }
    if (choices.orazionaleId) setSelectedOrazionaleId(choices.orazionaleId);
  }, []);

  const applyLiturgyDefaultsFor = useCallback(
    (lit: Liturgy) => {
      resetMassSessionChoices();
      const seasonKey = getLiturgicalSeasonKey(lit?.season?.season || "");
      setCurrentSeasonKey(seasonKey);
      const suggested = getSuggestedPrefacesForLiturgy(prefaces, lit);
      const match = suggested[0] || prefaces[0];
      if (match) setSelectedPrefaceId(match.id);
      setPenitentialSeason(seasonKey === "passione" ? "quaresima" : seasonKey);
      const toggleDefaults = getMassToggleDefaults(lit);
      setShowGloria(toggleDefaults.showGloria);
      setShowCredo(toggleDefaults.showCredo);
      setShowOrazionalePray(toggleDefaults.showOrazionalePray);
      const seasBless =
        solemnBlessings.find((b) => b.id === seasonKey) ||
        solemnBlessings.find((b) => b.season === seasonKey);
      if (seasBless) setSolemnBlessingId(seasBless.id);
      if (seasonKey === "pasqua") setCongedoId("pasqua_alleluia");
      const suggestedOrId = suggestPrayerForLiturgy(lit);
      if (suggestedOrId) setSelectedOrazionaleId(suggestedOrId);
    },
    [prefaces, solemnBlessings, resetMassSessionChoices],
  );

  const applyLiturgyDefaults = useCallback(() => {
    if (liturgy) applyLiturgyDefaultsFor(liturgy);
  }, [liturgy, applyLiturgyDefaultsFor]);

  const switchCelebrationMode = useCallback(
    async (newMode: CelebrationMode) => {
      if (!sessionDate) return;
      suppressSessionSaveRef.current = true;
      setCelebrationMode(newMode);
      if (newMode === "calendar_day" && calendarDayLiturgyRef.current) {
        setLiturgy(calendarDayLiturgyRef.current);
      } else if (
        newMode !== "calendar_day" &&
        vigilModeLiturgyRef.current?.celebrationMode === newMode
      ) {
        setLiturgy(vigilModeLiturgyRef.current);
      }
      try {
        const [saved, lit] = await Promise.all([
          loadSession(sessionDate, newMode),
          api.liturgyForDate(sessionDate, newMode),
        ]);
        const reconciled = reconcileLiturgyColors({ ...lit, celebrationMode: newMode });
        if (newMode === "calendar_day") {
          setVigilModeLiturgy(null);
          setLiturgy(calendarDayLiturgy ?? reconciled);
        } else {
          setVigilModeLiturgy(reconciled);
          setLiturgy(reconciled);
        }
        if (saved) {
          applySessionFromStorageRef.current(saved);
        }
        applyLiturgyChoicesFor(reconciled);
      } catch (e) {
        if (__DEV__) console.log("switchCelebrationMode err:", e);
      } finally {
        setTimeout(() => {
          suppressSessionSaveRef.current = false;
        }, 0);
      }
    },
    [sessionDate, applyLiturgyChoicesFor],
  );

  const handleSelectCelebrationMode = useCallback(
    (newMode: CelebrationMode) => {
      if (!sessionDate || newMode === celebrationModeRef.current) return;
      userPickedCelebrationModeRef.current = true;
      setCelebrationMode(newMode);
      void switchCelebrationMode(newMode);
    },
    [sessionDate, switchCelebrationMode],
  );

  const routeDateParam = messaRouteDateParam(params);
  const routeModeParam = messaRouteModeParam(params);
  const routeVotiveParam = messaRouteVotiveParam(params);
  const routePrefaceParam = typeof params.preface === "string" ? params.preface : "";

  useEffect(() => {
    userPickedCelebrationModeRef.current = false;
  }, [routeDateParam]);

  useEffect(() => {
    const gen = ++liturgyLoadGenRef.current;
    let cancelled = false;

    (async () => {
      setSessionLoaded(false);
      setLoadError(null);
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
          if (!parts?.parts) {
            setLoadError("Impossibile caricare i testi fissi della Messa. Verifica lo spazio libero e riprova.");
            setFixedParts(null);
            return;
          }
          const mass = (vm.masses as VotiveMassFull[]).find((m) => m.id === routeVotiveParam);
          if (!mass) {
            setLoadError("Messa votiva non trovata.");
            setFixedParts(null);
            return;
          }
          if (cancelled || gen !== liturgyLoadGenRef.current) return;
          setActiveVotiveId(routeVotiveParam);
          setActiveVotiveMeta({ title: mass.title, color: mass.color });
          setCalendarDayLiturgy(null);
          setVigilModeLiturgy(null);
          const reconciled = applyVotiveMassToLiturgy(
            reconcileLiturgyColors({
              ...lit,
              celebrationMode: "calendar_day",
            }),
            mass,
          );
          setLiturgy(reconciled);
          setFixedParts(parts.parts);
          setPrefaces(pr.prefaces);
          prefacesRef.current = pr.prefaces;
          setPrayers(pe.prayers);
          setAcclamations(acc.acclamations);
          setSolemnBlessings(bless.blessings);
          setPasquaDismissal(bless.pasqua_dismissal);
          if (Array.isArray((bless as any).prayersOverPeople)) {
            setPrayersOverPeople((bless as any).prayersOverPeople);
          }
          resetMassSessionChoicesRef.current();
          const seasBlessSeason = getLiturgicalSeasonKey(reconciled?.season?.season || "");
          const seasBless =
            bless.blessings.find((b) => b.id === seasBlessSeason) ||
            bless.blessings.find((b) => b.season === seasBlessSeason);
          if (seasBless) setSolemnBlessingId(seasBless.id);
          if (seasBlessSeason === "pasqua") setCongedoId("pasqua_alleluia");
          setSessionDate(lit?.date || todayStr());
          setCelebrationMode("calendar_day");
          const saved = await loadVotiveSession(routeVotiveParam);
          if (cancelled || gen !== liturgyLoadGenRef.current) return;
          if (saved) {
            applySessionFromStorageRef.current(saved);
            if (votiveSessionNeedsDefaultRepair(mass, saved.selectedPrefaceId)) {
              applyVotiveChoicesFor(mass, lit?.season?.season || "");
            }
          } else {
            applyVotiveChoicesFor(mass, lit?.season?.season || "");
            const routePreface = resolveVotivePrefaceId(routePrefaceParam);
            if (routePreface) {
              const forced = pr.prefaces.find((p) => p.id === routePreface);
              if (forced) setSelectedPrefaceId(forced.id);
            }
          }
          cleanupOldSessions();
          setSessionLoaded(true);
          return;
        }

        setActiveVotiveId(null);
        setActiveVotiveMeta(null);
        const dateParam = routeDateParam;
        const dateKey = dateParam || todayStr();
        const initialMode = coerceCelebrationMode(
          parseCelebrationMode(routeModeParam),
          getVigilEveContextForISO(dateKey),
        );
        const [lit, parts, pr, pe, acc, bless] = await Promise.all([
          dateParam
            ? api.liturgyForDate(dateParam, initialMode)
            : api.liturgyToday(initialMode),
          api.fixedParts(),
          api.prefaces(),
          api.eucharisticPrayers(),
          api.mysteryAcclamations(),
          api.solemnBlessings(),
        ]);
        if (!parts?.parts) {
          setLoadError("Impossibile caricare i testi fissi della Messa. Verifica lo spazio libero e riprova.");
          setFixedParts(null);
          return;
        }
        const reconciledInitial = reconcileLiturgyColors({
          ...lit,
          celebrationMode: initialMode,
        });
        setLiturgy(reconciledInitial);
        if (initialMode !== "calendar_day") {
          setVigilModeLiturgy(reconciledInitial);
        } else {
          setVigilModeLiturgy(null);
        }
        setFixedParts(parts.parts);
        setPrefaces(pr.prefaces);
        prefacesRef.current = pr.prefaces;
        setPrayers(pe.prayers);
        setAcclamations(acc.acclamations);
        setSolemnBlessings(bless.blessings);
        setPasquaDismissal(bless.pasqua_dismissal);
        // Orazioni sul popolo (28 formule del Messale 2020)
        if (Array.isArray((bless as any).prayersOverPeople)) {
          setPrayersOverPeople((bless as any).prayersOverPeople);
        }
        resetMassSessionChoicesRef.current();
        const seasBlessSeason = getLiturgicalSeasonKey(lit?.season?.season || "");
        const seasBless =
          bless.blessings.find((b) => b.id === seasBlessSeason) ||
          bless.blessings.find((b) => b.season === seasBlessSeason);
        if (seasBless) setSolemnBlessingId(seasBless.id);
        if (seasBlessSeason === "pasqua") setCongedoId("pasqua_alleluia");

        // === SESSION RESTORE ===
        const resolvedDateKey = lit?.date || dateKey;
        const vigilCtxForMode = getVigilEveContextForISO(resolvedDateKey);
        const resolvedMode = coerceCelebrationMode(
          parseCelebrationMode(routeModeParam),
          vigilCtxForMode,
        );
        const modeToApply = userPickedCelebrationModeRef.current
          ? celebrationModeRef.current
          : resolvedMode;

        if (cancelled || gen !== liturgyLoadGenRef.current) return;

        let activeReconciled = reconcileLiturgyColors({
          ...reconciledInitial,
          celebrationMode: modeToApply,
        });

        setSessionDate(resolvedDateKey);
        if (!userPickedCelebrationModeRef.current) {
          setCelebrationMode(modeToApply);
        }
        const saved = await loadSession(resolvedDateKey, modeToApply);
        if (cancelled || gen !== liturgyLoadGenRef.current) return;
        const vigilCtx = vigilCtxForMode;
        if (vigilCtx) {
          const calLit =
            modeToApply === "calendar_day"
              ? reconciledInitial
              : await api.liturgyForDate(resolvedDateKey, "calendar_day");
          if (cancelled || gen !== liturgyLoadGenRef.current) return;
          setCalendarDayLiturgy(
            reconcileLiturgyColors({ ...calLit, celebrationMode: "calendar_day" }),
          );
          const otherModes = availableCelebrationModes(vigilCtx).filter((m) => m !== modeToApply);
          void api.warmLiturgyModes(resolvedDateKey, otherModes);
          if (modeToApply === "calendar_day") {
            const altMode = vigilCtx.hasVigilProper ? "vigil_proper" : "solemnity_day";
            void api.liturgyForDate(resolvedDateKey, altMode).then((altLit) => {
              if (gen !== liturgyLoadGenRef.current) return;
              setVigilModeLiturgy(
                reconcileLiturgyColors({ ...altLit, celebrationMode: altMode }),
              );
            });
          }
        } else {
          setCalendarDayLiturgy(null);
        }
        if (modeToApply !== initialMode) {
          const modeLit = await api.liturgyForDate(resolvedDateKey, modeToApply);
          if (cancelled || gen !== liturgyLoadGenRef.current) return;
          activeReconciled = reconcileLiturgyColors({
            ...modeLit,
            celebrationMode: modeToApply,
          });
          if (modeToApply === "calendar_day") {
            setVigilModeLiturgy(null);
          } else {
            setVigilModeLiturgy(activeReconciled);
          }
          setLiturgy(activeReconciled);
        } else if (modeToApply !== "calendar_day") {
          activeReconciled = reconciledInitial;
          setVigilModeLiturgy(activeReconciled);
          setLiturgy(activeReconciled);
        } else {
          activeReconciled = reconciledInitial;
        }
        const prefaceParam = routePrefaceParam;
        if (saved) {
          applySessionFromStorageRef.current(saved);
        }
        applyLiturgyChoicesFor(activeReconciled);
        if (prefaceParam) {
          const forced = pr.prefaces.find((p) => p.id === prefaceParam);
          if (forced) setSelectedPrefaceId(forced.id);
        }
        // Pulisce sessioni vecchie in background
        cleanupOldSessions();
        if (cancelled || gen !== liturgyLoadGenRef.current) return;
        setSessionLoaded(true);
      } catch (e) {
        if (__DEV__) console.log("Errore:", e);
        if (cancelled || gen !== liturgyLoadGenRef.current) return;
        setLoadError("Errore nel caricamento della liturgia. Controlla la connessione o riprova.");
        setFixedParts(null);
      } finally {
        if (cancelled || gen !== liturgyLoadGenRef.current) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeDateParam, routeModeParam, routePrefaceParam, routeVotiveParam, applyLiturgyChoicesFor]);

  useEffect(() => {
    if (!sessionLoaded || !currentSessionTarget) {
      setIsStarred(false);
      return;
    }
    void isLiturgyFavorite(currentSessionTarget).then(setIsStarred);
  }, [sessionLoaded, currentSessionTarget]);

  const handleToggleFavorite = useCallback(async () => {
    if (!currentSessionTarget || !sessionLoaded) return;
    if (isStarred) {
      const fav = favoriteFromTarget(currentSessionTarget, {
        title: activeVotiveMeta?.title || liturgy?.title || "Liturgia",
        subtitle: "",
      });
      const res = await toggleLiturgyFavorite(fav);
      setIsStarred(res.starred);
      setFavoriteHint(res.starred ? null : "Rimossa da accesso rapido");
      return;
    }
    const title =
      activeVotiveMeta?.title ||
      liturgyTitleForMode(celebrationMode, liturgy?.title || "", vigilEve);
    const subtitle = activeVotiveId
      ? "Messa votiva"
      : `${italianDateLabel(parseLocalDate(sessionDate))} · ${celebrationKindLabel(
          celebrationMode,
          vigilEve,
        )}`;
    const liturgicalColor =
      activeVotiveMeta?.color || liturgy?.liturgical_color || liturgy?.season?.color;
    const fav = favoriteFromTarget(currentSessionTarget, { title, subtitle, liturgicalColor });
    const res = await toggleLiturgyFavorite(fav);
    if (res.error === "full") {
      setFavoriteHint(`Puoi salvare al massimo ${MAX_LITURGY_FAVORITES} liturgie in accesso rapido`);
      return;
    }
    setIsStarred(res.starred);
    setFavoriteHint(res.starred ? "Aggiunta ad accesso rapido" : null);
  }, [
    currentSessionTarget,
    sessionLoaded,
    isStarred,
    activeVotiveMeta,
    activeVotiveId,
    liturgy,
    celebrationMode,
    vigilEve,
    sessionDate,
  ]);

  // === SESSION AUTO-SAVE ===
  // Salva automaticamente le scelte del prete su AsyncStorage ogni volta
  // che cambiano. La chiave è la data della liturgia in corso.
  useEffect(() => {
    if (!sessionLoaded || !currentSessionTarget || suppressSessionSaveRef.current) return;
    const liturgyTitle =
      activeVotiveMeta?.title ||
      liturgyTitleForMode(celebrationMode, liturgy?.title || "", vigilEve);
    const session: MassSession = {
      celebrationMode,
      liturgyKind: activeVotiveId ? "votive" : "calendar",
      votiveId: activeVotiveId ?? undefined,
      liturgyTitle,
      showGloria, showCredo, showAntifone, showOrazionalePray,
      useSaintProperReadings,
      selectedOrazionaleId, selectedPrefaceId, selectedPrayerId,
      benedizioneId, congedoId, acclamationId, padreNostroIntroId,
      useSolemnBlessing, solemnBlessingId,
      penitentialForm, penitentialSeason, selectedCredoId, orateFratresId,
      peSelections,
      useOrazionePopolo, orazionePopoloId,
    };
    void saveSessionForTarget(currentSessionTarget, session);
  }, [sessionLoaded, currentSessionTarget, celebrationMode, activeVotiveId, activeVotiveMeta, liturgy?.title, vigilEve, showGloria, showCredo, showAntifone, showOrazionalePray,
      useSaintProperReadings,
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
  // un singolo testo piatto. Per pe1 le rubriche di gesto restano con marker interno.
  // Le 7 PE con prefazio incorporato (Messale Romano 2020).
  // In queste PE l'introduzione dialogica + il Santo sono parte integrante della preghiera.
  const PE_WITH_PROPER_PREFACE = ["pe4", "per_r1", "per_r2", "pvn_1", "pvn_2", "pvn_3", "pvn_4"];

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
    const hasProperPreface = PE_WITH_PROPER_PREFACE.includes(peFull.id);
    // Override per PE specifiche: regex che identifica l'esatta frase di chiusura
    // del prefazio dopo cui inserire il Santo. Necessario quando l'algoritmo
    // generico (inserimento prima della prima consacrazione) non basta perché
    // tra il prefazio e la consacrazione ci sono altri blocchi (es. epiclesi).
    const PE_SANTO_OVERRIDE: Record<string, RegExp> = {
      "per_r2": /l'inno di benedizione e di lode/i,
      "pvn_3": /cantando con gioia/i,
    };
    const santoOverrideRe = PE_SANTO_OVERRIDE[peFull.id];
    const SANTO_TEXT = "Santo, Santo, Santo il Signore Dio dell'universo.\nI cieli e la terra sono pieni della tua gloria.\nOsanna nell'alto dei cieli.\nBenedetto colui che viene nel nome del Signore.\nOsanna nell'alto dei cieli.";
    const parts: string[] = [];
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
      if (b.type === "acc") {
        // Le acclamazioni nei dati JSON sono di due tipi:
        //  1) il Santo (solo in pe4)
        //  2) il Mistero della Fede (in tutte)
        // L'app gestisce il Mistero della Fede con un selettore separato, e il
        // Santo viene inserito manualmente dopo la chiusura del prefazio.
        // Saltiamo quindi TUTTI i blocchi `acc`.
        continue;
      }
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
          // È una consacrazione (es. "PRENDETE, E MANGIATENE TUTTI...").
          // Se la PE ha prefazio incorporato e il Santo non è stato ancora
          // inserito, lo inseriamo qui PRIMA della consacrazione: questo è
          // l'ultimo punto sicuro dopo la chiusura del prefazio integrato.
          // (Se c'era un override ID-specifico, quello ha già inserito il Santo.)
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
        if (isPe1) parts.push(`${PE1_RUBRIC_PREFIX}${t}`);
        continue;
      }
      parts.push(t);
      // Override per ID-specifici: se la regex `santoOverrideRe` matcha l'ultimo
      // pezzo di questo blocco, inserisci il Santo subito dopo. Prevale sulla
      // logica generica (inserimento prima della prima Consacrazione).
      if (hasProperPreface && !santoInserted && santoOverrideRe && santoOverrideRe.test(t)) {
        parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
        santoInserted = true;
        continue;
      }
      // Fallback aggiuntivo: se il blocco appena pushato termina con "cantiamo..."
      // (chiusura tipica del prefazio integrato), inseriamo subito il Santo.
      if (hasProperPreface && !santoInserted && !santoOverrideRe) {
        if (/cantiamo\b[^.]{0,80}[:\.\,]?\s*$/i.test(t)) {
          parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
          santoInserted = true;
        }
      }
    }
    // Fallback: se per qualche motivo non abbiamo trovato la chiusura del prefazio
    // ma la PE dovrebbe averlo, aggiungilo prima della prima rubrica/anamnesi.
    if (hasProperPreface && !santoInserted) {
      // Non lo facciamo qui per non rischiare posizioni sbagliate.
      // Verrà segnalato dal codice in caso di rigressione.
    }
    // Concatenazione intelligente: se un blocco di testo NON termina con un
    // terminatore di frase (. ! ? :), allora unisce al successivo con \n
    // (riga semplice) invece di \n\n (paragrafo). Questo evita che il
    // chunker per pagine spezzi una frase liturgica continua come
    // "...santificare questi doni" + (rubrica) + "perché diventino il Corpo..."
    // dove la rubrica intermedia è solo gestuale.
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
      // Se il precedente termina con un terminatore di frase, paragrafo nuovo;
      // altrimenti continua sulla stessa frase (newline singolo).
      const sep = sentenceEnders.test(prevLast) ? "\n\n" : "\n";
      result += sep + cur;
    }
    // Marker SANTO: il Santo è preceduto dal marker `<<SANTO_BLANK>>` che
    // rappresenta una riga vuota prima del "Santo, Santo, Santo..." per dare
    // il giusto respiro visivo dopo la chiusura del prefazio (cantiamo:).
    result = result.replace(/<<SANTO_BLANK>>/g, "\n\n");
    return result;
  }, [peFull, peSelections, prayers, selectedPrayerId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (loadError || !fixedParts) {
    return (
      <SafeAreaView style={styles.container} testID="messa-load-error">
        <View style={styles.topBar}>
          <HomeCircleButton onPress={goHomeWithDate} testID="btn-back-home" />
          <BrandScreenTitle
            title="Scegli la liturgia"
            textStyle={styles.title}
            numberOfLines={1}
            markSize={Math.max(28, Math.round(fontSize * 0.85))}
          />
          <View style={{ width: 88 }} />
        </View>
        <View style={styles.loadErrorBox}>
          <Ionicons name="cloud-offline-outline" size={scaledFont(56)} color={colors.liturgicalRed} />
          <Text style={styles.loadErrorTitle}>Liturgia non disponibile</Text>
          <Text style={styles.loadErrorText}>
            {loadError || "I dati della Messa non sono stati caricati."}
          </Text>
          <TouchableOpacity
            style={styles.loadErrorBtn}
            onPress={goHomeWithDate}
            testID="btn-messa-error-home"
          >
            <Ionicons name="home" size={scaledFont(28)} color={colors.onPrimary} />
            <Text style={styles.loadErrorBtnText}>Torna alla Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedPreface = prefaces.find(p => p.id === selectedPrefaceId);
  const selectedPrayer = prayers.find(p => p.id === selectedPrayerId);
  const selectedOrazionale = selectedOrazionaleId ? getPrayerById(selectedOrazionaleId) : undefined;
  const offerSaintProperToggle = shouldOfferSaintProperToggle(liturgy);
  const effectiveLiturgy = liturgy
    ? mergeSaintReadingsIntoLiturgy(liturgy, useSaintProperReadings)
    : null;
  const getReading = (type: ReadingType) => effectiveLiturgy?.readings?.find(r => r.type === type);

  // Basic text renderers
  const R = ({ children, kind = "normal" }: { children: React.ReactNode; kind?: "normal" | "rubric" | "celebrante" | "assemblea" | "title" | "subtitle" | "antifonaTitle" | "readingTitle" | "orazioneTitle" | "ritoTitle" | "umili" | "peTitle" | "prefaceTitle" | "troparioTitle" }) => {
    const s = kind === "rubric" ? styles.rubric
      : kind === "celebrante" ? styles.celebrante
      : kind === "assemblea" ? styles.assemblea
      : kind === "title" ? styles.sectionTitle
      : kind === "subtitle" ? styles.subtitle
      : kind === "antifonaTitle" ? styles.antifonaTitle
      : kind === "readingTitle" ? styles.readingTitle
      : kind === "orazioneTitle" ? styles.orazioneTitle
      : kind === "ritoTitle" ? styles.ritoTitle
      : kind === "umili" ? styles.umili
      : kind === "peTitle" ? styles.peTitle
      : kind === "prefaceTitle" ? styles.prefaceTitle
      : kind === "troparioTitle" ? styles.troparioTitle
      : styles.text;
    return <Text style={s} selectable>{children}</Text>;
  };

  const D = ({ role, text }: { role: "celebrant" | "assembly"; text: string }) => (
    <DialogueLine
      role={role}
      text={text}
      baseStyle={role === "celebrant" ? styles.celebrante : styles.assemblea}
      markerColor={role === "celebrant" ? colors.markerCelebrant : colors.markerAssembly}
    />
  );

  const renderPrefaceDialogues = () => (
    <View style={styles.block}>
      {PREFACE_DIALOGUES.map((d, i) => (
        <View key={`pref-dlg-${i}`} style={styles.dialogBlock}>
          <D role="celebrant" text={d.c} />
          <D role="assembly" text={d.a} />
        </View>
      ))}
    </View>
  );

  // Renderer dedicato per il testo delle Preghiere Eucaristiche.
  // Le righe COMPLETAMENTE in maiuscolo (parole della consacrazione) sono in
  // azzurro (#29B6F6), peso normale (non grassetto). La croce ✠ è sempre rossa.
  const renderPeTextNormal = (text: string, keyPrefix = "pe") => {
    if (!text?.trim()) return null;
    const lines = text.split("\n");
    return (
      <View key={keyPrefix} collapsable={false} testID={`pe-text-${keyPrefix}`}>
        {lines.map((ln, i) => {
          const isRubric = isPe1RubricLine(ln);
          const display = unwrapPe1RubricLine(ln);
          const isCon = !isRubric && isPeConsecrationLine(display);
          const prevWasCon = i > 0 && isPeConsecrationLine(unwrapPe1RubricLine(lines[i - 1]));
          const needSpaceBefore = isCon && !prevWasCon && i > 0;
          if (!display) {
            return <View key={i} style={{ height: Math.round(fontSize * 0.45) }} />;
          }
          const lineStyle = isRubric
            ? styles.peRubric
            : isCon
              ? [styles.text, styles.peConsecration]
              : styles.text;
          return (
            <Text
              key={i}
              style={[lineStyle, needSpaceBefore ? { marginTop: Math.round(fontSize * 0.55) } : null]}
              selectable
            >
              {renderPeLineWithRedCross(
                display,
                isCon ? styles.peConsecration : styles.text,
                colors.rubrics,
              )}
            </Text>
          );
        })}
      </View>
    );
  };

  const renderPeText = (text: string, keyPrefix = "pe") => {
    if (!text) return null;
    const dosMarker = "<<DOSSOLOGIA>>";
    const dosIdx = text.indexOf(dosMarker);
    if (dosIdx >= 0) {
      const before = text.slice(0, dosIdx).replace(/\n+$/, "");
      const after = text.slice(dosIdx + dosMarker.length).replace(/^\n+/, "");
      const afterLines = after ? after.split("\n") : [];
      return (
        <View key={keyPrefix}>
          {before ? renderPeTextNormal(before, `${keyPrefix}-pre`) : null}
          {afterLines.length > 0 ? (
            <Text style={styles.peDossologia} selectable>
              {afterLines.map((ln, i) => {
                const isLast = i === afterLines.length - 1;
                const tail = isLast ? "" : "\n";
                if (isPe1RubricLine(ln)) {
                  return (
                    <Text key={i} style={styles.peRubric}>
                      {unwrapPe1RubricLine(ln)}
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
          ) : null}
        </View>
      );
    }
    return renderPeTextNormal(text, keyPrefix);
  };

  // Determina il kind del titolo in base al type della reading
  const readingTitleKind = (t: ReadingType): "antifonaTitle" | "readingTitle" | "orazioneTitle" => {
    if (t === "antifona_ingresso" || t === "antifona_comunione" || t === "sequenza") return "antifonaTitle";
    if (t === "colletta" || t === "sulle_offerte" || t === "dopo_comunione") return "orazioneTitle";
    // "acclamazione" (Acclamazione al Vangelo) usa readingTitle = verde,
    // come Vangelo e altre letture, per coerenza visiva.
    return "readingTitle";
  };

  const renderSection = (section: any, idx: number) => {
    if (section.type === "rubric") return <R key={idx} kind="rubric">{section.text}</R>;
    if (section.type === "dialogue") {
      return (
        <View key={idx} style={styles.block}>
          <D role="celebrant" text={section.celebrante} />
          <D role="assembly" text={section.assemblea} />
        </View>
      );
    }
    if (section.type === "monologue") {
      return (
        <View key={idx} style={styles.block}>
          <D role="celebrant" text={section.celebrante} />
        </View>
      );
    }
    if (section.type === "invitation_alternatives") {
      return (
        <View key={idx}>
          {(section.options || []).map((text: string, i: number) => (
            <View key={i}>
              {i > 0 && <R kind="rubric">oppure</R>}
              <D role="celebrant" text={text} />
            </View>
          ))}
        </View>
      );
    }
    if (section.type === "prayer") {
      const isSilent =
        !!section.rubric && /sottovoce|inchinato/i.test(section.rubric);
      return (
        <View key={idx} style={styles.block}>
          {section.rubric && <R kind="rubric">{section.rubric}</R>}
          {section.text && <R>{section.text}</R>}
          {section.celebrante && section.assemblea ? (
            <View style={styles.dialogBlock}>
              <D role="celebrant" text={section.celebrante} />
              <D role="assembly" text={section.assemblea} />
            </View>
          ) : section.celebrante ? (
            isSilent ? (
              <R kind="umili">{section.celebrante}</R>
            ) : (
              <D role="celebrant" text={section.celebrante} />
            )
          ) : null}
          {section.assemblea && !section.celebrante ? (
            <D role="assembly" text={section.assemblea} />
          ) : null}
        </View>
      );
    }
    if (section.type === "kyrie") {
      return (
        <View key={idx} style={styles.block}>
          {section.rubric && <R kind="rubric">{section.rubric}</R>}
          {section.dialogue.map((d: any, i: number) => (
            <View key={i} style={styles.dialogBlock}>
              <D role="celebrant" text={d.c} />
              <D role="assembly" text={d.a} />
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
  // Per la PE I (Canone Romano) le rubriche di gesto restano nel testo
  // (marker interno <<RUBRIC>>) e si mostrano in corsivo rosso, stessa misura.
  // Le parentesi [ ] del testo facoltativo (santi, N. e N.) restano visibili,
  // colorate in rosso, con il testo interno del colore normale.
  const processPrayerText = (text: string, prayerId: string): string => {
    if (!text) return "";
    if (prayerId === "pe1") return text;
    // Rimuove tutti i marker [xxx] e ricompatta gli spazi/righe vuote in eccesso
    return text
      .replace(/\[[^\]]*\]\s*\n?/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // === Helpers paginazione automatica testo ===
  // Stima quanti caratteri possono stare in una schermata dato il fontSize attuale.
  // Più aggressivo per evitare overflow oltre il fondo schermo con font grandi.
  // === Stima Kindle-style del testo che sta in una pagina (NO scroll, solo tap) ===
  // Calcoliamo dinamicamente i caratteri-per-pagina in base a:
  //   - dimensioni effettive dello schermo (useWindowDimensions)
  //   - dimensione del font scelta dall'utente (Settings)
  //   - padding/header/footer dell'app
  // Quando l'utente cambia il font size, il numero di pagine si aggiorna
  // automaticamente (ricalcolo nel render successivo).
  //
  // Stima: usiamo lineHeight = fontSize * 1.6 (nuova spaziatura dinamica)
  // larghezza utile del testo = screenWidth - padding (32 outer + 32 partBox)
  // larghezza media di un carattere = fontSize * 0.52 (sans-serif italiano)
  const HEADER_FOOTER_OVERHEAD = 130; // top header (~36) + tap nav footer (~60) + page title (~24) + padding
  const TEXT_HORIZONTAL_PADDING = 32;  // 16 outer (content padding ridotto)
  const lineHeightPx = Math.max(20, liturgyLineHeight(fontSize, BODY_LINE_HEIGHT, lineSpacing));
  const usableHeightPx = Math.max(300, screenHeight - HEADER_FOOTER_OVERHEAD);
  const usableWidthPx = Math.max(280, screenWidth - TEXT_HORIZONTAL_PADDING);
  const linesPerPage = Math.max(4, Math.floor(usableHeightPx / lineHeightPx));
  const avgCharWidthPx = Math.max(8, fontSize * 0.52);
  const charsPerLine = Math.max(20, Math.floor(usableWidthPx / avgCharWidthPx));
  // Safety factor 0.88: tiene conto di parole spezzate, paragrafi nuovi (\n),
  // titoli/subtitle che occupano riga intera, e variabilita' delle parole italiane.
  // Più alto del precedente 0.78 per ridurre lo spazio bianco residuo.
  const charsPerPage = Math.max(180, Math.round(linesPerPage * charsPerLine * 0.88));

  // Splitta un testo lungo in chunk rispettando i paragrafi (\n\n).
  // Algoritmo "greedy fill" Kindle-style: riempie ogni chunk il più possibile
  // per minimizzare il numero di pagine ed evitare spazio vuoto in fondo.
  // Se un singolo paragrafo eccede maxChars, lo splitta su frasi (.) o virgole (,).
  // BILANCIAMENTO FINALE: se l'ultimo chunk è molto vuoto (<35%), ridistribuisce
  // gli ultimi due chunk per evitare di avere "una sola riga sull'ultima pagina".
  const splitTextIntoChunks = (text: string, maxChars = charsPerPage): string[] => {
    if (!text) return [];
    if (text.length <= maxChars) return [text];
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = "";
    // Tolleranza Kindle: accetta sforamenti moderati per riempire la pagina
    const HARD_LIMIT = Math.round(maxChars * 1.10);
    const MIN_FILL = Math.round(maxChars * 0.65); // se il chunk è < 65% pieno, prova ad unire

    const splitParagraphLong = (p: string): string[] => {
      // Step 1: prova a dividere sulle frasi (.,?,!,:)
      const sentences = p.split(/(?<=[\.\?\!\:])\s+/);
      const pieces: string[] = [];
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

      // Step 2: se un piece è ancora troppo lungo (frase enorme),
      // prova a dividere su virgole/punti-e-virgola.
      const afterCommas: string[] = [];
      for (const piece of pieces) {
        if (piece.length <= HARD_LIMIT) {
          afterCommas.push(piece);
          continue;
        }
        const subs = piece.split(/(?<=[,;])\s+/);
        let b2 = "";
        for (const ss of subs) {
          const c2 = b2 ? `${b2} ${ss}` : ss;
          if (c2.length > maxChars && b2) {
            afterCommas.push(b2.trim());
            b2 = ss;
          } else {
            b2 = c2;
          }
        }
        if (b2) afterCommas.push(b2.trim());
      }

      // Step 3: ultimo fallback - dividere su newline singoli (a capo
      // tra versi/righe della preghiera) per evitare break a metà parola.
      const finalPieces: string[] = [];
      for (const piece of afterCommas) {
        if (piece.length <= HARD_LIMIT) {
          finalPieces.push(piece);
          continue;
        }
        const lines = piece.split(/\n/);
        let b3 = "";
        for (const ln of lines) {
          const c3 = b3 ? `${b3}\n${ln}` : ln;
          if (c3.length > maxChars && b3) {
            finalPieces.push(b3.trim());
            b3 = ln;
          } else {
            b3 = c3;
          }
        }
        if (b3) finalPieces.push(b3.trim());
      }

      return finalPieces;
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
      } else if (current.length < MIN_FILL && candidate.length <= Math.round(maxChars * 1.25)) {
        // Chunk attuale troppo vuoto: unisci anche se sfora un po'
        current = candidate;
      } else {
        chunks.push(current);
        current = p;
      }
    }
    if (current) chunks.push(current);

    // Bilanciamento finale: se l'ultimo chunk è molto vuoto, prova a spostare
    // un paragrafo dal penultimo all'ultimo (riduce "righe orfane" sull'ultima pagina).
    if (chunks.length >= 2) {
      const last = chunks[chunks.length - 1];
      const prev = chunks[chunks.length - 2];
      if (last.length < Math.round(maxChars * 0.35)) {
        const prevParas = prev.split(/\n\n+/);
        if (prevParas.length >= 2) {
          // Sposta l'ultimo paragrafo dal penultimo all'ultimo
          const moved = prevParas.pop()!;
          const newPrev = prevParas.join("\n\n");
          const newLast = `${moved}\n\n${last}`;
          // Solo se il nuovo last non sfora troppo
          if (newLast.length <= Math.round(maxChars * 1.20) && newPrev.length >= Math.round(maxChars * 0.40)) {
            chunks[chunks.length - 2] = newPrev;
            chunks[chunks.length - 1] = newLast;
          }
        }
      }
    }
    return chunks;
  };

  const renderPreghieraFedeliText = (text: string) =>
    renderOrazionaleOrFedeliText(text, { body: styles.text, marker: styles.salmoRit });

  const renderSalmoText = (text: string) =>
    renderSalmoResponsorialText(text, { body: styles.salmoText, marker: styles.salmoRit });

  const renderReading = (type: ReadingType, titleOverride?: string) => {
    const r = getReading(type);
    if (!r || !r.text) return null;
    const titleKind = readingTitleKind(type);
    return (
      <View style={styles.readingBlock} testID={`reading-${type}`}>
        <R kind={titleKind}>{titleOverride || r.title}</R>
        {r.reference ? <R kind="rubric">{r.reference}</R> : null}
        {type === "salmo" ? renderSalmoText(r.text) : <R>{r.text}</R>}
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
        <View style={styles.choiceRow} data-tap-stop="true">
          {(["A", "B", "C"] as const).map(id => (
            <TouchableOpacity
              key={id}
              style={[styles.choiceBtn, penitentialForm === id && styles.choiceBtnActive]}
              onPress={() => setPenitentialForm(id)}
              testID={`btn-penitential-${id}`}
            >
              <Text style={[styles.choiceBtnText, penitentialForm === id && { color: colors.onPrimary }]}>Formula {id}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Formula C: sub-selettore tempo liturgico */}
        {selectedOpt?.season_variants && (
          <View>
            <R kind="subtitle">Tempo liturgico (tropari)</R>
            <View style={styles.choiceRow} data-tap-stop="true">
              {Object.entries(selectedOpt.season_variants).map(([key, v]: [string, any]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.choiceBtn, penitentialSeason === key && styles.choiceBtnActive]}
                  onPress={() => setPenitentialSeason(key)}
                  testID={`btn-pen-season-${key}`}
                >
                  <Text style={[styles.choiceBtnText, penitentialSeason === key && { color: colors.onPrimary }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {selectedOpt && (
          <View style={styles.block}>
            <R kind="subtitle">{selectedOpt.label}</R>
            {selectedOpt.assemblea && <D role="assembly" text={selectedOpt.assemblea} />}
            {selectedOpt.dialogue && selectedOpt.dialogue.map((d: any, i: number) => (
              <View key={i} style={styles.dialogBlock}>
                <D role="celebrant" text={d.c} />
                <D role="assembly" text={d.a} />
              </View>
            ))}
            {/* Formula C: tutte le formule del tempo liturgico selezionato, una sotto l'altra */}
            {seasonVariant?.formulas && Array.isArray(seasonVariant.formulas) && (
              <>
                {seasonVariant.formulas.map((formula: any, fi: number) => (
                  <View key={`formula-${fi}`} style={styles.penitentialFormulaBox}>
                    {formula.label && <R kind="troparioTitle">{formula.label}</R>}
                    {formula.dialogue?.map((d: any, i: number) => (
                      <View key={`f${fi}-${i}`} style={styles.dialogBlock}>
                        <D role="celebrant" text={d.c} />
                        <D role="assembly" text={d.a} />
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}
            {/* Compatibilità retro: vecchio schema con singola dialogue per stagione */}
            {seasonVariant?.dialogue && seasonVariant.dialogue.map((d: any, i: number) => (
              <View key={`sv-${i}`} style={styles.dialogBlock}>
                <D role="celebrant" text={d.c} />
                <D role="assembly" text={d.a} />
              </View>
            ))}
            {selectedOpt.celebrante && <D role="celebrant" text={selectedOpt.celebrante} />}
            {selectedOpt.risposta && <D role="assembly" text={selectedOpt.risposta} />}
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
        <View style={styles.choiceRow} data-tap-stop="true">
          {choice.options.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, selectedCredoId === o.id && styles.choiceBtnActive]}
              onPress={() => setSelectedCredoId(o.id)}
              testID={`btn-credo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, selectedCredoId === o.id && { color: colors.onPrimary }]}>
                {o.id === "niceno" ? "Niceno" : "Apostolico"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {sel && <R>{sel.text}</R>}
      </View>
    );
  };

  const renderOrateFratresAll = (orateChoice: any) => {
    const opts = orateChoice?.options || [];
    if (!opts.length) return null;
    return (
      <View style={styles.block} testID="orate-fratres-all">
        <R kind="subtitle">Invito e risposta</R>
        {opts.map((o: any, i: number) => (
          <View key={o.id}>
            {i > 0 && <R kind="rubric">oppure</R>}
            <D role="celebrant" text={o.celebrante} />
          </View>
        ))}
        {opts[0].assemblea ? <D role="assembly" text={opts[0].assemblea} /> : null}
      </View>
    );
  };

  const renderMysteryAcclamationsAll = () => {
    if (!acclamations.length) return null;
    return (
      <View style={styles.block} testID="mystery-acclamations-all">
        <D role="celebrant" text={acclamations[0].celebrante} />
        {acclamations.map((a, i) => (
          <View key={a.id}>
            {i > 0 && <R kind="rubric">oppure</R>}
            <D role="assembly" text={a.assemblea} />
          </View>
        ))}
      </View>
    );
  };

  const renderPadreNostroIntrosAll = (introChoice: any) => {
    const opts = introChoice?.options || [];
    if (!opts.length) return null;
    return (
      <View style={styles.block} testID="pn-intros-all">
        <R kind="subtitle">Monizione d&apos;introduzione</R>
        {opts.map((o: any, i: number) => (
          <View key={o.id}>
            {i > 0 && <R kind="rubric">oppure</R>}
            <D role="celebrant" text={o.text} />
          </View>
        ))}
      </View>
    );
  };

  // === Offertorio ===
  const renderOffertorio = () => {
    const off = fixedParts["offertorio"];
    const orateChoice = off.sections.find((s: any) => s.type === "choice_orate");
    return (
      <View testID="part-offertorio">
        <R kind="title">Liturgia Eucaristica – Presentazione dei doni</R>
        {off.sections
          .filter((s: any) => s.type !== "choice_orate" && s.type !== "rubric")
          .map(renderSection)}
        {renderOrateFratresAll(orateChoice)}
      </View>
    );
  };

  // === Padre Nostro (tutte le monizioni, come sul messale) ===
  const renderPadreNostro = () => {
    const pn = fixedParts["padre_nostro"];
    const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
    return (
      <View testID="part-padre-nostro">
        <R kind="title">Riti di Comunione</R>
        {renderPadreNostroIntrosAll(introChoice)}
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

  const renderLiturgyChoicesSummary = () => {
    const preface = prefaces.find((p) => p.id === selectedPrefaceId);
    const prayer = prayers.find((p) => p.id === selectedPrayerId);
    const orazionale = selectedOrazionaleId ? getPrayerById(selectedOrazionaleId) : undefined;
    const congedoOpts = getCongedoOptions();
    const congedo = congedoOpts.find((o: any) => o.id === congedoId);
    const solemn = solemnBlessings.find((b) => b.id === solemnBlessingId);
    const orazionePopolo = prayersOverPeople.find((p) => p.id === orazionePopoloId);

    const rows: { label: string; value: string }[] = [
      { label: "Gloria", value: showGloria ? "Sì" : "No" },
      {
        label: "Credo",
        value: showCredo
          ? selectedCredoId === "niceno"
            ? "Niceno-Constantinopolitano"
            : "Apostolico"
          : "No",
      },
      {
        label: "Preghiera dei fedeli",
        value: showOrazionalePray ? orazionale?.title ?? "Sì (da scegliere)" : "No",
      },
      { label: "Antifone", value: showAntifone ? "Sì" : "No" },
      { label: "Atto penitenziale", value: `Formula ${penitentialForm}` },
      ...(preface ? [{ label: "Prefazio", value: preface.title }] : []),
      ...(prayer ? [{ label: "Preghiera eucaristica", value: prayer.title }] : []),
      ...peSelectorEntries.map((sel) => {
        const opt = sel.options.find((o: { id: string; label: string }) => o.id === sel.current);
        return { label: sel.label, value: opt?.label ?? "—" };
      }),
      ...(useOrazionePopolo && orazionePopolo
        ? [{ label: "Orazione sul popolo", value: `N. ${orazionePopolo.num}` }]
        : []),
      {
        label: "Benedizione",
        value:
          useSolemnBlessing && solemn
            ? `${solemn.num ? `${solemn.num}. ` : ""}${solemn.title}`
            : `Semplice (forma ${benedizioneId})`,
      },
      { label: "Congedo", value: congedo?.label ?? congedoId },
    ];

    return (
      <View style={styles.choicesSummary} testID="liturgy-choices-summary" data-tap-stop="true">
        <R kind="subtitle">Riepilogo scelte — verifica prima di celebrare</R>
        {rows.map((row) => (
          <View key={row.label} style={styles.choicesSummaryRow}>
            <Text style={styles.choicesSummaryLabel}>{row.label}</Text>
            <Text style={styles.choicesSummaryValue} numberOfLines={4}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    );
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
          <View style={[styles.block, styles.solemnToggle]} data-tap-stop="true" testID="solemn-toggle">
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
            <View style={[styles.choiceRow, { flexWrap: "wrap" }]} data-tap-stop="true">
              {solemnBlessings.map((b: any) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.solemnChoiceBtn, solemnBlessingId === b.id && styles.choiceBtnActive]}
                  onPress={() => setSolemnBlessingId(b.id)}
                  testID={`btn-solemn-${b.id}`}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.solemnChoiceText, solemnBlessingId === b.id && { color: colors.onPrimary }]} numberOfLines={2}>
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
            <View style={styles.choiceRow} data-tap-stop="true">
              {benedChoice.options.map((o: any) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.choiceBtn, benedizioneId === o.id && styles.choiceBtnActive]}
                  onPress={() => setBenedizioneId(o.id)}
                  testID={`btn-bened-${o.id}`}
                >
                  <Text style={[styles.choiceBtnText, benedizioneId === o.id && { color: colors.onPrimary }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {bened && (
              <View style={styles.block}>
                <D role="celebrant" text={bened.celebrante} />
                <D role="assembly" text={bened.assemblea} />
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
          <View style={[styles.block, styles.solemnToggle]} data-tap-stop="true" testID="orazione-popolo-toggle">
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
                <View style={[styles.choiceRow, { flexWrap: "wrap" }]} data-tap-stop="true">
                  {prayersOverPeople.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.numChoiceBtn, orazionePopoloId === p.id && styles.choiceBtnActive]}
                      onPress={() => setOrazionePopoloId(p.id)}
                      testID={`btn-orazione-popolo-${p.id}`}
                    >
                      <Text style={[styles.numChoiceText, orazionePopoloId === p.id && { color: colors.onPrimary }]}>
                        {p.num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {selectedOrazPopolo && (
                  <View
                    style={[styles.block, styles.orazionePopoloPreview]}
                    testID="orazione-popolo-preview"
                  >
                    <R kind="subtitle">Anteprima — orazione n. {selectedOrazPopolo.num}</R>
                    <R>{selectedOrazPopolo.text}</R>
                    <View style={styles.dialogBlock}>
                      <D role="assembly" text="Amen." />
                    </View>
                  </View>
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
        <View style={styles.choiceRow} data-tap-stop="true">
          {congedoOptions.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, congedoId === o.id && styles.choiceBtnActive]}
              onPress={() => setCongedoId(o.id)}
              testID={`btn-congedo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, congedoId === o.id && { color: colors.onPrimary }]}>
                {o.label || o.id}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedCongedo && (
          <View style={styles.block}>
            <D role="celebrant" text={selectedCongedo.celebrante} />
            <D role="assembly" text={selectedCongedo.assemblea} />
          </View>
        )}

        {renderLiturgyChoicesSummary()}

        {favoriteHint ? (
          <Text style={styles.favoriteHint} testID="favorite-hint">
            {favoriteHint}
          </Text>
        ) : null}

        <View style={styles.completeRow}>
          <TouchableOpacity
            style={[styles.celebrateNowBtn, styles.celebrateNowBtnMain]}
            onPress={goHomeWithDate}
            testID="btn-go-celebrate"
            accessibilityRole="button"
            accessibilityLabel="Preparazione completata, torna alla home"
          >
            <Ionicons name="checkmark-circle" size={scaledFont(36)} color={colors.onPrimary} />
            <Text style={styles.celebrateNowBtnText}>
              Preparazione completata — torna alla home
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.favoriteBtn, isStarred && styles.favoriteBtnActive]}
            onPress={() => void handleToggleFavorite()}
            testID="btn-toggle-favorite"
            accessibilityRole="button"
            accessibilityLabel={
              isStarred ? "Rimuovi da accesso rapido" : "Aggiungi ad accesso rapido"
            }
          >
            <Ionicons
              name={isStarred ? "star" : "star-outline"}
              size={scaledFont(34)}
              color={isStarred ? colors.onPrimary : colors.primary}
            />
          </TouchableOpacity>
        </View>
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
        <HomeCircleButton onPress={() => router.back()} testID="btn-back" />
        <BrandScreenTitle
          title="Scegli la liturgia"
          textStyle={styles.title}
          markSize={Math.max(28, Math.round(fontSize * 0.85))}
        />
        <View style={styles.fontBtns}>
          <FontSizeButtons
            decreaseTestID="btn-font-decrease-messa"
            increaseTestID="btn-font-increase-messa"
          />
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/impostazioni")} testID="btn-settings-mass">
          <Ionicons name="settings-outline" size={scaledFont(36)} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Definizione delle pagine della messa */}
      {(() => {
        // Costruisce dinamicamente le pagine in base ai toggle
        const pages: { key: string; title: string; render: () => React.ReactNode; disableTapAdvance?: boolean }[] = [];

        const SANTO_TEXT =
          "Santo, Santo, Santo il Signore Dio dell'universo.\nI cieli e la terra sono pieni della tua gloria.\nOsanna nell'alto dei cieli.\nBenedetto colui che viene nel nome del Signore.\nOsanna nell'alto dei cieli.";

        // PAGINA 0: Frontespizio
        pages.push({
          key: "intro",
          title: "Inizio",
          disableTapAdvance: true, // Evita avanzamento accidentale mentre si toccano i toggle Gloria/Credo
          render: () => (
            <View style={styles.partBox}>
              {vigilEve ? (
                <MessaVigilIntroSection
                  key={celebrationMode}
                  vigilCtx={vigilEve}
                  celebrationMode={celebrationMode}
                  calendarDayLiturgy={calendarDayLiturgy}
                  vigilLiturgy={vigilModeLiturgy}
                  selectedLiturgy={liturgy}
                  onSelectMode={handleSelectCelebrationMode}
                  colors={colors}
                  fontSize={fontSize}
                />
              ) : (
                <View style={styles.dayBannerWrap}>
                  <LiturgyDayBanner
                    dateLabel={liturgy?.date_label || ""}
                    seasonName={liturgy?.season?.season || ""}
                    ceiTitle={liturgy?.title}
                    liturgicalColor={liturgy?.liturgical_color || liturgy?.season?.color || "verde"}
                    celebrationDate={
                      liturgy?.date ? parseLocalDate(liturgy.date) : new Date()
                    }
                    colors={colors}
                    fontSize={fontSize}
                    testID="mass-day-banner"
                    dateTestID="mass-date"
                    titleTestID="mass-celebration-title"
                  />
                </View>
              )}
              <View
                style={vigilEve ? styles.partsPanel : styles.togglesBox}
                data-tap-stop="true"
              >
                {vigilEve ? (
                  <Text style={styles.partsPanelTitle}>Parti della Messa</Text>
                ) : null}
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Gloria</Text>
                  <Switch value={showGloria} onValueChange={setShowGloria} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Credo</Text>
                  <Switch value={showCredo} onValueChange={setShowCredo} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabelCol}>
                    <Text style={styles.toggleLabel}>Preghiera dei fedeli</Text>
                    {vigilEve && celebrationMode !== "calendar_day" ? (
                      <Text style={styles.toggleSubLabel} numberOfLines={2}>
                        {vigilEve.solemnityTitle}
                      </Text>
                    ) : null}
                  </View>
                  <Switch value={showOrazionalePray} onValueChange={setShowOrazionalePray} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Antifone</Text>
                  <Switch value={showAntifone} onValueChange={setShowAntifone} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
              </View>
              <TouchableOpacity
                style={styles.startCelebrationBtn}
                onPress={() => advancePageRef.current?.()}
                testID="btn-start-celebration"
                accessibilityRole="button"
                accessibilityLabel="Inizia la preparazione della liturgia"
              >
                <Ionicons name="play-circle" size={scaledFont(40)} color={colors.onPrimary} />
                <Text style={styles.startCelebrationBtnText}>Inizia la preparazione</Text>
              </TouchableOpacity>
              <Text style={[styles.toggleLabel, { textAlign: "center", marginTop: 12, fontStyle: "italic", fontSize: Math.round(fontSize * 0.55) }]}>
                Durante la messa: tocca a destra per avanzare, a sinistra per tornare indietro
              </Text>
            </View>
          ),
        });

        // PAGINA: Riti di Introduzione + Colletta combinati (Colletta chiude i riti iniziali)
        // SALUTI INIZIALI ALTERNATIVI: dopo "Nel nome del Padre" il Messale
        // Romano 2020 prevede 5 formule di saluto fra cui il celebrante può
        // scegliere a vista. Le mostriamo tutte come blocchi di dialogo C./A.
        // separati da una riga vuota.
        const SALUTI_INIZIALI = [
          {
            c: "La grazia del Signore nostro Gesù Cristo,\nl'amore di Dio Padre\ne la comunione dello Spirito Santo siano con tutti voi.",
            a: "E con il tuo spirito.",
          },
          {
            c: "La grazia e la pace di Dio nostro Padre\ne del Signore nostro Gesù Cristo siano con tutti voi.",
            a: "E con il tuo spirito.",
          },
          {
            c: "Il Signore, che guida i nostri cuori all'amore\ne alla pazienza di Cristo, sia con tutti voi.",
            a: "E con il tuo spirito.",
          },
          {
            c: "Il Dio della speranza, che ci riempie di ogni gioia\ne pace nella fede\nper la potenza dello Spirito Santo, sia con tutti voi.",
            a: "E con il tuo spirito.",
          },
          {
            c: "La pace, la carità e la fede da parte di Dio Padre\ne del Signore Gesù Cristo siano con tutti voi.",
            a: "E con il tuo spirito.",
          },
        ];

        pages.push({
          key: "riti-iniziali",
          title: "Riti di Introduzione",
          render: () => (
            <View style={styles.partBox}>
              {showAntifone && renderReading("antifona_ingresso", "Antifona d'ingresso")}
              <R kind="title">Riti di Introduzione</R>
              {fixedParts["riti_iniziali"].sections.map(renderSectionNoRubric)}
              {/* 5 formule di saluto: il celebrante sceglie a vista. */}
              {SALUTI_INIZIALI.map((s, i) => (
                <View key={`saluto-${i}`} style={styles.salutoBlock}>
                  <D role="celebrant" text={s.c} />
                  <D role="assembly" text={s.a} />
                </View>
              ))}
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
              {renderReading(
                "colletta",
                activeVotiveId ? "Colletta" : "Colletta (Orazione del giorno)",
              ) || (
                <R kind="rubric">Colletta non disponibile per oggi.</R>
              )}
            </View>
          ),
        });

        // PAGINE: Liturgia della Parola (suddivisa in più schermate, con auto-pagination per testi lunghi)
        const readings = effectiveLiturgy?.readings || [];
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

        const plReading = readings.find((rr) => rr.type === "prima_lettura");
        if (plReading?.text) {
          pages.push({
            key: "read-prima_lettura",
            title: "Prima Lettura",
            render: () => (
              <View style={styles.partBox}>
                {offerSaintProperToggle ? (
                  <View style={styles.togglesBox} data-tap-stop="true">
                    <View style={styles.toggleRow} testID="saint-proper-toggle">
                      <Text style={styles.toggleLabel}>Letture proprie del santo</Text>
                      <Switch
                        value={useSaintProperReadings}
                        onValueChange={setUseSaintProperReadings}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                        style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }}
                        testID="switch-saint-proper-readings"
                      />
                    </View>
                    <Text
                      style={[
                        styles.toggleLabel,
                        {
                          fontStyle: "italic",
                          fontSize: Math.round(fontSize * 0.55),
                          marginTop: 4,
                        },
                      ]}
                    >
                      {useSaintProperReadings
                        ? "Lezionario del santo (colletta e orazioni restano del giorno CEI)"
                        : "Letture feriale del giorno (CEI)"}
                    </Text>
                  </View>
                ) : null}
                {renderReading("prima_lettura", "Prima Lettura")}
              </View>
            ),
          });
        }

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
          const orChunks = splitFedeliTextIntoChunks(selectedOrazionale.body, charsPerPage);
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
                      <R kind="peTitle">{selectedOrazionale.title}</R>
                    </>
                  ) : (
                    <R kind="peTitle">{selectedOrazionale.title} (continua)</R>
                  )}
                  {renderPreghieraFedeliText(orChunks[i])}
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
        // Le rubriche rosse sono nascoste su richiesta utente — il sacerdote
        // conosce già i gesti; vengono mostrate solo le orazioni "Benedetto sei tu".
        pages.push({
          key: "offertorio-1",
          title: "Presentazione dei Doni",
          render: () => (
            <View style={styles.partBox} testID="part-offertorio-1">
              <R kind="title">Liturgia Eucaristica – Presentazione dei doni</R>
              {headSections
                .filter((s: any) => s.type !== "rubric")
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
              {/* "Umili e pentiti" — testo della preghiera silenziosa, in rosso (rubrica) */}
              {inchinatoSection && (
                <View style={styles.block}>
                  <R kind="umili">{inchinatoSection.celebrante}</R>
                </View>
              )}
              {renderOrateFratresAll(orateChoice)}
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

        // === Prefazio + Preghiera Eucaristica (paginato o continuo con microfono) ===
        const prefBodyText = selectedPreface
          ? selectedPreface.text.trimEnd() + "\n\n" + SANTO_TEXT
          : "";
        const peHasIncorporatedPreface =
          !!selectedPrayer && PE_WITH_PROPER_PREFACE.includes(selectedPrayer.id);

        let peBeforePart = "";
        let peAfterPart = "";
        let peBeforeChunks: string[] = [];
        let peAfterChunks: string[] = [];

        if (selectedPrayer) {
          const peMarker = "Mistero della fede.";
          const peText = expandedPrayerText || processPrayerText(selectedPrayer.text, selectedPrayer.id);
          const peIdx = peText.indexOf(peMarker);
          peBeforePart = peText;
          peAfterPart = "";
          if (peIdx >= 0) {
            peBeforePart = peText.substring(0, peIdx).trimEnd();
            const rest = peText.substring(peIdx + peMarker.length);
            const nextBreak = rest.indexOf("\n\n");
            peAfterPart = nextBreak > 0 ? rest.substring(nextBreak + 2).trimStart() : rest.trimStart();
          }
          const splitAtMarker = (txt: string, m: string): [string, string] => {
            const i = txt.indexOf(m);
            if (i < 0) return [txt, ""];
            return [txt.substring(0, i).trim(), txt.substring(i).trim()];
          };
          const expandIfTooBig = (chunks: string[]): string[] => {
            const out: string[] = [];
            const HARD = Math.round(charsPerPage * 1.15);
            for (const c of chunks) {
              if (!c) continue;
              if (c.length <= HARD) {
                out.push(c);
                continue;
              }
              out.push(...splitTextIntoChunks(c, charsPerPage));
            }
            return out;
          };
          const [beforeBread, beforeCalice] = splitAtMarker(peBeforePart, "Allo stesso modo, dopo aver cenato");
          const beforeRaw = beforeCalice ? [beforeBread, beforeCalice] : [peBeforePart];
          peBeforeChunks = expandIfTooBig(beforeRaw).map((c) => c.trim()).filter(Boolean);
          if (peBeforeChunks.length === 0) {
            const fallback = (peText || selectedPrayer.text || "").trim();
            if (fallback) peBeforeChunks = [fallback];
          }

          if (peAfterPart || acclamations.length > 0) {
            const dossMarkerLit = "<<DOSSOLOGIA>>";
            const dossIdx = peAfterPart.indexOf(dossMarkerLit);
            let afterRaw: string[];
            if (dossIdx > 0) {
              afterRaw = [peAfterPart.substring(0, dossIdx).trim(), peAfterPart.substring(dossIdx).trim()];
            } else {
              const fallbackRe = /PER CRISTO, CON CRISTO|Per Cristo, con Cristo/;
              const m = peAfterPart.match(fallbackRe);
              const fallbackIdx = m ? peAfterPart.indexOf(m[0]) : -1;
              afterRaw =
                fallbackIdx > 0
                  ? [peAfterPart.substring(0, fallbackIdx).trim(), peAfterPart.substring(fallbackIdx).trim()]
                  : [peAfterPart];
            }
            peAfterChunks = expandIfTooBig(afterRaw).map((c) => c.trim()).filter(Boolean);
          }
        }

        const renderPeAcclamationBlock = () =>
          acclamations.length > 0 ? renderMysteryAcclamationsAll() : null;

        const renderPeSelectorRow = () =>
          peSelectorEntries.length > 0 ? (
            <View style={styles.peSelectorsRow} data-tap-stop="true">
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
                      <Text style={styles.peSelectorValue} numberOfLines={2}>
                        {opt?.label || "—"}
                      </Text>
                      <Ionicons name="chevron-down" size={scaledFont(14)} color={colors.accentPeSelectorLabel} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null;

        if (selectedPreface) {
          const prefChunks = splitTextIntoChunks(prefBodyText);
          prefChunks.forEach((_, i) => {
            pages.push({
                key: `prefazio-${i}`,
                title: prefChunks.length > 1 ? `Prefazio (${i + 1}/${prefChunks.length})` : "Prefazio",
                render: () => (
                  <View style={styles.partBox}>
                    {i === 0 ? (
                      <>
                        <View style={styles.titleRow}>
                          <R kind="title">Prefazio</R>
                        </View>
                        <TouchableOpacity
                          style={styles.selectorBtn}
                          onPress={() => {
                            setShowPrefaces(true);
                            setExpandedPrefaceSeason("suggeriti");
                          }}
                          testID="btn-select-preface"
                        >
                          <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                          <Text style={styles.selectorBtnText}>Scegli Prefazio</Text>
                        </TouchableOpacity>
                        <R kind="prefaceTitle">{selectedPreface.title}</R>
                        {renderPrefaceDialogues()}
                      </>
                    ) : (
                      <R kind="prefaceTitle">{selectedPreface.title} (continua)</R>
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
                  <View style={styles.titleRow}>
                    <R kind="title">Prefazio</R>
                  </View>
                  <TouchableOpacity
                    style={styles.selectorBtn}
                    onPress={() => {
                      setShowPrefaces(true);
                      setExpandedPrefaceSeason("suggeriti");
                    }}
                    testID="btn-select-preface"
                  >
                    <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                    <Text style={styles.selectorBtnText}>Scegli Prefazio</Text>
                  </TouchableOpacity>
                </View>
              ),
            });
        }

        if (selectedPrayer) {
          if (peBeforeChunks.length === 0) {
            pages.push({
              key: "pe-cons-0",
              title: "Preghiera Eucaristica",
              render: () => (
                <View style={styles.partBox} testID="mass-page-pe-fallback">
                  <View style={styles.titleRow}>
                    <R kind="title">Preghiera Eucaristica</R>
                    <TouchableOpacity
                      style={styles.selectorBtnInline}
                      onPress={() => setShowPrayers(true)}
                      testID="btn-select-prayer"
                    >
                      <Ionicons name="swap-horizontal" size={scaledFont(18)} color={colors.primary} />
                      <Text style={styles.selectorBtnInlineText}>Scegli</Text>
                    </TouchableOpacity>
                  </View>
                  {renderPeSelectorRow()}
                  <R kind="peTitle">{selectedPrayer.title}</R>
                  {peHasIncorporatedPreface ? renderPrefaceDialogues() : null}
                  <R kind="rubric">Testo della preghiera non disponibile. Prova a cambiare PE o a tornare indietro e riaprire.</R>
                </View>
              ),
            });
          }
          peBeforeChunks.forEach((_, i) => {
              pages.push({
                key: `pe-cons-${i}`,
                title:
                  peBeforeChunks.length > 1
                    ? `Preghiera Eucaristica – Consacrazione (${i + 1}/${peBeforeChunks.length})`
                    : "Preghiera Eucaristica – Consacrazione",
                render: () => (
                  <View style={styles.partBox}>
                    {i === 0 ? (
                      <>
                        <View style={styles.titleRow}>
                          <R kind="title">Preghiera Eucaristica</R>
                          <TouchableOpacity
                            style={styles.selectorBtnInline}
                            onPress={() => setShowPrayers(true)}
                            testID="btn-select-prayer"
                          >
                            <Ionicons name="swap-horizontal" size={scaledFont(18)} color={colors.primary} />
                            <Text style={styles.selectorBtnInlineText}>Scegli</Text>
                          </TouchableOpacity>
                        </View>
                        {renderPeSelectorRow()}
                        <R kind="peTitle">{selectedPrayer.title}</R>
                        {peHasIncorporatedPreface ? renderPrefaceDialogues() : null}
                      </>
                    ) : (
                      <R kind="peTitle">{selectedPrayer.title} (continua)</R>
                    )}
                    {renderPeText(peBeforeChunks[i], `pe-b${i}`)}
                  </View>
                ),
              });
            });

            if (peAfterPart || acclamations.length > 0) {
              if (acclamations.length > 0) {
                pages.push({
                  key: "pe-acclamazione",
                  title: "Mistero della Fede",
                  render: () => (
                    <View style={styles.partBox}>
                      <R kind="title">Mistero della Fede</R>
                      {renderPeAcclamationBlock()}
                    </View>
                  ),
                });
              }
              peAfterChunks.forEach((_, i) => {
                const isLastDossology = peAfterChunks.length > 1 && i === peAfterChunks.length - 1;
                const pageTitle =
                  peAfterChunks.length > 1
                    ? isLastDossology
                      ? "Dossologia"
                      : "Anamnesi e Intercessioni"
                    : "Anamnesi e Dossologia";
                pages.push({
                  key: `pe-after-${i}`,
                  title: pageTitle,
                  render: () => (
                    <View style={styles.partBox}>
                      <R kind="title">{pageTitle}</R>
                      {renderPeText(peAfterChunks[i], `pe-a${i}`)}
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
                  <View style={styles.titleRow}>
                    <R kind="title">Preghiera Eucaristica</R>
                  </View>
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
            // Le prime 3 sezioni: monizione, Pater, embolismo. Saltiamo la rubrica iniziale "Il sacerdote..."
            const padreSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(0, 2); // Pater + embolismo
            return (
              <View testID="part-padre-nostro">
                <R kind="title">Padre Nostro</R>
                {renderPadreNostroIntrosAll(introChoice)}
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
                {showAntifone && renderReading("antifona_comunione", "Antifona alla Comunione")}
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
                      <D role="assembly" text="Amen." />
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
                      <D role="celebrant" text={inv.c} />
                      <D role="assembly" text={inv.a} />
                    </View>
                  ))}
                  <View style={styles.dialogBlock}>
                    <D role="celebrant" text={sel.final.c} />
                    <D role="assembly" text={sel.final.a} />
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
        const safeIdx = resolveMassPageIndex(pages, pageKey);
        const cur = pages[safeIdx] ?? pages[0];
        if (!cur) return null;
        const goTo = (idx: number) => {
          const next = Math.max(0, Math.min(total - 1, idx));
          const nextKey = pages[next]?.key;
          if (nextKey) setPageKey(nextKey);
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        };
        const prev = () => goTo(safeIdx - 1);
        const advance = () => goTo(safeIdx + 1);
        advancePageRef.current = advance;

        // Tap pagina: Pressable dentro ScrollView — tap e bottoni convivono su native;
        // su web isWebInteractiveTarget evita avanzamento su formula/switch/Scegli.
        const TAP_LEFT_RATIO = 0.35;
        const tapLeftWidth = Math.round(screenWidth * TAP_LEFT_RATIO);

        const handlePagePress = (e: GestureResponderEvent) => {
          const target = (e.nativeEvent as unknown as { target?: EventTarget }).target;
          if (isWebInteractiveTarget(target)) return;
          const x = e.nativeEvent.pageX ?? e.nativeEvent.locationX ?? 0;
          if (x < tapLeftWidth) prev();
          else advance();
        };

        return (
          <>
            <View style={{ flex: 1 }}>
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={[styles.content, { paddingBottom: 60 }]}
                testID="mass-scroll"
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {cur.disableTapAdvance ? (
                  <View testID="page-no-tap" key={`intro-${celebrationMode}`}>
                    {cur.render()}
                  </View>
                ) : (
                  <Pressable
                    key={cur.key}
                    onPress={handlePagePress}
                    testID="page-tap-area"
                    android_disableSound
                    style={{ minHeight: screenHeight - 200 }}
                  >
                    <View collapsable={false} testID={`mass-page-${cur.key}`}>
                      {cur.render()}
                    </View>
                  </Pressable>
                )}
              </ScrollView>
            </View>

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
      <PrefaceSelectorModal
        visible={showPrefaces}
        onClose={() => setShowPrefaces(false)}
        prefaces={prefaces}
        selectedId={selectedPrefaceId}
        onSelect={setSelectedPrefaceId}
        currentSeasonKey={currentSeasonKey}
        liturgy={liturgy}
        colors={colors}
        scaledFont={scaledFont}
        fontFamilyId={fontFamilyId}
        isBold={isBold}
        expandedSeason={expandedPrefaceSeason}
        setExpandedSeason={setExpandedPrefaceSeason}
      />

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
                          <Text style={[styles.peModalOptionText, isSel && { color: colors.accentPeModalActiveText, fontWeight: "800" }]}>
                            {o.label}
                          </Text>
                          {isSel ? <Ionicons name="checkmark" size={scaledFont(28)} color={colors.accentPeModalActiveText} /> : null}
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

