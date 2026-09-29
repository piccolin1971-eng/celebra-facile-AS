import React, { useRef } from "react";
import { View, StyleSheet, type GestureResponderEvent } from "react-native";
import { useSettings } from "../SettingsContext";
import { fontFromPinch } from "../pinchFont";
import { FONT_MAX, FONT_MIN } from "./FontSizeButtons";

function touchDistance(e: GestureResponderEvent): number | null {
  const touches = e.nativeEvent.touches;
  if (!touches || touches.length < 2) return null;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Due dita sul testo: la grandezza segue la distanza, a passi piccoli.
 * Quando le dita si fermano o si alzano, non c’è un altro scatto.
 * Un dito solo resta allo scroll e ai tap.
 */
export function PinchFontZoom({ children }: { children: React.ReactNode }) {
  const { pinchZoomEnabled, fontSize, setFontSize } = useSettings();
  const fontRef = useRef(fontSize);
  const liveRef = useRef(fontSize);
  const baseRef = useRef(fontSize);
  const originRef = useRef(1);
  const gesturing = useRef(false);
  if (!gesturing.current) {
    fontRef.current = fontSize;
    liveRef.current = fontSize;
  }

  const claim = (e: GestureResponderEvent) =>
    pinchZoomEnabled && (e.nativeEvent.touches?.length ?? 0) >= 2;

  const onGrant = (e: GestureResponderEvent) => {
    const d = touchDistance(e);
    gesturing.current = true;
    baseRef.current = fontRef.current;
    liveRef.current = fontRef.current;
    originRef.current = d && d > 12 ? d : 0;
  };

  const onMove = (e: GestureResponderEvent) => {
    const d = touchDistance(e);
    if (!d || !gesturing.current) return;
    if (originRef.current < 12) {
      originRef.current = d;
      baseRef.current = liveRef.current;
      return;
    }
    const next = fontFromPinch(baseRef.current, d / originRef.current, FONT_MIN, FONT_MAX);
    if (next === liveRef.current) return;
    liveRef.current = next;
    setFontSize(next, false);
  };

  const onEnd = () => {
    if (!gesturing.current) return;
    gesturing.current = false;
    const next = liveRef.current;
    fontRef.current = next;
    setFontSize(next, true);
  };

  return (
    <View
      style={styles.fill}
      onStartShouldSetResponder={claim}
      onMoveShouldSetResponder={claim}
      onStartShouldSetResponderCapture={claim}
      onMoveShouldSetResponderCapture={claim}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
