import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import type { AppUpdateInfo } from "../appUpdate";
import { currentAppVersionName } from "../appUpdate";

type Props = {
  visible: boolean;
  info: AppUpdateInfo | null;
  busy?: boolean;
  onUpdate: () => void;
  onLater: () => void;
  colors: {
    background: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
    primary: string;
    border: string;
  };
};

const GOLD = "#E0B429";

export function AppUpdateModal({ visible, info, busy, onUpdate, onLater, colors }: Props) {
  if (!info) return null;
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop} testID="app-update-modal">
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Aggiornamento disponibile</Text>
          <Text style={styles.title}>Nuova versione</Text>
          <Text style={styles.versions}>
            {currentAppVersionName()} → {info.versionName}
          </Text>
          {info.body ? (
            <Text style={styles.body} numberOfLines={5}>
              {info.body}
            </Text>
          ) : (
            <Text style={styles.body}>
              Se non sei sicuro, tocca il pulsante rotondo. L’app continua a funzionare.
            </Text>
          )}
          <Text style={styles.hintLabel}>Consigliato se serve aiuto</Text>
          <TouchableOpacity
            style={[styles.laterBtn, busy && { opacity: 0.55 }]}
            onPress={onLater}
            disabled={!!busy}
            testID="btn-app-update-later"
            accessibilityRole="button"
            accessibilityLabel="Più tardi, chiudi aggiornamento"
          >
            <Text style={styles.laterLab}>Più tardi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.updateBtn, busy && { opacity: 0.6 }]}
            onPress={onUpdate}
            disabled={!!busy}
            testID="btn-app-update-now"
            accessibilityRole="button"
            accessibilityLabel="Aggiorna ora"
          >
            {busy ? (
              <ActivityIndicator color={colors.primary || "#4DA8DA"} />
            ) : (
              <Text style={styles.updateLab}>Aggiorna ora</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Props["colors"]) {
  const primary = colors.primary || "#4DA8DA";
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.72)",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.surface || "#1a1f27",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border || "#2a3140",
      padding: 20,
      ...Platform.select({
        web: { maxWidth: 420, alignSelf: "center", width: "100%" },
        default: {},
      }),
    },
    eyebrow: {
      color: GOLD,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginBottom: 6,
      textTransform: "uppercase",
    },
    title: {
      color: colors.textPrimary,
      fontSize: 32,
      fontWeight: "900",
      lineHeight: 36,
      marginBottom: 8,
      paddingBottom: 6,
      borderBottomWidth: 4,
      borderBottomColor: GOLD,
    },
    versions: {
      color: colors.textSecondary,
      fontSize: 16,
      marginBottom: 12,
      marginTop: 4,
    },
    body: {
      color: colors.textPrimary,
      fontSize: 17,
      lineHeight: 24,
      marginBottom: 10,
      opacity: 0.95,
    },
    hintLabel: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: "center",
      marginBottom: 8,
    },
    laterBtn: {
      height: 80,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: "#8FA3C4",
      backgroundColor: "#3D4554",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      paddingHorizontal: 12,
    },
    laterLab: {
      color: "#FFFFFF",
      fontSize: 40,
      fontWeight: "900",
      lineHeight: 42,
      letterSpacing: 3.2,
    },
    updateBtn: {
      height: 52,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: primary,
      backgroundColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    updateLab: {
      color: primary,
      fontSize: 18,
      fontWeight: "700",
      lineHeight: 20,
    },
  });
}
