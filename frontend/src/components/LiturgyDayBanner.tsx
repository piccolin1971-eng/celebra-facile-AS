import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { parseBannerCelebration } from "../homeBannerUtils";
import { localDateStr } from "../dateUtils";
import { getSaintBioPreview, saintBioButtonLabel } from "../saintBioPreview";
import { SaintBioModal } from "./SaintBioModal";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary?: string;
  onPrimary?: string;
  liturgicalGreen: string;
  liturgicalRed: string;
  liturgicalPurple: string;
  liturgicalWhite: string;
  liturgicalRose: string;
};

type Props = {
  dateLabel: string;
  seasonName: string;
  ceiTitle?: string;
  liturgicalColor: string;
  celebrationDate: Date;
  colors: ThemeColors;
  fontSize: number;
  testID?: string;
  dateTestID?: string;
  rankTestID?: string;
  titleTestID?: string;
  /** false: solo la barra del colore liturgico, senza riquadro (Home). */
  framed?: boolean;
};

function colorHex(colors: ThemeColors, liturgicalColor: string): string {
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

/** Barra a D come nella foto: tonda fuori, piatta verso il testo, alta quanto il box. */
function ColorParen({
  side,
  hex,
  withBorder,
  borderColor,
}: {
  side: "left" | "right";
  hex: string;
  withBorder: boolean;
  borderColor: string;
}) {
  return (
    <View pointerEvents="none" style={parenStyles.slot}>
      <View
        style={[
          parenStyles.halfPill,
          {
            backgroundColor: hex,
            borderWidth: withBorder ? 1 : 0,
            borderColor,
          },
          side === "left" ? { left: 0 } : { right: 0 },
        ]}
      />
    </View>
  );
}

const PAREN_W = 16;

const parenStyles = StyleSheet.create({
  slot: {
    width: PAREN_W,
    alignSelf: "stretch",
    overflow: "hidden",
    flexShrink: 0,
  },
  halfPill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: PAREN_W * 2,
    borderRadius: PAREN_W,
  },
});

export function LiturgyDayBanner({
  dateLabel,
  seasonName,
  ceiTitle,
  liturgicalColor,
  celebrationDate,
  colors,
  fontSize,
  testID = "date-banner",
  dateTestID = "date-label",
  rankTestID = "celebration-rank",
  titleTestID = "celebration-title",
  framed = true,
}: Props) {
  const styles = makeStyles(colors, fontSize, framed);
  const accent = colors.primary ?? "#0056B3";
  const onAccent = colors.onPrimary ?? "#FFFFFF";
  const hex = colorHex(colors, liturgicalColor);
  const celebration = parseBannerCelebration(ceiTitle, seasonName, celebrationDate);
  const showCelebrationTitle =
    celebration.displayTitle.trim().toLowerCase() !== celebration.seasonLine.trim().toLowerCase();
  const saintBio = getSaintBioPreview(celebrationDate, {
    rankLabel: celebration.rankLabel,
    displayTitle: celebration.displayTitle,
  });
  const celebrationDateKey = localDateStr(celebrationDate);
  const [bioOpen, setBioOpen] = useState(false);
  const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;
  const infoIconBox = Math.round(fontSize * 1.05);

  useEffect(() => {
    setBioOpen(false);
  }, [celebrationDateKey, saintBio?.title, celebration.rankLabel]);

  return (
    <>
      <View
        style={[styles.banner, framed ? { borderColor: hex } : null]}
        testID={testID}
      >
        {framed ? (
          <View
            style={[
              styles.colorPill,
              {
                backgroundColor: hex,
                borderWidth: liturgicalColor === "bianco" ? 1 : 0,
                borderColor: colors.border,
              },
            ]}
          />
        ) : (
          <ColorParen
            side="left"
            hex={hex}
            withBorder={liturgicalColor === "bianco"}
            borderColor={colors.border}
          />
        )}
        <View style={styles.body}>
          <Text style={styles.dateLabel} testID={dateTestID}>
            {dateLabel}
          </Text>
          <Text style={styles.metaLine} testID="season-label">
            {celebration.seasonLine}
            {celebration.rankLabel ? " · " : ""}
            <Text style={styles.metaRank} testID={rankTestID}>
              {celebration.rankLabel}
            </Text>
          </Text>
          {showCelebrationTitle ? (
            <Text style={styles.title} testID={titleTestID}>
              {celebration.displayTitle}
            </Text>
          ) : null}
          {saintBio ? (
            <TouchableOpacity
              style={[styles.infoBtn, webClickable]}
              onPress={() => setBioOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${saintBioButtonLabel(saintBio.kind)}: ${saintBio.title}`}
              testID="btn-saint-bio"
            >
              <View
                style={[
                  styles.infoIconWrap,
                  { width: infoIconBox, height: infoIconBox, backgroundColor: accent },
                ]}
              >
                <Ionicons name="information" size={infoIconBox} color={onAccent} />
              </View>
              <Text style={[styles.infoBtnText, { color: accent }]}>
                {saintBioButtonLabel(saintBio.kind)}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {!framed ? (
          <ColorParen
            side="right"
            hex={hex}
            withBorder={liturgicalColor === "bianco"}
            borderColor={colors.border}
          />
        ) : null}
      </View>
      <SaintBioModal
        visible={bioOpen && !!saintBio}
        bio={saintBio}
        colors={colors}
        fontSize={fontSize}
        onClose={() => setBioOpen(false)}
      />
    </>
  );
}

const makeStyles = (colors: ThemeColors, fontSize: number, framed: boolean) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 8,
      paddingVertical: framed ? 12 : 10,
      paddingHorizontal: framed ? 12 : 12,
      borderWidth: framed ? 2 : 0,
      borderRadius: 12,
      backgroundColor: framed ? colors.surface : "#0C0C0C",
    },
    colorPill: {
      width: 8,
      borderRadius: 99,
      flexShrink: 0,
      alignSelf: "stretch",
      minHeight: 40,
    },
    body: { flex: 1, minWidth: 0, gap: 6 },
    dateLabel: {
      alignSelf: "stretch",
      width: "100%",
      fontSize: Math.round(fontSize * 0.95),
      fontWeight: "700",
      color: colors.textPrimary,
      lineHeight: Math.round(fontSize * 1.35),
      flexShrink: 0,
    },
    metaLine: {
      alignSelf: "stretch",
      width: "100%",
      fontSize: Math.round(fontSize * 0.82),
      color: colors.textSecondary,
      fontWeight: "600",
      lineHeight: Math.round(fontSize * 1.5),
      flexShrink: 0,
    },
    metaRank: {
      fontSize: Math.round(fontSize * 0.82),
      color: colors.textSecondary,
      textTransform: "uppercase",
      fontWeight: "700",
      lineHeight: Math.round(fontSize * 1.5),
    },
    title: {
      alignSelf: "stretch",
      width: "100%",
      fontSize: Math.round(fontSize * 1.05),
      fontWeight: "700",
      color: colors.textPrimary,
      textAlign: "left",
      lineHeight: Math.round(fontSize * 1.38),
      marginTop: 2,
      flexShrink: 0,
    },
    infoBtn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      paddingLeft: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary ?? "#0056B3",
      backgroundColor: "transparent",
      maxWidth: "100%",
    },
    infoIconWrap: {
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    infoBtnText: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: Math.round(fontSize * 0.78),
      fontWeight: "600",
    },
  });
