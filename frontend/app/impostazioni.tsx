import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useSettings } from "../src/SettingsContext";

export default function Impostazioni() {
  const router = useRouter();
  const { theme, setTheme, fontSize, setFontSize, highContrast, setHighContrast, colors, scaledFont } = useSettings();
  const styles = makeStyles(colors, fontSize);

  return (
    <SafeAreaView style={styles.container} testID="settings-screen">
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
        <Text style={styles.title}>Impostazioni</Text>
        <View style={{ width: 120 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section} testID="section-font-size">
          <Text style={styles.sectionTitle}>Dimensione testo</Text>
          <Text style={styles.sectionDesc}>Regola la dimensione dei testi di lettura ({fontSize} pt)</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity
              style={styles.fontBtn}
              onPress={() => setFontSize(Math.max(24, fontSize - 2))}
              testID="btn-font-minus"
              accessibilityLabel="Riduci dimensione testo"
            >
              <Text style={styles.fontBtnText}>A−</Text>
            </TouchableOpacity>
            <Slider
              style={{ flex: 1, height: 60 }}
              minimumValue={24}
              maximumValue={60}
              step={1}
              value={fontSize}
              onValueChange={(v) => setFontSize(Math.round(v))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              testID="slider-font-size"
            />
            <TouchableOpacity
              style={styles.fontBtn}
              onPress={() => setFontSize(Math.min(60, fontSize + 2))}
              testID="btn-font-plus"
              accessibilityLabel="Aumenta dimensione testo"
            >
              <Text style={styles.fontBtnText}>A+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.previewText}>Anteprima: In principio era il Verbo.</Text>
        </View>

        <View style={styles.section} testID="section-theme">
          <Text style={styles.sectionTitle}>Tema</Text>
          <View style={styles.themeRow}>
            <TouchableOpacity
              style={[styles.themeCard, theme === "light" && styles.themeCardActive]}
              onPress={() => setTheme("light")}
              testID="btn-theme-light"
              accessibilityLabel="Tema chiaro"
            >
              <Ionicons name="sunny" size={scaledFont(48)} color={theme === "light" ? colors.primary : colors.textSecondary} />
              <Text style={[styles.themeCardText, theme === "light" && { color: colors.primary }]}>Chiaro</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.themeCard, theme === "dark" && styles.themeCardActive]}
              onPress={() => setTheme("dark")}
              testID="btn-theme-dark"
              accessibilityLabel="Tema scuro"
            >
              <Ionicons name="moon" size={scaledFont(48)} color={theme === "dark" ? colors.primary : colors.textSecondary} />
              <Text style={[styles.themeCardText, theme === "dark" && { color: colors.primary }]}>Scuro</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section} testID="section-contrast">
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Alto contrasto</Text>
              <Text style={styles.sectionDesc}>Aumenta il contrasto tra testo e sfondo per una lettura più facile.</Text>
            </View>
            <Switch
              value={highContrast}
              onValueChange={setHighContrast}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 1.6 }, { scaleY: 1.6 }], marginLeft: 16 }}
              testID="switch-high-contrast"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informazioni</Text>
          <Text style={styles.info}>
            Messale Digitale per la celebrazione della Santa Messa in lingua italiana.
          </Text>
          <Text style={styles.info}>
            Le letture del giorno sono scaricate automaticamente da chiesacattolica.it e conservate in memoria per l'uso offline.
          </Text>
          <Text style={styles.info}>
            I testi dell'Ordinario seguono la liturgia del Messale Romano. Si raccomanda il confronto con l'edizione CEI ufficiale.
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
  sectionDesc: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 8 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 20 },
  fontBtn: {
    width: 80,
    height: 72,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fontBtnText: { fontSize: 32, fontWeight: "800", color: colors.textPrimary },
  previewText: { fontSize: fontSize, color: colors.textPrimary, marginTop: 18, fontStyle: "italic", lineHeight: fontSize * 1.6 },
  themeRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  themeCard: {
    flex: 1,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    minHeight: 140,
    justifyContent: "center",
  },
  themeCardActive: { borderColor: colors.primary, borderWidth: 4 },
  themeCardText: { fontSize: Math.round(fontSize * 0.75), fontWeight: "600", color: colors.textPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 10, lineHeight: fontSize * 0.95 },
});
