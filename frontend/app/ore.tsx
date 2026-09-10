import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { HomeCircleButton } from "../src/components/HomeCircleButton";
import { BrandScreenTitle } from "../src/components/BrandScreenTitle";
import { italianDateLabel, parseLocalDate, localDateStr } from "../src/dateUtils";
import { loadDayHours } from "../src/ore/cache";
import { hourHeadMeta } from "../src/ore/dayHead";
import { INDEX_HOURS, hourTitle } from "../src/ore/titles";
import { ACTION_MIN_HEIGHT, ACTION_RADIUS, ACTION_TITLE_WEIGHT } from "../src/uiActionTokens";
import { SECTION_TOP_BAR_PAD_H } from "../src/components/SectionScreenTopBar";
import type { OreHourId } from "../src/ore/types";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;
const ORE_BLUE = "#4DA8DA";

export default function OreIndex() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { colors, fontSize, scaledFont } = useSettings();
  const dateISO =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : localDateStr(new Date());
  const date = parseLocalDate(dateISO);
  const [seasonLine, setSeasonLine] = useState("");
  const [psalterLine, setPsalterLine] = useState("");

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const cached = await loadDayHours(dateISO);
        const meta = cached?.meta || hourHeadMeta(dateISO);
        if (!live) return;
        setSeasonLine(meta.seasonLine);
        setPsalterLine(meta.psalterLine);
      })();
      return () => {
        live = false;
      };
    }, [dateISO]),
  );

  const styles = makeStyles(colors, fontSize);
  const openHour = (hour: OreHourId) => {
    router.push({ pathname: "/ore-leggi", params: { date: dateISO, hour } } as any);
  };

  return (
    <SafeAreaView style={styles.container} testID="ore-index-screen">
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <HomeCircleButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          testID="btn-ore-home"
          accessibilityLabel="Torna alla home"
        />
        <BrandScreenTitle
          title="Liturgia delle Ore"
          textStyle={styles.topTitle}
          numberOfLines={1}
          markSize={Math.max(28, Math.round(fontSize * 0.85))}
        />
        <TouchableOpacity
          onPress={() => router.push("/impostazioni")}
          accessibilityRole="button"
          accessibilityLabel="Impostazioni"
          style={styles.gear}
          testID="btn-ore-settings"
        >
          <Ionicons name="settings-outline" size={scaledFont(32)} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.banner}>
          <Text style={styles.bannerDate}>{italianDateLabel(date)}</Text>
          {seasonLine ? <Text style={styles.bannerSub}>{seasonLine}</Text> : null}
          {psalterLine ? <Text style={styles.bannerSub}>{psalterLine}</Text> : null}
        </View>

        {INDEX_HOURS.map((hour) => (
          <TouchableOpacity
            key={hour}
            style={styles.item}
            onPress={() => openHour(hour)}
            testID={`btn-ore-${hour}`}
            accessibilityRole="button"
            accessibilityLabel={hourTitle(hour, date)}
            {...webClickable}
          >
            <Text style={styles.itemLab}>{hourTitle(hour, date)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SECTION_TOP_BAR_PAD_H,
      paddingVertical: 10,
      borderBottomWidth: 1,
      gap: 8,
    },
    topTitle: {
      color: colors.textPrimary,
      fontWeight: ACTION_TITLE_WEIGHT,
      fontSize: Math.round(fontSize * 0.72),
    },
    gear: {
      width: 52,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    body: { padding: 16, gap: 10, paddingBottom: 40 },
    banner: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bannerDate: {
      color: colors.textPrimary,
      fontWeight: "800",
      fontSize: Math.round(fontSize * 0.78),
    },
    bannerSub: {
      color: colors.textSecondary,
      fontWeight: "700",
      marginTop: 4,
      fontSize: Math.round(fontSize * 0.62),
    },
    item: {
      minHeight: ACTION_MIN_HEIGHT,
      borderRadius: ACTION_RADIUS,
      borderWidth: 3,
      borderColor: ORE_BLUE,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      paddingHorizontal: 12,
    },
    itemLab: {
      color: ORE_BLUE,
      fontWeight: ACTION_TITLE_WEIGHT,
      fontSize: Math.round(fontSize * 1.0),
      letterSpacing: Math.round(fontSize * 0.08),
      fontVariant: ["small-caps"],
      textAlign: "center",
    },
  });
