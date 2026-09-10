import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import type { MassSession } from "../massSession";
import type { VigilEveContext } from "../vigilCatalog";
import {
  celebrationKindLabel,
  celebrationShortLabel,
} from "../celebrationModeLabels";
import type { CelebrationMode } from "../massSession";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
};

type Props = {
  visible: boolean;
  sessions: MassSession[];
  vigilCtx: VigilEveContext | null;
  colors: ThemeColors;
  fontSize: number;
  onPick: (mode: CelebrationMode) => void;
  onCancel: () => void;
};

export function CelebrateChoiceDialog({
  visible,
  sessions,
  vigilCtx,
  colors,
  fontSize,
  onPick,
  onCancel,
}: Props) {
  const styles = makeStyles(colors, fontSize);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Quale liturgia celebri?</Text>
          <Text style={styles.message}>
            Hai preparato due celebrazioni per questo giorno. Scegli una:
          </Text>
          {sessions.map((s) => {
            const mode = s.celebrationMode ?? "calendar_day";
            return (
              <TouchableOpacity
                key={mode}
                style={styles.option}
                onPress={() => onPick(mode)}
                testID={`celebrate-pick-${mode}`}
                accessibilityRole="button"
              >
                <Text style={styles.optionTitle}>{celebrationKindLabel(mode, vigilCtx)}</Text>
                <Text style={styles.optionSub}>
                  {celebrationShortLabel(mode, vigilCtx, s.liturgyTitle)}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            testID="celebrate-pick-cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Annulla</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.75)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    dialog: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 20,
      gap: 10,
    },
    title: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: "800",
      color: colors.textPrimary,
    },
    message: {
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textSecondary,
      lineHeight: Math.round(fontSize * 0.95),
      marginBottom: 4,
    },
    option: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: colors.surface,
    },
    optionTitle: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    optionSub: {
      fontSize: Math.round(fontSize * 0.6),
      fontWeight: "600",
      color: colors.textSecondary,
      marginTop: 3,
    },
    cancelBtn: {
      paddingVertical: 10,
      alignItems: "center",
      marginTop: 4,
    },
    cancelText: {
      fontSize: Math.round(fontSize * 0.68),
      fontWeight: "700",
      color: colors.textSecondary,
    },
  });
}
