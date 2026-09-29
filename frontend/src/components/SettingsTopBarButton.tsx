import React from "react";
import { TouchableOpacity, Platform, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../SettingsContext";
import { topBarGlyphBox, topBarGlyphSize } from "../chromeScale";

type Props = {
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

/** Stesso blu della rotella piena in Home. */
export const TOP_BAR_GEAR_COLOR = "#4DA8DA";

/** Rotella impostazioni piena, come in Home. La cornice cresce col glifo e non lo taglia. */
export function SettingsTopBarButton({
  onPress,
  testID = "btn-settings",
  style,
}: Props) {
  const { fontSize } = useSettings();
  const glyph = topBarGlyphSize(fontSize, 40);
  const box = topBarGlyphBox(glyph);
  return (
    <TouchableOpacity
      style={[
        {
          width: box,
          height: box,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "visible",
          marginRight: 4,
        },
        style,
      ]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Impostazioni"
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
      {...webClickable}
    >
      <Ionicons name="settings" size={glyph} color={TOP_BAR_GEAR_COLOR} />
    </TouchableOpacity>
  );
}
