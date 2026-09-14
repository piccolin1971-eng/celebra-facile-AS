import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { triggerAppHaptic } from "../appHaptics";
import { useSettings } from "../SettingsContext";
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

const CREAM = "#E8DCC4";
const CREAM_DIM = "#9A9080";
const PANEL_BG = "#241F1B";
const SUN_GOLD = "#F0D060";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

type Anchor = { top: number; right: number };

type BrightnessCtx = {
  open: boolean;
  level: number;
  toggleFrom: (node: View | null) => void;
  bump: (delta: number) => void;
};

const Ctx = createContext<BrightnessCtx | null>(null);

function measureAnchor(node: View | null, cb: (a: Anchor) => void) {
  if (!node || typeof (node as any).measureInWindow !== "function") {
    cb({ top: 56, right: 8 });
    return;
  }
  (node as any).measureInWindow((x: number, y: number, w: number, h: number) => {
    const winW = Dimensions.get("window").width;
    cb({
      top: Math.round((y || 0) + (h || 36) + 6),
      right: Math.max(8, Math.round(winW - (x || 0) - (w || 36))),
    });
  });
}

export function ReadingBrightnessRoot({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(3);
  const [anchor, setAnchor] = useState<Anchor>({ top: 56, right: 8 });

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

  const toggleFrom = useCallback((node: View | null) => {
    setOpen((v) => {
      if (!v) measureAnchor(node, setAnchor);
      return !v;
    });
    void triggerAppHaptic("light");
  }, []);

  const value = useMemo(() => ({ open, level, toggleFrom, bump }), [open, level, toggleFrom, bump]);

  return (
    <Ctx.Provider value={value}>
      <View style={styles.root}>
        {children}
        {open ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="brightness-stepper">
            <View style={[styles.panelWrap, { top: anchor.top, right: anchor.right }]}>
              <View style={styles.panel} accessibilityRole="adjustable">
                <TouchableOpacity
                  style={styles.pm}
                  onPress={() => bump(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Diminuisci luminosità"
                  testID="btn-brightness-minus"
                  {...webClickable}
                >
                  <Text style={styles.pmLab}>−</Text>
                </TouchableOpacity>
                <View style={styles.val} accessible accessibilityLabel={`Luminosità ${level} su ${BRIGHTNESS_MAX}`}>
                  <Text style={styles.glyph}>{brightnessSunGlyph(level)}</Text>
                  <Text style={styles.valN}>{level} / {BRIGHTNESS_MAX}</Text>
                </View>
                <TouchableOpacity
                  style={styles.pm}
                  onPress={() => bump(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Aumenta luminosità"
                  testID="btn-brightness-plus"
                  {...webClickable}
                >
                  <Text style={styles.pmLab}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Ctx.Provider>
  );
}

export function ReadingBrightnessButton() {
  const ctx = useContext(Ctx);
  const { colors } = useSettings();
  const wrapRef = useRef<View>(null);
  if (!ctx) return null;
  const iconColor = ctx.open ? "#1A1208" : colors.textPrimary;
  return (
    <View ref={wrapRef} collapsable={false}>
      <TouchableOpacity
        onPress={() => ctx.toggleFrom(wrapRef.current)}
        style={[
          styles.sunBtn,
          { borderColor: ctx.open ? "#E0B429" : colors.textPrimary },
          ctx.open && styles.sunBtnOpen,
        ]}
        accessibilityRole="button"
        accessibilityLabel={ctx.open ? "Chiudi luminosità" : "Luminosità"}
        accessibilityState={{ expanded: ctx.open }}
        testID="btn-reading-brightness"
        hitSlop={4}
        {...webClickable}
      >
        <Ionicons name="sunny" size={22} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panelWrap: {
    position: "absolute",
    zIndex: 80,
    elevation: 80,
  },
  panel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 210,
    backgroundColor: PANEL_BG,
    borderColor: CREAM,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  pm: {
    width: 46,
    height: 42,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: CREAM,
    alignItems: "center",
    justifyContent: "center",
  },
  pmLab: {
    color: CREAM,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 28,
    marginTop: Platform.OS === "android" ? -2 : 0,
  },
  val: {
    flexGrow: 1,
    minWidth: 72,
    height: 42,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: CREAM_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    color: SUN_GOLD,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
  },
  valN: {
    color: CREAM,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    opacity: 0.75,
  },
  sunBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: CREAM,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  sunBtnOpen: {
    backgroundColor: CREAM,
  },
});
