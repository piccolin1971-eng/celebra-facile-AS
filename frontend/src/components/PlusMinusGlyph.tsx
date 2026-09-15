import React from "react";
import { View } from "react-native";

/** Segni −/+ geometrici, centrati nel tasto (niente baseline del font). */
export function PlusMinusGlyph({
  kind,
  color,
  size = 22,
  stroke,
}: {
  kind: "plus" | "minus";
  color: string;
  size?: number;
  stroke?: number;
}) {
  const t = stroke ?? Math.max(2.6, size * 0.13);
  const len = size * 0.64;
  const bar = {
    position: "absolute" as const,
    backgroundColor: color,
    borderRadius: t / 2,
  };
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      pointerEvents="none"
    >
      <View style={[bar, { width: len, height: t }]} />
      {kind === "plus" ? <View style={[bar, { width: t, height: len }]} /> : null}
    </View>
  );
}
