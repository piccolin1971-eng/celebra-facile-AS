/**
 * Titolo schermata con marca brand (come Home «Celebra facile»).
 */
import React from "react";
import { View, Text, Image, StyleSheet, type StyleProp, type TextStyle } from "react-native";

type Props = {
  title: string;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  markSize?: number;
  testID?: string;
};

export function BrandScreenTitle({
  title,
  textStyle,
  numberOfLines = 1,
  markSize = 32,
  testID,
}: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <Image
        source={require("../../assets/images/brand-mark.png")}
        style={{ width: markSize, height: markSize, flexShrink: 0 }}
        accessibilityIgnoresInvertColors
      />
      <Text style={[styles.titleFlex, textStyle]} numberOfLines={numberOfLines}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  titleFlex: {
    flex: 1,
    minWidth: 0,
  },
});
