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

export function AppUpdateModal({ visible, info, busy, onUpdate, onLater, colors }: Props) {
  if (!info) return null;
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop} testID="app-update-modal">
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Aggiornamento disponibile</Text>
          <Text style={styles.title}>C’è una nuova versione</Text>
          <Text style={styles.versions}>
            Installata {currentAppVersionName()} → {info.versionName}
          </Text>
          {info.body ? (
            <Text style={styles.body} numberOfLines={5}>
              {info.body}
            </Text>
          ) : (
            <Text style={styles.body}>
              Tocca «Aggiorna ora»: l’app scarica l’APK e chiede a Android di installarlo.
              Impostazioni e liturgie scaricate restano.
            </Text>
          )}
          <View style={styles.steps}>
            <Text style={styles.step}>1. Tocca «Aggiorna ora» (attendi il download)</Text>
            <Text style={styles.step}>2. Conferma «Installa» quando Android lo chiede</Text>
            <Text style={styles.step}>3. Se richiesto, abilita installazione da questa app</Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={onUpdate}
            disabled={!!busy}
            testID="btn-app-update-now"
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryLab}>Aggiorna ora</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onLater}
            disabled={!!busy}
            testID="btn-app-update-later"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryLab}>Più tardi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Props["colors"]) {
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
      color: "#E0B429",
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.4,
      marginBottom: 6,
      textTransform: "uppercase",
    },
    title: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 8,
    },
    versions: {
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: 12,
    },
    body: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 14,
      opacity: 0.92,
    },
    steps: {
      marginBottom: 18,
      gap: 4,
    },
    step: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    primaryBtn: {
      backgroundColor: colors.primary || "#4DA8DA",
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 10,
      minHeight: 48,
      justifyContent: "center",
    },
    primaryLab: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
    },
    secondaryBtn: {
      paddingVertical: 12,
      alignItems: "center",
    },
    secondaryLab: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
