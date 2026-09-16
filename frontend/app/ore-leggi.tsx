import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSettings } from "../src/SettingsContext";
import { resolveBodyFont } from "../src/fontFamily";
import { FontSizeButtons } from "../src/components/FontSizeButtons";
import { PlusMinusGlyph } from "../src/components/PlusMinusGlyph";
import { ReadingBrightnessButton, ReadingBrightnessRoot, ReadingBrightnessRow } from "../src/components/ReadingBrightnessControl";
import { localDateStr, parseLocalDate } from "../src/dateUtils";
import { oreBodyLineHeight } from "../src/liturgyTypography";
import { ACTION_TITLE_WEIGHT } from "../src/uiActionTokens";
import { invitatoryBlocks } from "../src/ore/assemble";
import { DEFAULT_INVIT_ANT, INVIT_PSALM_IDS } from "../src/ore/bundled";
import { hourHeadMeta } from "../src/ore/dayHead";
import { OreBlocksView } from "../src/ore/OreBlocks";
import { ensureHour, invitAntText } from "../src/ore/scraper";
import { hourTitle } from "../src/ore/titles";
import type { DayHoursCache } from "../src/ore/types";
import type { InvitPsalmId, MediaId, OreBlock, OreHourId } from "../src/ore/types";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;
const ORE_BLUE = "#4DA8DA";
const GOLD = "#E0B429";
const AUTO_ON_BG = "#173B4D";
const AUTO_ON_TEXT = "#B8E6FA";
const SPD_BORDER = "#c4b06a";
const SPD_VAL_BORDER = "#b8c0bc";
/** px/s. 1 = vecchia 2; poi scala fino a 10 per testo grande. */
const SPD_PX = [0, 6.5, 10, 16, 25, 38, 58, 88, 135, 205, 310];
const SPD_MIN = 1;
const SPD_MAX = 10;
const PSALM_KEY = "ore_invit_psalm";
const MEDIA_KEY = "ore_media_id";
const SPD_KEY = "ore_auto_speed";
const AUTO_KEY = "ore_auto_on";
const LAST_KEY = "ore_last_hour";
const NEXT_GOLD = "#c4b06a";
const FONT_LIT = "LibreBaskerville_400Regular";
const MEDIA_IDS: MediaId[] = ["terza", "sesta", "nona"];
const MEDIA_LABEL: Record<MediaId, string> = { terza: "Terza", sesta: "Sesta", nona: "Nona" };

function parseHourParam(raw: unknown): OreHourId {
  const v = String(raw || "");
  if (
    v === "invitatorio" ||
    v === "ufficio" ||
    v === "lodi" ||
    v === "ora-media" ||
    v === "vespri" ||
    v === "compieta"
  ) {
    return v;
  }
  return "lodi";
}

export default function OreLeggi() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; hour?: string }>();
  const { colors, fontSize, lineSpacing, fontFamilyId, isBold } = useSettings();
  const dateISO =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : localDateStr(new Date());
  const hour = parseHourParam(params.hour);
  const date = parseLocalDate(dateISO);
  const title = hourTitle(hour, date);
  const lineHeight = oreBodyLineHeight(fontSize, lineSpacing);
  const headFont = resolveBodyFont(fontFamilyId, isBold);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocks, setBlocks] = useState<OreBlock[]>([]);
  const [day, setDay] = useState<DayHoursCache | null>(null);
  const [meta, setMeta] = useState(hourHeadMeta(dateISO));
  const [psalmId, setPsalmId] = useState<InvitPsalmId>("94");
  const [mediaId, setMediaId] = useState<MediaId>("terza");
  const [invitAnt, setInvitAnt] = useState(DEFAULT_INVIT_ANT);
  const [speed, setSpeed] = useState(3);
  const [autoOn, setAutoOn] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const yRef = useRef(0);
  const maxRef = useRef(0);
  const viewHRef = useRef(0);
  const contentHRef = useRef(0);

  const updateMax = useCallback(() => {
    maxRef.current = Math.max(0, contentHRef.current - viewHRef.current);
  }, []);
  const wantAutoRef = useRef(false);
  const autoOnRef = useRef(false);
  const draggingRef = useRef(false);
  const lastTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(3);
  const fontSizeRef = useRef(fontSize);

  autoOnRef.current = autoOn;
  speedRef.current = speed;
  fontSizeRef.current = fontSize;

  const persistAuto = useCallback((on: boolean) => {
    wantAutoRef.current = on;
    void AsyncStorage.setItem(AUTO_KEY, on ? "1" : "0");
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = 0;
  }, []);

  const stopAuto = useCallback(
    (persist = true) => {
      setAutoOn(false);
      autoOnRef.current = false;
      stopRaf();
      if (persist) persistAuto(false);
    },
    [persistAuto, stopRaf],
  );

  const tick = useCallback((ts: number) => {
    if (!autoOnRef.current) return;
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dt = Math.min(0.05, Math.max(0, (ts - lastTsRef.current) / 1000));
    lastTsRef.current = ts;
    const max = maxRef.current;
    if (max <= 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (draggingRef.current || yRef.current >= max - 0.5) {
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const px = (SPD_PX[speedRef.current] || 16) * (fontSizeRef.current / 32);
    yRef.current = Math.min(max, yRef.current + px * dt);
    scrollRef.current?.scrollTo({ y: yRef.current, animated: false });
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startAuto = useCallback(
    (persist = true) => {
      if (maxRef.current > 0 && yRef.current >= maxRef.current - 1) {
        yRef.current = 0;
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      setAutoOn(true);
      autoOnRef.current = true;
      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
      if (persist) persistAuto(true);
    },
    [persistAuto, stopRaf, tick],
  );

  useEffect(() => () => stopAuto(false), [stopAuto]);

  useEffect(() => {
    let cancelled = false;
    let deactivateFn: (() => void) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ka = require("expo-keep-awake");
      deactivateFn = ka.deactivateKeepAwake;
      ka.activateKeepAwakeAsync()
        .then(() => {
          if (cancelled && deactivateFn) {
            try {
              deactivateFn();
            } catch {}
          }
        })
        .catch(() => {});
    } catch (e) {
      console.warn("[ore] expo-keep-awake non disponibile:", e);
    }
    return () => {
      cancelled = true;
      if (deactivateFn) {
        try {
          deactivateFn();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      const p = await AsyncStorage.getItem(PSALM_KEY);
      if (p && INVIT_PSALM_IDS.includes(p as InvitPsalmId)) setPsalmId(p as InvitPsalmId);
      const m = await AsyncStorage.getItem(MEDIA_KEY);
      if (m && MEDIA_IDS.includes(m as MediaId)) setMediaId(m as MediaId);
      const s = parseInt((await AsyncStorage.getItem(SPD_KEY)) || "3", 10);
      if (s >= SPD_MIN && s <= SPD_MAX) setSpeed(s);
      wantAutoRef.current = false;
      setAutoOn(false);
      setPrefsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (loading || !prefsReady) {
      stopRaf();
      return;
    }
    if (wantAutoRef.current) startAuto(false);
  }, [loading, prefsReady, dateISO, hour, startAuto, stopRaf]);

  const applyDay = useCallback(
    (day: Awaited<ReturnType<typeof ensureHour>>, media: MediaId, psalm: InvitPsalmId) => {
      setMeta(day.meta);
      const ant = invitAntText(day);
      setInvitAnt(ant);
      if (hour === "invitatorio") {
        setBlocks(invitatoryBlocks(psalm, ant));
        setError("");
        return;
      }
      const id = hour === "ora-media" ? media : hour;
      const parsed = day.hours[id];
      if (!parsed || !parsed.blocks.length) {
        setBlocks([]);
        setError(parsed?.error || "Testo non disponibile. Connettiti o scarica 10 giorni dalla Home.");
        return;
      }
      setBlocks(parsed.blocks);
      setError(parsed.error || "");
    },
    [hour],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const next = await ensureHour(dateISO, hour);
        if (!live) return;
        setDay(next);
      } catch (e) {
        if (!live) return;
        setError(String((e as Error)?.message || e));
        setDay(null);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [dateISO, hour]);

  useEffect(() => {
    if (!day) return;
    applyDay(day, mediaId, psalmId);
  }, [day, mediaId, psalmId, applyDay]);

  const changePsalm = (id: InvitPsalmId) => {
    setPsalmId(id);
    void AsyncStorage.setItem(PSALM_KEY, id);
    setBlocks(invitatoryBlocks(id, invitAnt));
  };

  const changeMedia = (id: MediaId) => {
    setMediaId(id);
    void AsyncStorage.setItem(MEDIA_KEY, id);
  };

  const changeSpeed = (n: number) => {
    const next = Math.max(SPD_MIN, Math.min(SPD_MAX, n));
    setSpeed(next);
    void AsyncStorage.setItem(SPD_KEY, String(next));
  };

  const goToHour = (next: OreHourId) => {
    void AsyncStorage.setItem(LAST_KEY, next);
    router.push({ pathname: "/ore-leggi", params: { date: dateISO, hour: next } } as any);
  };

  const styles = makeStyles(colors, fontSize);

  return (
    <ReadingBrightnessRoot>
    <SafeAreaView style={styles.container} testID="ore-read-screen">
      <View>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Indice delle Ore"
            style={styles.iconBtn}
            testID="btn-ore-back"
            {...webClickable}
          >
            <Ionicons name="chevron-back" size={32} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.hourTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.fonts}>
            <FontSizeButtons
              decreaseTestID="btn-ore-read-a-minus"
              increaseTestID="btn-ore-read-a-plus"
              labelScale={0.86}
            />
          </View>
        </View>
        <View style={styles.scrollRow}>
          <TouchableOpacity
            onPress={() => (autoOn ? stopAuto(true) : startAuto(true))}
            style={[styles.autoBtn, autoOn && styles.autoOn]}
            accessibilityRole="button"
            accessibilityLabel="Scorrimento automatico"
            accessibilityState={{ selected: autoOn }}
            testID="btn-ore-auto"
            hitSlop={4}
            {...webClickable}
          >
            <Text style={[styles.autoLab, autoOn && styles.autoLabOn]}>Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => changeSpeed(speed - 1)}
            style={styles.spdBtn}
            accessibilityLabel="Rallenta"
            hitSlop={4}
            {...webClickable}
          >
            <PlusMinusGlyph kind="minus" color={colors.textPrimary} size={18} stroke={2.8} />
          </TouchableOpacity>
          <View style={styles.spdValBox} accessibilityLabel={`Velocità ${speed}`}>
            <Text style={styles.spdVal}>{speed}</Text>
          </View>
          <TouchableOpacity
            onPress={() => changeSpeed(speed + 1)}
            style={styles.spdBtn}
            accessibilityLabel="Accelera"
            hitSlop={4}
            {...webClickable}
          >
            <PlusMinusGlyph kind="plus" color={colors.textPrimary} size={18} stroke={2.8} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <ReadingBrightnessButton />
        </View>
      </View>
      <ReadingBrightnessRow />
      </View>

      {hour === "ora-media" ? (
        <View style={styles.chips} accessibilityRole="tablist">
          {MEDIA_IDS.map((id) => (
            <TouchableOpacity
              key={id}
              onPress={() => changeMedia(id)}
              style={[styles.chip, mediaId === id && styles.chipOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mediaId === id }}
              {...webClickable}
            >
              <Text style={[styles.chipLab, mediaId === id && styles.chipLabOn]}>{MEDIA_LABEL[id]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORE_BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollInner}
          onLayout={(e) => {
            viewHRef.current = e.nativeEvent.layout.height;
            updateMax();
          }}
          onContentSizeChange={(_w, h) => {
            contentHRef.current = h;
            updateMax();
          }}
          onScroll={(e) => {
            const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
            viewHRef.current = layoutMeasurement.height;
            contentHRef.current = contentSize.height;
            updateMax();
            if (autoOnRef.current && !draggingRef.current) return;
            yRef.current = contentOffset.y;
          }}
          onScrollBeginDrag={() => {
            draggingRef.current = true;
          }}
          onScrollEndDrag={() => {
            draggingRef.current = false;
            lastTsRef.current = 0;
          }}
          onMomentumScrollBegin={() => {
            draggingRef.current = true;
          }}
          onMomentumScrollEnd={() => {
            draggingRef.current = false;
            lastTsRef.current = 0;
          }}
          scrollEventThrottle={16}
          testID="ore-read-scroll"
        >
          {error && !blocks.length ? <Text style={styles.err}>{error}</Text> : null}
          <OreBlocksView
            blocks={blocks}
            meta={meta}
            fontSize={fontSize}
            lineHeight={lineHeight}
            textColor={colors.textPrimary}
            headFontFamily={headFont.fontFamily}
            headFontWeight={headFont.fontWeight}
            afterFirstAnt={
              hour === "invitatorio" ? (
                <View style={styles.invNums} accessibilityRole="tablist">
                  {INVIT_PSALM_IDS.map((id) => (
                    <TouchableOpacity
                      key={id}
                      onPress={() => changePsalm(id)}
                      style={[styles.invChip, psalmId === id && styles.invChipOn]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: psalmId === id }}
                      {...webClickable}
                    >
                      <Text style={[styles.invChipLab, psalmId === id && styles.invChipLabOn]}>{id}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : undefined
            }
          />
          {blocks.length > 0 && hour === "invitatorio" ? (
            <View style={styles.nextWrap}>
              <View style={styles.nextRow}>
                <TouchableOpacity
                  onPress={() => goToHour("lodi")}
                  style={styles.nextBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Vai alle Lodi"
                  testID="btn-ore-next-lodi"
                  {...webClickable}
                >
                  <Text style={styles.nextLab}>Lodi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => goToHour("ufficio")}
                  style={styles.nextBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Vai all'Ufficio delle letture"
                  testID="btn-ore-next-ufficio"
                  {...webClickable}
                >
                  <Text style={styles.nextLab}>Ufficio</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {blocks.length > 0 && hour === "ufficio" ? (
            <View style={styles.nextWrap}>
              <View style={styles.nextRow}>
                <TouchableOpacity
                  onPress={() => goToHour("lodi")}
                  style={styles.nextBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Vai alle Lodi"
                  testID="btn-ore-next-lodi"
                  {...webClickable}
                >
                  <Text style={styles.nextLab}>Lodi</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
    </ReadingBrightnessRoot>
  );
}

const makeStyles = (colors: any, fontSize: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 8,
      borderBottomWidth: 1,
      gap: 8,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    scrollRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingLeft: 4,
    },
    fonts: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
    iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    hourTitle: {
      flex: 1,
      textAlign: "center",
      color: colors.textPrimary,
      fontWeight: ACTION_TITLE_WEIGHT,
      fontSize: Math.round(fontSize * 0.984),
      letterSpacing: Math.max(0.6, fontSize * 0.045),
      fontVariant: ["small-caps"],
      ...(Platform.OS === "web" ? ({ fontVariant: "small-caps" } as const) : {}),
    },
    autoBtn: {
      borderWidth: 2,
      borderColor: ORE_BLUE,
      borderRadius: 9,
      minWidth: 68,
      height: 39,
      paddingHorizontal: 14,
      marginRight: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    autoOn: { backgroundColor: AUTO_ON_BG, borderColor: ORE_BLUE },
    autoLab: { color: ORE_BLUE, fontWeight: "800", fontSize: Math.round(fontSize * 0.78) },
    autoLabOn: { color: AUTO_ON_TEXT },
    spdBtn: {
      minWidth: 46,
      height: 39,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
      borderWidth: 2,
      borderColor: SPD_BORDER,
      backgroundColor: colors.background,
    },
    spdValBox: {
      minWidth: 46,
      height: 39,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: SPD_VAL_BORDER,
      alignItems: "center",
      justifyContent: "center",
    },
    spdVal: { color: colors.textPrimary, fontWeight: "800", fontSize: Math.round(fontSize * 0.88) },
    chips: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    invNums: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 13,
      marginTop: 8,
      marginBottom: 14,
    },
    invChip: {
      width: 60,
      height: 52,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: ORE_BLUE,
      backgroundColor: "#000",
      alignItems: "center",
      justifyContent: "center",
    },
    invChipOn: {
      borderWidth: 3,
      borderColor: GOLD,
    },
    invChipLab: {
      color: "#fff",
      fontWeight: "400",
      fontSize: Math.round(fontSize * 1.05),
    },
    invChipLabOn: { color: "#fff" },
    chip: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    chipOn: { borderColor: GOLD },
    chipLab: { color: colors.textPrimary, fontWeight: "800" },
    chipLabOn: { color: GOLD },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    scroll: { flex: 1 },
    scrollInner: { padding: 16, paddingBottom: 48 },
    nextWrap: {
      marginTop: 36,
      paddingTop: 22,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(196,176,106,0.35)",
      alignItems: "center",
    },
    nextRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 36,
    },
    nextBtn: {
      paddingVertical: 10,
      paddingHorizontal: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    nextLab: {
      fontFamily: FONT_LIT,
      color: NEXT_GOLD,
      fontSize: Math.round(fontSize * 1.14),
      letterSpacing: Math.max(0.8, fontSize * 0.06),
      fontVariant: ["small-caps"],
      ...(Platform.OS === "web" ? ({ fontVariant: "small-caps" } as const) : {}),
    },
    err: { color: colors.textSecondary, marginBottom: 12, fontSize: Math.round(fontSize * 0.7) },
  });
