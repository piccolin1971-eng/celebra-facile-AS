import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MassSession } from "../massSession";
import type { EucharisticPrayer, Preface } from "../api";
import { getPrayerById } from "../orazionale";
import { confirmDestructive } from "../confirmDestructive";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  liturgicalGreen: string;
  rubrics: string;
  primary: string;
};

type Props = {
  session: MassSession | null;
  prefaces: Preface[];
  prayers: EucharisticPrayer[];
  colors: ThemeColors;
  fontSize: number;
  scaledFont: (n: number) => number;
  kindLabel?: string;
  liturgySubtitle?: string;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
  onReset?: () => void | Promise<void>;
};

function ChoiceChip({
  label,
  on,
  colors,
  fontSize,
}: {
  label: string;
  on: boolean;
  colors: ThemeColors;
  fontSize: number;
}) {
  return (
    <View
      style={[
        chipStyles.chip,
        {
          backgroundColor: on ? colors.liturgicalGreen + "20" : colors.surface,
          borderColor: on ? colors.liturgicalGreen : colors.border,
        },
      ]}
    >
      <Ionicons
        name={on ? "checkmark-circle" : "close-circle-outline"}
        size={Math.round(fontSize * 0.55)}
        color={on ? colors.liturgicalGreen : colors.textSecondary}
      />
      <Text
        style={[
          chipStyles.chipText,
          {
            fontSize: Math.round(fontSize * 0.56),
            color: on ? colors.textPrimary : colors.textSecondary,
          },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    maxWidth: "100%",
  },
  chipText: { fontWeight: "700", flexShrink: 1 },
});

function shortenTitle(title: string, max = 42): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function HomeSessionSummary({
  session,
  prefaces,
  prayers,
  colors,
  fontSize,
  scaledFont,
  kindLabel,
  liturgySubtitle,
  selected = false,
  selectable = false,
  onSelect,
  onReset,
}: Props) {
  const styles = makeStyles(colors, fontSize);

  const confirmReset = () => {
    if (!onReset) return;
    confirmDestructive(
      "Azzerare le scelte?",
      "Le scelte salvate per questa liturgia verranno rimosse. Potrai preparare di nuovo da zero.",
      onReset,
    );
  };

  if (!session) {
    return (
      <View style={styles.mutedBox} testID="home-summary-empty">
        <Ionicons name="ellipse-outline" size={scaledFont(22)} color={colors.textSecondary} />
        <Text style={styles.mutedText}>
          Liturgia non ancora preparata — nessuna scelta salvata per questo giorno
        </Text>
      </View>
    );
  }

  const preface = prefaces.find((p) => p.id === session.selectedPrefaceId);
  const pe = prayers.find((p) => p.id === session.selectedPrayerId);
  const orPrayer = session.selectedOrazionaleId
    ? getPrayerById(session.selectedOrazionaleId)
    : undefined;

  const inner = (
    <>
      <View style={styles.summaryHeader}>
        <View style={styles.summaryHeaderText}>
          {kindLabel ? <Text style={styles.kindLabel}>{kindLabel}</Text> : null}
          <Text style={styles.summaryLabel}>Scelte per questo giorno</Text>
          {liturgySubtitle ? (
            <Text style={styles.liturgySubtitle} numberOfLines={2}>
              {liturgySubtitle}
            </Text>
          ) : null}
        </View>
        {onReset ? (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={confirmReset}
            testID="btn-reset-session"
            accessibilityRole="button"
            accessibilityLabel="Azzera le scelte per questa liturgia"
          >
            <Ionicons
              name="refresh-outline"
              size={Math.round(fontSize * 0.62)}
              color={colors.rubrics}
            />
            <Text style={styles.resetBtnText}>Azzera</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.chipRow}>
        <ChoiceChip
          label="Gloria"
          on={session.showGloria === true}
          colors={colors}
          fontSize={fontSize}
        />
        <ChoiceChip
          label="Credo"
          on={session.showCredo === true}
          colors={colors}
          fontSize={fontSize}
        />
        <ChoiceChip
          label="Preghiera fedeli"
          on={session.showOrazionalePray === true}
          colors={colors}
          fontSize={fontSize}
        />
      </View>
      <View style={styles.chipRow}>
        {preface ? (
          <ChoiceChip
            label={shortenTitle(preface.title, 36)}
            on
            colors={colors}
            fontSize={fontSize}
          />
        ) : null}
        {pe ? (
          <ChoiceChip label={shortenTitle(pe.title, 28)} on colors={colors} fontSize={fontSize} />
        ) : null}
      </View>
      {session.showOrazionalePray === true && orPrayer ? (
        <Text style={styles.orazionaleHint} numberOfLines={2}>
          Orazionale: {shortenTitle(orPrayer.title, 48)}
        </Text>
      ) : null}
    </>
  );

  const boxStyle = [
    styles.summaryBox,
    selected && styles.summaryBoxSelected,
    selectable && !selected && styles.summaryBoxSelectable,
  ];

  if (selectable && onSelect) {
    return (
      <TouchableOpacity
        style={boxStyle}
        onPress={onSelect}
        activeOpacity={0.7}
        testID={selected ? "home-summary-selected" : "home-summary-selectable"}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Seleziona per celebrare: ${kindLabel || "liturgia preparata"}`}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <View style={boxStyle} testID="home-summary-prepared">
      {inner}
    </View>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  return StyleSheet.create({
    summaryBox: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.liturgicalGreen,
      backgroundColor: colors.surface,
      gap: 12,
    },
    summaryBoxSelected: {
      borderWidth: 3,
      borderColor: colors.liturgicalGreen,
      backgroundColor: colors.liturgicalGreen + "0F",
    },
    summaryBoxSelectable: {
      borderColor: colors.border,
      opacity: 0.92,
    },
    summaryHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    summaryHeaderText: {
      flex: 1,
      gap: 2,
    },
    kindLabel: {
      fontSize: Math.round(fontSize * 0.56),
      fontWeight: "800",
      color: colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    summaryLabel: {
      fontSize: Math.round(fontSize * 0.62),
      fontWeight: "800",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    liturgySubtitle: {
      fontSize: Math.round(fontSize * 0.68),
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: 2,
      lineHeight: Math.round(fontSize * 0.95),
    },
    resetBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.rubrics,
      backgroundColor: colors.surface,
    },
    resetBtnText: {
      fontSize: Math.round(fontSize * 0.56),
      fontWeight: "700",
      color: colors.rubrics,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    orazionaleHint: {
      fontSize: Math.round(fontSize * 0.55),
      color: colors.textSecondary,
      fontWeight: "600",
      fontStyle: "italic",
    },
    mutedBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    mutedText: {
      flex: 1,
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textSecondary,
      fontWeight: "600",
      lineHeight: Math.round(fontSize * 0.95),
    },
  });
}
