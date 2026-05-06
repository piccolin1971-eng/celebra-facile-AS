import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, Liturgy } from "../src/api";
import { localDateStr, italianDateLabel, addDays, parseLocalDate } from "../src/dateUtils";

type DayChoice = "today" | "day1" | "day2" | "day3" | "day4" | "day5" | "day6" | "day7";

const DAY_OFFSETS: Record<DayChoice, number> = {
  today: 0,
  day1: 1,
  day2: 2,
  day3: 3,
  day4: 4,
  day5: 5,
  day6: 6,
  day7: 7,
};

const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function dayLabelFor(day: DayChoice, date: Date): string {
  if (day === "today") return "Oggi";
  const wd = (date.getDay() + 6) % 7; // 0=Lun
  return WEEKDAYS_SHORT[wd];
}

export default function Home() {
  const router = useRouter();
  const { colors, scaledFont, fontSize } = useSettings();
  const [selectedDay, setSelectedDay] = useState<DayChoice>("today");
  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLiturgy = useCallback(async (day: DayChoice) => {
    setLoading(true);
    setLoadError(null);
    try {
      const target = addDays(new Date(), DAY_OFFSETS[day]);
      const dateStr = localDateStr(target);
      const data = await api.liturgyForDate(dateStr);
      setLiturgy(data);
    } catch (e: any) {
      console.log("Errore caricamento liturgia:", e);
      setLoadError(
        "Nessuna connessione a Internet e nessuna lettura scaricata per questa data. Collegati a Internet o usa 'Scarica letture'.",
      );
      setLiturgy(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ricarica quando cambia il giorno selezionato
  useEffect(() => {
    loadLiturgy(selectedDay);
  }, [selectedDay, loadLiturgy]);

  // Resetta sempre su "Oggi" e ricarica quando si torna sulla home (es. dopo mezzanotte)
  useFocusEffect(
    useCallback(() => {
      setSelectedDay("today");
    }, []),
  );

  const seasonColor = liturgy?.season?.color_hex || colors.liturgicalGreen;
  const styles = makeStyles(colors, fontSize);

  const selectedDate = addDays(new Date(), DAY_OFFSETS[selectedDay]);
  const selectedDateStr = localDateStr(selectedDate);
  const selectedDateLabel = liturgy?.date_label || italianDateLabel(selectedDate);

  const openMessa = () => {
    if (selectedDay === "today") {
      router.push("/messa");
    } else {
      router.push({ pathname: "/messa", params: { date: selectedDateStr } });
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="home-screen">
      <View style={styles.topBar}>
        <Text style={styles.appTitle} testID="app-title">Celebra facile</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push("/impostazioni")}
          testID="btn-settings"
          accessibilityLabel="Impostazioni"
        >
          <Ionicons name="settings-outline" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.settingsBtnText}>Impostazioni</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.dateBanner, { borderColor: seasonColor }]} testID="date-banner">
          <View style={[styles.seasonDot, { backgroundColor: seasonColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel} testID="date-label">
              {selectedDateLabel}
            </Text>
            <Text style={styles.seasonLabel} testID="season-label">
              {liturgy?.season?.season || ""}
              {liturgy?.liturgical_color ? ` · Colore: ${liturgy.liturgical_color}` : ""}
            </Text>
            {liturgy?.title ? (
              <Text style={styles.celebrationTitle} testID="celebration-title">{liturgy.title}</Text>
            ) : null}
            {liturgy?.saints && liturgy.saints.length > 0 ? (
              <View style={styles.saintsInline} testID="saints-inline">
                {liturgy.saints.map((s, i) => (
                  <Text key={i} style={styles.saintInlineItem} testID={`saint-${i}`}>• {s.title}</Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* Selettore giorno */}
        <View style={styles.daySelector} testID="day-selector">
          <Text style={styles.daySelectorLabel}>Giorno da celebrare</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayButtonsRow}
          >
            {(Object.keys(DAY_OFFSETS) as DayChoice[]).map((day) => {
              const isActive = selectedDay === day;
              const d = addDays(new Date(), DAY_OFFSETS[day]);
              const dayNum = d.getDate();
              const label = dayLabelFor(day, d);
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayButton, isActive && styles.dayButtonActive]}
                  onPress={() => setSelectedDay(day)}
                  testID={`btn-day-${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${label}, ${dayNum}`}
                >
                  <Text style={[styles.dayButtonLabel, isActive && styles.dayButtonLabelActive]}>
                    {label}
                  </Text>
                  <Text style={[styles.dayButtonNum, isActive && styles.dayButtonNumActive]}>
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {liturgy?.fromLocalCache ? (
          <View style={styles.offlineBanner} testID="offline-banner">
            <Ionicons name="cloud-done" size={scaledFont(28)} color={colors.liturgicalGreen} />
            <Text style={styles.offlineText}>Modalità offline: stai usando le letture scaricate.</Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.errorBanner} testID="error-banner">
            <Ionicons name="warning" size={scaledFont(28)} color={colors.rubrics} />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : null}

        <View style={styles.heroRow} testID="hero-row">
          <TouchableOpacity
            style={[styles.heroCard, { backgroundColor: colors.primary }]}
            onPress={openMessa}
            testID="btn-mass-of-the-day"
            accessibilityRole="button"
            accessibilityLabel={`Celebra la Messa di ${dayLabelFor(selectedDay, selectedDate).toLowerCase()}`}
          >
            <Ionicons name="book" size={scaledFont(44)} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Celebra la Messa</Text>
            <Text style={styles.heroSubtitle}>
              {selectedDay === "today" ? "Letture di oggi" : `Letture di ${dayLabelFor(selectedDay, selectedDate)}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.heroCard, { backgroundColor: colors.liturgicalPurple }]}
            onPress={() => router.push("/orazionale" as any)}
            testID="btn-orazionale"
            accessibilityRole="button"
            accessibilityLabel="Orazionale, Preghiera Universale"
          >
            <MaterialCommunityIcons name="hands-pray" size={scaledFont(40)} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Orazionale</Text>
            <Text style={styles.heroSubtitle}>Preghiera Universale</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.secondaryCard}
          onPress={() => router.push("/calendario")}
          testID="btn-calendar"
          accessibilityRole="button"
        >
          <Ionicons name="calendar" size={scaledFont(44)} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.secondaryCardTitle}>Calendario Liturgico</Text>
            <Text style={styles.secondaryCardSubtitle}>Santi, feste e messe votive</Text>
          </View>
          <Ionicons name="chevron-forward" size={scaledFont(40)} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryCard}
          onPress={() => router.push("/scarica")}
          testID="btn-download"
          accessibilityRole="button"
          accessibilityLabel="Scarica letture per uso offline"
        >
          <Ionicons name="cloud-download" size={scaledFont(44)} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.secondaryCardTitle}>Scarica letture</Text>
            <Text style={styles.secondaryCardSubtitle}>Uso offline · Pre-download più giorni</Text>
          </View>
          <Ionicons name="chevron-forward" size={scaledFont(40)} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryCard}
          onPress={() => router.push("/impostazioni")}
          testID="btn-settings-card"
          accessibilityRole="button"
        >
          <Ionicons name="text" size={scaledFont(44)} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.secondaryCardTitle}>Accessibilità</Text>
            <Text style={styles.secondaryCardSubtitle}>Testo grande · Tema · Contrasto</Text>
          </View>
          <Ionicons name="chevron-forward" size={scaledFont(40)} color={colors.textSecondary} />
        </TouchableOpacity>

        {liturgy?.saints && liturgy.saints.length > 0 ? null : null}

        <Text style={styles.footer}>
          Fonte letture: chiesacattolica.it · Testi liturgici secondo il Messale Romano in lingua italiana
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  appTitle: { fontSize: Math.round(fontSize * 0.9), fontWeight: "700", color: colors.textPrimary },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 64,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
  },
  settingsBtnText: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "600" },
  content: { padding: 24, gap: 20 },
  dateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  seasonDot: { width: 32, height: 32, borderRadius: 16 },
  dateLabel: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  seasonLabel: { fontSize: Math.round(fontSize * 0.7), color: colors.textSecondary, marginTop: 4 },
  celebrationTitle: { fontSize: Math.round(fontSize * 0.75), color: colors.textPrimary, marginTop: 8, fontStyle: "italic" },
  saintsInline: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  saintInlineItem: {
    fontSize: Math.round(fontSize * 0.65),
    color: colors.textPrimary,
    fontWeight: "600",
  },
  daySelector: {
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    gap: 12,
  },
  daySelectorLabel: { fontSize: Math.round(fontSize * 0.7), fontWeight: "600", color: colors.textSecondary },
  dayButtonsRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 12,
  },
  dayButton: {
    width: 88,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 88,
    gap: 4,
  },
  dayButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayButtonLabel: {
    fontSize: Math.round(fontSize * 0.58),
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  dayButtonLabelActive: { color: "#FFFFFF" },
  dayButtonNum: {
    fontSize: Math.round(fontSize * 0.85),
    fontWeight: "800",
    color: colors.textSecondary,
  },
  dayButtonNumActive: { color: "#FFFFFF" },
  bigCard: {
    padding: 22,
    borderRadius: 14,
    alignItems: "center",
    gap: 8,
    minHeight: 140,
    justifyContent: "center",
  },
  bigCardTitle: { fontSize: Math.round(fontSize * 0.8), fontWeight: "700", color: "#FFFFFF" },
  bigCardSubtitle: { fontSize: Math.round(fontSize * 0.55), color: "#FFFFFF", opacity: 0.9, textAlign: "center" },
  heroRow: {
    flexDirection: "row",
    gap: 12,
  },
  heroCard: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 160,
  },
  heroCardFull: {
    width: "100%",
    padding: 22,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 140,
  },
  heroTitle: { fontSize: Math.round(fontSize * 0.78), fontWeight: "700", color: "#FFFFFF", textAlign: "center" },
  heroSubtitle: { fontSize: Math.round(fontSize * 0.5), color: "#FFFFFF", opacity: 0.92, textAlign: "center" },
  secondaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    minHeight: 96,
  },
  secondaryCardTitle: { fontSize: Math.round(fontSize * 0.85), fontWeight: "600", color: colors.textPrimary },
  secondaryCardSubtitle: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 4 },
  saintsBox: {
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  saintsTitle: { fontSize: Math.round(fontSize * 0.75), fontWeight: "700", color: colors.textPrimary, marginBottom: 10 },
  saintItem: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, marginVertical: 4 },
  footer: { fontSize: Math.round(fontSize * 0.55), color: colors.textSecondary, textAlign: "center", marginTop: 20 },
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
  offlineText: { flex: 1, fontSize: Math.round(fontSize * 0.65), color: colors.textPrimary, fontWeight: "600" },
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
