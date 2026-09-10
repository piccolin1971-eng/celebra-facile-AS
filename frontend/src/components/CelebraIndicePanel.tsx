/**
 * Pannello indice «Celebra subito» (lista parti + Cambia prefazio/PE/penitenziale).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Preface, EucharisticPrayer } from "../api";
import type { MassSession } from "../massSession";
import type { FontFamilyId } from "../fontFamily";
import {
  buildCelebraIndexItems,
  celebraIndexAccentByOrder,
  celebraIndexAccentBySectionId,
  shortPrefaceLabel,
  type CelebraSectionId,
} from "../celebraIndex";
import { PrefaceSelectorModal } from "./PrefaceSelectorModal";
import { BrandScreenTitle } from "./BrandScreenTitle";
import { HomeCircleButton } from "./HomeCircleButton";
import { SettingsTopBarButton } from "./SettingsTopBarButton";
import { FontSizeButtons } from "./FontSizeButtons";
import { shouldOfferSaintProperToggle } from "../saintLectionary";
import {
  ACTION_MIN_HEIGHT,
  ACTION_TITLE_WEIGHT,
} from "../uiActionTokens";
import { italianDateLabel, italianDateLabelFromISO, parseLocalDate } from "../dateUtils";
import { getLiturgicalSeason, getSaintsForDate } from "../localLiturgy";
import { shouldSuppressFacultativeMemory } from "../liturgicalCelebrationUtils";
import {
  calendarCelebrationBannerTitle,
  homeBannerLiturgicalColor,
  liturgicalColorHex,
  parseBannerCelebration,
} from "../homeBannerUtils";
import {
  eucharisticPrayerAccentColor,
  eucharisticPrayerFamilyLabel,
} from "../eucharisticPrayerUi";
import { triggerAppHaptic } from "../appHaptics";
import fixedPartsData from "../data/fixedParts.json";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

const PENITENTIAL_FORMULAS =
  (
    fixedPartsData.atto_penitenziale?.sections?.find(
      (s: { type?: string }) => s.type === "choice",
    ) as { options?: { id: string; label: string; season_variants?: Record<string, { label: string }> }[] }
  )?.options ?? [];

/** Ultima sezione aperta: bordo giallo 4px (proposta B). */
const INDEX_ACTIVE_BORDER = "#FFE566";
const INDEX_ACTIVE_BG = "#121200";
const INDEX_BTN_BG = "#000000";
const INDEX_BTN_BG_ALT = "#080808";
const INDEX_CHANGE_TEXT = "#7EC8F0";

type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  liturgicalGreen: string;
  liturgicalRed: string;
  liturgicalPurple: string;
  liturgicalWhite: string;
  liturgicalRose: string;
};

type Props = {
  colors: ThemeColors;
  fontSize: number;
  scaledFont: (n: number) => number;
  fontFamilyId: FontFamilyId;
  isBold: boolean;
  session: MassSession | null;
  prefaces: Preface[];
  prayers: EucharisticPrayer[];
  liturgy: any;
  /** Liturgia senza merge del lezionario santo (per mostrare sempre il toggle). */
  baseLiturgy?: any;
  currentSeasonKey: string;
  loading?: boolean;
  onHome: () => void;
  onOpenSection: (section: CelebraSectionId) => void;
  onPatchSession: (patch: Partial<MassSession>) => void;
  /** Sezione aperta per ultima (ripresa dopo ritorno all'indice). */
  lastOpenedSection?: CelebraSectionId | null;
  /** Quando torna true, centra la sezione di partenza nella lista. */
  listVisible?: boolean;
};

export function CelebraIndicePanel({
  colors,
  fontSize,
  scaledFont,
  fontFamilyId,
  isBold,
  session,
  prefaces,
  prayers,
  liturgy,
  baseLiturgy,
  currentSeasonKey,
  loading,
  onHome,
  onOpenSection,
  onPatchSession,
  lastOpenedSection,
  listVisible = true,
}: Props) {
  const router = useRouter();
  const styles = makeStyles(colors, fontSize);
  const [showPrefaces, setShowPrefaces] = useState(false);
  const [showPrayers, setShowPrayers] = useState(false);
  const [showPenitential, setShowPenitential] = useState(false);
  const [expandedPrefaceSeason, setExpandedPrefaceSeason] = useState<string | null>("suggeriti");
  const listScrollRef = useRef<ScrollView>(null);
  const rowLayoutRef = useRef<Partial<Record<CelebraSectionId, { y: number; height: number }>>>(
    {},
  );
  const viewportHeightRef = useRef(0);

  const dayFrame = useMemo(() => {
    const iso = typeof liturgy?.date === "string" ? liturgy.date : "";
    const date = iso ? parseLocalDate(iso) : new Date();
    const dateLabel =
      italianDateLabelFromISO(iso) ||
      (typeof liturgy?.date_label === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(liturgy.date_label)
        ? liturgy.date_label.trim()
        : "") ||
      italianDateLabel(date);
    const ceiTitle =
      (typeof liturgy?.title === "string" ? liturgy.title.trim() : "") ||
      (session?.liturgyTitle || "").trim();
    const season = getLiturgicalSeason(date);
    const saints = getSaintsForDate(date);
    let rawTitle = ceiTitle || calendarCelebrationBannerTitle(date);
    if (rawTitle && shouldSuppressFacultativeMemory(rawTitle, season.season, date)) {
      rawTitle = "";
    } else if (!ceiTitle && saints.length > 0) {
      const hasObligatory = saints.some(
        (s) =>
          s.rank === "solennita" ||
          s.rank === "festa" ||
          s.rank === "memoria_obbligatoria",
      );
      if (!hasObligatory) rawTitle = "";
    }
    const liturgicalColor = homeBannerLiturgicalColor(
      date,
      "calendar_day",
      null,
      rawTitle,
    );
    const parsed = parseBannerCelebration(
      rawTitle || undefined,
      season.season,
      date,
    );
    const isSunday = date.getDay() === 0;
    const isGreenWeekdayFeria =
      liturgicalColor === "verde" && parsed.rankLabel === "Feria" && !isSunday;
    // Titolo completo (niente abbreviazione a 28 caratteri della striscia Home).
    const saintLine = isGreenWeekdayFeria
      ? null
      : (parsed.displayTitle || "").trim() || null;
    return {
      dateLabel,
      saintLine,
      colorHex: liturgicalColorHex(liturgicalColor, colors),
    };
  }, [liturgy, session?.liturgyTitle, colors]);

  const items = useMemo(() => buildCelebraIndexItems(session), [session]);
  const selectedPreface = prefaces.find((p) => p.id === session?.selectedPrefaceId);
  const selectedPrayer = prayers.find((p) => p.id === session?.selectedPrayerId);
  const penForm = session?.penitentialForm || "A";
  const penSeason = session?.penitentialSeason || "ordinario";
  const penFormulaOpt = PENITENTIAL_FORMULAS.find((o) => o.id === penForm);
  const penSeasonLabel =
    penForm === "C"
      ? penFormulaOpt?.season_variants?.[penSeason]?.label || "Tempo liturgico"
      : null;
  const offerSaintReadings = shouldOfferSaintProperToggle(baseLiturgy || liturgy);
  const useSaintProper = session?.useSaintProperReadings === true;

  const scrollLastSectionToCenter = () => {
    if (!lastOpenedSection) return;
    const row = rowLayoutRef.current[lastOpenedSection];
    const vh = viewportHeightRef.current;
    if (!row || vh <= 0) return;
    const targetY = Math.max(0, row.y + row.height / 2 - vh / 2);
    listScrollRef.current?.scrollTo({ y: targetY, animated: false });
  };

  useEffect(() => {
    if (!listVisible) return;
    if (loading && !session) return;
    const id = requestAnimationFrame(() => scrollLastSectionToCenter());
    const t = setTimeout(scrollLastSectionToCenter, 80);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [listVisible, loading, session, items.length, lastOpenedSection]);
  return (
    <SafeAreaView style={styles.container} testID="celebra-indice-screen">
      <View style={styles.topBar}>
        <HomeCircleButton onPress={onHome} testID="btn-indice-home" />
        <BrandScreenTitle
          title="Celebra subito la Messa"
          textStyle={styles.title}
          numberOfLines={2}
          markSize={Math.max(30, Math.round(fontSize * 0.95))}
        />
        <View style={styles.fontBtns}>
          <FontSizeButtons
            decreaseTestID="btn-font-decrease-indice"
            increaseTestID="btn-font-increase-indice"
          />
          <SettingsTopBarButton
            onPress={() => router.push("/impostazioni")}
            color={colors.textPrimary}
            size={scaledFont(32)}
            testID="btn-settings-indice"
            style={styles.settingsBtn}
          />
        </View>
      </View>

      <View
        style={[styles.dayFrame, { borderColor: dayFrame.colorHex }]}
        testID="indice-day-frame"
      >
        <Text style={styles.dayFrameLine} numberOfLines={3}>
          {dayFrame.saintLine
            ? `${dayFrame.dateLabel} · ${dayFrame.saintLine}`
            : dayFrame.dateLabel}
        </Text>
      </View>

      {loading && !session ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          ref={listScrollRef}
          contentContainerStyle={styles.list}
          testID="celebra-indice-list"
          onContentSizeChange={scrollLastSectionToCenter}
          onLayout={(e) => {
            viewportHeightRef.current = e.nativeEvent.layout.height;
            scrollLastSectionToCenter();
          }}
        >
          {items.map((item, index) => {
            const isPreface = item.kind === "preface";
            const isPe = item.kind === "pe";
            const isLetture = item.id === "letture";
            const isPenitential = item.id === "atto_penitenziale";
            const showChange =
              isPreface || isPe || isPenitential || (isLetture && offerSaintReadings);
            const sub =
              isPreface
                ? shortPrefaceLabel(selectedPreface?.title) ||
                  (session?.selectedPrefaceId ? "…" : "Prefazio del giorno")
                : isPe
                  ? selectedPrayer?.title || "Preghiera Eucaristica II"
                  : isPenitential
                    ? penForm === "C" && penSeasonLabel
                      ? `Formula C · ${penSeasonLabel}`
                      : penFormulaOpt?.label?.replace(/^Formula [ABC] - /, "Formula ") ||
                        `Formula ${penForm}`
                    : isLetture && offerSaintReadings
                      ? useSaintProper
                        ? "Letture del Santo"
                        : "Letture del giorno (CEI)"
                      : null;
            const accent = celebraIndexAccentByOrder(index);
            const isLast = lastOpenedSection === item.id;

            return (
              <View
                key={item.id}
                style={styles.row}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  rowLayoutRef.current[item.id] = { y, height };
                  if (item.id === lastOpenedSection) {
                    scrollLastSectionToCenter();
                  }
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.mainBtn,
                    {
                      borderColor: accent,
                      backgroundColor: isLast ? INDEX_ACTIVE_BG : INDEX_BTN_BG,
                    },
                    isLast && styles.mainBtnActive,
                    webClickable,
                  ]}
                  onPress={() => {
                    void triggerAppHaptic("selection");
                    onOpenSection(item.id);
                  }}
                  testID={`indice-${item.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isLast }}
                  accessibilityLabel={
                    (sub ? `${item.label}: ${sub}` : item.label) +
                    (isLast ? ", ultima aperta" : "")
                  }
                >
                  <Text style={styles.mainBtnText}>{item.label}</Text>
                  {sub ? <Text style={styles.mainBtnSub}>{sub}</Text> : null}
                </TouchableOpacity>
                {showChange ? (
                  <TouchableOpacity
                    style={[styles.changeBtn, webClickable]}
                    onPress={() => {
                      void triggerAppHaptic("light");
                      if (isPreface) {
                        setExpandedPrefaceSeason("suggeriti");
                        setShowPrefaces(true);
                      } else if (isPe) {
                        setShowPrayers(true);
                      } else if (isPenitential) {
                        setShowPenitential(true);
                      } else {
                        onPatchSession({ useSaintProperReadings: !useSaintProper });
                      }
                    }}
                    testID={`indice-cambia-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPreface
                        ? "Cambia prefazio"
                        : isPe
                          ? "Cambia preghiera eucaristica"
                          : isPenitential
                            ? "Cambia formula dell'atto penitenziale"
                            : useSaintProper
                                ? "Usa letture del giorno"
                                : "Usa lezionario del santo"
                    }
                  >
                    <Text
                      style={styles.changeBtnText}
                      numberOfLines={isLetture ? 3 : 1}
                      adjustsFontSizeToFit={!isLetture}
                    >
                      {isLetture
                        ? useSaintProper
                          ? "Letture del giorno"
                          : "Letture del Santo"
                        : "Cambia"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.changeBtnSpacer} pointerEvents="none" />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <PrefaceSelectorModal
        visible={showPrefaces}
        onClose={() => setShowPrefaces(false)}
        prefaces={prefaces}
        selectedId={session?.selectedPrefaceId || ""}
        onSelect={(id) => {
          onPatchSession({ selectedPrefaceId: id });
          setShowPrefaces(false);
        }}
        currentSeasonKey={currentSeasonKey}
        liturgy={liturgy}
        colors={colors}
        scaledFont={scaledFont}
        fontFamilyId={fontFamilyId}
        isBold={isBold}
        expandedSeason={expandedPrefaceSeason}
        setExpandedSeason={setExpandedPrefaceSeason}
      />

      <Modal
        visible={showPenitential}
        animationType="slide"
        onRequestClose={() => setShowPenitential(false)}
      >
        <SafeAreaView style={styles.container} testID="indice-modal-penitential">
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setShowPenitential(false)}
              accessibilityLabel="Chiudi"
            >
              <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>Chiudi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Atto penitenziale</Text>
            <View style={{ width: 56 }} />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.modalSectionLabel}>Formula</Text>
            {PENITENTIAL_FORMULAS.map((opt) => {
              const active = opt.id === penForm;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.mainBtn,
                    {
                      borderColor: celebraIndexAccentBySectionId("atto_penitenziale"),
                      backgroundColor: active ? INDEX_ACTIVE_BG : INDEX_BTN_BG,
                    },
                    active && styles.mainBtnActive,
                    webClickable,
                  ]}
                  onPress={() => {
                    onPatchSession({
                      penitentialForm: opt.id as "A" | "B" | "C",
                    });
                    if (opt.id !== "C") setShowPenitential(false);
                  }}
                  testID={`indice-pick-pen-${opt.id}`}
                >
                  <Text style={styles.mainBtnText}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
            {penForm === "C" && penFormulaOpt?.season_variants ? (
              <>
                <Text style={[styles.modalSectionLabel, { marginTop: 8 }]}>
                  Tempo liturgico (tropari)
                </Text>
                {Object.entries(penFormulaOpt.season_variants).map(([key, v]) => {
                  const active = key === penSeason;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.mainBtn,
                        {
                          borderColor: celebraIndexAccentBySectionId("atto_penitenziale"),
                          backgroundColor: active ? INDEX_ACTIVE_BG : INDEX_BTN_BG,
                        },
                        active && styles.mainBtnActive,
                        webClickable,
                      ]}
                      onPress={() => {
                        onPatchSession({
                          penitentialForm: "C",
                          penitentialSeason: key,
                        });
                        setShowPenitential(false);
                      }}
                      testID={`indice-pick-pen-season-${key}`}
                    >
                      <Text style={styles.mainBtnText}>{v.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showPrayers} animationType="slide" onRequestClose={() => setShowPrayers(false)}>
        <SafeAreaView style={styles.container} testID="indice-modal-prayers">
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setShowPrayers(false)}
              accessibilityLabel="Chiudi"
            >
              <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>Chiudi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Preghiere Eucaristiche</Text>
            <View style={{ width: 56 }} />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {prayers.map((p) => {
              const active = p.id === session?.selectedPrayerId;
              const accent = eucharisticPrayerAccentColor(p.id);
              const familyLabel = eucharisticPrayerFamilyLabel(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.mainBtn,
                    {
                      borderColor: accent,
                      backgroundColor: active ? INDEX_ACTIVE_BG : INDEX_BTN_BG,
                    },
                    active && styles.mainBtnActive,
                    webClickable,
                  ]}
                  onPress={() => {
                    onPatchSession({ selectedPrayerId: p.id, peSelections: {} });
                    setShowPrayers(false);
                  }}
                  testID={`indice-pick-pe-${p.id}`}
                >
                  {familyLabel ? (
                    <Text style={[styles.mainBtnFamily, { color: accent }]}>{familyLabel}</Text>
                  ) : null}
                  <Text style={styles.mainBtnText}>{p.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors, fontSize: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 2,
      borderBottomColor: colors.border,
      gap: 8,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minWidth: 88,
    },
    backBtnText: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    title: {
      textAlign: "left",
      fontSize: Math.round(fontSize * 0.95),
      fontWeight: "800",
      color: colors.textPrimary,
    },
    fontBtns: {
      flexDirection: "row",
      gap: 6,
      flexShrink: 0,
      minWidth: 88,
      justifyContent: "flex-end",
      alignItems: "center",
    },
    settingsBtn: {
      minWidth: 40,
      paddingHorizontal: 6,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    dayFrame: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      borderWidth: 3,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: INDEX_BTN_BG_ALT,
    },
    dayFrameLine: {
      fontSize: Math.round(fontSize * 0.92),
      lineHeight: Math.round(fontSize * 1.15),
      fontWeight: "600",
      color: "#FFFFFF",
      textAlign: "center",
    },
    list: {
      padding: 16,
      paddingBottom: 40,
      gap: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 8,
      minHeight: ACTION_MIN_HEIGHT,
    },
    mainBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 14,
      minHeight: ACTION_MIN_HEIGHT,
      justifyContent: "center",
      borderWidth: 5,
      overflow: "hidden",
    },
    mainBtnActive: {
      borderWidth: 6,
      borderColor: INDEX_ACTIVE_BORDER,
    },
    mainBtnText: {
      fontSize: Math.round(fontSize * 1.12),
      lineHeight: Math.round(fontSize * 1.18),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: "#FFFFFF",
      textAlign: "left",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    mainBtnFamily: {
      fontSize: Math.round(fontSize * 0.72),
      lineHeight: Math.round(fontSize * 0.95),
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    mainBtnSub: {
      marginTop: 6,
      fontSize: Math.round(fontSize * 0.85),
      lineHeight: Math.round(fontSize * 1.1),
      fontWeight: "500",
      color: "#E0E0E0",
      textAlign: "left",
      letterSpacing: 0.3,
      paddingHorizontal: 0,
      textTransform: "none",
    },
    changeBtn: {
      minWidth: 96,
      maxWidth: 128,
      width: 112,
      paddingHorizontal: 10,
      paddingVertical: 13,
      minHeight: ACTION_MIN_HEIGHT,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: INDEX_BTN_BG_ALT,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },
    changeBtnSpacer: {
      minWidth: 96,
      maxWidth: 128,
      width: 112,
      minHeight: ACTION_MIN_HEIGHT,
      opacity: 0,
    },
    changeBtnText: {
      fontSize: Math.round(fontSize * 0.74),
      lineHeight: Math.round(fontSize * 1.12),
      fontWeight: "700",
      textAlign: "center",
      color: INDEX_CHANGE_TEXT,
      textTransform: "none",
      letterSpacing: 0,
    },
    modalSectionLabel: {
      fontSize: Math.round(fontSize * 0.78),
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
  });
