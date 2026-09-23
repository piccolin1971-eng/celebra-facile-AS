import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, Platform, useWindowDimensions, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, Preface, EucharisticPrayer, PrefetchProgress } from "../src/api";
import { localDateStr, italianDateLabel, italianMonthName, italianWeekdayName, addDays, dayOffsetFromToday, parseLocalDate } from "../src/dateUtils";
import { LiturgyDayBanner } from "../src/components/LiturgyDayBanner";
import { HomeSessionSummary } from "../src/components/HomeSessionSummary";
import { HomeHeroIcon } from "../src/components/HomeHeroIcon";
import { FontSizeButtons } from "../src/components/FontSizeButtons";
import {
  loadSessionsForDate,
  clearSession,
  saveCelebratePick,
  loadCelebratePick,
  routeParamStr,
  routeSearchParam,
  filterHomeSummarySessions,
  type MassSession,
  type CelebrationMode,
  parseCelebrationMode,
} from "../src/massSession";
import { getVigilEveContext, vigilEveBannerMessage } from "../src/vigilCatalog";
import { getLiturgicalSeason } from "../src/localLiturgy";
import {
  celebrationKindLabel,
  celebrationShortLabel,
} from "../src/celebrationModeLabels";
import { CelebrateChoiceDialog } from "../src/components/CelebrateChoiceDialog";
import { AppUpdateModal } from "../src/components/AppUpdateModal";
import {
  checkForAppUpdate,
  dismissUpdateUntil,
  getDismissedUpdateCode,
  openApkDownload,
  isAppUpdateSupported,
  type AppUpdateInfo,
} from "../src/appUpdate";
import { HomeDatePickerModal } from "../src/components/HomeDatePickerModal";
import { QuickAccessModal } from "../src/components/QuickAccessModal";
import { loadLiturgyFavorites } from "../src/liturgyFavorites";
import { bannerCeiTitleWithRank, calendarCelebrationBannerTitle, formatCelebrationTitle, homeBannerLiturgicalColor, homeStripDayMeta, liturgicalColorHex, preparedBannerLiturgyTitle } from "../src/homeBannerUtils";
import { ensureQuickCelebrateSession } from "../src/defaultMassSession";
import { triggerAppHaptic } from "../src/appHaptics";
import {
  ACTION_LABEL_WEIGHT,
  ACTION_MIN_HEIGHT,
  ACTION_RADIUS,
  ACTION_TITLE_WEIGHT,
} from "../src/uiActionTokens";
import { prefetchMassAndHours } from "../src/ore/prefetch";
import { unifiedCacheDaysLeft } from "../src/ore/cache";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

function DayChipWrap({
  active,
  styles,
  children,
}: {
  active: boolean;
  styles: Record<string, any>;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.dayButtonOuter, active && styles.dayButtonOuterActive]}>
      {active && Platform.OS !== "web" ? (
        <View pointerEvents="none" style={styles.dayHaloNear} />
      ) : null}
      {children}
    </View>
  );
}

const STRIP_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Tasto «Celebra subito»: oro, distinto dal verde di «Celebra la Messa». */
const QUICK_CELEBRA_GOLD = "#E0B429";
const ORE_BLUE = "#4DA8DA";
const DL_CHECK_GREEN = "#4CAF50";

/** Scurisce un riempimento restando sullo stesso colore, così il testo resta più leggibile. */
function mixHexTowardBlack(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const k = 1 - amount;
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * k)));
  return `#${[ch(16), ch(8), ch(0)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function dayLabelFor(offset: number, date: Date): string {
  if (offset === 0) return "OGGI";
  return italianWeekdayName(date);
}

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { colors, scaledFont, fontSize, celebraSubitoEnabled, preparaCelebraEnabled, oreEnabled, theme } = useSettings();
  const [selectedDateISO, setSelectedDateISO] = useState(() => localDateStr(new Date()));
  const [sessions, setSessions] = useState<MassSession[]>([]);
  const [selectedCelebrateMode, setSelectedCelebrateMode] = useState<CelebrationMode | null>(null);
  const [preparedCounts, setPreparedCounts] = useState<Record<string, number>>({});
  const [celebrateDialogVisible, setCelebrateDialogVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [quickAccessVisible, setQuickAccessVisible] = useState(false);
  const [quickAccessCount, setQuickAccessCount] = useState(0);
  const [quickStarting, setQuickStarting] = useState(false);
  const [dlDaysLeft, setDlDaysLeft] = useState(0);
  const [dlRunning, setDlRunning] = useState(false);
  const [dlProgress, setDlProgress] = useState<PrefetchProgress | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [ceiDayTitle, setCeiDayTitle] = useState("");
  const [stripCeiTitles, setStripCeiTitles] = useState<Record<string, string>>({});
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [updateVisible, setUpdateVisible] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const calendarDayRef = useRef(localDateStr(new Date()));
  const selectedDateStrRef = useRef("");
  const updateCheckedRef = useRef(false);

  const muteFill = (hex: string) =>
    mixHexTowardBlack(hex, theme === "dark" ? 0.32 : theme === "parchment" ? 0.16 : 0.12);

  const selectedDate = parseLocalDate(selectedDateISO);
  const selectedSeasonName = getLiturgicalSeason(selectedDate).season;
  const selectedDateStr = selectedDateISO;
  selectedDateStrRef.current = selectedDateISO;
  const todayISO = localDateStr(new Date());
  const stripSelected = dayOffsetFromToday(selectedDateISO) != null;
  const vigilEve = useMemo(() => getVigilEveContext(selectedDate), [selectedDate]);
  const selectedDateLabel = italianDateLabel(selectedDate);
  const activeCelebrateMode: CelebrationMode =
    selectedCelebrateMode ??
    (sessions.length === 1 ? (sessions[0].celebrationMode ?? "calendar_day") : "calendar_day");
  const activeSession = sessions.find(
    (s) => (s.celebrationMode ?? "calendar_day") === activeCelebrateMode,
  );
  const calendarSession = sessions.find(
    (s) => (s.celebrationMode ?? "calendar_day") === "calendar_day",
  );
  const calendarDayFallbackTitle =
    ceiDayTitle ||
    calendarCelebrationBannerTitle(selectedDate) ||
    "Prepara la liturgia per questo giorno";
  const bannerTitle =
    preparedBannerLiturgyTitle(activeSession?.liturgyTitle) ||
    (activeCelebrateMode !== "calendar_day" && vigilEve
      ? celebrationShortLabel(activeCelebrateMode, vigilEve)
      : "") ||
    calendarDayFallbackTitle;
  const calendarBannerTitle =
    preparedBannerLiturgyTitle(calendarSession?.liturgyTitle) ||
    (vigilEve ? ceiDayTitle || "Messa del giorno di calendario" : bannerTitle);
  const calendarBannerColor = homeBannerLiturgicalColor(
    selectedDate,
    "calendar_day",
    vigilEve,
    calendarBannerTitle,
  );
  const liturgicalColor = homeBannerLiturgicalColor(
    selectedDate,
    activeCelebrateMode,
    vigilEve,
    bannerTitle,
  );
  const hasPreparedSession = sessions.length > 0;
  const hasDualPrepared = sessions.length >= 2;

  const syncCelebrateSelection = useCallback(
    async (dateStr: string, loaded: MassSession[]) => {
      if (loaded.length === 0) {
        setSelectedCelebrateMode(null);
        return;
      }
      if (loaded.length === 1) {
        const only = loaded[0].celebrationMode ?? "calendar_day";
        setSelectedCelebrateMode(only);
        await saveCelebratePick(dateStr, only);
        return;
      }
      const pick = await loadCelebratePick(dateStr);
      const modes = new Set(loaded.map((s) => s.celebrationMode ?? "calendar_day"));
      if (pick && modes.has(pick)) {
        setSelectedCelebrateMode(pick);
        return;
      }
      const last = loaded[loaded.length - 1]?.celebrationMode ?? "calendar_day";
      setSelectedCelebrateMode(last);
      await saveCelebratePick(dateStr, last);
    },
    [],
  );

  const reloadSessions = useCallback(
    async (dateStr: string) => {
      const saved = filterHomeSummarySessions(await loadSessionsForDate(dateStr));
      setSessions(saved);
      await syncCelebrateSelection(dateStr, saved);
    },
    [syncCelebrateSelection],
  );

  const reloadPreparedFlags = useCallback(async () => {
    const entries = await Promise.all(
      STRIP_OFFSETS.map(async (offset) => {
        const dateStr = localDateStr(addDays(new Date(), offset));
        const saved = filterHomeSummarySessions(await loadSessionsForDate(dateStr));
        return [dateStr, saved.length] as const;
      }),
    );
    setPreparedCounts(Object.fromEntries(entries));
  }, []);

  const handleResetSession = useCallback(
    async (mode: CelebrationMode) => {
      await clearSession(selectedDateStr, mode);
      const remaining = filterHomeSummarySessions(await loadSessionsForDate(selectedDateStr));
      setSessions(remaining);
      setPreparedCounts((prev) => ({ ...prev, [selectedDateStr]: remaining.length }));
      await syncCelebrateSelection(selectedDateStr, remaining);
    },
    [selectedDateStr, syncCelebrateSelection],
  );

  const handleSelectCelebrateMode = useCallback(
    async (mode: CelebrationMode) => {
      setSelectedCelebrateMode(mode);
      await saveCelebratePick(selectedDateStr, mode);
    },
    [selectedDateStr],
  );

  const reloadQuickAccessCount = useCallback(async () => {
    const list = await loadLiturgyFavorites();
    setQuickAccessCount(list.length);
  }, []);

  const reloadDlDays = useCallback(async () => {
    setDlDaysLeft(await unifiedCacheDaysLeft(oreEnabled));
  }, [oreEnabled]);

  useEffect(() => {
    void reloadPreparedFlags();
  }, [reloadPreparedFlags]);

  useEffect(() => {
    void reloadQuickAccessCount();
  }, [reloadQuickAccessCount]);

  useEffect(() => {
    (async () => {
      try {
        const [pr, pe] = await Promise.all([api.prefaces(), api.eucharisticPrayers()]);
        setPrefaces(pr.prefaces);
        setPrayers(pe.prayers);
      } catch (e) {
        if (__DEV__) console.log("Home: caricamento prefazi/PE", e);
      }
    })();
  }, []);

  useEffect(() => {
    void reloadSessions(selectedDateISO);
  }, [selectedDateISO, reloadSessions]);

  useEffect(() => {
    let cancelled = false;
    setCeiDayTitle("");
    void (async () => {
      try {
        const title = await api.resolveCeiCelebrationTitle(selectedDateISO, "calendar_day");
        if (!cancelled) setCeiDayTitle(title);
      } catch (e) {
        if (__DEV__) console.log("Home: titolo CEI", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDateISO]);

  useEffect(() => {
    let cancelled = false;
    setStripCeiTitles({});
    void (async () => {
      for (const offset of STRIP_OFFSETS) {
        if (cancelled) return;
        const dateStr = localDateStr(addDays(new Date(), offset));
        try {
          const title = await api.resolveCeiCelebrationTitle(dateStr, "calendar_day");
          if (!cancelled && title) {
            setStripCeiTitles((prev) => ({ ...prev, [dateStr]: title }));
          }
        } catch (e) {
          if (__DEV__) console.log("Home: titolo CEI striscia", dateStr, e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todayISO]);

  useEffect(() => {
    const dateParam = routeParamStr(params.date) ?? routeSearchParam("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setSelectedDateISO(dateParam);
    }
  }, [params.date]);

  // Aggiornamento APK: fail-soft, una volta per avvio, solo Android.
  useEffect(() => {
    if (updateCheckedRef.current || !isAppUpdateSupported()) return;
    updateCheckedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const info = await checkForAppUpdate();
        if (cancelled || !info) return;
        const dismissed = await getDismissedUpdateCode();
        if (dismissed >= info.versionCode) return;
        setUpdateInfo(info);
        setUpdateVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const today = localDateStr(new Date());
      const prevCalendarDay = calendarDayRef.current;
      calendarDayRef.current = today;
      if (prevCalendarDay !== today && selectedDateStrRef.current === prevCalendarDay) {
        setSelectedDateISO(today);
      }
      void reloadSessions(selectedDateStrRef.current);
      void reloadPreparedFlags();
      void reloadQuickAccessCount();
      void reloadDlDays();
    }, [reloadSessions, reloadPreparedFlags, reloadQuickAccessCount, reloadDlDays]),
  );

  const messaMode: CelebrationMode = activeCelebrateMode;

  const openMessa = () => {
    void triggerAppHaptic("light");
    const navParams: { date?: string; mode: string } = { mode: messaMode };
    if (selectedDateISO !== todayISO) navParams.date = selectedDateISO;
    router.push({ pathname: "/messa", params: navParams });
  };

  const openOre = () => {
    void triggerAppHaptic("light");
    router.push({ pathname: "/ore", params: { date: selectedDateISO } } as any);
  };

  const startUnifiedDownload = async () => {
    if (dlRunning) return;
    void triggerAppHaptic("light");
    setDlRunning(true);
    setDlProgress({ total: 10, done: 0, failed: [] });
    try {
      const result = await prefetchMassAndHours(10, (p) => setDlProgress({ ...p }), {
        includeHours: oreEnabled,
      });
      await reloadDlDays();
      const ok = result.total - result.failed.length;
      const what = oreEnabled
        ? "giornate (Messa e Liturgia delle Ore)"
        : "giornate di letture della Messa";
      Alert.alert(
        "Download completato",
        `Scaricate ${ok} su ${result.total} ${what}.` +
          (result.failed.length ? `\n\nGiorni incompleti:\n${result.failed.join(", ")}` : ""),
      );
    } catch (e: any) {
      Alert.alert("Errore", String(e?.message || e));
    } finally {
      setDlRunning(false);
      setDlProgress(null);
    }
  };

  const goCelebra = (mode: CelebrationMode) => {
    void triggerAppHaptic("light");
    const navParams: { date?: string; mode: string } = { mode };
    if (selectedDateISO !== todayISO) navParams.date = selectedDateISO;
    router.push({ pathname: "/celebra" as any, params: navParams });
  };

  const openCelebra = () => {
    if (!hasPreparedSession) return;
    if (hasDualPrepared && !selectedCelebrateMode) {
      setCelebrateDialogVisible(true);
      return;
    }
    const mode =
      selectedCelebrateMode ??
      sessions[sessions.length - 1]?.celebrationMode ??
      "calendar_day";
    goCelebra(mode);
  };

  const openCelebraSubito = async () => {
    if (quickStarting) return;
    void triggerAppHaptic("light");
    const mode = selectedCelebrateMode ?? "calendar_day";
    setQuickStarting(true);
    try {
      await ensureQuickCelebrateSession(selectedDateISO, mode);
      const navParams: { date?: string; mode: string; from: string; index: string } = {
        mode,
        from: "indice",
        index: "1",
      };
      if (selectedDateISO !== todayISO) navParams.date = selectedDateISO;
      // Un solo caricamento: indice come overlay su /celebra (niente schermata intermedia).
      router.push({ pathname: "/celebra" as any, params: navParams });
    } catch (e) {
      if (__DEV__) console.log("Celebra subito:", e);
      Alert.alert(
        "Celebra subito",
        "Non è stato possibile avviare la celebrazione. Riprova o usa Scegli la liturgia.",
      );
    } finally {
      setQuickStarting(false);
    }
  };

  const celebrateButtonSub =
    hasPreparedSession && activeCelebrateMode
      ? formatCelebrationTitle(
          celebrationShortLabel(
            activeCelebrateMode,
            vigilEve,
            activeSession?.liturgyTitle,
          ),
        )
      : null;

  const { width: windowWidth } = useWindowDimensions();
  const topBarIconSize = Math.round(scaledFont(windowWidth < 380 ? 36 : 40));
  // Su native la width fissa a 42px non cresce con il font: l'ingranaggio esce
  // dalla cella. La cornice deve essere un quadrato almeno quanto l'icona.
  const topBarIconBtnSize = Math.max(42, topBarIconSize + 10);
  const topBarIconStyle =
    Platform.OS === "android"
      ? {
          width: topBarIconSize,
          height: topBarIconSize,
          includeFontPadding: false,
          textAlign: "center" as const,
        }
      : { width: topBarIconSize, height: topBarIconSize };
  const styles = makeStyles(colors, fontSize, topBarIconBtnSize);
  const heroIconSize = Math.round(scaledFont(40) * 1.45);
  const compactIconSlot = Math.round(heroIconSize * 0.78);

  return (
    <SafeAreaView style={styles.container} testID="home-screen">
      <View style={styles.topBar}>
        <View style={styles.brandPill} testID="app-title" accessibilityRole="header">
          <Image
            source={require("../assets/images/brand-mark.png")}
            style={styles.brandMark}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.appTitle} numberOfLines={2}>
            Celebra e prega facile
          </Text>
        </View>
        <View style={styles.fontBtns}>
          <FontSizeButtons
            decreaseTestID="btn-font-decrease-home"
            increaseTestID="btn-font-increase-home"
          />
        </View>
        <View style={styles.topBarIconGroup}>
          <TouchableOpacity
            style={styles.quickAccessBtn}
            onPress={() => setQuickAccessVisible(true)}
            testID="btn-quick-access"
            accessibilityRole="button"
            accessibilityLabel={`Accesso rapido${quickAccessCount > 0 ? `, ${quickAccessCount} liturgie` : ""}`}
          >
            <View style={styles.topBarIconSlot} pointerEvents="none">
              <Ionicons
                name={quickAccessCount > 0 ? "star" : "star-outline"}
                size={topBarIconSize}
                color={quickAccessCount > 0 ? colors.primary : colors.textPrimary}
                style={topBarIconStyle}
              />
            </View>
            {quickAccessCount > 0 ? (
              <View style={styles.quickAccessBadge} testID="quick-access-badge">
                <Text style={styles.quickAccessBadgeText}>{quickAccessCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push("/impostazioni")}
            testID="btn-settings"
            accessibilityLabel="Impostazioni"
            accessibilityRole="button"
          >
            <View style={styles.topBarIconSlot} pointerEvents="none">
              <Ionicons
                name="settings-outline"
                size={topBarIconSize}
                color={colors.textPrimary}
                style={topBarIconStyle}
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={false}
        style={styles.homeScroll}
      >
        <View style={styles.daySelector} testID="day-selector">
          <View
            style={styles.daySelectorLegend}
            testID="day-selector-legend"
            accessibilityRole="text"
            accessibilityLabel="Pallini: vuoto nessuna liturgia preparata, uno verde una liturgia, due verdi due liturgie"
          >
            <Text style={styles.legendLead} accessibilityElementsHidden>
              Preparata
            </Text>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotEmpty]} />
              <Text style={styles.daySelectorLabel}>nessuna</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotPrepared]} />
              <Text style={styles.daySelectorLabel}>una</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotsCol}>
                <View style={[styles.legendDot, styles.legendDotPrepared]} />
                <View style={[styles.legendDot, styles.legendDotPrepared]} />
              </View>
              <Text style={styles.daySelectorLabel}>due</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayButtonsScroll}
            contentContainerStyle={styles.dayButtonsRow}
          >
            {STRIP_OFFSETS.map((offset) => {
              const d = addDays(new Date(), offset);
              const dateStr = localDateStr(d);
              const isActive = dateStr === selectedDateISO;
              const dayNum = d.getDate();
              const label = dayLabelFor(offset, d);
              const isToday = offset === 0;
              const monthLabel = italianMonthName(d);
              const dateSpoken = isToday ? `${dayNum} ${monthLabel}` : `${label} ${dayNum} ${monthLabel}`;
              const stripMeta = homeStripDayMeta(d, stripCeiTitles[dateStr]);
              const borderHex = liturgicalColorHex(stripMeta.liturgicalColor, colors);
              const prepCount = preparedCounts[dateStr] ?? 0;
              const isPrepared = prepCount > 0;
              const prepLabel =
                prepCount >= 2
                  ? "due liturgie preparate"
                  : prepCount === 1
                    ? "una liturgia preparata"
                    : "non preparata";
              const celebrationLabel = stripMeta.subtitle
                ? `, ${stripMeta.subtitle}`
                : "";
              return (
                <DayChipWrap key={offset} active={isActive} styles={styles}>
                <TouchableOpacity
                  style={[
                    styles.dayButton,
                    { borderColor: borderHex },
                    isToday && styles.dayButtonToday,
                    webClickable,
                  ]}
                  onPress={() => setSelectedDateISO(dateStr)}
                  testID={offset === 0 ? "btn-day-today" : `btn-day-${offset}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${isToday ? `${label}, ${dateSpoken}` : dateSpoken}${celebrationLabel}, liturgia ${prepLabel}`}
                >
                  {prepCount >= 2 ? (
                    <View
                      style={styles.dayStatusDotsStack}
                      pointerEvents="none"
                      testID={`day-status-dots-${offset}`}
                    >
                      <View style={[styles.dayStatusDot, styles.dayStatusDotPrepared]} />
                      <View style={[styles.dayStatusDot, styles.dayStatusDotPrepared]} />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.dayStatusDotSolo,
                        isPrepared ? styles.dayStatusDotPrepared : styles.dayStatusDotEmpty,
                      ]}
                      pointerEvents="none"
                      testID={`day-status-dot-${offset}`}
                    />
                  )}
                  {isToday ? (
                    <>
                      <Text style={styles.dayButtonLabel}>{label}</Text>
                      <View style={styles.dayButtonDateRow}>
                        <Text style={styles.dayButtonNum}>{dayNum}</Text>
                        <Text style={styles.dayButtonMonth} numberOfLines={1}>
                          {monthLabel.toLowerCase()}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.dayButtonDateRow}>
                        <Text style={styles.dayButtonWeekday} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={styles.dayButtonNum}>{dayNum}</Text>
                      </View>
                      <Text style={styles.dayButtonMonthLine} numberOfLines={1}>
                        {monthLabel}
                      </Text>
                    </>
                  )}
                  {stripMeta.subtitle ? (
                    <Text style={styles.dayButtonCelebration}>{stripMeta.subtitle}</Text>
                  ) : null}
                </TouchableOpacity>
                </DayChipWrap>
              );
            })}
            <DayChipWrap active={!stripSelected} styles={styles}>
            <TouchableOpacity
              style={[
                styles.dayButton,
                styles.dayButtonCalendar,
                webClickable,
              ]}
              onPress={() => setDatePickerVisible(true)}
              testID="btn-day-calendar"
              accessibilityRole="button"
              accessibilityState={{ selected: !stripSelected }}
              accessibilityLabel="Scegli un altro giorno dal calendario"
            >
              <Ionicons name="calendar-outline" size={scaledFont(26)} color="#FFFFFF" />
              <Text style={styles.dayButtonLabel} numberOfLines={2}>
                Altri giorni
              </Text>
            </TouchableOpacity>
            </DayChipWrap>
          </ScrollView>
          {!stripSelected ? (
            <Text style={styles.selectedDateHint} testID="home-selected-date-hint">
              Data selezionata: {selectedDateLabel}
            </Text>
          ) : null}
        </View>

        {vigilEve ? (
          <LiturgyDayBanner
            dateLabel={selectedDateLabel}
            seasonName={selectedSeasonName}
            ceiTitle={calendarBannerTitle}
            liturgicalColor={calendarBannerColor}
            celebrationDate={selectedDate}
            colors={colors}
            fontSize={fontSize}
            framed={false}
            testID="home-day-banner-calendar"
          />
        ) : (
          <LiturgyDayBanner
            dateLabel={selectedDateLabel}
            seasonName={selectedSeasonName}
            ceiTitle={bannerCeiTitleWithRank(bannerTitle, activeCelebrateMode, vigilEve)}
            liturgicalColor={liturgicalColor}
            celebrationDate={selectedDate}
            colors={colors}
            fontSize={fontSize}
            framed={false}
            testID="home-day-banner"
          />
        )}

        {vigilEve && activeCelebrateMode !== "calendar_day" ? (
          <View style={styles.vigilSelectionBannerWrap} testID="home-vigil-banner-wrap">
            <Text style={styles.vigilSelectionBannerKind}>
              {celebrationKindLabel(activeCelebrateMode, vigilEve)}
            </Text>
            <LiturgyDayBanner
              dateLabel={selectedDateLabel}
              seasonName={getLiturgicalSeason(parseLocalDate(vigilEve.solemnityDateISO)).season}
              ceiTitle={bannerCeiTitleWithRank(bannerTitle, activeCelebrateMode, vigilEve)}
              liturgicalColor={liturgicalColor}
              celebrationDate={parseLocalDate(vigilEve.solemnityDateISO)}
              colors={colors}
              fontSize={fontSize}
              framed={false}
              testID="home-vigil-banner"
            />
          </View>
        ) : null}

        {vigilEve ? (
          <View style={styles.vigilEveBanner} testID="vigil-eve-banner">
            <Ionicons name="moon-outline" size={scaledFont(24)} color={colors.primary} />
            <Text style={styles.vigilEveText}>{vigilEveBannerMessage(vigilEve)}</Text>
          </View>
        ) : null}

        {preparaCelebraEnabled && sessions.length > 0 ? (
          <View style={styles.summariesStack} testID="home-summaries">
            {hasDualPrepared ? (
              <Text style={styles.summariesHint}>Tocca per selezionare la celebrazione</Text>
            ) : null}
            {sessions.map((s) => {
              const mode = parseCelebrationMode(s.celebrationMode);
              return (
                <HomeSessionSummary
                  key={mode}
                  session={s}
                  prefaces={prefaces}
                  prayers={prayers}
                  colors={colors}
                  fontSize={fontSize}
                  scaledFont={scaledFont}
                  kindLabel={celebrationKindLabel(mode, vigilEve)}
                  liturgySubtitle={celebrationShortLabel(mode, vigilEve, s.liturgyTitle)}
                  selected={hasDualPrepared && activeCelebrateMode === mode}
                  selectable={hasDualPrepared}
                  onSelect={
                    hasDualPrepared ? () => void handleSelectCelebrateMode(mode) : undefined
                  }
                  onReset={() => handleResetSession(mode)}
                />
              );
            })}
          </View>
        ) : null}

        {celebraSubitoEnabled && !preparaCelebraEnabled ? (
          <View style={styles.flagStack} testID="home-subito-flag-stack">
            <TouchableOpacity
              style={[
                styles.flagBtn,
                styles.flagBtnGold,
                webClickable,
                quickStarting && { opacity: 0.7 },
              ]}
              onPress={() => void openCelebraSubito()}
              disabled={quickStarting}
              testID="btn-celebra-subito"
              accessibilityRole="button"
              accessibilityLabel="Celebra subito la Messa con la liturgia di default di questo giorno"
              accessibilityState={{ disabled: quickStarting, busy: quickStarting }}
            >
              <View style={styles.flagLeft}>
                {quickStarting ? (
                  <ActivityIndicator color={QUICK_CELEBRA_GOLD} />
                ) : (
                  <HomeHeroIcon
                    variant="celebra"
                    size={Math.round(heroIconSize * 0.72)}
                    activeColor={QUICK_CELEBRA_GOLD}
                  />
                )}
                <Text style={[styles.flagTitle, styles.flagTitleGold]} numberOfLines={2}>
                  {quickStarting ? "Avvio…" : "Celebra subito la Messa"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={Math.round(scaledFont(26))}
                color={QUICK_CELEBRA_GOLD}
                style={styles.flagChevron}
              />
            </TouchableOpacity>
            {oreEnabled ? (
              <TouchableOpacity
                style={[styles.flagBtn, styles.flagBtnOre, webClickable]}
                onPress={openOre}
                testID="btn-ore"
                accessibilityRole="button"
                accessibilityLabel="Liturgia delle Ore"
              >
                <View style={styles.flagLeft}>
                  <Ionicons
                    name="book-outline"
                    size={Math.round(scaledFont(28))}
                    color={ORE_BLUE}
                  />
                  <Text style={[styles.flagTitle, styles.flagTitleOre]} numberOfLines={2}>
                    Liturgia delle Ore
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={Math.round(scaledFont(26))}
                  color={ORE_BLUE}
                  style={styles.flagChevron}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            {celebraSubitoEnabled ? (
              <TouchableOpacity
                style={[
                  styles.quickCelebraBtn,
                  styles.quickCelebraBtnOutline,
                  webClickable,
                  quickStarting && { opacity: 0.7 },
                ]}
                onPress={() => void openCelebraSubito()}
                disabled={quickStarting}
                testID="btn-celebra-subito"
                accessibilityRole="button"
                accessibilityLabel="Celebra subito la Messa con la liturgia di default di questo giorno"
                accessibilityState={{ disabled: quickStarting, busy: quickStarting }}
              >
                {quickStarting ? (
                  <ActivityIndicator color={QUICK_CELEBRA_GOLD} />
                ) : (
                  <HomeHeroIcon
                    variant="celebra"
                    size={Math.round(heroIconSize * 0.78)}
                    activeColor={QUICK_CELEBRA_GOLD}
                  />
                )}
                <Text
                  style={[styles.heroTitle, styles.heroTitleGoldOutline]}
                  numberOfLines={1}
                >
                  {quickStarting ? "Avvio…" : "Celebra subito la Messa"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {celebraSubitoEnabled && preparaCelebraEnabled ? (
              <Text style={styles.orDivider} testID="home-or-divider">
                oppure
              </Text>
            ) : null}

            {preparaCelebraEnabled ? (
            <View style={styles.heroRow} testID="hero-row">
              <TouchableOpacity
                style={[styles.heroCard, { backgroundColor: muteFill(colors.primary) }, webClickable]}
                onPress={openMessa}
                testID="btn-mass-of-the-day"
                accessibilityRole="button"
                accessibilityLabel="Scegli la liturgia"
              >
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    Scegli la liturgia
                  </Text>
              </TouchableOpacity>

              <View
                style={styles.heroFlowArrow}
                pointerEvents="none"
                accessible={false}
                testID="home-hero-flow-arrow"
              >
                <Ionicons
                  name="arrow-forward"
                  size={Math.round(scaledFont(22))}
                  color="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.heroCard,
                  hasPreparedSession
                    ? { backgroundColor: muteFill(colors.liturgicalGreen) }
                    : styles.heroCardGhost,
                  webClickable,
                ]}
                onPress={openCelebra}
                disabled={!hasPreparedSession}
                testID="btn-celebrate-clean"
                accessibilityRole="button"
                accessibilityLabel={
                  hasPreparedSession
                    ? celebrateButtonSub
                      ? `Celebra la Messa: ${celebrateButtonSub}`
                      : "Celebra la Messa, modalità lettura per l'altare"
                    : "Celebra la Messa, disponibile dopo la preparazione della liturgia"
                }
                accessibilityState={{ disabled: !hasPreparedSession }}
              >
                  <Text
                    style={[
                      styles.heroTitle,
                      !hasPreparedSession && styles.heroTitleGhost,
                    ]}
                    numberOfLines={2}
                  >
                    Celebra la Messa
                  </Text>
                  {celebrateButtonSub ? (
                    <Text style={styles.heroSub} numberOfLines={2}>
                      {celebrateButtonSub}
                    </Text>
                  ) : null}
              </TouchableOpacity>
            </View>
            ) : null}

            {oreEnabled ? (
            <TouchableOpacity
              style={[styles.quickCelebraBtn, styles.oreBtnOutline, webClickable]}
              onPress={openOre}
              testID="btn-ore"
              accessibilityRole="button"
              accessibilityLabel="Liturgia delle Ore"
            >
              <Text style={[styles.heroTitle, styles.heroTitleBlueOutline]} numberOfLines={1}>
                Liturgia delle Ore
              </Text>
            </TouchableOpacity>
            ) : null}
          </>
        )}

        <TouchableOpacity
          style={[styles.dlCard, dlRunning && { opacity: 0.75 }, webClickable]}
          onPress={() => void startUnifiedDownload()}
          disabled={dlRunning}
          testID="btn-download-ore"
          accessibilityRole="button"
          accessibilityLabel={
            oreEnabled
              ? "Scarica 10 giorni di letture della Messa e Liturgia delle Ore"
              : "Scarica 10 giorni di letture della Messa"
          }
          accessibilityState={{ disabled: dlRunning, busy: dlRunning }}
        >
          <View style={styles.dlMain}>
            <Text style={styles.dlMainLine} numberOfLines={1}>
              Scarica letture
            </Text>
            {oreEnabled ? (
            <Text style={styles.dlMainLine} numberOfLines={1}>
              e liturgia delle ore
            </Text>
            ) : (
            <Text style={styles.dlMainLine} numberOfLines={1}>
              della Messa
            </Text>
            )}
          </View>
          <View style={styles.dlSide}>
            {dlRunning ? (
              <ActivityIndicator color={QUICK_CELEBRA_GOLD} />
            ) : (
              <Text
                style={[
                  styles.dlCheck,
                  dlDaysLeft > 0 ? styles.dlCheckReady : styles.dlCheckEmpty,
                ]}
              >
                ✓
              </Text>
            )}
            <Text style={styles.dlLabel}>
              {dlRunning
                ? "Scaricando"
                : dlDaysLeft > 0
                  ? "Ancora"
                  : "Scarica"}
            </Text>
            <Text style={styles.dlCount}>
              {dlRunning && dlProgress
                ? `${dlProgress.done}/${dlProgress.total}`
                : dlDaysLeft > 0
                  ? `${dlDaysLeft} ${dlDaysLeft === 1 ? "giorno" : "giorni"}`
                  : "10 giorni"}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.compactRow} testID="home-secondary-actions">
          <TouchableOpacity
            style={[
              styles.compactCard,
              { backgroundColor: muteFill(colors.liturgicalPurple) },
              webClickable,
            ]}
            onPress={() => router.push("/calendario")}
            testID="btn-calendar"
            accessibilityRole="button"
            accessibilityLabel="Calendario liturgico"
          >
            <View style={styles.compactIconStack}>
              <HomeHeroIcon
                variant="calendar"
                size={compactIconSlot}
              />
                <Text style={styles.heroTitle} numberOfLines={2}>
                  Calendario liturgico
                </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.compactCard,
              { backgroundColor: muteFill(colors.liturgicalGreen) },
              webClickable,
            ]}
            onPress={() => router.push("/orazionale" as any)}
            testID="btn-orazionale"
            accessibilityRole="button"
            accessibilityLabel="Orazionale, Preghiera Universale"
          >
            <View style={styles.compactIconStack}>
              <HomeHeroIcon
                variant="orazionale"
                size={compactIconSlot}
              />
                <Text style={styles.heroTitle} numberOfLines={2}>
                  Orazionale
                </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          {oreEnabled
            ? "Fonte: chiesacattolica.it · Messa e Liturgia delle Ore"
            : "Fonte: chiesacattolica.it · Letture della Messa"}
        </Text>
      </ScrollView>

      {celebrateDialogVisible ? (
        <CelebrateChoiceDialog
          visible
          sessions={sessions}
          vigilCtx={vigilEve}
          colors={colors}
          fontSize={fontSize}
          onPick={(mode) => {
            setCelebrateDialogVisible(false);
            void handleSelectCelebrateMode(mode);
            goCelebra(mode);
          }}
          onCancel={() => setCelebrateDialogVisible(false)}
        />
      ) : null}
      <AppUpdateModal
        visible={updateVisible}
        info={updateInfo}
        busy={updateBusy}
        colors={colors}
        onLater={() => {
          setUpdateVisible(false);
          if (updateInfo) void dismissUpdateUntil(updateInfo.versionCode);
        }}
        onUpdate={() => {
          if (!updateInfo) return;
          setUpdateBusy(true);
          void (async () => {
            try {
              await openApkDownload(updateInfo);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Download o installazione non riuscita.";
              Alert.alert("Aggiornamento", msg);
            } finally {
              setUpdateBusy(false);
            }
          })();
        }}
      />

      {datePickerVisible ? (
        <HomeDatePickerModal
          visible
          initialDateISO={selectedDateISO}
          colors={colors}
          fontSize={fontSize}
          scaledFont={scaledFont}
          onPick={(dateISO) => {
            setDatePickerVisible(false);
            setSelectedDateISO(dateISO);
            void loadSessionsForDate(dateISO).then((saved) => {
              setPreparedCounts((prev) => ({
                ...prev,
                [dateISO]: filterHomeSummarySessions(saved).length,
              }));
            });
          }}
          onCancel={() => setDatePickerVisible(false)}
        />
      ) : null}

      {quickAccessVisible ? (
        <QuickAccessModal
          visible
          colors={colors}
          fontSize={fontSize}
          scaledFont={scaledFont}
          onClose={() => setQuickAccessVisible(false)}
          onChanged={() => void reloadQuickAccessCount()}
        />
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number, iconBtnSize: number) => {
  const heroTextOutline = {
    textShadowColor: "#000000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    ...(Platform.OS === "web"
      ? ({
          textShadow:
            "0 0 2px #000, -1.2px 0 0 #000, 1.2px 0 0 #000, 0 -1.2px 0 #000, 0 1.2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
        } as const)
      : {
          // Su native più ombre sovrapposte = cornice più spessa
          textShadowColor: "#000000",
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 5,
        }),
  };

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: colors.border,
      gap: 8,
      backgroundColor: colors.background,
      zIndex: 30,
      elevation: 16,
      position: "relative",
    },
    brandPill: {
      flex: 1,
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 0,
      borderColor: "transparent",
      borderRadius: 0,
      paddingVertical: 4,
      paddingLeft: 0,
      paddingRight: 8,
      marginRight: 4,
      minWidth: 0,
    },
    brandMark: {
      width: Math.max(34, Math.round(fontSize * 1.05)),
      height: Math.max(34, Math.round(fontSize * 1.05)),
      flexShrink: 0,
    },
    appTitle: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: Math.round(fontSize * 0.78),
      lineHeight: Math.round(fontSize * 0.95),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    topBarIconGroup: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: colors.surface,
    },
    topBarIconSlot: {
      width: iconBtnSize - 10,
      height: iconBtnSize - 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    settingsBtn: {
      alignItems: "center",
      justifyContent: "center",
      width: iconBtnSize,
      height: iconBtnSize,
      overflow: "hidden",
      backgroundColor: colors.surface,
    },
    quickAccessBtn: {
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      width: iconBtnSize,
      height: iconBtnSize,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderRightWidth: 2,
      borderRightColor: colors.border,
    },
    quickAccessBadge: {
      position: "absolute",
      top: 1,
      right: 1,
      minWidth: 15,
      height: 15,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    quickAccessBadgeText: {
      fontSize: 9,
      fontWeight: "800",
      color: colors.onPrimary,
    },
    fontBtns: { flexDirection: "row", gap: 6, flexShrink: 0 },
    homeScroll: {
      flex: 1,
      overflow: "hidden",
    },
    content: { paddingHorizontal: 8, paddingTop: 2, paddingBottom: 24, gap: 14 },
    daySelector: {
      paddingTop: 2,
      paddingHorizontal: 0,
      paddingBottom: 0,
      borderWidth: 0,
      borderRadius: 12,
      backgroundColor: "transparent",
      gap: 8,
      overflow: "visible",
    },
    daySelectorLabel: {
      fontSize: Math.min(15, Math.max(11, Math.round(fontSize * 0.42))),
      fontWeight: "600",
      color: colors.textSecondary,
    },
    legendLead: {
      fontSize: Math.min(15, Math.max(11, Math.round(fontSize * 0.42))),
      fontWeight: "800",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginRight: 2,
    },
    daySelectorLegend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendDotEmpty: {
      borderWidth: 2,
      borderColor: colors.textSecondary,
      backgroundColor: "transparent",
    },
    legendDotPrepared: {
      backgroundColor: colors.liturgicalGreen,
      borderWidth: 1.5,
      borderColor: "#000000",
    },
    legendDotsCol: {
      flexDirection: "row",
      gap: 3,
      alignItems: "center",
    },
    summariesStack: {
      gap: 12,
    },
    summariesHint: {
      fontSize: Math.round(fontSize * 0.58),
      fontWeight: "800",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    dayButtonsScroll: {
      overflow: "visible",
    },
    dayButtonsRow: {
      flexDirection: "row",
      gap: 10,
      paddingLeft: 8,
      paddingRight: 10,
      paddingTop: 8,
      paddingBottom: 12,
      alignItems: "stretch",
    },
    dayButtonOuter: {
      position: "relative",
      alignSelf: "stretch",
      borderRadius: ACTION_RADIUS + 6,
      padding: 5,
    },
    dayButtonOuterActive: Platform.select({
      web: {
        zIndex: 2,
        boxShadow:
          "0 0 0 3px rgba(77, 168, 218, 0.95), 0 0 8px 3px rgba(77, 168, 218, 0.55), 0 0 16px 6px rgba(77, 168, 218, 0.22)",
      },
      default: {
        shadowColor: ORE_BLUE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
    dayHaloNear: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: ACTION_RADIUS + 6,
      borderWidth: 3,
      borderColor: ORE_BLUE,
    },
    dayButton: {
      position: "relative",
      // Su Android `flex: 1` imposta flexBasis 0 e fa collassare l'altezza
      // intrinseca dentro lo ScrollView orizzontale. flexGrow conserva la
      // misura del contenuto e poi porta tutti i chip all'altezza del più alto.
      flexGrow: 1,
      width: Math.round(fontSize * 8.4),
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderWidth: 3,
      borderColor: colors.border,
      borderRadius: ACTION_RADIUS,
      backgroundColor: "#000000",
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: Math.round(fontSize * 2.5),
      gap: 6,
      overflow: "visible",
    },
    dayButtonToday: {
      backgroundColor: "#000000",
    },
    dayStatusDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    dayStatusDotSolo: {
      position: "absolute",
      top: -3,
      right: -3,
      width: 20,
      height: 20,
      borderRadius: 10,
      zIndex: 2,
    },
    dayStatusDotsStack: {
      position: "absolute",
      top: -3,
      right: -3,
      flexDirection: "column",
      gap: 4,
      alignItems: "center",
      zIndex: 2,
    },
    dayStatusDotPrepared: {
      backgroundColor: colors.liturgicalGreen,
      borderWidth: 2,
      borderColor: "#000000",
    },
    dayStatusDotEmpty: {
      borderWidth: 2,
      borderColor: colors.textSecondary,
      backgroundColor: colors.surface,
    },
    dayButtonLabel: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: ACTION_LABEL_WEIGHT,
      color: "#FFFFFF",
      textAlign: "center",
      lineHeight: Math.round(fontSize * 1.12),
      flexShrink: 0,
    },
    dayButtonWeekday: {
      fontSize: Math.round(fontSize * 0.78),
      fontWeight: ACTION_LABEL_WEIGHT,
      color: "#FFFFFF",
      textAlign: "center",
      lineHeight: Math.round(fontSize * 1.12),
      flexShrink: 1,
    },
    dayButtonDateRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "center",
      gap: 5,
      flexWrap: "nowrap",
      width: "100%",
      paddingHorizontal: 4,
      paddingTop: 2,
    },
    dayButtonNum: {
      fontSize: Math.round(fontSize * 1.08),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: "#FFFFFF",
      lineHeight: Math.round(fontSize * 1.28),
      flexShrink: 0,
    },
    dayButtonMonth: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "600",
      color: "#FFFFFF",
      lineHeight: Math.round(fontSize * 1.12),
      flexShrink: 1,
    },
    dayButtonMonthLine: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "600",
      color: "#FFFFFF",
      lineHeight: Math.round(fontSize * 1.12),
      textAlign: "center",
      width: "100%",
    },
    dayButtonCelebration: {
      fontSize: Math.round(fontSize * 0.68),
      fontWeight: "400",
      color: "#FFFFFF",
      textAlign: "center",
      lineHeight: Math.round(fontSize * 0.98),
      marginTop: 4,
      width: "100%",
      paddingHorizontal: 2,
    },
    dayButtonCalendar: {
      justifyContent: "center",
      gap: 4,
    },
    selectedDateHint: {
      fontSize: Math.round(fontSize * 0.62),
      fontWeight: "700",
      color: colors.primary,
      textAlign: "center",
      marginTop: 4,
    },
    heroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    heroFlowArrow: {
      flexShrink: 0,
      width: Math.max(18, Math.round(fontSize * 0.7)),
      alignItems: "center",
      justifyContent: "center",
    },
    orDivider: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "700",
      color: colors.textSecondary,
      textAlign: "center",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    flagStack: {
      width: "100%",
      gap: 12,
    },
    flagBtn: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minHeight: Math.round(ACTION_MIN_HEIGHT * 1.05),
      paddingVertical: 16,
      paddingRight: 14,
      paddingLeft: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderLeftWidth: 5,
    },
    flagBtnGold: {
      borderLeftColor: QUICK_CELEBRA_GOLD,
      borderColor: "rgba(224, 180, 41, 0.35)",
    },
    flagBtnOre: {
      borderLeftColor: ORE_BLUE,
      borderColor: "rgba(77, 168, 218, 0.35)",
    },
    flagLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      minWidth: 0,
    },
    flagTitle: {
      flex: 1,
      flexShrink: 1,
      fontSize: Math.round(fontSize * 1.22),
      lineHeight: Math.round(fontSize * 1.38),
      fontWeight: ACTION_TITLE_WEIGHT,
      textAlign: "left",
      letterSpacing: Math.round(fontSize * 0.15),
      fontVariant: ["small-caps"],
      includeFontPadding: false,
      ...(Platform.OS === "web"
        ? ({
            fontVariant: "small-caps",
          } as const)
        : {}),
    },
    flagTitleGold: {
      color: QUICK_CELEBRA_GOLD,
    },
    flagTitleOre: {
      color: ORE_BLUE,
    },
    flagChevron: {
      opacity: 0.7,
      flexShrink: 0,
    },
    quickCelebraBtn: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: ACTION_RADIUS,
      minHeight: Math.round(ACTION_MIN_HEIGHT * 0.82 * 1.2),
    },
    quickCelebraBtnOutline: {
      backgroundColor: "transparent",
      borderWidth: 4,
      borderColor: QUICK_CELEBRA_GOLD,
    },
    oreBtnOutline: {
      backgroundColor: "transparent",
      borderWidth: 4,
      borderColor: ORE_BLUE,
    },
    heroCard: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: ACTION_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      minHeight: ACTION_MIN_HEIGHT,
      gap: 4,
    },
    compactIconStack: {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      width: "100%",
      gap: 8,
    },
    heroCardGhost: {
      backgroundColor: "transparent",
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: "dashed",
      opacity: 0.58,
    },
    heroTitle: {
      fontSize: Math.round(fontSize * 1.05),
      lineHeight: Math.round(fontSize * 1.18),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: colors.onPrimary,
      textAlign: "center",
      width: "100%",
      flexShrink: 1,
      includeFontPadding: false,
      textAlignVertical: "center",
      letterSpacing: Math.round(fontSize * 0.15),
      fontVariant: ["small-caps"],
      ...heroTextOutline,
      ...(Platform.OS === "web"
        ? ({
            fontVariant: "small-caps",
          } as const)
        : {}),
    },
    heroTitleGhost: {
      color: colors.textSecondary,
      fontWeight: ACTION_LABEL_WEIGHT,
      ...heroTextOutline,
    },
    heroTitleGoldOutline: {
      color: QUICK_CELEBRA_GOLD,
      fontSize: Math.round(fontSize * 1.05),
      lineHeight: Math.round(fontSize * 1.18),
      fontVariant: ["small-caps"],
      letterSpacing: Math.round(fontSize * 0.15),
      flexShrink: 1,
      width: "auto",
      textShadowColor: "transparent",
      textShadowRadius: 0,
      ...(Platform.OS === "web"
        ? ({
            textShadow: "none",
            fontVariant: "small-caps",
          } as const)
        : {}),
    },
    heroTitleBlueOutline: {
      color: ORE_BLUE,
      fontSize: Math.round(fontSize * 1.05),
      lineHeight: Math.round(fontSize * 1.18),
      fontVariant: ["small-caps"],
      letterSpacing: Math.round(fontSize * 0.15),
      flexShrink: 1,
      width: "auto",
      textShadowColor: "transparent",
      textShadowRadius: 0,
      ...(Platform.OS === "web"
        ? ({
            textShadow: "none",
            fontVariant: "small-caps",
          } as const)
        : {}),
    },
    heroSub: {
      width: "100%",
      fontSize: Math.round(fontSize * 0.62),
      lineHeight: Math.round(fontSize * 0.82),
      fontWeight: "600",
      color: colors.onPrimary,
      textAlign: "center",
      marginTop: 2,
      flexShrink: 0,
      letterSpacing: 0.2,
      ...heroTextOutline,
    },
    compactRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 12,
      marginTop: 12,
    },
    dlCard: {
      flexDirection: "row",
      alignItems: "stretch",
      borderWidth: 3,
      borderColor: ORE_BLUE,
      borderRadius: ACTION_RADIUS,
      minHeight: ACTION_MIN_HEIGHT,
      overflow: "hidden",
      backgroundColor: "transparent",
    },
    dlMain: {
      flex: 2,
      minWidth: 0,
      paddingVertical: 12,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    dlMainLine: {
      color: ORE_BLUE,
      fontWeight: ACTION_TITLE_WEIGHT,
      fontSize: Math.round(fontSize * 0.72),
      lineHeight: Math.round(fontSize * 0.92),
      letterSpacing: 0.4,
    },
    dlSide: {
      flex: 1,
      minWidth: 88,
      borderLeftWidth: 2,
      borderLeftColor: ORE_BLUE,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      paddingHorizontal: 6,
      backgroundColor: "#000000",
      gap: 2,
    },
    dlCheck: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "800",
      lineHeight: Math.round(fontSize * 1),
    },
    dlCheckReady: { color: DL_CHECK_GREEN },
    dlCheckEmpty: { color: "#555555" },
    dlLabel: {
      color: "#FFFFFF",
      fontWeight: "800",
      fontSize: Math.round(fontSize * 0.48),
      textTransform: "uppercase",
    },
    dlCount: {
      color: QUICK_CELEBRA_GOLD,
      fontWeight: "800",
      fontSize: Math.round(fontSize * 0.55),
      textAlign: "center",
    },
    compactCard: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 14,
      paddingHorizontal: 10,
      borderRadius: ACTION_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      minHeight: ACTION_MIN_HEIGHT,
    },
    footer: {
      fontSize: Math.round(fontSize * 0.55),
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 20,
    },
    vigilEveBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 12,
    },
    vigilEveText: {
      flex: 1,
      fontSize: Math.round(fontSize * 0.62),
      color: colors.textSecondary,
      fontWeight: "600",
      lineHeight: Math.round(fontSize * 0.9),
    },
    vigilSelectionBannerWrap: {
      marginBottom: 16,
    },
    vigilSelectionBannerKind: {
      fontSize: Math.round(fontSize * 0.58),
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: colors.primary,
      marginBottom: 8,
    },
    offlineBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.liturgicalGreen,
      borderRadius: 12,
    },
    offlineText: {
      flex: 1,
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textPrimary,
      fontWeight: "600",
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.rubrics,
      borderRadius: 12,
    },
    errorText: { flex: 1, fontSize: Math.round(fontSize * 0.65), color: colors.textPrimary },
  });
};
