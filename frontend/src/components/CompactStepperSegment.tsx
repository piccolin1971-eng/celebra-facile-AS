import React from "react";
import { Text, TouchableOpacity, StyleSheet, View, Platform } from "react-native";
import { useSettings } from "../SettingsContext";
import { ACTION_TITLE_WEIGHT } from "../uiActionTokens";
import {
  FONT_SIZE_SEG_HEIGHT,
  FONT_SIZE_SEG_WIDTH,
} from "./FontSizeButtons";

const SIDE_LABEL_SIZE = 22;
const MID_LABEL_SIZE = 18;

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

const labelCenter = {
  includeFontPadding: false as const,
  textAlignVertical: "center" as const,
  textAlign: "center" as const,
  ...(Platform.OS === "android" ? { paddingVertical: 0 } : null),
  ...(Platform.OS === "web"
    ? ({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      } as const)
    : null),
};

/** −/+ seduti in basso nella box: offset più marcato dello A±. */
const SIDE_NUDGE_UP = -3;
const MID_NUDGE_UP = -1;

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  decreaseTestID: string;
  increaseTestID: string;
  accessibilityLabel?: string;
};

/**
 * Segmento − | N | + gemello di FontSizeButtons (stesse dimensioni / chrome blu).
 * Usato per la velocità di scorrimento Ore.
 */
export function CompactStepperSegment({
  value,
  min,
  max,
  onChange,
  decreaseTestID,
  increaseTestID,
  accessibilityLabel = "Velocità scorrimento",
}: Props) {
  const { colors } = useSettings();
  const decreaseDisabled = value <= min;
  const increaseDisabled = value >= max;
  const midBorder = `${colors.primary}59`;
  const fill = `${colors.primary}1A`;

  return (
    <View
      style={[
        styles.seg,
        {
          borderColor: colors.primary,
          backgroundColor: fill,
        },
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={`${accessibilityLabel} ${value}`}
      accessibilityValue={{ min, max, now: value }}
    >
      <TouchableOpacity
        style={[styles.side, decreaseDisabled && styles.disabled, webClickable]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={decreaseDisabled}
        testID={decreaseTestID}
        accessibilityRole="button"
        accessibilityLabel="Rallenta"
        activeOpacity={0.55}
        hitSlop={4}
      >
        <Text style={[styles.sideLabel, { color: colors.textPrimary }]}>-</Text>
      </TouchableOpacity>
      <View style={[styles.mid, { borderLeftColor: midBorder, borderRightColor: midBorder }]}>
        <Text style={[styles.midLabel, { color: colors.focus }]}>{value}</Text>
      </View>
      <TouchableOpacity
        style={[styles.side, increaseDisabled && styles.disabled, webClickable]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={increaseDisabled}
        testID={increaseTestID}
        accessibilityRole="button"
        accessibilityLabel="Accelera"
        activeOpacity={0.55}
        hitSlop={4}
      >
        <Text style={[styles.sideLabel, { color: colors.textPrimary }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row",
    alignItems: "stretch",
    width: FONT_SIZE_SEG_WIDTH,
    maxWidth: FONT_SIZE_SEG_WIDTH,
    height: FONT_SIZE_SEG_HEIGHT,
    borderRadius: 8,
    borderWidth: 1.5,
    overflow: "hidden",
    flexShrink: 0,
  },
  side: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  mid: {
    width: 34,
    maxWidth: 36,
    minWidth: 30,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  sideLabel: {
    fontSize: SIDE_LABEL_SIZE,
    lineHeight: SIDE_LABEL_SIZE,
    fontWeight: ACTION_TITLE_WEIGHT,
    letterSpacing: 0.3,
    marginTop: SIDE_NUDGE_UP,
    ...labelCenter,
  },
  midLabel: {
    fontSize: MID_LABEL_SIZE,
    lineHeight: MID_LABEL_SIZE,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    marginTop: MID_NUDGE_UP,
    ...(Platform.OS === "web" ? ({ fontVariantNumeric: "tabular-nums" } as const) : null),
    ...labelCenter,
  },
  disabled: { opacity: 0.35 },
});
