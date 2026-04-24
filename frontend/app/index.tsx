import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, Liturgy } from "../src/api";

export default function Home() {
  const router = useRouter();
  const { colors, scaledFont, fontSize } = useSettings();
  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.liturgyToday();
        setLiturgy(data);
      } catch (e) {
        console.log("Errore caricamento liturgia:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const seasonColor = liturgy?.season?.color_hex || colors.liturgicalGreen;

  const styles = makeStyles(colors, fontSize);

  return (
    <SafeAreaView style={styles.container} testID="home-screen">
      <View style={styles.topBar}>
        <Text style={styles.appTitle} testID="app-title">Messale Digitale</Text>
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
              {liturgy?.date_label || "Caricamento..."}
            </Text>
            <Text style={styles.seasonLabel} testID="season-label">
              {liturgy?.season?.season || ""}
              {liturgy?.liturgical_color ? ` · Colore: ${liturgy.liturgical_color}` : ""}
            </Text>
            {liturgy?.title ? (
              <Text style={styles.celebrationTitle} testID="celebration-title">{liturgy.title}</Text>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : null}

        <TouchableOpacity
          style={[styles.bigCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/messa")}
          testID="btn-mass-of-the-day"
          accessibilityRole="button"
          accessibilityLabel="Celebra Messa di oggi"
        >
          <Ionicons name="book" size={scaledFont(56)} color="#FFFFFF" />
          <Text style={styles.bigCardTitle}>Celebra la Messa</Text>
          <Text style={styles.bigCardSubtitle}>Ordinario + Letture del giorno</Text>
        </TouchableOpacity>

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

        {liturgy?.saints && liturgy.saints.length > 0 ? (
          <View style={styles.saintsBox} testID="saints-box">
            <Text style={styles.saintsTitle}>Oggi si celebra:</Text>
            {liturgy.saints.map((s, i) => (
              <Text key={i} style={styles.saintItem} testID={`saint-${i}`}>• {s.title}</Text>
            ))}
          </View>
        ) : null}

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
  bigCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    gap: 12,
    minHeight: 200,
    justifyContent: "center",
  },
  bigCardTitle: { fontSize: Math.round(fontSize * 1.1), fontWeight: "700", color: "#FFFFFF" },
  bigCardSubtitle: { fontSize: Math.round(fontSize * 0.7), color: "#FFFFFF", opacity: 0.9 },
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
});
