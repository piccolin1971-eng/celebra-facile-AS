import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSettings } from "../src/SettingsContext";
import { resolveBodyFont } from "../src/fontFamily";
import { HomeCircleButton } from "../src/components/HomeCircleButton";
import { BrandScreenTitle } from "../src/components/BrandScreenTitle";
import { italianDateLabel, parseLocalDate, localDateStr } from "../src/dateUtils";
import { loadDayHours } from "../src/ore/cache";
import { hourHeadMeta } from "../src/ore/dayHead";
import { OreHourHead } from "../src/ore/OreBlocks";
import { ensureHour } from "../src/ore/scraper";
import { INDEX_HOURS, hourTitle } from "../src/ore/titles";
import { ACTION_MIN_HEIGHT, ACTION_TITLE_WEIGHT } from "../src/uiActionTokens";
import { SECTION_TOP_BAR_PAD_H } from "../src/components/SectionScreenTopBar";
import type { OreHourId } from "../src/ore/types";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;
const ORE_BLUE = "#4DA8DA";
const ORE_BLUE_ALT = "#B8E6FA";
const GOLD = "#E0B429";
const LAST_KEY = "ore_last_hour";

export default function OreIndex() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { colors, fontSize, scaledFont, fontFamilyId, isBold } = useSettings();
  const headFont = resolveBodyFont(fontFamilyId, isBold);
  const dateISO =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : localDateStr(new Date());
  const date = parseLocalDate(dateISO);
  const [seasonLine, setSeasonLine] = useState("");
  const [psalterLine, setPsalterLine] = useState("");
  const [colorHex, setColorHex] = useState("#1b5e20");
  const [lastHour, setLastHour] = useState<string>("");

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const cached = await loadDayHours(dateISO);
        let meta = cached?.meta || hourHeadMeta(dateISO);
        if (!meta.psalterLine) {
          const next = await ensureHour(dateISO, "invitatorio");
          meta = next.meta;
        }
        const last = (await AsyncStorage.getItem(LAST_KEY)) || "";
        if (!live) return;
        setSeasonLine(meta.seasonLine);
        setPsalterLine(meta.psalterLine);
        setColorHex(meta.colorHex || "#1b5e20");
        setLastHour(last);
      })();
      return () => {
        live = false;
      };
    }, [dateISO]),
  );

  const styles = makeStyles(colors, fontSize);
  const openHour = (hour: OreHourId) => {
    void AsyncStorage.setItem(LAST_KEY, hour);
    setLastHour(hour);
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
        <OreHourHead
          meta={{
            dateLabel: italianDateLabel(date),
            seasonLine,
            psalterLine,
            colorHex,
          }}
          fontSize={fontSize}
          fontFamily={headFont.fontFamily}
          fontWeight={headFont.fontWeight}
          style={{ marginBottom: 8 }}
        />

        {INDEX_HOURS.map((hour, idx) => {
          const last = lastHour === hour;
          return (
            <TouchableOpacity
              key={hour}
              style={[
                styles.item,
                idx % 2 === 1 && styles.itemAlt,
                last && styles.itemLast,
              ]}
              onPress={() => openHour(hour)}
              testID={`btn-ore-${hour}`}
              accessibilityRole="button"
              accessibilityLabel={hourTitle(hour, date)}
              {...webClickable}
            >
              <Text style={[styles.itemLab, last && styles.itemLabLast]}>{hourTitle(hour, date)}</Text>
            </TouchableOpacity>
          );
        })}
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
    body: { padding: 16, gap: 12, paddingBottom: 40 },
    item: {
      minHeight: ACTION_MIN_HEIGHT,
      borderRadius: 14,
      borderWidth: 5,
      borderColor: ORE_BLUE,
      alignItems: "flex-start",
      justifyContent: "center",
      backgroundColor: "#000",
      paddingHorizontal: 14,
      paddingVertical: 15,
    },
    itemAlt: {
      borderColor: ORE_BLUE_ALT,
    },
    itemLast: {
      borderWidth: 6,
      borderColor: GOLD,
      backgroundColor: "#121200",
    },
    itemLab: {
      color: "#fff",
      fontWeight: ACTION_TITLE_WEIGHT,
      fontSize: Math.round(fontSize * 1.05),
      letterSpacing: 1.2,
      textTransform: "uppercase",
      textAlign: "left",
    },
    itemLabLast: {
      color: GOLD,
    },
  });
