import React from "react";
import { Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSettings } from "../SettingsContext";
import { ACTION_TITLE_WEIGHT } from "../uiActionTokens";

const FONT_MIN = 12;
const FONT_MAX = 60;
const FONT_STEP = 2;

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

type Props = {
  extraDisabled?: boolean;
  decreaseTestID: string;
  increaseTestID: string;
  labelScale?: number;
};

/** A− e misura attuale (es. 20+), stesso stile carenato della Home. */
export function FontSizeButtons({
  extraDisabled = false,
  decreaseTestID,
  increaseTestID,
  labelScale = 0.75,
}: Props) {
  const { colors, fontSize, setFontSize } = useSettings();
  const labelSize = Math.round(fontSize * labelScale);
  const decreaseDisabled = extraDisabled || fontSize <= FONT_MIN;
  const increaseDisabled = extraDisabled || fontSize >= FONT_MAX;
  const labelStyle = [
    styles.label,
    {
      fontSize: labelSize,
      color: colors.onPrimary,
      letterSpacing: Math.round(fontSize * 0.12),
    },
  ];

  return (
    <>
      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: colors.primary },
          decreaseDisabled && styles.disabled,
          webClickable,
        ]}
        onPress={() => setFontSize(Math.max(FONT_MIN, fontSize - FONT_STEP))}
        disabled={decreaseDisabled}
        testID={decreaseTestID}
        accessibilityRole="button"
        accessibilityLabel={`Riduci dimensione testo, attuale ${fontSize}`}
      >
        <Text style={labelStyle}>A-</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: colors.primary },
          increaseDisabled && styles.disabled,
          webClickable,
        ]}
        onPress={() => setFontSize(Math.min(FONT_MAX, fontSize + FONT_STEP))}
        disabled={increaseDisabled}
        testID={increaseTestID}
        accessibilityRole="button"
        accessibilityLabel={`Aumenta dimensione testo, attuale ${fontSize}`}
      >
        <Text style={labelStyle}>{`${fontSize}+`}</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 62,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  label: {
    fontWeight: ACTION_TITLE_WEIGHT,
    fontVariant: ["small-caps"],
    textShadowColor: "#000000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    ...(Platform.OS === "web"
      ? ({
          fontVariant: "small-caps",
          textShadow:
            "0 0 2px #000, -1.2px 0 0 #000, 1.2px 0 0 #000, 0 -1.2px 0 #000, 0 1.2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
        } as const)
      : {
          textShadowColor: "#000000",
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 5,
        }),
  },
});
