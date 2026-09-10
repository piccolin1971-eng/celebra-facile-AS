/**
 * Mock statico Home — riga 75/25 (non preparato) vs 50/50 (preparato).
 * Solo anteprima visiva; nessuna navigazione reale.
 */
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { LiturgyDayBanner } from "../src/components/LiturgyDayBanner";

type MockState = "unprepared" | "prepared";

export default function AnteprimaHomeScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont } = useSettings();
  const [mockState, setMockState] = useState<MockState>("unprepared");

  const prepared = mockState === "prepared";
  const styles = useMemo(() => makeStyles(colors, fontSize), [colors, fontSize]);

  const celebrationDate = prepared ? new Date(2026, 5, 15) : new Date(2026, 5, 14);

  return (
    <SafeAreaView style={styles.container} testID="anteprima-home">
      <View style={styles.devBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={scaledFont(24)} color={colors.textPrimary} />
          <Text style={styles.backText}>Anteprima</Text>
        </Pressable>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleChip, !prepared && styles.toggleChipActive]}
            onPress={() => setMockState("unprepared")}
          >
            <Text style={[styles.toggleChipText, !prepared && styles.toggleChipTextActive]}>
              Non preparato (¾ + ¼)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleChip, prepared && styles.toggleChipActive]}
            onPress={() => setMockState("prepared")}
          >
            <Text style={[styles.toggleChipText, prepared && styles.toggleChipTextActive]}>
              Preparato (50 / 50)
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.mockBadge}>
        <Ionicons name="eye-outline" size={scaledFont(18)} color={colors.primary} />
        <Text style={styles.mockBadgeText}>
          Punto 2: riepilogo sotto il banner — usa i chip in alto (preparato / non preparato)
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.brandPill}>
            <Image
              source={require("../assets/images/brand-mark.png")}
              style={styles.brandMark}
            />
            <Text style={styles.appTitle}>Celebra facile</Text>
          </View>
          <View style={styles.fontBtns}>
            <View style={styles.fontBtn}>
              <Text style={styles.fontBtnText}>A-</Text>
            </View>
            <View style={styles.fontBtn}>
              <Text style={styles.fontBtnText}>A+</Text>
            </View>
          </View>
          <View style={styles.settingsBtn}>
            <Ionicons name="settings-outline" size={scaledFont(28)} color={colors.textPrimary} />
          </View>
        </View>

        <LiturgyDayBanner
          dateLabel={prepared ? "Domenica 15 giugno 2026" : "Sabato 14 giugno 2026"}
          seasonName="Tempo Ordinario"
          ceiTitle={
            prepared
              ? "XI DOMENICA DEL TEMPO ORDINARIO – ANNO A"
              : "SABATO DELLA XI SETTIMANA DEL TEMPO ORDINARIO"
          }
          liturgicalColor="verde"
          celebrationDate={celebrationDate}
          colors={colors}
          fontSize={fontSize}
        />

        {/* Punto 2 — Riepilogo scelte (sotto il banner) */}
        {prepared ? (
          <View style={styles.summaryBox} testID="mock-summary-prepared">
            <Text style={styles.summaryLabel}>Scelte per questo giorno</Text>
            <View style={styles.summaryRow}>
              <ChoiceChip label="Gloria" on colors={colors} fontSize={fontSize} />
              <ChoiceChip label="Credo" on colors={colors} fontSize={fontSize} />
              <ChoiceChip label="Preghiera fedeli" on colors={colors} fontSize={fontSize} />
            </View>
            <View style={styles.summaryRow}>
              <ChoiceChip
                label="Prefazione XI Domenica"
                on
                detail
                colors={colors}
                fontSize={fontSize}
              />
              <ChoiceChip label="PE III" on detail colors={colors} fontSize={fontSize} />
            </View>
            <View style={styles.summaryRow}>
              <ChoiceChip label="Congedo A" on={false} colors={colors} fontSize={fontSize} />
              <ChoiceChip label="Antifone" on={false} colors={colors} fontSize={fontSize} />
            </View>
          </View>
        ) : (
          <View style={styles.summaryBoxMuted} testID="mock-summary-empty">
            <Ionicons name="ellipse-outline" size={scaledFont(20)} color={colors.textSecondary} />
            <Text style={styles.summaryMutedText}>
              Liturgia non ancora preparata — nessuna scelta salvata per questo giorno
            </Text>
          </View>
        )}

        <View style={styles.daySelector}>
          <Text style={styles.daySelectorLabel}>Giorno da celebrare</Text>
          <View style={styles.dayButtonsRow}>
            {["Oggi", "Dom", "Lun"].map((label, i) => (
              <View
                key={label}
                style={[styles.dayButton, i === (prepared ? 0 : 1) && styles.dayButtonActive]}
              >
                <Text
                  style={[
                    styles.dayButtonLabel,
                    i === (prepared ? 0 : 1) && styles.dayButtonLabelActive,
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.dayButtonNum,
                    i === (prepared ? 0 : 1) && styles.dayButtonNumActive,
                  ]}
                >
                  {prepared ? [15, 16, 17][i] : [14, 15, 16][i]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Riga hero: 75/25 oppure 50/50 come Home attuale */}
        <View style={styles.heroRow} testID="mock-hero-row">
          <Pressable
            style={[
              styles.heroCard,
              prepared ? styles.heroCardHalf : styles.heroCardWide,
              { backgroundColor: colors.primary },
            ]}
            testID="mock-btn-messa"
          >
            <View style={styles.heroIconRow}>
              <Ionicons name="settings" size={scaledFont(28)} color={colors.onPrimary} />
              <Text style={styles.heroTitle}>Scegli la liturgia</Text>
            </View>
          </Pressable>

          <Pressable
            disabled={!prepared}
            style={[
              styles.heroCard,
              prepared ? styles.heroCardHalf : styles.heroCardNarrow,
              prepared
                ? { backgroundColor: colors.liturgicalGreen }
                : styles.heroCardGhost,
            ]}
            testID="mock-btn-celebra"
          >
            <View style={[styles.heroIconRow, !prepared && styles.heroIconRowNarrow]}>
              <Ionicons
                name="book"
                size={scaledFont(prepared ? 28 : 22)}
                color={prepared ? colors.onPrimary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.heroTitle,
                  !prepared && styles.heroTitleGhost,
                  !prepared && styles.heroTitleNarrow,
                ]}
              >
                Celebra la Messa
              </Text>
            </View>
          </Pressable>
        </View>

        {!prepared ? (
          <Text style={styles.hintText}>
            Celebra la Messa si attiva e torna uguale a Scegli la liturgia dopo la preparazione.
          </Text>
        ) : null}

        <View style={styles.compactCard}>
          <Ionicons name="calendar-outline" size={scaledFont(24)} color={colors.textPrimary} />
          <Text style={styles.compactTitle}>Calendario Liturgico</Text>
        </View>
        <View style={styles.compactCard}>
          <Ionicons name="cloud-download-outline" size={scaledFont(24)} color={colors.textPrimary} />
          <Text style={styles.compactTitle}>Scarica letture</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceChip({
  label,
  on,
  detail,
  colors,
  fontSize,
}: {
  label: string;
  on: boolean;
  detail?: boolean;
  colors: ReturnType<typeof useSettings>["colors"];
  fontSize: number;
}) {
  const active = on;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: active ? colors.liturgicalGreen + "18" : colors.surface,
        borderWidth: 1.5,
        borderColor: active ? colors.liturgicalGreen : colors.border,
        maxWidth: "100%",
      }}
    >
      <Ionicons
        name={active ? "checkmark-circle" : "close-circle-outline"}
        size={Math.round(fontSize * (detail ? 0.5 : 0.55))}
        color={active ? colors.liturgicalGreen : colors.textSecondary}
      />
      <Text
        style={{
          fontSize: Math.round(fontSize * (detail ? 0.52 : 0.58)),
          fontWeight: "700",
          color: active ? colors.textPrimary : colors.textSecondary,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useSettings>["colors"], fontSize: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    devBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
      gap: 8,
      flexWrap: "wrap",
    },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    backText: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
    toggleRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    toggleChip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    toggleChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    toggleChipText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
    toggleChipTextActive: { color: colors.onPrimary },
    mockBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.primary + "14",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    mockBadgeText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    content: { padding: 24, gap: 20, paddingBottom: 40 },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    brandPill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 4,
      paddingLeft: 5,
      paddingRight: 12,
      minWidth: 0,
    },
    brandMark: {
      width: Math.max(34, Math.round(fontSize * 1.05)),
      height: Math.max(34, Math.round(fontSize * 1.05)),
    },
    appTitle: { flexShrink: 1, fontSize: Math.round(fontSize * 0.9), fontWeight: "700", color: colors.textPrimary },
    fontBtns: { flexDirection: "row", gap: 8 },
    fontBtn: {
      minWidth: 64,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    fontBtnText: { fontSize: Math.round(fontSize * 0.75), fontWeight: "800", color: colors.onPrimary },
    settingsBtn: {
      padding: 10,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 12,
    },
    summaryBox: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.liturgicalGreen,
      backgroundColor: colors.surface,
      gap: 12,
    },
    summaryLabel: {
      fontSize: Math.round(fontSize * 0.62),
      fontWeight: "800",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    summaryBoxMuted: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    summaryMutedText: {
      flex: 1,
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textSecondary,
      fontWeight: "600",
      lineHeight: Math.round(fontSize * 0.9),
    },
    daySelector: {
      padding: 16,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      gap: 12,
    },
    daySelectorLabel: {
      fontSize: Math.round(fontSize * 0.7),
      fontWeight: "600",
      color: colors.textSecondary,
    },
    dayButtonsRow: { flexDirection: "row", gap: 8 },
    dayButton: {
      width: 88,
      paddingVertical: 12,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 12,
      alignItems: "center",
      gap: 4,
      minHeight: 88,
      justifyContent: "center",
    },
    dayButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayButtonLabel: {
      fontSize: Math.round(fontSize * 0.58),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    dayButtonLabelActive: { color: colors.onPrimary },
    dayButtonNum: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "800",
      color: colors.textSecondary,
    },
    dayButtonNumActive: { color: colors.onPrimary },
    heroRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "stretch",
    },
    heroCard: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 96,
    },
    heroCardHalf: { flex: 1 },
    heroCardWide: { flex: 3 },
    heroCardNarrow: { flex: 1, paddingHorizontal: 6 },
    heroCardGhost: {
      backgroundColor: "transparent",
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: "dashed",
      opacity: 0.55,
    },
    heroIconRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    heroIconRowNarrow: {
      flexDirection: "column",
      gap: 6,
    },
    heroTitle: {
      fontSize: Math.round(fontSize * 0.78),
      fontWeight: "700",
      color: colors.onPrimary,
      textAlign: "center",
      flexShrink: 1,
    },
    heroTitleGhost: {
      color: colors.textSecondary,
      fontSize: Math.round(fontSize * 0.52),
      fontWeight: "600",
    },
    heroTitleNarrow: {
      lineHeight: Math.round(fontSize * 0.62),
    },
    hintText: {
      fontSize: Math.round(fontSize * 0.58),
      color: colors.textSecondary,
      textAlign: "center",
      fontStyle: "italic",
      marginTop: -8,
    },
    compactCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      minHeight: 56,
    },
    compactTitle: {
      fontSize: Math.round(fontSize * 0.7),
      fontWeight: "700",
      color: colors.textPrimary,
    },
  });
}
