import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, prefetchLiturgies, prefetchStatic, PrefetchProgress } from "../src/api";
import {
  getLiturgyIndex,
  CachedLiturgyIndexEntry,
  clearAllLiturgies,
  pruneOldLiturgies,
  removeLiturgy,
} from "../src/offlineCache";

const PRESET_OPTIONS = [
  { days: 1, label: "Solo oggi" },
  { days: 3, label: "3 giorni" },
  { days: 7, label: "1 settimana" },
  { days: 14, label: "2 settimane" },
  { days: 30, label: "1 mese" },
];

export default function ScaricaLetture() {
  const router = useRouter();
  const { colors, scaledFont, fontSize } = useSettings();
  const styles = makeStyles(colors, fontSize);

  const [cached, setCached] = useState<CachedLiturgyIndexEntry[]>([]);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const [running, setRunning] = useState(false);

  const reloadIndex = useCallback(async () => {
    const idx = await getLiturgyIndex();
    setCached(idx);
  }, []);

  useEffect(() => {
    reloadIndex();
  }, [reloadIndex]);

  const doDownload = async (days: number) => {
    if (running) return;
    setRunning(true);
    setProgress({ total: days, done: 0, failed: [] });
    try {
      // Pre-scarica anche i testi statici (utile al primo avvio)
      await prefetchStatic();
      // Scarica N giorni di letture
      const result = await prefetchLiturgies(days, (p) => setProgress({ ...p }));
      await reloadIndex();
      const ok = result.total - result.failed.length;
      Alert.alert(
        "Download completato",
        `Scaricate ${ok} su ${result.total} giornate.` +
          (result.failed.length ? `\n\nGiorni non disponibili:\n${result.failed.join(", ")}` : ""),
      );
    } catch (e: any) {
      Alert.alert("Errore", String(e?.message || e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const confirmClearAll = () => {
    Alert.alert(
      "Cancellare tutte le letture?",
      "Verranno rimosse tutte le letture scaricate. Potrai sempre riscaricarle se sei online.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Cancella",
          style: "destructive",
          onPress: async () => {
            const n = await clearAllLiturgies();
            await reloadIndex();
            Alert.alert("Fatto", `Rimosse ${n} giornate dalla cache.`);
          },
        },
      ],
    );
  };

  const doPrune = async () => {
    const n = await pruneOldLiturgies(3);
    await reloadIndex();
    Alert.alert("Pulizia completata", `Rimosse ${n} giornate più vecchie di 3 giorni.`);
  };

  const removeOne = (date: string) => {
    Alert.alert("Rimuovere questa giornata?", date, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Rimuovi",
        style: "destructive",
        onPress: async () => {
          await removeLiturgy(date);
          await reloadIndex();
        },
      },
    ]);
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} testID="download-screen">
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="btn-back"
          accessibilityLabel="Indietro"
        >
          <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scarica letture</Text>
        <View style={{ width: 120 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modalità offline</Text>
          <Text style={styles.sectionDesc}>
            Scarica in anticipo le letture del giorno per poter celebrare anche senza connessione a Internet.
            L'app utilizzerà automaticamente le letture scaricate quando non c'è rete.
          </Text>
        </View>

        {running && progress ? (
          <View style={[styles.section, { borderColor: colors.primary, borderWidth: 4 }]}>
            <Text style={styles.sectionTitle}>Scaricamento in corso…</Text>
            <Text style={styles.progressText} testID="progress-text">
              {progress.done} / {progress.total}  ·  {pct}%
            </Text>
            {progress.current ? (
              <Text style={styles.currentDate}>Giorno corrente: {progress.current}</Text>
            ) : null}
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
            </View>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quanti giorni scaricare?</Text>
            <View style={styles.optionsGrid}>
              {PRESET_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.days}
                  style={styles.optionCard}
                  onPress={() => doDownload(opt.days)}
                  disabled={running}
                  testID={`btn-download-${opt.days}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Scarica ${opt.label}`}
                >
                  <Ionicons name="cloud-download" size={scaledFont(40)} color={colors.primary} />
                  <Text style={styles.optionDays}>{opt.days}</Text>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Letture scaricate</Text>
            <Text style={styles.badge}>{cached.length}</Text>
          </View>
          {cached.length === 0 ? (
            <Text style={styles.empty}>Nessuna lettura ancora scaricata.</Text>
          ) : (
            cached.map((e) => (
              <TouchableOpacity
                key={e.date}
                style={styles.cachedItem}
                onLongPress={() => removeOne(e.date)}
                accessibilityHint="Tieni premuto per rimuovere"
                testID={`cached-${e.date}`}
              >
                <Ionicons name="checkmark-circle" size={scaledFont(30)} color={colors.liturgicalGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cachedDate}>{e.date_label || e.date}</Text>
                  {e.title ? <Text style={styles.cachedTitle} numberOfLines={1}>{e.title}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => removeOne(e.date)} hitSlop={12} accessibilityLabel={`Rimuovi ${e.date}`}>
                  <Ionicons name="trash-outline" size={scaledFont(28)} color={colors.rubrics} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

        {cached.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Manutenzione</Text>
            <TouchableOpacity style={styles.actionBtn} onPress={doPrune} testID="btn-prune">
              <Ionicons name="time" size={scaledFont(32)} color={colors.textPrimary} />
              <Text style={styles.actionBtnText}>Elimina letture più vecchie di 3 giorni</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.rubrics }]}
              onPress={confirmClearAll}
              testID="btn-clear-all"
            >
              <Ionicons name="trash" size={scaledFont(32)} color={colors.rubrics} />
              <Text style={[styles.actionBtnText, { color: colors.rubrics }]}>Cancella tutte le letture</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.note}>
            💡 Suggerimento: scarica 7 giorni prima di una settimana di celebrazioni così l'app funziona anche se il tablet non è connesso a Internet.
          </Text>
        </View>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
    minWidth: 120,
  },
  backBtnText: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "600" },
  title: { fontSize: Math.round(fontSize * 0.9), fontWeight: "700", color: colors.textPrimary },
  content: { padding: 20, gap: 20 },
  section: {
    padding: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  sectionTitle: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  sectionDesc: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 10, lineHeight: fontSize * 0.95 },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  optionCard: {
    flexBasis: "30%",
    flexGrow: 1,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
    minHeight: 130,
    justifyContent: "center",
  },
  optionDays: { fontSize: Math.round(fontSize * 1.0), fontWeight: "800", color: colors.textPrimary },
  optionLabel: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, textAlign: "center" },
  progressText: { fontSize: Math.round(fontSize * 1.0), fontWeight: "800", color: colors.textPrimary, marginTop: 14, textAlign: "center" },
  currentDate: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, textAlign: "center", marginTop: 8 },
  progressBar: {
    height: 16,
    backgroundColor: colors.border,
    borderRadius: 8,
    marginTop: 18,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    fontSize: Math.round(fontSize * 0.7),
    fontWeight: "800",
    color: "#FFFFFF",
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 16,
    overflow: "hidden",
  },
  empty: { fontSize: Math.round(fontSize * 0.7), color: colors.textSecondary, fontStyle: "italic", marginTop: 10 },
  cachedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cachedDate: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "600" },
  cachedTitle: { fontSize: Math.round(fontSize * 0.55), color: colors.textSecondary, marginTop: 3 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    marginTop: 12,
    minHeight: 72,
  },
  actionBtnText: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "600", flex: 1 },
  note: { fontSize: Math.round(fontSize * 0.65), color: colors.textPrimary, lineHeight: fontSize * 0.95 },
});
