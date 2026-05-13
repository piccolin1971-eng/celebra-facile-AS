import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useSettings } from "../src/SettingsContext";
import { FONT_OPTIONS, FontFamilyId } from "../src/fontFamily";

export default function Impostazioni() {
  const router = useRouter();
  const { theme, setTheme, fontSize, highContrast, setHighContrast, autoScrollDelaySec, setAutoScrollDelaySec, autoScrollPxPerSec, setAutoScrollPxPerSec, fontFamilyId, setFontFamilyId, colors, scaledFont } = useSettings();
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
        {/* Sezione "Dimensione testo" rimossa (richiesta utente v2.16.8):
            la dimensione del testo si regola ora solo dai bottoni A- / A+
            in alto nelle schermate (Home, Messa, Celebra, Orazionale).
            Il valore continua a essere persistito in SettingsContext. */}

        <View style={styles.section} testID="section-autoscroll-speed">
          <Text style={styles.sectionTitle}>Velocità auto-scroll PE</Text>
          <Text style={styles.sectionDesc}>
            Quanto velocemente scorre il testo nelle Preghiere Eucaristiche ({autoScrollPxPerSec} px/s)
          </Text>
          <View style={styles.sliderRow}>
            <Text style={[styles.fontBtnText, { width: 56, textAlign: "center" }]}>2</Text>
            <Slider
              style={{ flex: 1, height: 60 }}
              minimumValue={2}
              maximumValue={15}
              step={1}
              value={autoScrollPxPerSec}
              onValueChange={(v) => setAutoScrollPxPerSec(Math.round(v))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              testID="slider-autoscroll-speed"
            />
            <Text style={[styles.fontBtnText, { width: 56, textAlign: "center" }]}>15</Text>
          </View>
        </View>

        <View style={styles.section} testID="section-autoscroll-delay">
          <Text style={styles.sectionTitle}>Attesa prima dell'auto-scroll</Text>
          <Text style={styles.sectionDesc}>
            Tempo (in secondi) prima che parta lo scorrimento automatico ({autoScrollDelaySec} sec.)
          </Text>
          <View style={styles.sliderRow}>
            <Text style={[styles.fontBtnText, { width: 56, textAlign: "center" }]}>3 s</Text>
            <Slider
              style={{ flex: 1, height: 60 }}
              minimumValue={3}
              maximumValue={10}
              step={1}
              value={autoScrollDelaySec}
              onValueChange={(v) => setAutoScrollDelaySec(Math.round(v))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              testID="slider-autoscroll-delay"
            />
            <Text style={[styles.fontBtnText, { width: 56, textAlign: "center" }]}>10 s</Text>
          </View>
        </View>

        <View style={styles.section} testID="section-font-family">
          <Text style={styles.sectionTitle}>Carattere</Text>
          <Text style={styles.sectionDesc}>
            Scegli il tipo di carattere per il testo della celebrazione. Tocca un'opzione per applicarla — l'anteprima sotto mostra come apparirà.
          </Text>
          <View style={styles.fontFamilyList}>
            {FONT_OPTIONS.map((opt) => {
              const active = opt.id === fontFamilyId;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.fontFamilyCard, active && styles.fontFamilyCardActive]}
                  onPress={() => setFontFamilyId(opt.id as FontFamilyId)}
                  testID={`btn-font-${opt.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Carattere ${opt.label}`}
                >
                  <View style={styles.fontFamilyHeader}>
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={scaledFont(28)}
                      color={active ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.fontFamilyLabel,
                        active && { color: colors.primary },
                        opt.family ? { fontFamily: opt.family } : null,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.fontFamilySample,
                      opt.family ? { fontFamily: opt.family } : null,
                    ]}
                  >
                    {opt.sample}
                  </Text>
                  <Text style={styles.fontFamilyDesc}>{opt.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
              <Ionicons name="sunny" size={scaledFont(28)} color={theme === "light" ? colors.primary : colors.textSecondary} />
              <Text style={[styles.themeCardText, theme === "light" && { color: colors.primary }]}>Chiaro</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.themeCard, theme === "dark" && styles.themeCardActive]}
              onPress={() => setTheme("dark")}
              testID="btn-theme-dark"
              accessibilityLabel="Tema scuro"
            >
              <Ionicons name="moon" size={scaledFont(28)} color={theme === "dark" ? colors.primary : colors.textSecondary} />
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
              style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }}
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
  content: { padding: 16, gap: 12 },
  section: {
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  sectionTitle: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  sectionDesc: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 4 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  fontBtn: {
    width: 68,
    height: 60,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fontBtnText: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
  previewText: { fontSize: Math.round(fontSize * 0.85), color: colors.textPrimary, marginTop: 8, fontStyle: "italic", lineHeight: fontSize * 1.2 },
  themeRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  themeCard: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
  },
  themeCardActive: { borderColor: colors.primary, borderWidth: 3 },
  themeCardText: { fontSize: Math.round(fontSize * 0.7), fontWeight: "600", color: colors.textPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 6, lineHeight: fontSize * 0.85 },
  // ----- Sezione Carattere -----
  fontFamilyList: { gap: 12, marginTop: 12 },
  fontFamilyCard: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.background,
  },
  fontFamilyCardActive: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
  fontFamilyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  fontFamilyLabel: {
    fontSize: Math.round(fontSize * 0.78),
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  fontFamilySample: {
    fontSize: Math.round(fontSize * 1.0),
    color: colors.textPrimary,
    marginTop: 4,
    marginBottom: 6,
    lineHeight: fontSize * 1.4,
  },
  fontFamilyDesc: {
    fontSize: Math.round(fontSize * 0.55),
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: fontSize * 0.8,
  },
});
