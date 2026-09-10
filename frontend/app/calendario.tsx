import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { SectionScreenTopBar } from "../src/components/SectionScreenTopBar";
import { api, VotiveMass } from "../src/api";
import { loadLiturgy } from "../src/offlineCache";
import { localDateStr } from "../src/dateUtils";
import {
  buildMonthCalendarDays,
  enrichMonthFromCachedLiturgy,
  yearForMonthView,
  type CalendarDayEntry,
} from "../src/calendarMonth";
import {
  ACTION_LABEL_WEIGHT,
  ACTION_MIN_HEIGHT,
  ACTION_RADIUS,
  ACTION_TITLE_WEIGHT,
} from "../src/uiActionTokens";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function CelebraAction({
  colors,
  dotSize,
  labelSize,
}: {
  colors: ReturnType<typeof useSettings>["colors"];
  dotSize: number;
  labelSize: number;
}) {
  return (
    <View style={celebraStyles.wrap}>
      <View
        style={[
          celebraStyles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: colors.primary,
          },
        ]}
      />
      <Text style={[celebraStyles.label, { fontSize: labelSize, color: colors.primary }]}>
        Celebra
      </Text>
    </View>
  );
}

const celebraStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 5, minWidth: 56, paddingHorizontal: 4 },
  dot: {},
  label: { fontWeight: ACTION_LABEL_WEIGHT, lineHeight: 14 },
});

function DayCard({
  day,
  onPress,
  colors,
  fontSize,
  colorHex,
  styles,
  isToday,
  onLayout,
}: {
  day: CalendarDayEntry;
  onPress: () => void;
  colors: ReturnType<typeof useSettings>["colors"];
  fontSize: number;
  colorHex: (c: string) => string;
  styles: ReturnType<typeof makeStyles>;
  isToday?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const pillColor = colorHex(day.liturgicalColor);
  const dotSize = Math.round(fontSize * 0.7);
  const labelSize = Math.round(fontSize * 0.65);

  return (
    <TouchableOpacity
      style={[styles.dayCard, isToday && styles.dayCardToday]}
      testID={`calendar-day-${day.dateISO}`}
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ selected: !!isToday }}
      accessibilityLabel={`${isToday ? "Oggi. " : ""}Celebra la messa del ${day.dateISO}: ${day.title}`}
      activeOpacity={0.7}
    >
      <View style={styles.dateCol}>
        <Text style={styles.dayNum}>{day.dayNum}</Text>
        <Text style={styles.weekdayShort}>{day.weekdayShort}</Text>
      </View>

      <View
        style={[
          styles.colorPill,
          {
            backgroundColor: pillColor,
            borderWidth: day.liturgicalColor === "bianco" ? 1 : 0,
            borderColor: colors.border,
          },
        ]}
      />

      <View style={styles.dayBody}>
        <Text style={styles.rankLabel}>{day.rankLabel}</Text>
        <Text style={styles.dayTitle} numberOfLines={2}>
          {day.title}
        </Text>
      </View>

      <CelebraAction colors={colors} dotSize={dotSize} labelSize={labelSize} />
    </TouchableOpacity>
  );
}

function dayCardBorderColor(
  theme: ReturnType<typeof useSettings>["theme"],
  highContrast: boolean,
  colors: ReturnType<typeof useSettings>["colors"],
): string {
  if (highContrast) return colors.border;
  if (theme === "dark") return "#666666";
  if (theme === "parchment") return colors.textSecondary;
  return "#B8B3A8";
}

export default function CalendarioScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont, theme, highContrast } = useSettings();
  const [votive, setVotive] = useState<VotiveMass[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [monthDays, setMonthDays] = useState<CalendarDayEntry[]>([]);
  const [loadingVotive, setLoadingVotive] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [tab, setTab] = useState<"santi" | "votive">("santi");
  const styles = makeStyles(colors, fontSize, dayCardBorderColor(theme, highContrast, colors));
  const todayISO = useMemo(() => localDateStr(new Date()), []);
  const openingMonth = useMemo(() => new Date().getMonth() + 1, []);
  const monthChips = useMemo(() => {
    const start = openingMonth - 1;
    return Array.from({ length: 12 }, (_, i) => {
      const idx = (start + i) % 12;
      return { label: MONTHS[idx], month: idx + 1 };
    });
  }, [openingMonth]);
  const listScrollRef = useRef<ScrollView>(null);
  const didScrollToTodayRef = useRef(false);

  const viewYear = useMemo(() => yearForMonthView(selectedMonth), [selectedMonth]);

  useEffect(() => {
    (async () => {
      try {
        const v = await api.votiveMasses();
        setVotive(v.masses);
      } catch (e) {
        if (__DEV__) console.log("Errore votive:", e);
      } finally {
        setLoadingVotive(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMonth(true);
      const base = buildMonthCalendarDays(viewYear, selectedMonth);
      try {
        const enriched = await enrichMonthFromCachedLiturgy(base, loadLiturgy);
        if (!cancelled) setMonthDays(enriched);
      } catch {
        if (!cancelled) setMonthDays(base);
      } finally {
        if (!cancelled) setLoadingMonth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, viewYear]);

  useEffect(() => {
    didScrollToTodayRef.current = false;
  }, [selectedMonth, viewYear, loadingMonth]);

  const scrollTodayToTop = (y: number) => {
    if (didScrollToTodayRef.current) return;
    didScrollToTodayRef.current = true;
    const top = Math.max(0, y);
    const run = () => {
      const sv = listScrollRef.current;
      if (!sv) return;
      sv.scrollTo({ y: top, animated: false });
      if (Platform.OS === "web") {
        const node = (
          sv as unknown as { getScrollableNode?: () => { scrollTop: number } }
        ).getScrollableNode?.();
        if (node) node.scrollTop = top;
      }
    };
    requestAnimationFrame(run);
  };

  useEffect(() => {
    if (loadingMonth) return;
    if (!monthDays.some((d) => d.dateISO === todayISO)) return;
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let cancelled = false;
    const align = () => {
      if (cancelled) return;
      const list = document.querySelector('[data-testid="calendar-day-list"]') as HTMLElement | null;
      const todayEl = document.querySelector(
        `[data-testid="calendar-day-${todayISO}"]`,
      ) as HTMLElement | null;
      if (!list || !todayEl) return;
      const listBox = list.getBoundingClientRect();
      const todayBox = todayEl.getBoundingClientRect();
      const y = list.scrollTop + todayBox.top - listBox.top;
      if (Math.abs(list.scrollTop - y) > 2) list.scrollTop = Math.max(0, y);
    };
    const t0 = setTimeout(align, 0);
    const t1 = setTimeout(align, 80);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [loadingMonth, monthDays, todayISO]);

  const colorHex = (c: string) => {
    switch (c) {
      case "bianco":
        return colors.liturgicalWhite;
      case "rosso":
        return colors.liturgicalRed;
      case "verde":
        return colors.liturgicalGreen;
      case "viola":
        return colors.liturgicalPurple;
      case "rosa":
        return colors.liturgicalRose;
      default:
        return colors.border;
    }
  };

  const loading = tab === "santi" ? loadingMonth : loadingVotive;

  return (
    <SafeAreaView style={styles.container} testID="calendar-screen">
      <SectionScreenTopBar
        title="Calendario liturgico"
        onHome={() => router.back()}
        colors={colors}
        fontSize={fontSize}
        textStyle={styles.title}
        homeTestID="btn-back"
      />

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "santi" && styles.tabBtnActive]}
          onPress={() => setTab("santi")}
          testID="tab-santi"
        >
          <Text style={[styles.tabBtnText, tab === "santi" && { color: colors.onPrimary }]}>
            Santi e Feste
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "votive" && styles.tabBtnActive]}
          onPress={() => setTab("votive")}
          testID="tab-votive"
        >
          <Text style={[styles.tabBtnText, tab === "votive" && { color: colors.onPrimary }]}>
            Messe Votive
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      ) : tab === "santi" ? (
        <View style={styles.saintsBody}>
          <ScrollView
            horizontal
            style={styles.monthScroll}
            contentContainerStyle={styles.monthRow}
            showsHorizontalScrollIndicator={Platform.OS === "web"}
            testID="calendar-month-scroll"
          >
            {monthChips.map((chip) => (
              <TouchableOpacity
                key={chip.month}
                style={[styles.monthBtn, selectedMonth === chip.month && styles.monthBtnActive]}
                onPress={() => setSelectedMonth(chip.month)}
                testID={`month-${chip.month}`}
              >
                <Text style={[styles.monthBtnText, selectedMonth === chip.month && { color: colors.onPrimary }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.monthYearHint}>
            {MONTHS[selectedMonth - 1]} {viewYear}
          </Text>

          <ScrollView
            ref={listScrollRef}
            style={styles.listScroll}
            contentContainerStyle={styles.content}
            testID="calendar-day-list"
          >
            {monthDays.map((day) => {
              const isToday = day.dateISO === todayISO;
              return (
                <DayCard
                  key={day.dateISO}
                  day={day}
                  isToday={isToday}
                  colors={colors}
                  fontSize={fontSize}
                  colorHex={colorHex}
                  styles={styles}
                  onPress={() => router.push({ pathname: "/messa", params: { date: day.dateISO } })}
                  onLayout={
                    isToday
                      ? (e) => {
                          scrollTodayToTop(e.nativeEvent.layout.y);
                        }
                      : undefined
                  }
                />
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.content}>
          <Text style={styles.sectionIntro}>
            Tocca una messa votiva per vedere il dettaglio e celebrarla con il prefazio adeguato.
          </Text>
          {votive.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={styles.votiveCard}
              testID={`votive-${v.id}`}
              onPress={() => router.push(`/messa-votiva/${v.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Apri messa votiva ${v.title}`}
            >
              <View style={[styles.votiveColorPill, { backgroundColor: colorHex(v.color) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.votiveTitle}>{v.title}</Text>
                <Text style={styles.votiveColor}>Colore: {v.color}</Text>
              </View>
              <Ionicons name="chevron-forward" size={scaledFont(36)} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number, dayCardBorder: string) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      ...(Platform.OS === "web" ? { minHeight: 0 } : null),
    },
    title: {
      fontSize: Math.round(fontSize * 0.9),
      fontWeight: "700",
      color: colors.textPrimary,
      textAlign: "left",
    },
    tabRow: { flexDirection: "row", padding: 16, gap: 12 },
    tabBtn: {
      flex: 1,
      padding: 18,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: ACTION_RADIUS,
      alignItems: "center",
      minHeight: ACTION_MIN_HEIGHT,
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabBtnText: {
      fontSize: Math.round(fontSize * 0.75),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: colors.textPrimary,
    },
    saintsBody: { flex: 1, minHeight: 0 },
    monthScroll: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: ACTION_MIN_HEIGHT + 24,
      ...(Platform.OS === "web" ? { width: "100%", overflow: "scroll" } : null),
    },
    monthRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    monthBtn: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: ACTION_RADIUS,
      backgroundColor: colors.surface,
      minHeight: ACTION_MIN_HEIGHT,
      justifyContent: "center",
      flexShrink: 0,
    },
    monthBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    monthBtnText: {
      fontSize: Math.round(fontSize * 0.65),
      fontWeight: ACTION_LABEL_WEIGHT,
      color: colors.textPrimary,
    },
    monthYearHint: {
      paddingHorizontal: 16,
      paddingBottom: 4,
      fontSize: Math.round(fontSize * 0.55),
      color: colors.textSecondary,
      fontWeight: "600",
    },
    listScroll: { flex: 1, minHeight: 0 },
    content: { padding: 16, paddingBottom: 40 },
    dayCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingRight: 10,
      paddingLeft: 10,
      backgroundColor: colors.surface,
      borderWidth: 3,
      borderColor: dayCardBorder,
      borderRadius: ACTION_RADIUS,
      marginBottom: 10,
      minHeight: ACTION_MIN_HEIGHT,
    },
    dayCardToday: {
      borderColor: colors.primary,
      borderWidth: 4,
    },
    dateCol: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 46,
      flexShrink: 0,
      gap: 1,
    },
    dayNum: {
      fontSize: Math.round(fontSize * 1.0),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: colors.textPrimary,
      lineHeight: Math.round(fontSize * 1.05),
    },
    weekdayShort: {
      fontSize: Math.round(fontSize * 0.6),
      fontWeight: ACTION_LABEL_WEIGHT,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
    colorPill: {
      width: 16,
      alignSelf: "stretch",
      minHeight: 44,
      borderRadius: 999,
      flexShrink: 0,
    },
    dayBody: { flex: 1, minWidth: 0, gap: 2 },
    rankLabel: {
      fontSize: Math.round(fontSize * 0.5),
      color: colors.textSecondary,
      textTransform: "uppercase",
      fontWeight: ACTION_LABEL_WEIGHT,
      letterSpacing: 0.4,
    },
    dayTitle: {
      fontSize: Math.round(fontSize * 0.75),
      color: colors.textPrimary,
      fontWeight: ACTION_LABEL_WEIGHT,
      lineHeight: Math.round(fontSize * 0.95),
    },
    sectionIntro: { fontSize: Math.round(fontSize * 0.7), color: colors.textSecondary, marginBottom: 16 },
    votiveCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      padding: 20,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: ACTION_RADIUS,
      marginBottom: 12,
      minHeight: ACTION_MIN_HEIGHT,
    },
    votiveColorPill: { width: 16, height: 44, borderRadius: 999 },
    votiveTitle: {
      flex: 1,
      fontSize: Math.round(fontSize * 0.75),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: colors.textPrimary,
    },
    votiveColor: { fontSize: Math.round(fontSize * 0.55), color: colors.textSecondary },
  });
