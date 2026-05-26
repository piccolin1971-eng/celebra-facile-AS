import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { getOrazionaleSections, OrazionalePrayer } from "../src/orazionale";

type ViewMode = "list" | "section" | "prayer";

// Renderer condiviso per il testo della Preghiera dei Fedeli.
// Regola globale: ogni occorrenza di "R/." (anche multipla, anche a metà
// riga) viene mostrata in rosso bold; ogni riga che la contiene è seguita
// da UNA SOLA riga vuota di separazione. Stessa logica usata in
// /messa (prepara la liturgia) e /celebra (celebrazione).
function renderRespText(text: string, styles: any) {
  if (!text) return null;
  const normalized = text.replace(/\n{3,}/g, "\n\n");
  const rawLines = normalized.split("\n");
  // Evita doppio gap: se una riga contiene R/. e la successiva è vuota,
  // saltiamo la riga vuota perché il tail "\n\n" la genererà comunque.
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const ln = rawLines[i];
    lines.push(ln);
    if (/R\/\.?/.test(ln) && rawLines[i + 1] === "") i++;
  }
  const RESP_RE = /R\/\.?/g;
  return (
    <Text style={styles.prayerText} selectable>
      {lines.map((ln, i) => {
        const parts = ln.split(/(R\/\.?)/g);
        const hasResp = RESP_RE.test(ln);
        RESP_RE.lastIndex = 0;
        const isLast = i === lines.length - 1;
        const tail = isLast ? "" : (hasResp ? "\n\n" : "\n");
        return (
          <Text key={i}>
            {parts.map((p, j) => {
              if (/^R\/\.?$/.test(p)) {
                return <Text key={j} style={styles.respMarker}>{p}</Text>;
              }
              return <Text key={j}>{p}</Text>;
            })}
            {tail}
          </Text>
        );
      })}
    </Text>
  );
}

export default function OrazionaleScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont, readingMode, isBold } = useSettings();
  const { width } = useWindowDimensions();

  const sections = useMemo(() => getOrazionaleSections(), []);
  const [mode, setMode] = useState<ViewMode>("list");
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [activePrayerId, setActivePrayerId] = useState<string | null>(null);
  // indice della "pagina" del corpo preghiera per Tap-to-Advance
  const [page, setPage] = useState(0);

  const styles = makeStyles(colors, fontSize, isBold);

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
    const TAP_LEFT_RATIO = 0.35;
    const tapLeftWidth = Math.round(width * TAP_LEFT_RATIO);

    const handlePagePress = (e: any) => {
      const x = e?.nativeEvent?.pageX ?? e?.nativeEvent?.locationX ?? 0;
      if (x < tapLeftWidth) back();
      else advance();
    };

    const Body = (
      <View style={styles.prayerBody}>
        <Text style={styles.prayerHeader}>{activePrayer.title}</Text>
        {isTap
          ? renderRespText(prayerChunks[safePage], styles)
          : renderRespText(activePrayer.body, styles)}
      </View>
    );

    return (
      <SafeAreaView style={styles.container} testID="orazionale-prayer">
        {renderHeader(activeSection?.label)}
        {/* Stato pagina (per modalità tap) */}
        {isTap && total > 1 ? (
          <View style={styles.pageStatusBar}>
            <Text style={styles.pageStatusText}>{safePage + 1} / {total}</Text>
          </View>
        ) : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.prayerScroll}>
          {isTap ? (
            <Pressable
              onPress={handlePagePress}
              testID="prayer-tap-area"
              android_disableSound
              style={{ minHeight: 600, flexGrow: 1 }}
            >
              {Body}
            </Pressable>
          ) : (
            Body
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const makeStyles = (colors: any, fontSize: number, isBold?: boolean) => StyleSheet.create({
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
    lineHeight: Math.round(fontSize * 1.6),
    color: colors.textPrimary,
    fontWeight: isBold ? "700" : "400",
  },
  // Marker R/. in rosso bold (regola globale Preghiera dei Fedeli)
  respMarker: {
    color: "#E57373",
    fontWeight: "800",
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
  pageStatusBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pageStatusText: {
    fontSize: Math.round(fontSize * 0.55),
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
});
