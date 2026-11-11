/**
 * Casetta Home: icona bianca grande in cerchio azzurro stretto.
 * Stile condiviso per le top bar delle sezioni principali.
 */
import React, { useCallback } from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSettings } from "../SettingsContext";
import { triggerAppHaptic } from "../appHaptics";

/** Pressione lunga sulla casetta → Impostazioni (tap breve = onPress dello schermo). */
const SETTINGS_LONG_PRESS_MS = 1500;

type Props = {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  /** Default true: long press apre /impostazioni. */
  settingsOnLongPress?: boolean;
};

export function HomeCircleButton({
  onPress,
  testID = "btn-back-home",
  accessibilityLabel = "Torna alla home",
  settingsOnLongPress = true,
}: Props) {
  const router = useRouter();
  const { colors, scaledFont } = useSettings();

  const openSettings = useCallback(() => {
    void triggerAppHaptic("light");
    router.push("/impostazioni");
  }, [router]);

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
      delayLongPress={SETTINGS_LONG_PRESS_MS}
      onLongPress={settingsOnLongPress ? openSettings : undefined}
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
