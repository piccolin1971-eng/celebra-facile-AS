/**
 * Casetta Home: icona bianca grande in cerchio azzurro stretto.
 * Stile condiviso per le top bar delle sezioni principali.
 */
import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../SettingsContext";

type Props = {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
};

export function HomeCircleButton({
  onPress,
  testID = "btn-back-home",
  accessibilityLabel = "Torna alla home",
}: Props) {
  const { colors, scaledFont } = useSettings();
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          borderColor: colors.primary,
          backgroundColor: colors.surface,
        },
      ]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="home" size={scaledFont(42)} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    flexShrink: 0,
  },
});
