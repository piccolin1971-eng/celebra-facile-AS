import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CelebrationMode } from "../massSession";
import type { MassEveningChoiceContext } from "../massEveningContext";
import {
  availableCelebrationModes,
  celebrationKindLabel,
  celebrationOptionDescription,
  eveningChoiceBannerMessage,
} from "../celebrationModeLabels";

type ThemeColors = {
  surface: string;
  surface2?: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
};

type Props = {
  eveningCtx: MassEveningChoiceContext;
  calendarTitle: string;
  selectedMode: CelebrationMode;
  onSelectMode: (mode: CelebrationMode) => void;
  colors: ThemeColors;
  fontSize: number;
};

export function CelebrationModePanel({
  eveningCtx,
  calendarTitle,
  selectedMode,
  onSelectMode,
  colors,
  fontSize,
}: Props) {
  const styles = makeStyles(colors, fontSize);
  const modes = availableCelebrationModes(eveningCtx);

  return (
    <View style={styles.panel} testID="celebration-mode-panel" data-tap-stop="true">
      <Text style={styles.panelTitle}>Quale liturgia?</Text>
      <Text style={styles.hint}>{eveningChoiceBannerMessage(eveningCtx)}</Text>
      {modes.map((mode) => {
        const selected = selectedMode === mode;
        return (
          <TouchableOpacity
            key={mode}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onSelectMode(mode)}
            activeOpacity={0.7}
            testID={`celebration-mode-${mode}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={celebrationKindLabel(mode, eveningCtx)}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={Math.round(fontSize * 0.85)}
              color={selected ? colors.primary : colors.textSecondary}
              style={styles.radioIcon}
            />
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{celebrationKindLabel(mode, eveningCtx)}</Text>
              <Text style={styles.optionSub}>
                {celebrationOptionDescription(mode, eveningCtx, calendarTitle)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  const surface2 = colors.surface2 ?? colors.surface;
  return StyleSheet.create({
    panel: {
      backgroundColor: surface2,
      borderWidth: 3,
      borderColor: colors.primary,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      gap: 8,
    },
    panelTitle: {
      fontSize: Math.round(fontSize * 0.58),
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      color: colors.primary,
    },
    hint: {
      fontSize: Math.round(fontSize * 0.58),
      color: colors.textSecondary,
      lineHeight: Math.round(fontSize * 0.85),
    },
    option: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 10,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    optionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "24",
    },
    radioIcon: {
      marginTop: 2,
      flexShrink: 0,
    },
    optionText: {
      flex: 1,
      gap: 3,
    },
    optionLabel: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "700",
      color: colors.textPrimary,
      lineHeight: Math.round(fontSize * 0.9),
    },
    optionSub: {
      fontSize: Math.round(fontSize * 0.58),
      color: colors.textSecondary,
      lineHeight: Math.round(fontSize * 0.82),
    },
  });
}
