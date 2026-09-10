import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SaintBioPreview } from "../saintBioPreview";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary?: string;
  onPrimary?: string;
};

type Props = {
  visible: boolean;
  bio: SaintBioPreview | null;
  colors: ThemeColors;
  fontSize: number;
  onClose: () => void;
};

export function SaintBioModal({ visible, bio, colors, fontSize, onClose }: Props) {
  const primary = colors.primary ?? "#0056B3";
  const onPrimary = colors.onPrimary ?? "#FFFFFF";
  const styles = makeStyles({ ...colors, primary, onPrimary }, fontSize);
  const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTap}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Chiudi"
        />
        <View style={styles.card} testID="saint-bio-modal">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} testID="saint-bio-title">
                {bio?.title ?? ""}
              </Text>
              {bio?.rank ? <Text style={styles.rank}>{bio.rank}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, webClickable]}
              accessibilityRole="button"
              accessibilityLabel="Chiudi scheda"
              testID="saint-bio-close"
            >
              <Ionicons name="close" size={Math.round(fontSize * 1.4)} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.biography} testID="saint-bio-text">
              {bio?.biography ?? ""}
            </Text>
            {bio?.sourceNote ? <Text style={styles.source}>{bio.sourceNote}</Text> : null}

            <Text style={styles.linksHeading}>Approfondisci</Text>
            <View style={styles.linksRow}>
              <TouchableOpacity
                style={[styles.linkBtn, webClickable]}
                onPress={() => bio && openUrl(bio.wikipediaUrl)}
                accessibilityRole="link"
                accessibilityLabel="Apri Wikipedia"
                testID="saint-bio-wikipedia"
              >
                <Ionicons name="globe-outline" size={Math.round(fontSize * 1.1)} color={onPrimary} />
                <Text style={styles.linkBtnText}>Wikipedia</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.linkBtn, styles.linkBtnSecondary, webClickable]}
                onPress={() => bio && openUrl(bio.santiebeatiUrl)}
                accessibilityRole="link"
                accessibilityLabel="Apri Santi e Beati"
                testID="saint-bio-santiebeati"
              >
                <Ionicons name="book-outline" size={Math.round(fontSize * 1.1)} color={primary} />
                <Text style={[styles.linkBtnText, styles.linkBtnTextSecondary]}>Santi e Beati</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (
  colors: ThemeColors & { primary: string; onPrimary: string },
  fontSize: number,
) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    backdropTap: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "85%",
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      zIndex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerText: { flex: 1, minWidth: 0, gap: 4 },
    title: {
      fontSize: Math.round(fontSize * 1.05),
      fontWeight: "800",
      color: colors.textPrimary,
      lineHeight: Math.round(fontSize * 1.25),
    },
    rank: {
      fontSize: Math.round(fontSize * 0.8),
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
    },
    scroll: { flexGrow: 0 },
    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 20,
      gap: 12,
    },
    biography: {
      fontSize: Math.round(fontSize * 0.95),
      lineHeight: Math.round(fontSize * 1.45),
      color: colors.textPrimary,
      fontWeight: "500",
    },
    source: {
      fontSize: Math.round(fontSize * 0.72),
      color: colors.textSecondary,
      fontStyle: "italic",
      marginTop: 4,
    },
    linksHeading: {
      marginTop: 8,
      fontSize: Math.round(fontSize * 0.82),
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.35,
    },
    linksRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 4,
    },
    linkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    linkBtnSecondary: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    linkBtnText: {
      fontSize: Math.round(fontSize * 0.88),
      fontWeight: "700",
      color: colors.onPrimary,
    },
    linkBtnTextSecondary: {
      color: colors.primary,
    },
  });
