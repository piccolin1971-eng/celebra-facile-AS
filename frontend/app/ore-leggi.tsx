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
import { FontSizeButtons } from "../src/components/FontSizeButtons";
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
const SPD_PX = [0, 4, 6.5, 10, 16, 25, 38];
const SPD_MIN = 1;
const SPD_MAX = 6;
const PSALM_KEY = "ore_invit_psalm";
const MEDIA_KEY = "ore_media_id";
const SPD_KEY = "ore_auto_speed";
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
  const { colors, fontSize, lineSpacing } = useSettings();
  const dateISO =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : localDateStr(new Date());
  const hour = parseHourParam(params.hour);
  const date = parseLocalDate(dateISO);
  const title = hourTitle(hour, date);
  const lineHeight = oreBodyLineHeight(fontSize, lineSpacing);

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

  const scrollRef = useRef<ScrollView>(null);
  const yRef = useRef(0);
  const maxRef = useRef(0);
  const viewHRef = useRef(0);
  const contentHRef = useRef(0);

  const updateMax = useCallback(() => {
    maxRef.current = Math.max(0, contentHRef.current - viewHRef.current);
  }, []);
  const carryRef = useRef(0);
  const autoOnRef = useRef(false);
  const lastTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(3);

  autoOnRef.current = autoOn;
  speedRef.current = speed;

  const stopAuto = useCallback(() => {
    setAutoOn(false);
    autoOnRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = 0;
    carryRef.current = 0;
  }, []);

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
    if (yRef.current >= max - 0.5) {
      stopAuto();
      return;
    }
    carryRef.current += (SPD_PX[speedRef.current] || 10) * dt;
    const step = Math.floor(carryRef.current);
    if (step >= 1) {
      carryRef.current -= step;
      yRef.current += step;
      scrollRef.current?.scrollTo({ y: yRef.current, animated: false });
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stopAuto]);

  const startAuto = useCallback(() => {
    if (yRef.current >= maxRef.current - 1) {
      yRef.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    setAutoOn(true);
    autoOnRef.current = true;
    lastTsRef.current = 0;
    carryRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => () => stopAuto(), [stopAuto]);

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
    })();
  }, []);

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

  const styles = makeStyles(colors, fontSize);

  return (
    <SafeAreaView style={styles.container} testID="ore-read-screen">
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <View style={styles.barRow}>
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
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.barRow}>
          <TouchableOpacity
            onPress={() => (autoOn ? stopAuto() : startAuto())}
            style={[styles.autoBtn, autoOn && styles.autoOn]}
            accessibilityRole="button"
            accessibilityLabel="Scorrimento automatico"
            accessibilityState={{ selected: autoOn }}
            testID="btn-ore-auto"
            {...webClickable}
          >
            <Text style={[styles.autoLab, autoOn && { color: "#000" }]}>Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => changeSpeed(speed - 1)}
            style={styles.spdBtn}
            accessibilityLabel="Rallenta"
            {...webClickable}
          >
            <Text style={styles.spdLab}>−</Text>
          </TouchableOpacity>
          <Text style={styles.spdVal}>{speed}</Text>
          <TouchableOpacity
            onPress={() => changeSpeed(speed + 1)}
            style={styles.spdBtn}
            accessibilityLabel="Accelera"
            {...webClickable}
          >
            <Text style={styles.spdLab}>+</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <FontSizeButtons decreaseTestID="btn-ore-read-a-minus" increaseTestID="btn-ore-read-a-plus" />
        </View>
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
            yRef.current = e.nativeEvent.contentOffset.y;
            const { contentSize, layoutMeasurement } = e.nativeEvent;
            viewHRef.current = layoutMeasurement.height;
            contentHRef.current = contentSize.height;
            updateMax();
          }}
          onScrollBeginDrag={stopAuto}
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
            rubricColor={colors.textSecondary}
            afterFirstAnt={
              hour === "invitatorio" ? (
                <View style={styles.chips} accessibilityRole="tablist">
                  {INVIT_PSALM_IDS.map((id) => (
                    <TouchableOpacity
                      key={id}
                      onPress={() => changePsalm(id)}
                      style={[styles.chip, psalmId === id && styles.chipOn]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: psalmId === id }}
                      {...webClickable}
                    >
                      <Text style={[styles.chipLab, psalmId === id && styles.chipLabOn]}>{id}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : undefined
            }
          />
        </ScrollView>
      )}
    </SafeAreaView>
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
    barRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    hourTitle: {
      flex: 1,
      textAlign: "center",
      color: colors.textPrimary,
      fontWeight: ACTION_TITLE_WEIGHT,
      fontSize: Math.round(fontSize * 0.78),
    },
    autoBtn: {
      borderWidth: 2,
      borderColor: ORE_BLUE,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    autoOn: { backgroundColor: GOLD, borderColor: GOLD },
    autoLab: { color: ORE_BLUE, fontWeight: "800", fontSize: Math.round(fontSize * 0.55) },
    spdBtn: {
      minWidth: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    spdLab: { color: colors.textPrimary, fontSize: 22, fontWeight: "700" },
    spdVal: { color: colors.textPrimary, fontWeight: "800", minWidth: 18, textAlign: "center" },
    chips: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
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
    err: { color: colors.textSecondary, marginBottom: 12, fontSize: Math.round(fontSize * 0.7) },
  });
