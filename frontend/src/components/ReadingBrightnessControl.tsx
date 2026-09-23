import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { triggerAppHaptic } from "../appHaptics";
import { useSettings } from "../SettingsContext";
import { PlusMinusGlyph } from "./PlusMinusGlyph";
import { FONT_SIZE_SEG_HEIGHT } from "./FontSizeButtons";
import {
  BRIGHTNESS_MAX,
  applyReadingBrightnessLevel,
  brightnessSunGlyph,
  brightnessValueToLevel,
  clampBrightnessLevel,
  loadSavedBrightnessLevel,
  readCurrentBrightnessValue,
  restoreSystemReadingBrightness,
  saveBrightnessLevel,
} from "../readingBrightness";

const ROW_BG = "#000000";
const ORANGE = "#FF6A00";
const LIME = "#22E85A";
const SUN_YELLOW = "#FFE14A";
const BORDER_STOPS = ["#000000", "#1A1A1A", "#4A4A4A", "#8A8A8A", "#C8C8C8", "#FFFFFF"] as const;

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

type BrightnessCtx = {
  open: boolean;
  level: number;
  toggle: () => void;
  bump: (delta: number) => void;
};

const Ctx = createContext<BrightnessCtx | null>(null);

export function ReadingBrightnessRoot({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(3);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const current = await readCurrentBrightnessValue();
        const saved = await loadSavedBrightnessLevel();
        if (!live) return;
        if (saved != null) {
          setLevel(saved);
          await applyReadingBrightnessLevel(saved);
        } else if (current != null) {
          setLevel(brightnessValueToLevel(current));
        }
      })();
      return () => {
        live = false;
        setOpen(false);
        void restoreSystemReadingBrightness();
      };
    }, []),
  );

  const bump = useCallback((delta: number) => {
    setLevel((prev) => {
      const next = clampBrightnessLevel(prev + delta);
      void applyReadingBrightnessLevel(next);
      void saveBrightnessLevel(next);
      return next;
    });
    void triggerAppHaptic("light");
  }, []);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
    void triggerAppHaptic("light");
  }, []);

  const value = useMemo(() => ({ open, level, toggle, bump }), [open, level, toggle, bump]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function ReadingBrightnessButton() {
  const ctx = useContext(Ctx);
  const { colors } = useSettings();
  if (!ctx) return null;
  // Pillola come «Auto»: sole sempre giallo (anche a riposo).
  const border = ctx.open ? "#E0B429" : colors.primary;
  return (
    <TouchableOpacity
      onPress={ctx.toggle}
      style={[
        styles.sunBtn,
        {
          height: FONT_SIZE_SEG_HEIGHT,
          borderColor: border,
          backgroundColor: ctx.open ? "rgba(224,180,41,0.22)" : `${colors.primary}14`,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={ctx.open ? "Chiudi luminosità" : "Luminosità"}
      accessibilityState={{ expanded: ctx.open }}
      testID="btn-reading-brightness"
      hitSlop={4}
      {...webClickable}
    >
      <Ionicons name="sunny" size={22} color={SUN_YELLOW} />
    </TouchableOpacity>
  );
}

/** Riga nera a tutta larghezza: − / sole animato / +, solo contorni colorati. */
export function ReadingBrightnessRow() {
  const ctx = useContext(Ctx);
  if (!ctx?.open) return null;
  return (
    <View style={styles.row} testID="brightness-stepper" accessibilityRole="adjustable">
      <TouchableOpacity
        style={[styles.pill, styles.pillMinus]}
        onPress={() => ctx.bump(-1)}
        accessibilityRole="button"
        accessibilityLabel="Diminuisci luminosità"
        testID="btn-brightness-minus"
        {...webClickable}
      >
        <PlusMinusGlyph kind="minus" color={ORANGE} size={22} stroke={3.2} />
      </TouchableOpacity>
      <View
        style={[styles.midShell, Platform.OS === "web" ? styles.midShellWeb : null]}
        accessible
        accessibilityLabel={`Luminosità ${ctx.level} su ${BRIGHTNESS_MAX}`}
      >
        {Platform.OS === "web" ? null : (
          <View style={styles.midGrad} pointerEvents="none">
            {BORDER_STOPS.map((c) => (
              <View key={c} style={[styles.midGradStop, { backgroundColor: c }]} />
            ))}
          </View>
        )}
        <View style={styles.midInner}>
          <Text style={styles.glyph}>{brightnessSunGlyph(ctx.level)}</Text>
          <Text style={styles.midN}>
            {ctx.level} / {BRIGHTNESS_MAX}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.pill, styles.pillPlus]}
        onPress={() => ctx.bump(1)}
        accessibilityRole="button"
        accessibilityLabel="Aumenta luminosità"
        testID="btn-brightness-plus"
        {...webClickable}
      >
        <PlusMinusGlyph kind="plus" color={LIME} size={22} stroke={3.2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 56,
    backgroundColor: ROW_BG,
    gap: 10,
  },
  pill: {
    minWidth: 90,
    height: 44,
    paddingHorizontal: 25,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    backgroundColor: ROW_BG,
  },
  pillMinus: { borderColor: ORANGE },
  pillPlus: { borderColor: LIME },
  midShell: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    padding: 3,
    overflow: "hidden",
    justifyContent: "center",
  },
  midShellWeb: {
    // @ts-expect-error web-only: bordo da nero (sx) a bianco pieno (dx)
    backgroundImage: "linear-gradient(90deg, #000000 0%, #000000 22%, #5A5A5A 58%, #E8E8E8 82%, #FFFFFF 100%)",
  },
  midGrad: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  midGradStop: { flex: 1 },
  midInner: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 999,
    backgroundColor: ROW_BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  glyph: {
    color: SUN_YELLOW,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    textAlign: "center",
  },
  midN: {
    color: SUN_YELLOW,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  sunBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
