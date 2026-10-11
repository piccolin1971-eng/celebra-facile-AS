import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSettings } from "../src/SettingsContext";
import { SectionScreenTopBar } from "../src/components/SectionScreenTopBar";
import {
  formatOptionalSaintListDate,
  getOptionalSaintById,
  optionalSaintsCatalog,
  otherSaintOnSameDate,
  sortOptionalSaintsForList,
} from "../src/optionalSaints";
import {
  loadOptionalSaintsSelection,
  saveOptionalSaintsSelection,
  type OptionalSaintsStorage,
} from "../src/optionalSaintsStorage";

export default function ImpostazioniMemorieFacoltative() {
  const router = useRouter();
  const {
    colors,
    fontSize,
    scaledFont,
    optionalSaintsUseSelection,
    setOptionalSaintsUseSelection,
  } = useSettings();
  const styles = makeStyles(colors, fontSize);
  const [selection, setSelection] = useState<OptionalSaintsStorage>({ selectedByMonthDay: {} });

  const reload = useCallback(async () => {
    const data = await loadOptionalSaintsSelection();
    setSelection(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const saints = sortOptionalSaintsForList(optionalSaintsCatalog());

  const toggleSaint = (saintId: string, mmdd: string, title: string, enabled: boolean) => {
    if (!enabled) {
      const next = { ...selection.selectedByMonthDay };
      if (next[mmdd] === saintId) delete next[mmdd];
      const payload = { selectedByMonthDay: next };
      setSelection(payload);
      void saveOptionalSaintsSelection(payload);
      return;
    }

    const existingId = selection.selectedByMonthDay[mmdd];
    if (existingId && existingId !== saintId) {
      const other = getOptionalSaintById(existingId);
      Alert.alert(
        "Un solo santo per giorno",
        `Per il ${formatOptionalSaintListDate(mmdd)} hai già attivato «${other?.title ?? existingId}». Vuoi sostituirlo con «${title}»?`,
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Sostituisci",
            onPress: () => {
              const next = { ...selection.selectedByMonthDay, [mmdd]: saintId };
              const payload = { selectedByMonthDay: next };
              setSelection(payload);
              void saveOptionalSaintsSelection(payload);
            },
          },
        ],
      );
      return;
    }

    const alt = otherSaintOnSameDate(saintId, mmdd);
    if (alt && !existingId) {
      Alert.alert(
        "Un solo santo per giorno",
        `Nello stesso giorno del calendario c’è anche «${alt.title}». Puoi attivarne uno alla volta.`,
        [{ text: "OK" }],
      );
    }

    const next = { ...selection.selectedByMonthDay, [mmdd]: saintId };
    const payload = { selectedByMonthDay: next };
    setSelection(payload);
    void saveOptionalSaintsSelection(payload);
  };

  return (
    <SafeAreaView style={styles.container} testID="optional-saints-settings">
      <SectionScreenTopBar
        title="Memorie facoltative"
        onHome={() => router.back()}
        colors={colors}
        fontSize={fontSize}
        textStyle={styles.title}
        homeTestID="btn-back-optional-saints"
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Usa la mia selezione</Text>
              <Text style={styles.sectionDesc}>
                {optionalSaintsUseSelection
                  ? "Attivo: nei giorni spuntati sotto, Home e Celebra possono orientarsi al santo scelto (con le regole del calendario liturgico)."
                  : "Disattivo (predefinito): l’app resta come oggi, senza mettere in evidenza memorie facoltative."}
              </Text>
            </View>
            <Switch
              value={optionalSaintsUseSelection}
              onValueChange={setOptionalSaintsUseSelection}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              testID="switch-optional-saints-use"
            />
          </View>
        </View>

        <Text style={styles.listIntro}>
          Spunta i santi che vuoi poter celebrare in quel giorno. L’app usa la pagina CEI quando c’è il
          blocco facoltativo, altrimenti lezionario e testi propri già in app (o in preparazione per i
          santi locali).
        </Text>

        {saints.map((s) => {
          const on = selection.selectedByMonthDay[s.date] === s.id;
          return (
            <View key={s.id} style={styles.saintRow} testID={`optional-saint-row-${s.id}`}>
              <View style={styles.saintText}>
                <Text style={styles.saintDate}>{formatOptionalSaintListDate(s.date)}</Text>
                <Text style={styles.saintTitle}>{s.title}</Text>
                {s.custom ? (
                  <Text style={styles.saintNote}>Santo locale (testi da verificare sul Messale)</Text>
                ) : null}
              </View>
              <Switch
                value={on}
                onValueChange={(v) => toggleSaint(s.id, s.date, s.title, v)}
                disabled={!optionalSaintsUseSelection}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                testID={`switch-optional-saint-${s.id}`}
              />
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: Math.round(fontSize * 0.9), fontWeight: "700", color: colors.textPrimary },
    content: { padding: 16, gap: 10, paddingBottom: 32 },
    section: {
      padding: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    sectionTitle: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    sectionDesc: {
      fontSize: Math.round(fontSize * 0.6),
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: Math.round(fontSize * 0.85),
    },
    listIntro: {
      fontSize: Math.round(fontSize * 0.62),
      color: colors.textSecondary,
      lineHeight: Math.round(fontSize * 0.9),
      marginTop: 4,
      marginBottom: 4,
    },
    saintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    saintText: { flex: 1 },
    saintDate: {
      fontSize: Math.round(fontSize * 0.55),
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    saintTitle: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "600",
      color: colors.textPrimary,
      marginTop: 2,
    },
    saintNote: {
      fontSize: Math.round(fontSize * 0.55),
      color: colors.textSecondary,
      marginTop: 4,
      fontStyle: "italic",
    },
  });
