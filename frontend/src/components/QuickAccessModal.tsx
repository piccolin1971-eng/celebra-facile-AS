import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  celebraParamsFromFavorite,
  favoriteSessionExists,
  loadLiturgyFavorites,
  MAX_LITURGY_FAVORITES,
  removeLiturgyFavorite,
  type LiturgyFavorite,
} from "../liturgyFavorites";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  liturgicalGreen: string;
  liturgicalRed: string;
  liturgicalPurple: string;
  liturgicalWhite: string;
  liturgicalRose: string;
  rubrics: string;
};

type Props = {
  visible: boolean;
  colors: ThemeColors;
  fontSize: number;
  scaledFont: (n: number) => number;
  onClose: () => void;
  onChanged?: () => void;
};

type RowState = LiturgyFavorite & { available: boolean };

function colorHex(colors: ThemeColors, liturgicalColor?: string): string {
  switch (liturgicalColor) {
    case "bianco":
      return colors.liturgicalWhite;
    case "rosso":
      return colors.liturgicalRed;
    case "viola":
      return colors.liturgicalPurple;
    case "rosa":
      return colors.liturgicalRose;
    default:
      return colors.liturgicalGreen;
  }
}

export function QuickAccessModal({
  visible,
  colors,
  fontSize,
  scaledFont,
  onClose,
  onChanged,
}: Props) {
  const router = useRouter();
  const styles = makeStyles(colors, fontSize);
  const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadLiturgyFavorites();
      const withStatus = await Promise.all(
        list.map(async (f) => ({
          ...f,
          available: await favoriteSessionExists(f),
        })),
      );
      setRows(withStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void reload();
  }, [visible, reload]);

  const handleRemove = async (id: string) => {
    await removeLiturgyFavorite(id);
    onChanged?.();
    await reload();
  };

  const handleCelebrate = (fav: RowState) => {
    if (!fav.available) return;
    onClose();
    router.push({ pathname: "/celebra" as any, params: celebraParamsFromFavorite(fav) });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} testID="quick-access-modal">
          <View style={styles.header}>
            <Ionicons name="star" size={scaledFont(28)} color={colors.primary} />
            <Text style={styles.title}>Accesso rapido</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              testID="quick-access-close"
              accessibilityLabel="Chiudi"
            >
              <Ionicons name="close" size={scaledFont(32)} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Liturgie segnate con ☆ in preparazione. Tocca per celebrare (max {MAX_LITURGY_FAVORITES}).
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 32 }} />
          ) : rows.length === 0 ? (
            <Text style={styles.empty} testID="quick-access-empty">
              Nessuna liturgia in accesso rapido. Segna una preparazione con ☆ in «Scegli la liturgia».
            </Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {rows.map((fav) => {
                const hex = colorHex(colors, fav.liturgicalColor);
                return (
                  <View
                    key={fav.id}
                    style={[styles.row, !fav.available && styles.rowUnavailable]}
                    testID={`quick-access-item-${fav.id}`}
                  >
                    <TouchableOpacity
                      style={[styles.rowMain, webClickable]}
                      onPress={() => handleCelebrate(fav)}
                      disabled={!fav.available}
                      accessibilityRole="button"
                      accessibilityLabel={
                        fav.available
                          ? `Celebra: ${fav.title}`
                          : `${fav.title}, preparazione non disponibile`
                      }
                    >
                      <View
                        style={[
                          styles.colorPill,
                          {
                            backgroundColor: hex,
                            borderWidth: fav.liturgicalColor === "bianco" ? 1 : 0,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                      <View style={styles.rowText}>
                        <Text
                          style={[styles.rowTitle, !fav.available && styles.rowTitleMuted]}
                          numberOfLines={2}
                        >
                          {fav.title}
                        </Text>
                        {fav.subtitle ? (
                          <Text style={styles.rowSub} numberOfLines={2}>
                            {fav.subtitle}
                          </Text>
                        ) : null}
                        {!fav.available ? (
                          <Text style={styles.unavailable}>Preparazione non più disponibile</Text>
                        ) : null}
                      </View>
                      {fav.available ? (
                        <Ionicons
                          name="chevron-forward"
                          size={scaledFont(24)}
                          color={colors.textSecondary}
                        />
                      ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trashBtn, webClickable]}
                      onPress={() => void handleRemove(fav.id)}
                      testID={`quick-access-remove-${fav.id}`}
                      accessibilityLabel="Rimuovi da accesso rapido"
                    >
                      <Ionicons name="trash-outline" size={scaledFont(26)} color={colors.rubrics} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      padding: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 16,
      maxHeight: "85%",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    title: {
      flex: 1,
      fontSize: Math.round(fontSize * 0.82),
      fontWeight: "800",
      color: colors.textPrimary,
    },
    closeBtn: { padding: 4 },
    hint: {
      fontSize: Math.round(fontSize * 0.58),
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: Math.round(fontSize * 0.85),
    },
    empty: {
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textSecondary,
      textAlign: "center",
      marginVertical: 28,
      lineHeight: Math.round(fontSize * 0.95),
    },
    list: { maxHeight: 420 },
    listContent: { gap: 10 },
    row: {
      flexDirection: "row",
      alignItems: "stretch",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: "hidden",
    },
    rowUnavailable: { opacity: 0.72 },
    rowMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingLeft: 12,
      paddingRight: 8,
    },
    colorPill: {
      width: 8,
      borderRadius: 999,
      alignSelf: "stretch",
      minHeight: 44,
    },
    rowText: { flex: 1, gap: 2 },
    rowTitle: {
      fontSize: Math.round(fontSize * 0.68),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    rowTitleMuted: { color: colors.textSecondary },
    rowSub: {
      fontSize: Math.round(fontSize * 0.56),
      color: colors.textSecondary,
      fontWeight: "600",
    },
    unavailable: {
      fontSize: Math.round(fontSize * 0.52),
      color: colors.rubrics,
      fontWeight: "700",
      marginTop: 2,
    },
    trashBtn: {
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 14,
      borderLeftWidth: 1.5,
      borderLeftColor: colors.border,
      backgroundColor: colors.surface,
    },
  });
}
