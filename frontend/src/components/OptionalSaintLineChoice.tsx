import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { formatCelebrationTitle } from "../homeBannerUtils";
import type { OptionalSaintLinePick } from "../optionalSaintLinePick";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary?: string;
  onPrimary?: string;
};

type Props = {
  calendarTitle: string;
  optionalTitle: string;
  activeLine: OptionalSaintLinePick;
  onPick: (line: OptionalSaintLinePick) => void;
  colors: ThemeColors;
  fontSize: number;
  scaledFont: (n: number) => number;
};

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

/** Come i tasti «Scegli la liturgia» / «Celebra la Messa» in Home (testo chiaro su sfondo colorato). */
const textOnFilledOutline = {
  textShadowColor: "#000000",
  textShadowOffset: { width: 1, height: 1 },
  textShadowRadius: 4,
  ...(Platform.OS === "web"
    ? ({
        textShadow:
          "0 0 2px #000, -1.2px 0 0 #000, 1.2px 0 0 #000, 0 -1.2px 0 #000, 0 1.2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
      } as const)
    : {
        textShadowColor: "#000000",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 5,
      }),
};

function activeChipTextStyle(
  selected: boolean,
  kind: "label" | "sub",
  fontSize: number,
  onPrimary: string,
) {
  if (!selected) return undefined;
  const letterSpacing =
    kind === "label"
      ? 0.35 + Math.round(fontSize * 0.04)
      : Math.round(fontSize * 0.05);
  return {
    color: onPrimary,
    letterSpacing,
    ...textOnFilledOutline,
  };
}

export function OptionalSaintLineChoice({
  calendarTitle,
  optionalTitle,
  activeLine,
  onPick,
  colors,
  fontSize,
}: Props) {
  const { width } = useWindowDimensions();
  const stackChips = width < 400;
  const styles = makeStyles(colors, fontSize);
  const primary = colors.primary ?? "#0056B3";
  const onPrimary = colors.onPrimary ?? "#FFFFFF";

  return (
    <View style={styles.wrap} testID="optional-saint-line-choice">
      <Text style={styles.hint}>
        In questo giorno puoi celebrare la liturgia del calendario o il santo che hai attivato in
        impostazioni.
      </Text>
      <View style={[styles.row, stackChips && styles.rowStacked]}>
        <TouchableOpacity
          style={[
            styles.chip,
            activeLine === "calendar" && { backgroundColor: primary, borderColor: primary },
          ]}
          onPress={() => onPick("calendar")}
          accessibilityRole="button"
          accessibilityState={{ selected: activeLine === "calendar" }}
          testID="optional-line-calendar"
          {...webClickable}
        >
          <Text
            style={[
              styles.chipLabel,
              activeChipTextStyle(activeLine === "calendar", "label", fontSize, onPrimary),
            ]}
            numberOfLines={3}
          >
            Calendario
          </Text>
          <Text
            style={[
              styles.chipSub,
              activeChipTextStyle(activeLine === "calendar", "sub", fontSize, onPrimary),
            ]}
            numberOfLines={4}
          >
            {formatCelebrationTitle(calendarTitle) || "Liturgia del giorno"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.chip,
            activeLine === "optional" && { backgroundColor: primary, borderColor: primary },
          ]}
          onPress={() => onPick("optional")}
          accessibilityRole="button"
          accessibilityState={{ selected: activeLine === "optional" }}
          testID="optional-line-saint"
          {...webClickable}
        >
          <Text
            style={[
              styles.chipLabel,
              activeChipTextStyle(activeLine === "optional", "label", fontSize, onPrimary),
            ]}
            numberOfLines={3}
          >
            Santo scelto
          </Text>
          <Text
            style={[
              styles.chipSub,
              activeChipTextStyle(activeLine === "optional", "sub", fontSize, onPrimary),
            ]}
            numberOfLines={4}
          >
            {formatCelebrationTitle(optionalTitle)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  const pad = Math.round(fontSize * 0.46);
  return StyleSheet.create({
    wrap: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: pad,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    hint: {
      fontSize: Math.round(fontSize * 0.62),
      lineHeight: Math.round(fontSize * 0.92),
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: Math.round(fontSize * 0.38),
    },
    row: {
      flexDirection: "row",
      gap: Math.round(fontSize * 0.38),
    },
    rowStacked: {
      flexDirection: "column",
    },
    chip: {
      flex: 1,
      padding: pad,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: Math.round(fontSize * 2.6),
      minWidth: 0,
    },
    chipLabel: {
      fontSize: Math.round(fontSize * 0.72),
      lineHeight: Math.round(fontSize * 1.05),
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.35,
      color: colors.textSecondary,
      marginBottom: Math.round(fontSize * 0.15),
    },
    chipSub: {
      fontSize: Math.round(fontSize * 0.92),
      lineHeight: Math.round(fontSize * 1.32),
      fontWeight: "700",
      color: colors.textPrimary,
    },
  });
}
