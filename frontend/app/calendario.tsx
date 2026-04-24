import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, VotiveMass } from "../src/api";

type SaintEntry = { date: string; celebrations: { title: string; rank: string; color: string }[] };

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
                "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function CalendarioScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont } = useSettings();
  const [calendar, setCalendar] = useState<SaintEntry[]>([]);
  const [votive, setVotive] = useState<VotiveMass[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"santi" | "votive">("santi");
  const styles = makeStyles(colors, fontSize);

  useEffect(() => {
    (async () => {
      try {
        const [c, v] = await Promise.all([api.allSaints(), api.votiveMasses()]);
        setCalendar(c.calendar);
        setVotive(v.masses);
      } catch (e) {
        console.log("Errore:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rankLabel = (r: string) => {
    switch (r) {
      case "solennita": return "Solennità";
      case "festa": return "Festa";
      case "memoria_obbligatoria": return "Memoria";
      case "memoria_facoltativa": return "Mem. facoltativa";
      default: return r;
    }
  };

  const colorHex = (c: string) => {
    switch (c) {
      case "bianco": return colors.liturgicalWhite;
      case "rosso": return colors.liturgicalRed;
      case "verde": return colors.liturgicalGreen;
      case "viola": return colors.liturgicalPurple;
      case "rosa": return colors.liturgicalRose;
      default: return colors.border;
    }
  };

  const filteredEntries = calendar.filter(e => parseInt(e.date.split("-")[0]) === selectedMonth);

  return (
    <SafeAreaView style={styles.container} testID="calendar-screen">
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="btn-back">
          <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Calendario</Text>
        <View style={{ width: 100 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "santi" && styles.tabBtnActive]}
          onPress={() => setTab("santi")}
          testID="tab-santi"
        >
          <Text style={[styles.tabBtnText, tab === "santi" && { color: "#FFFFFF" }]}>Santi e Feste</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "votive" && styles.tabBtnActive]}
          onPress={() => setTab("votive")}
          testID="tab-votive"
        >
          <Text style={[styles.tabBtnText, tab === "votive" && { color: "#FFFFFF" }]}>Messe Votive</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      ) : tab === "santi" ? (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal contentContainerStyle={styles.monthRow} showsHorizontalScrollIndicator={false}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.monthBtn, selectedMonth === i + 1 && styles.monthBtnActive]}
                onPress={() => setSelectedMonth(i + 1)}
                testID={`month-${i+1}`}
              >
                <Text style={[styles.monthBtnText, selectedMonth === i + 1 && { color: "#FFFFFF" }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={styles.content}>
            {filteredEntries.length === 0 ? (
              <Text style={styles.empty}>Nessuna celebrazione fissa in questo mese.</Text>
            ) : filteredEntries.map((entry) => (
              <View key={entry.date} style={styles.saintCard} testID={`saint-card-${entry.date}`}>
                <View style={styles.saintDateBox}>
                  <Text style={styles.saintDay}>{entry.date.split("-")[1]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {entry.celebrations.map((c, i) => (
                    <View key={i} style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={[styles.colorDot, { backgroundColor: colorHex(c.color) }]} />
                        <Text style={styles.saintRank}>{rankLabel(c.rank)}</Text>
                      </View>
                      <Text style={styles.saintName}>{c.title}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionIntro}>
            Messe votive disponibili per celebrazioni particolari.
          </Text>
          {votive.map(v => (
            <View key={v.id} style={styles.votiveCard} testID={`votive-${v.id}`}>
              <View style={[styles.colorDot, { backgroundColor: colorHex(v.color), width: 28, height: 28 }]} />
              <Text style={styles.votiveTitle}>{v.title}</Text>
              <Text style={styles.votiveColor}>Colore: {v.color}</Text>
            </View>
          ))}
        </ScrollView>
      )}
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
  tabRow: { flexDirection: "row", padding: 16, gap: 12 },
  tabBtn: {
    flex: 1,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    minHeight: 72,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabBtnText: { fontSize: Math.round(fontSize * 0.75), fontWeight: "700", color: colors.textPrimary },
  monthRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  monthBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    minHeight: 60,
    justifyContent: "center",
  },
  monthBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  monthBtnText: { fontSize: Math.round(fontSize * 0.65), fontWeight: "700", color: colors.textPrimary },
  content: { padding: 16, paddingBottom: 40 },
  empty: { fontSize: Math.round(fontSize * 0.75), color: colors.textSecondary, textAlign: "center", marginTop: 40 },
  saintCard: {
    flexDirection: "row",
    gap: 16,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 12,
  },
  saintDateBox: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saintDay: { fontSize: Math.round(fontSize * 1.0), fontWeight: "800", color: "#FFFFFF" },
  colorDot: { width: 18, height: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  saintRank: { fontSize: Math.round(fontSize * 0.55), color: colors.textSecondary, textTransform: "uppercase", fontWeight: "700" },
  saintName: { fontSize: Math.round(fontSize * 0.75), color: colors.textPrimary, fontWeight: "600", marginTop: 4 },
  sectionIntro: { fontSize: Math.round(fontSize * 0.7), color: colors.textSecondary, marginBottom: 16 },
  votiveCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 12,
    minHeight: 80,
  },
  votiveTitle: { flex: 1, fontSize: Math.round(fontSize * 0.75), fontWeight: "700", color: colors.textPrimary },
  votiveColor: { fontSize: Math.round(fontSize * 0.55), color: colors.textSecondary },
});
