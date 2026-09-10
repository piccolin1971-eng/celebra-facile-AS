import React from "react";
import { Image, StyleSheet, View } from "react-native";

export type HomeHeroIconVariant =
  | "prep"
  | "celebra"
  | "calendar"
  | "download"
  | "orazionale";

type Props = {
  variant: HomeHeroIconVariant;
  size: number;
  /** Spazio nel layout: se minore di size, l'icona è più grande senza allargare il tasto. */
  layoutSize?: number;
  ghost?: boolean;
  /** Ignorato: i colori sono nel PNG, uguali su ogni dispositivo. */
  activeColor?: string;
  ghostColor?: string;
};

const SOURCES: Record<HomeHeroIconVariant, number> = {
  celebra: require("../../assets/images/brand-icons/celebra.png"),
  prep: require("../../assets/images/brand-icons/messale.png"),
  calendar: require("../../assets/images/brand-icons/calendario.png"),
  download: require("../../assets/images/brand-icons/lezionario.png"),
  orazionale: require("../../assets/images/brand-icons/orazionale.png"),
};

/**
 * Icone del marchio (PNG a colori). Non usano il tint del tasto:
 * restano a colori su web, telefono e tablet.
 */
export function HomeHeroIcon({ variant, size, layoutSize, ghost }: Props) {
  const box = layoutSize ?? size;
  return (
    <View style={[styles.iconWrap, { width: box, height: box }]}>
      <Image
        source={SOURCES[variant]}
        style={{ width: size, height: size, opacity: ghost ? 0.58 : 1 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
});
