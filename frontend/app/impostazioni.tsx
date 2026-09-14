import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Platform } from "react-native";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings, PARCHMENT_TONE_MIN, PARCHMENT_TONE_MAX } from "../src/SettingsContext";
import { LINE_SPACING_MIN, LINE_SPACING_MAX, LINE_SPACING_STEP, formatLineSpacingValue } from "../src/liturgyTypography";
import { SettingsStepperSlider } from "../src/components/SettingsStepperSlider";
import { FONT_OPTIONS, FontFamilyId, resolveBodyFont } from "../src/fontFamily";
import { SectionScreenTopBar } from "../src/components/SectionScreenTopBar";

export default function Impostazioni() {
  const router = useRouter();
  const { theme, setTheme, fontSize, highContrast, setHighContrast, isBold, setIsBold, lineSpacing, setLineSpacing, fontFamilyId, setFontFamilyId, parchmentTone, setParchmentTone, celebraSubitoEnabled, setCelebraSubitoEnabled, hapticFeedbackEnabled, setHapticFeedbackEnabled, colors, scaledFont } = useSettings();
  const styles = makeStyles(colors, fontSize);
  const appVersion = Constants.expoConfig?.version ?? "—";
  const buildNumber =
    Platform.OS === "android"
      ? String(Constants.expoConfig?.android?.versionCode ?? "—")
      : (Constants.nativeBuildVersion ?? "—");

  return (
    <SafeAreaView style={styles.container} testID="settings-screen">
      <SectionScreenTopBar
        title="Impostazioni"
        onHome={() => router.back()}
        colors={colors}
        fontSize={fontSize}
        textStyle={styles.title}
        homeTestID="btn-back"
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Dimensione testo: bottoni A- / A+ in Home, Messa, Celebra (e altre schermate).
            Ogni modifica aggiorna il valore globale persistito in SettingsContext. */}

        <View style={styles.section} testID="section-celebra-subito">
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Celebra subito la Messa</Text>
              <Text style={styles.sectionDesc}>
                {celebraSubitoEnabled
                  ? "Attivo (predefinito): in Home compare «Celebra subito la Messa» (indice a parti), senza nascondere le scelte preparate né «Scegli la liturgia» e «Celebra la Messa». Disattiva per togliere solo il tasto oro."
                  : "Disattivo: in Home restano «Scegli la liturgia» e «Celebra la Messa». Attiva per aggiungere «Celebra subito» sopra quei tasti, lasciando visibile l’elenco delle scelte con Azzera."}
              </Text>
            </View>
            <Switch
              value={celebraSubitoEnabled}
              onValueChange={setCelebraSubitoEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              testID="switch-celebra-subito"
            />
          </View>
        </View>

        <View style={styles.section} testID="section-haptic">
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Feedback tattile</Text>
              <Text style={styles.sectionDesc}>
                Vibrazione leggera ai tap principali (indice, celebrazione, Home). Utile se si vede poco; su tablet senza motore vibrazione non ha effetto.
              </Text>
            </View>
            <Switch
              value={hapticFeedbackEnabled}
              onValueChange={setHapticFeedbackEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              testID="switch-haptic-feedback"
            />
          </View>
        </View>

        <View style={styles.section} testID="section-line-spacing">
          <Text style={styles.sectionTitle}>Interlinea del testo</Text>
          <Text style={styles.sectionDesc}>
            Spaziatura verticale tra le righe in Celebra e in Scegli la liturgia (Messa). Utile con carattere grande o per leggere con più respiro. Si adatta alla dimensione testo (A-/A+).
          </Text>
          <Text style={[styles.sectionDesc, { marginTop: 12 }]}>
            Interlinea: {formatLineSpacingValue(lineSpacing)} (1,00 = normale)
          </Text>
          <SettingsStepperSlider
            value={lineSpacing}
            minimumValue={LINE_SPACING_MIN}
            maximumValue={LINE_SPACING_MAX}
            step={LINE_SPACING_STEP}
            onValueChange={setLineSpacing}
            colors={colors}
            scaledFont={scaledFont}
            testID="slider-line-spacing"
          />
        </View>

        <View style={styles.section} testID="section-font-family">
          <Text style={styles.sectionTitle}>Carattere</Text>
          <Text style={styles.sectionDesc}>
            Scegli il tipo di carattere per il testo della celebrazione. Tocca un'opzione per applicarla.
          </Text>

          {/* Opzione Grassetto (Bold) - Richiesta utente v2.7.5 */}
          <View style={[styles.switchRow, { marginTop: 12, marginBottom: 16, padding: 12, backgroundColor: colors.bgSecondary, borderRadius: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fontFamilyLabel, { fontSize: scaledFont(22) }]}>Grassetto</Text>
              <Text style={styles.fontFamilyDesc}>
                Rende più spesso il testo liturgico, mantenendo il carattere scelto.
              </Text>
            </View>
            <Switch
              value={isBold}
              onValueChange={setIsBold}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              testID="switch-bold"
            />
          </View>

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
                      isBold && opt.supportsNativeBold
                        ? resolveBodyFont(opt.id, true)
                        : null,
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
              style={[styles.themeCard, theme === "parchment" && styles.themeCardActive]}
              onPress={() => setTheme("parchment")}
              testID="btn-theme-parchment"
              accessibilityLabel="Tema pergamena"
            >
              <Ionicons name="document-text" size={scaledFont(28)} color={theme === "parchment" ? colors.primary : colors.textSecondary} />
              <Text style={[styles.themeCardText, theme === "parchment" && { color: colors.primary }]}>Pergamena</Text>
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

          <View
            style={[styles.themePreview, { backgroundColor: colors.background, borderColor: colors.border }]}
            testID="theme-accent-preview"
          >
            <Text style={styles.themePreviewHeading}>Anteprima colori liturgici</Text>
            <Text style={[styles.themePreviewAntifona, { color: colors.accentAntifona }]}>Antifona d'ingresso</Text>
            <Text style={[styles.themePreviewOrazione, { color: colors.accentOrazione }]}>Colletta</Text>
            <Text style={[styles.themePreviewReading, { color: colors.accentReading }]}>Prima Lettura</Text>
            <Text style={[styles.themePreviewPe, { color: colors.accentPe }]}>Preghiera Eucaristica</Text>
            <Text style={[styles.themePreviewBody, { color: colors.textPrimary }]}>
              Padre nostro che sei nei cieli, sia santificato il tuo nome.
            </Text>
            <Text style={[styles.themePreviewRubric, { color: colors.rubrics }]}>
              Il sacerdote invita i fedeli all'atto penitenziale:
            </Text>
          </View>

          {theme === "parchment" && (
            <View style={{ marginTop: 16 }} testID="section-parchment-tone">
              <Text style={styles.sectionTitle}>Tono pergamena</Text>
              <Text style={styles.sectionDesc}>
                Regola la tonalità dello sfondo seppia ({parchmentTone}).
                Il range è limitato per mantenere il testo nero sempre leggibile.
              </Text>
              <SettingsStepperSlider
                value={parchmentTone}
                minimumValue={PARCHMENT_TONE_MIN}
                maximumValue={PARCHMENT_TONE_MAX}
                step={1}
                onValueChange={setParchmentTone}
                colors={colors}
                scaledFont={scaledFont}
                testID="slider-parchment-tone"
              />
              <View
                style={[
                  styles.parchmentPreview,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                testID="parchment-tone-preview"
              >
                <Text style={[styles.parchmentPreviewSample, { color: colors.textPrimary }]}>
                  Padre nostro che sei nei cieli, sia santificato il tuo nome.
                </Text>
                <Text style={[styles.parchmentPreviewDesc, { color: colors.textSecondary }]}>
                  Anteprima del tono pergamena su sfondo e testo nero.
                </Text>
              </View>
            </View>
          )}
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

        {Platform.OS === "web" || __DEV__ ? (
          <View style={styles.section} testID="section-web-preview">
            <Text style={styles.sectionTitle}>Anteprima web</Text>
            <Text style={styles.sectionDesc}>
              Hub di navigazione rapida per provare Celebra, Messa e impostazioni nel browser durante lo sviluppo.
            </Text>
            <TouchableOpacity
              style={styles.previewLinkBtn}
              onPress={() => router.push("/anteprima" as never)}
              testID="btn-open-preview-hub"
            >
              <Ionicons name="desktop-outline" size={scaledFont(24)} color={colors.primary} />
              <Text style={styles.previewLinkText}>Apri hub anteprima</Text>
              <Ionicons name="chevron-forward" size={scaledFont(22)} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : null}

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
          <Text style={styles.versionInfo} testID="app-version">
            Versione {appVersion} (build {buildNumber}) by AP
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  previewLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  previewLinkText: { flex: 1, fontSize: Math.round(fontSize * 0.65), fontWeight: "700", color: colors.textPrimary },
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
  themePreview: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 6,
  },
  themePreviewHeading: {
    fontSize: Math.round(fontSize * 0.65),
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 4,
  },
  themePreviewAntifona: { fontSize: Math.round(fontSize * 0.72), fontWeight: "800" },
  themePreviewOrazione: { fontSize: Math.round(fontSize * 0.72), fontWeight: "800" },
  themePreviewReading: { fontSize: Math.round(fontSize * 0.72), fontWeight: "800" },
  themePreviewPe: { fontSize: Math.round(fontSize * 0.68), fontWeight: "800" },
  themePreviewBody: { fontSize: Math.round(fontSize * 0.75), lineHeight: fontSize * 1.1, marginTop: 4 },
  themePreviewRubric: { fontSize: Math.round(fontSize * 0.55), fontStyle: "italic", marginTop: 4 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 6, lineHeight: fontSize * 0.85 },
  versionInfo: {
    fontSize: Math.round(fontSize * 0.65),
    color: colors.textPrimary,
    marginTop: 16,
    fontWeight: "700",
  },
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
  parchmentPreview: {
    marginTop: 12,
    padding: 14,
    borderWidth: 2,
    borderRadius: 12,
  },
  parchmentPreviewSample: {
    fontSize: Math.round(fontSize * 0.85),
    lineHeight: fontSize * 1.2,
    fontWeight: "600",
  },
  parchmentPreviewDesc: {
    fontSize: Math.round(fontSize * 0.55),
    marginTop: 8,
    fontStyle: "italic",
    lineHeight: fontSize * 0.8,
  },
});
