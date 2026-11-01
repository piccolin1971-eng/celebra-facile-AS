import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import type { CeiMassFormula, CeiMassFormulaOption } from "../liturgyScraper";
import { ACTION_MIN_HEIGHT, ACTION_TITLE_WEIGHT } from "../uiActionTokens";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary?: string;
};

type Props = {
  options: CeiMassFormulaOption[];
  activeFormula: CeiMassFormula;
  onPick: (formula: CeiMassFormula) => void;
  colors: ThemeColors;
  fontSize: number;
};

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

/** Come i flagBtn in Home («Celebra subito», Ore, …). */
const FLAG_BTN_MIN_HEIGHT = Math.round(ACTION_MIN_HEIGHT * 1.05);

/** Cornice selezione: visibile su temi scuri e chiari. */
const SELECTED_BORDER_WIDTH = 6;
const DEFAULT_BORDER_WIDTH = 3;

export function CeiMassFormulaChoice({
  options,
  activeFormula,
  onPick,
  colors,
  fontSize,
}: Props) {
  const styles = makeStyles(colors, fontSize);
  const accent = colors.primary ?? "#0056B3";

  if (options.length < 2) return null;

  const titleLineHeight = Math.round(fontSize * 1.38);
  const titleSize = Math.round(fontSize * 1.22);
  const subSize = Math.round(fontSize * 0.92);

  return (
    <View style={styles.wrap} testID="cei-mass-formula-choice">
      <Text style={styles.hint}>
        In questo giorno la CEI propone più messe: scegli quale celebrare.
      </Text>
      <View style={styles.stack}>
        {options.map((opt) => {
          const selected = activeFormula === opt.formula;
          return (
            <TouchableOpacity
              key={opt.formula}
              style={[
                styles.chip,
                {
                  borderColor: selected ? accent : colors.border,
                  borderWidth: selected ? SELECTED_BORDER_WIDTH : DEFAULT_BORDER_WIDTH,
                },
              ]}
              onPress={() => onPick(opt.formula)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Messa ${opt.formula}, ${opt.entranceAntiphon || `formulario ${opt.formula}`}`}
              testID={`cei-mass-formula-${opt.formula}`}
              {...webClickable}
            >
              <Text style={styles.chipLine} numberOfLines={1} ellipsizeMode="tail">
                <Text
                  style={[
                    styles.chipLabel,
                    {
                      fontSize: titleSize,
                      lineHeight: titleLineHeight,
                      color: selected ? accent : colors.textPrimary,
                    },
                  ]}
                >
                  {`Messa ${opt.formula} · `}
                </Text>
                <Text
                  style={[styles.chipSub, { fontSize: subSize, lineHeight: titleLineHeight }]}
                >
                  {opt.entranceAntiphon || `Formulario ${opt.formula}`}
                </Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  return StyleSheet.create({
    wrap: {
      marginTop: 12,
      marginBottom: 4,
      gap: 8,
      width: "100%",
    },
    hint: {
      fontSize: fontSize * 0.88,
      color: colors.textSecondary,
      lineHeight: fontSize * 1.25,
    },
    stack: {
      width: "100%",
      gap: 12,
    },
    chip: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: FLAG_BTN_MIN_HEIGHT,
      paddingVertical: 16,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
    },
    chipLine: {
      flex: 1,
      minWidth: 0,
      textAlign: "left",
      includeFontPadding: false,
      ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
    },
    chipLabel: {
      fontWeight: ACTION_TITLE_WEIGHT,
      letterSpacing: Math.round(fontSize * 0.06),
      fontVariant: ["small-caps"],
      ...(Platform.OS === "web" ? ({ fontVariant: "small-caps" } as const) : {}),
    },
    chipSub: {
      fontWeight: "600",
      color: colors.textPrimary,
      opacity: 0.92,
    },
  });
}
