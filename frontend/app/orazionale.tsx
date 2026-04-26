import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { getOrazionaleSections, OrazionalePrayer } from "../src/orazionale";

type ViewMode = "list" | "section" | "prayer";

export default function OrazionaleScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont, readingMode } = useSettings();
  const { width } = useWindowDimensions();

  const sections = useMemo(() => getOrazionaleSections(), []);
  const [mode, setMode] = useState<ViewMode>("list");
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [activePrayerId, setActivePrayerId] = useState<string | null>(null);
  // indice della "pagina" del corpo preghiera per Tap-to-Advance
  const [page, setPage] = useState(0);

  const styles = makeStyles(colors, fontSize);

  const activeSection = sections.find((s) => s.key === activeSectionKey);
  const activePrayer: OrazionalePrayer | null = activeSection
    ? activeSection.prayers.find((p) => p.id === activePrayerId) || null
    : null;

  const goBack = () => {
    if (mode === "prayer") {
      setMode("section");
      setActivePrayerId(null);
      setPage(0);
    } else if (mode === "section") {
      setMode("list");
      setActiveSectionKey(null);
    } else {
      router.back();
    }
  };

  const openSection = (key: string) => {
    setActiveSectionKey(key);
    setMode("section");
  };

  const openPrayer = (id: string) => {
    setActivePrayerId(id);
    setPage(0);
    setMode("prayer");
  };

  // Suddividi corpo preghiera in chunk per modalità tap-to-advance
  const prayerChunks = useMemo(() => {
    if (!activePrayer) return [];
    if (readingMode !== "tap") return [activePrayer.body];
    // Stima: ~14 righe per pagina (più conservativo per font grandi)
    const lines = activePrayer.body.split("\n");
    const linesPerPage = fontSize >= 40 ? 8 : fontSize >= 30 ? 11 : 14;
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      out.push(lines.slice(i, i + linesPerPage).join("\n"));
    }
    return out.length > 0 ? out : [activePrayer.body];
  }, [activePrayer, fontSize, readingMode]);

  const total = prayerChunks.length;
  const safePage = Math.max(0, Math.min(page, total - 1));
  const advance = () => setPage((p) => Math.min(p + 1, total - 1));
  const back = () => setPage((p) => Math.max(p - 1, 0));

  // ===== HEADER =====
  const renderHeader = (subtitle?: string) => (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.backBtn} onPress={goBack} testID="btn-back">
        <Ionicons name="chevron-back" size={scaledFont(36)} color={colors.textPrimary} />
        <Text style={styles.backBtnText}>Indietro</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>Orazionale</Text>
        {subtitle ? <Text style={styles.subtitleHeader} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={{ width: 100 }} />
    </View>
  );

  // ===== LISTA SEZIONI =====
  if (mode === "list") {
    return (
      <SafeAreaView style={styles.container} testID="orazionale-list">
        {renderHeader("Preghiera Universale (CEI)")}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.introCard}>
            <MaterialCommunityIcons name="hands-pray" size={scaledFont(36)} color={colors.primary} />
            <Text style={styles.introText}>
              Orazionale per la Preghiera universale - Conferenza Episcopale Italiana, 2ª edizione 2020.
              Sussidio per la Preghiera dei fedeli durante la celebrazione eucaristica.
            </Text>
          </View>
          {sections.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.sectionCard}
              onPress={() => openSection(s.key)}
              testID={`section-${s.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}, ${s.prayers.length} preghiere`}
            >
              <View style={styles.sectionIconBox}>
                <MaterialCommunityIcons name="book-open-variant" size={scaledFont(32)} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{s.label}</Text>
                <Text style={styles.sectionDesc}>{s.description}</Text>
                <Text style={styles.sectionCount}>{s.prayers.length} preghiere</Text>
              </View>
              <Ionicons name="chevron-forward" size={scaledFont(36)} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== ELENCO PREGHIERE NELLA SEZIONE =====
  if (mode === "section" && activeSection) {
    return (
      <SafeAreaView style={styles.container} testID="orazionale-section">
        {renderHeader(activeSection.label)}
        <ScrollView contentContainerStyle={styles.content}>
          {activeSection.prayers.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.prayerListItem}
              onPress={() => openPrayer(p.id)}
              testID={`prayer-${p.id}`}
              accessibilityRole="button"
              accessibilityLabel={p.title}
            >
              <Text style={styles.prayerListTitle}>{p.title}</Text>
              <Ionicons name="chevron-forward" size={scaledFont(28)} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== DETTAGLIO PREGHIERA =====
  if (mode === "prayer" && activePrayer) {
    const isTap = readingMode === "tap";
    const tapZoneLeft = width * 0.35;

    const Body = (
      <View style={styles.prayerBody}>
        <Text style={styles.prayerHeader}>{activePrayer.title}</Text>
        {isTap ? (
          <Text style={styles.prayerText} selectable>
            {prayerChunks[safePage]}
          </Text>
        ) : (
          <Text style={styles.prayerText} selectable>
            {activePrayer.body}
          </Text>
        )}
      </View>
    );

    return (
      <SafeAreaView style={styles.container} testID="orazionale-prayer">
        {renderHeader(activeSection?.label)}
        {isTap ? (
          // Tap to Advance: niente scroll, zone touch sx/dx
          <View style={{ flex: 1 }}>
            <View style={styles.prayerScroll} pointerEvents="box-none">
              {Body}
            </View>
            {/* Zone touch invisibili sopra il contenuto */}
            <Pressable
              style={[styles.tapZone, { left: 0, width: tapZoneLeft }]}
              onPress={back}
              testID="tap-zone-back"
              accessibilityLabel="Pagina precedente"
            />
            <Pressable
              style={[styles.tapZone, { right: 0, width: width - tapZoneLeft }]}
              onPress={advance}
              testID="tap-zone-next"
              accessibilityLabel="Pagina successiva"
            />
            {/* Indicatore pagina */}
            {total > 1 ? (
              <View style={styles.pageIndicator} pointerEvents="none">
                <Text style={styles.pageIndicatorText}>{safePage + 1} / {total}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.prayerScroll}>
            {Body}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  return null;
}

const makeStyles = (colors: any, fontSize: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 56,
    borderRadius: 10,
    gap: 4,
  },
  backBtnText: { fontSize: Math.round(fontSize * 0.7), fontWeight: "600", color: colors.textPrimary },
  title: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  subtitleHeader: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 2 },
  content: { padding: 20, gap: 14 },
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  introText: { flex: 1, fontSize: Math.round(fontSize * 0.6), color: colors.textPrimary, lineHeight: Math.round(fontSize * 0.85) },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 18,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 96,
  },
  sectionIconBox: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary,
  },
  sectionTitle: { fontSize: Math.round(fontSize * 0.8), fontWeight: "700", color: colors.textPrimary },
  sectionDesc: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 4 },
  sectionCount: { fontSize: Math.round(fontSize * 0.55), color: colors.primary, marginTop: 6, fontWeight: "600" },
  prayerListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 76,
    gap: 12,
  },
  prayerListTitle: {
    flex: 1,
    fontSize: Math.round(fontSize * 0.72),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  prayerScroll: { padding: 24, paddingBottom: 80 },
  prayerBody: { gap: 16 },
  prayerHeader: {
    fontSize: Math.round(fontSize * 0.85),
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 8,
  },
  prayerText: {
    fontSize: fontSize,
    lineHeight: Math.round(fontSize * 1.5),
    color: colors.textPrimary,
  },
  tapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  pageIndicator: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    left: 0, right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  pageIndicatorText: {
    fontSize: Math.round(fontSize * 0.5),
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    overflow: "hidden",
    fontWeight: "600",
  },
});
