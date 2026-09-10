import React from "react";
import { TouchableOpacity, Platform, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  onPress: () => void;
  color: string;
  size: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

/** Rotella impostazioni in top bar (Home, Celebra, indice Celebra subito). */
export function SettingsTopBarButton({
  onPress,
  color,
  size,
  testID = "btn-settings",
  style,
}: Props) {
  return (
    <TouchableOpacity
      style={style}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Impostazioni"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      {...webClickable}
    >
      <Ionicons name="settings-outline" size={size} color={color} />
    </TouchableOpacity>
  );
}
