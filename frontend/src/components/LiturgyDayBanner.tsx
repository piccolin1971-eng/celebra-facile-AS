import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { parseBannerCelebration } from "../homeBannerUtils";
import { localDateStr } from "../dateUtils";
import { getSaintBioPreview, saintBioButtonLabel } from "../saintBioPreview";
import { getOptionalSaintBioPreview } from "../optionalSaintBio";
import { SaintBioModal } from "./SaintBioModal";
import type { OptionalSaintLinePick } from "../optionalSaintLinePick";

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
  /** Memoria facoltativa scelta in impostazioni (scheda bio dedicata). */
  optionalSaintId?: string;
  /** Feria vs memoria facoltativa (santo attivato in impostazioni per questo giorno). */
  optionalLineSwitch?: {
    activeLine: OptionalSaintLinePick;
    calendarLiturgicalColor: string;
    optionalLiturgicalColor: string;
    calendarSubtitle: string;
    optionalSubtitle: string;
    onPick: (line: OptionalSaintLinePick) => void;
  };
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

function parseHexRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

/** Sfondo riga attiva B2b: ~20% colore liturgico su base scura/chiara. */
function liturgicalRowFill(hex: string, baseHex: string, amount = 0.2): string {
  const fg = parseHexRgb(hex);
  const bg = parseHexRgb(baseHex);
  if (!fg || !bg) return baseHex;
  const mix = (a: number, b: number) => Math.round(a * amount + b * (1 - amount));
  return `rgb(${mix(fg[0], bg[0])}, ${mix(fg[1], bg[1])}, ${mix(fg[2], bg[2])})`;
}

function inactiveRowBorderColor(colors: ThemeColors, framed: boolean): string {
  if (framed) return colors.border;
  const fg = parseHexRgb(colors.textPrimary);
  const bg = parseHexRgb(colors.border);
  if (!fg || !bg) return "#6B6B6B";
  const t = 0.55;
  const mix = (a: number, b: number) => Math.round(a * t + b * (1 - t));
  return `rgb(${mix(fg[0], bg[0])}, ${mix(fg[1], bg[1])}, ${mix(fg[2], bg[2])})`;
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
  optionalSaintId,
  optionalLineSwitch,
}: Props) {
  const styles = makeStyles(colors, fontSize, framed);
  const accent = colors.primary ?? "#0056B3";
  const onAccent = colors.onPrimary ?? "#FFFFFF";
  const hex = colorHex(colors, liturgicalColor);
  const celebration = parseBannerCelebration(ceiTitle, seasonName, celebrationDate);
  const showCelebrationTitle =
    celebration.displayTitle.trim().toLowerCase() !== celebration.seasonLine.trim().toLowerCase();
  const bannerCtx = {
    rankLabel: celebration.rankLabel,
    displayTitle: celebration.displayTitle,
  };
  const saintBio =
    (optionalSaintId
      ? getOptionalSaintBioPreview(optionalSaintId, celebration.displayTitle)
      : null) ?? getSaintBioPreview(celebrationDate, bannerCtx);
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
            {!optionalLineSwitch && celebration.rankLabel ? " · " : ""}
            {!optionalLineSwitch ? (
              <Text style={styles.metaRank} testID={rankTestID}>
                {celebration.rankLabel}
              </Text>
            ) : null}
          </Text>
          {optionalLineSwitch ? (
            <View style={styles.lineSwitchBlock}>
              <Text style={styles.lineSwitchLabel}>Scegli la celebrazione</Text>
              <OptionalLineRow
                label="Feria"
                subtitle={optionalLineSwitch.calendarSubtitle}
                active={optionalLineSwitch.activeLine === "calendar"}
                liturgicalColor={optionalLineSwitch.calendarLiturgicalColor}
                colors={colors}
                fontSize={fontSize}
                framed={framed}
                testID="optional-line-feria"
                onPress={() => optionalLineSwitch.onPick("calendar")}
              />
              <OptionalLineRow
                label="Memoria facoltativa"
                subtitle={optionalLineSwitch.optionalSubtitle}
                active={optionalLineSwitch.activeLine === "optional"}
                liturgicalColor={optionalLineSwitch.optionalLiturgicalColor}
                colors={colors}
                fontSize={fontSize}
                framed={framed}
                testID="optional-line-memoria"
                onPress={() => optionalLineSwitch.onPick("optional")}
              />
            </View>
          ) : null}
          {!optionalLineSwitch && showCelebrationTitle ? (
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

function OptionalLineRow({
  label,
  subtitle,
  active,
  liturgicalColor,
  colors,
  fontSize,
  framed,
  testID,
  onPress,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  liturgicalColor: string;
  colors: ThemeColors;
  fontSize: number;
  framed: boolean;
  testID: string;
  onPress: () => void;
}) {
  const hex = colorHex(colors, liturgicalColor);
  const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;
  const inactiveBg = framed ? colors.surface : "#141414";
  const activeBase = framed ? colors.surface : "#0C0C0C";
  const rowStyles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      width: "100%",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: active ? hex : inactiveRowBorderColor(colors, framed),
      backgroundColor: active ? liturgicalRowFill(hex, activeBase, 0.2) : inactiveBg,
      maxWidth: "100%",
      ...(Platform.OS === "web" && active
        ? ({ boxShadow: `0 0 0 1px ${hex}80` } as object)
        : null),
    },
    swatch: {
      width: 6,
      alignSelf: "stretch",
      borderRadius: 3,
      backgroundColor: hex,
      opacity: active ? 1 : 0.35,
      flexShrink: 0,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: active ? hex : colors.textPrimary,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      opacity: active ? 1 : 0.85,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: hex,
    },
    textCol: { flex: 1, minWidth: 0 },
    title: {
      fontSize: Math.round(fontSize * 0.76),
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.35,
      color: active ? hex : colors.textPrimary,
    },
    sub: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "500",
      marginTop: 3,
      color: active ? colors.textSecondary : colors.textPrimary,
      opacity: active ? 1 : 0.92,
    },
  });
  const a11y = subtitle.trim() ? `${label}. ${subtitle}` : label;
  return (
    <TouchableOpacity
      style={rowStyles.row}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={a11y}
      {...webClickable}
    >
      <View style={rowStyles.swatch} />
      <View style={rowStyles.radio}>
        {active ? <View style={rowStyles.radioDot} /> : null}
      </View>
      <View style={rowStyles.textCol}>
        <Text style={rowStyles.title} numberOfLines={2}>
          {label}
        </Text>
        {subtitle.trim() ? (
          <Text style={rowStyles.sub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
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
    lineSwitchBlock: {
      width: "100%",
      gap: 6,
      marginTop: 2,
    },
    lineSwitchLabel: {
      fontSize: Math.round(fontSize * 0.68),
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textSecondary,
      opacity: 0.85,
    },
  });
