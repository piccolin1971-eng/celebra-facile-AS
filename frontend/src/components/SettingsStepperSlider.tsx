import Slider from "@react-native-community/slider";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type SettingsColors = {
  primary: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
};

type Props = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  onValueChange: (value: number) => void;
  colors: SettingsColors;
  scaledFont: (n: number) => number;
  minimumLabel?: string;
  maximumLabel?: string;
  /** Appended to auto-generated min/max labels (e.g. "sec." for seconds). */
  valueSuffix?: string;
  testID?: string;
};

function formatBoundLabel(n: number, step: number, suffix = ""): string {
  const rounded = roundToStep(n, step);
  const core =
    step < 1
      ? rounded % 1 === 0
        ? String(Math.round(rounded))
        : rounded.toFixed(1)
      : String(Math.round(rounded));
  const unit = suffix.trim();
  if (!unit) return core;
  return `${core}\u00a0${unit}`;
}

function roundToStep(n: number, step: number): number {
  if (step >= 1) return Math.round(n);
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function SettingsStepperSlider({
  value,
  minimumValue,
  maximumValue,
  step,
  onValueChange,
  colors,
  scaledFont,
  minimumLabel,
  maximumLabel,
  valueSuffix = "",
  testID,
}: Props) {
  const styles = makeStyles(colors, scaledFont, Boolean(valueSuffix.trim()));
  const minLabel = minimumLabel ?? formatBoundLabel(minimumValue, step, valueSuffix);
  const maxLabel = maximumLabel ?? formatBoundLabel(maximumValue, step, valueSuffix);
  const atMin = roundToStep(value, step) <= minimumValue;
  const atMax = roundToStep(value, step) >= maximumValue;

  const bump = (delta: number) => {
    onValueChange(clamp(roundToStep(value + delta, step), minimumValue, maximumValue));
  };

  return (
    <View style={styles.row} testID={testID}>
      <TouchableOpacity
        style={[styles.stepBtn, atMin && styles.stepBtnDisabled]}
        onPress={() => bump(-step)}
        disabled={atMin}
        accessibilityLabel="Diminuisci valore"
        testID={testID ? `${testID}-minus` : undefined}
      >
        <Text style={[styles.stepBtnText, atMin && styles.stepBtnTextDisabled]}>−</Text>
      </TouchableOpacity>

      <View style={styles.sliderBlock}>
        <Text
          style={styles.boundLabel}
          numberOfLines={1}
          testID={testID ? `${testID}-min-label` : undefined}
        >
          {minLabel}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          value={value}
          onValueChange={(v) => onValueChange(clamp(roundToStep(v, step), minimumValue, maximumValue))}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
        <Text
          style={styles.boundLabel}
          numberOfLines={1}
          testID={testID ? `${testID}-max-label` : undefined}
        >
          {maxLabel}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.stepBtn, atMax && styles.stepBtnDisabled]}
        onPress={() => bump(step)}
        disabled={atMax}
        accessibilityLabel="Aumenta valore"
        testID={testID ? `${testID}-plus` : undefined}
      >
        <Text style={[styles.stepBtnText, atMax && styles.stepBtnTextDisabled]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: SettingsColors, scaledFont: (n: number) => number, withUnit: boolean) {
  const btnSize = Math.round(scaledFont(52));
  const labelWidth = Math.round(scaledFont(withUnit ? 88 : 56));
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 10,
    },
    stepBtn: {
      width: btnSize,
      height: btnSize,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "18",
    },
    stepBtnDisabled: {
      borderColor: colors.border,
      backgroundColor: "transparent",
      opacity: 0.45,
    },
    stepBtnText: {
      fontSize: scaledFont(32),
      fontWeight: "800",
      color: colors.primary,
      lineHeight: scaledFont(36),
    },
    stepBtnTextDisabled: {
      color: colors.textSecondary,
    },
    sliderBlock: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    slider: {
      flex: 1,
      height: 36,
    },
    boundLabel: {
      minWidth: labelWidth,
      flexShrink: 0,
      fontSize: scaledFont(26),
      fontWeight: "800",
      color: colors.textPrimary,
      textAlign: "center",
    },
  });
}
