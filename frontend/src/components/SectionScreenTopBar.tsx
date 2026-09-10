/**
 * Barra superiore uniforme: casetta Home + marca/titolo app.
 * Usata in Impostazioni, Scarica letture, Calendario, Orazionale, ecc.
 */
import React from "react";
import { View, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { HomeCircleButton } from "./HomeCircleButton";
import { BrandScreenTitle } from "./BrandScreenTitle";

export const SECTION_TOP_BAR_GAP = 12;
export const SECTION_TOP_BAR_PAD_H = 16;
/** Spaziatore a destra = larghezza casetta (52), per bilanciare la top bar. */
export const SECTION_TOP_BAR_TRAILING_WIDTH = 52;

type ThemeColors = { border: string };

type Props = {
  title: string;
  onHome: () => void;
  colors: ThemeColors;
  fontSize: number;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  homeTestID?: string;
  homeAccessibilityLabel?: string;
  /** Bilancia visivamente la casetta a sinistra (default true). */
  balanceTrailing?: boolean;
  trailingWidth?: number;
  markSize?: number;
  titleNumberOfLines?: number;
  /** Sostituisce la casetta Home (es. «Indietro» nell’Orazionale). */
  leading?: React.ReactNode;
  children?: React.ReactNode;
};

export function SectionScreenTopBar({
  title,
  onHome,
  colors,
  fontSize,
  textStyle,
  style,
  homeTestID = "btn-back",
  homeAccessibilityLabel = "Torna alla home",
  balanceTrailing = true,
  trailingWidth = SECTION_TOP_BAR_TRAILING_WIDTH,
  markSize = Math.max(28, Math.round(fontSize * 0.85)),
  titleNumberOfLines = 1,
  leading,
  children,
}: Props) {
  return (
    <View style={[styles.topBar, { borderBottomColor: colors.border }, style]}>
      {leading ? (
        <View style={styles.leadingSlot}>{leading}</View>
      ) : (
        <HomeCircleButton
          onPress={onHome}
          testID={homeTestID}
          accessibilityLabel={homeAccessibilityLabel}
        />
      )}
      {children ?? (
        <BrandScreenTitle
          title={title}
          textStyle={textStyle}
          numberOfLines={titleNumberOfLines}
          markSize={markSize}
        />
      )}
      {balanceTrailing ? <View style={{ width: trailingWidth, flexShrink: 0 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SECTION_TOP_BAR_PAD_H,
    paddingVertical: 14,
    borderBottomWidth: 2,
    gap: SECTION_TOP_BAR_GAP,
  },
  leadingSlot: {
    flexShrink: 0,
  },
});
