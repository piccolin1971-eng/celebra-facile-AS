import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Liturgy } from "../api";
import type { CelebrationMode } from "../massSession";
import type { VigilEveContext } from "../vigilCatalog";
import { LiturgyDayBanner } from "./LiturgyDayBanner";
import { CelebrationModePanel } from "./CelebrationModePanel";
import {
  celebrationKindLabel,
  liturgyTitleForMode,
} from "../celebrationModeLabels";
import { reconcileLiturgyColors } from "../localLiturgy";
import {
  celebrationTitlesMatch,
  isVigilOrVespertineMass,
} from "../liturgicalColorUtils";
import { parseLocalDate } from "../dateUtils";

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  liturgicalGreen: string;
  liturgicalRed: string;
  liturgicalPurple: string;
  liturgicalWhite: string;
  liturgicalRose: string;
};

type Props = {
  vigilCtx: VigilEveContext;
  celebrationMode: CelebrationMode;
  calendarDayLiturgy: Liturgy | null;
  vigilLiturgy: Liturgy | null;
  selectedLiturgy: Liturgy | null;
  onSelectMode: (mode: CelebrationMode) => void;
  colors: ThemeColors;
  fontSize: number;
};

function vigilBannerContent(
  vigilCtx: VigilEveContext,
  celebrationMode: CelebrationMode,
  calendarDayLiturgy: Liturgy | null,
  selectedLiturgy: Liturgy | null,
) {
  const calTitle = calendarDayLiturgy?.title?.trim() || "";
  const baseLit =
    selectedLiturgy ??
    ({
      date: vigilCtx.vigilDateISO,
      date_label: "",
      title: "",
      season: calendarDayLiturgy?.season,
      liturgical_color: calendarDayLiturgy?.liturgical_color,
      saints: [],
      readings: [],
    } as Liturgy);
  const fixed = reconcileLiturgyColors({ ...baseLit, celebrationMode });
  let ceiTitle = fixed.title?.trim() || "";
  const titleMatchesMode =
    celebrationMode === "vigil_proper"
      ? isVigilOrVespertineMass(ceiTitle) ||
        celebrationTitlesMatch(ceiTitle, vigilCtx.solemnityTitle)
      : celebrationTitlesMatch(ceiTitle, vigilCtx.solemnityTitle) &&
        !isVigilOrVespertineMass(ceiTitle);
  if (!ceiTitle || ceiTitle === calTitle || !titleMatchesMode) {
    ceiTitle = liturgyTitleForMode(celebrationMode, calTitle, vigilCtx);
  }
  return {
    ceiTitle,
    liturgicalColor: fixed.liturgical_color || fixed.season?.color || "verde",
    seasonName: fixed.season?.season || "",
    dateLabel: baseLit.date_label || calendarDayLiturgy?.date_label || "",
    kindLabel: celebrationKindLabel(celebrationMode, vigilCtx),
  };
}

export function MessaVigilIntroSection({
  vigilCtx,
  celebrationMode,
  calendarDayLiturgy,
  vigilLiturgy,
  selectedLiturgy,
  onSelectMode,
  colors,
  fontSize,
}: Props) {
  const styles = makeStyles(colors, fontSize);
  const litForVigilBanner = vigilLiturgy ?? selectedLiturgy;
  const showVigilBanner = celebrationMode !== "calendar_day";
  const vigilBanner = showVigilBanner
    ? vigilBannerContent(vigilCtx, celebrationMode, calendarDayLiturgy, litForVigilBanner)
    : null;

  return (
    <>
      {calendarDayLiturgy ? (
        <View style={styles.dayBannerWrap}>
          <LiturgyDayBanner
            dateLabel={calendarDayLiturgy.date_label || ""}
            seasonName={calendarDayLiturgy.season?.season || ""}
            ceiTitle={calendarDayLiturgy.title}
            liturgicalColor={
              calendarDayLiturgy.liturgical_color ||
              calendarDayLiturgy.season?.color ||
              "verde"
            }
            celebrationDate={
              calendarDayLiturgy.date
                ? parseLocalDate(calendarDayLiturgy.date)
                : new Date()
            }
            colors={colors}
            fontSize={fontSize}
            testID="mass-day-banner-calendar"
            dateTestID="mass-date"
            titleTestID="mass-celebration-title-calendar"
          />
        </View>
      ) : null}

      <CelebrationModePanel
        vigilCtx={vigilCtx}
        calendarTitle={calendarDayLiturgy?.title || ""}
        selectedMode={celebrationMode}
        onSelectMode={onSelectMode}
        colors={colors}
        fontSize={fontSize}
      />

      {vigilBanner ? (
        <View style={styles.dayBannerWrap} testID="mass-vigil-banner-wrap">
          <Text style={styles.vigilBannerKind}>{vigilBanner.kindLabel}</Text>
          <LiturgyDayBanner
            dateLabel={vigilBanner.dateLabel}
            seasonName={vigilBanner.seasonName}
            ceiTitle={vigilBanner.ceiTitle}
            liturgicalColor={vigilBanner.liturgicalColor}
            celebrationDate={parseLocalDate(vigilCtx.solemnityDateISO)}
            colors={colors}
            fontSize={fontSize}
            testID="mass-day-banner-vigil"
            dateTestID="mass-date-vigil"
            titleTestID="mass-celebration-title-vigil"
          />
        </View>
      ) : null}
    </>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  return StyleSheet.create({
    dayBannerWrap: { marginBottom: 16 },
    vigilBannerKind: {
      fontSize: Math.round(fontSize * 0.58),
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: colors.primary,
      marginBottom: 8,
    },
  });
}
