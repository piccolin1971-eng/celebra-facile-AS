import React from "react";
import { Text, TouchableOpacity, StyleSheet, View, Platform } from "react-native";
import { useSettings } from "../SettingsContext";
import { ACTION_TITLE_WEIGHT } from "../uiActionTokens";

const FONT_MIN = 12;
const FONT_MAX = 60;
const FONT_STEP = 1;

/** Larghezza totale ≤ due tasti storici (62 + 8 + 62). */
export const FONT_SIZE_SEG_WIDTH = 132;
/** Altezza fissa del segmento (non scala col testo liturgico). */
export const FONT_SIZE_SEG_HEIGHT = 40;

/** Più piccolo del testo liturgico: A+/A− devono stare interi nella cella stretta. */
const SIDE_LABEL_SIZE = 16;
/** Valore al centro: non grassetto; il box resta 132×40. */
const MID_LABEL_SIZE = 17;

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

/** Centraggio verticale stabile (Android + web). */
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

/** Glifi A± / −+ tendono a sedersi in basso: leggero offset ottico. */
const SIDE_NUDGE_UP = -2;
const MID_NUDGE_UP = -1;

type Props = {
  extraDisabled?: boolean;
  decreaseTestID: string;
  increaseTestID: string;
  /** @deprecated Il chrome del segmento non scala più col testo. */
  labelScale?: number;
};

/** Segmento compatto A− | N | A+ (stile extra-slim, A± in evidenza). */
export function FontSizeButtons({
  extraDisabled = false,
  decreaseTestID,
  increaseTestID,
}: Props) {
  const { colors, fontSize, setFontSize } = useSettings();
  const decreaseDisabled = extraDisabled || fontSize <= FONT_MIN;
  const increaseDisabled = extraDisabled || fontSize >= FONT_MAX;
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
      accessibilityLabel={`Dimensione testo ${fontSize}`}
      accessibilityValue={{ min: FONT_MIN, max: FONT_MAX, now: fontSize }}
    >
      <TouchableOpacity
        style={[styles.side, decreaseDisabled && styles.disabled, webClickable]}
        onPress={() => setFontSize(Math.max(FONT_MIN, fontSize - FONT_STEP))}
        disabled={decreaseDisabled}
        testID={decreaseTestID}
        accessibilityRole="button"
        accessibilityLabel={`Riduci dimensione testo, attuale ${fontSize}`}
        activeOpacity={0.55}
      >
        <Text style={[styles.sideLabel, { color: colors.textPrimary }]} allowFontScaling={false}>
          A−
        </Text>
      </TouchableOpacity>
      <View style={[styles.mid, { borderLeftColor: midBorder, borderRightColor: midBorder }]}>
        <Text style={[styles.midLabel, { color: colors.focus }]} allowFontScaling={false}>
          {fontSize}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.side, increaseDisabled && styles.disabled, webClickable]}
        onPress={() => setFontSize(Math.min(FONT_MAX, fontSize + FONT_STEP))}
        disabled={increaseDisabled}
        testID={increaseTestID}
        accessibilityRole="button"
        accessibilityLabel={`Aumenta dimensione testo, attuale ${fontSize}`}
        activeOpacity={0.55}
      >
        <Text style={[styles.sideLabel, { color: colors.textPrimary }]} allowFontScaling={false}>
          A+
        </Text>
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
    paddingHorizontal: 0,
  },
  mid: {
    width: 30,
    maxWidth: 32,
    minWidth: 28,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  sideLabel: {
    fontSize: SIDE_LABEL_SIZE,
    lineHeight: SIDE_LABEL_SIZE + 2,
    fontWeight: ACTION_TITLE_WEIGHT,
    letterSpacing: -0.4,
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
