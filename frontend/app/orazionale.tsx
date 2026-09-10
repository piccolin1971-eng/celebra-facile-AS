import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { SectionScreenTopBar } from "../src/components/SectionScreenTopBar";
import { BrandScreenTitle } from "../src/components/BrandScreenTitle";
import { getOrazionaleSections, OrazionalePrayer } from "../src/orazionale";
import { FontFamilyId, resolveBodyFont, resolveHeadingFont } from "../src/fontFamily";
import { renderOrazionaleOrFedeliText } from "../src/responsorialRendering";
import { useKindleScrollPaging } from "../src/useKindleScrollPaging";
import { triggerAppHaptic } from "../src/appHaptics";

type ViewMode = "list" | "section" | "prayer";

function renderRespText(
  text: string,
  styles: any,
  textProps?: { onTextLayout?: any },
) {
  return renderOrazionaleOrFedeliText(
    text,
    {
      body: styles.prayerText,
      marker: styles.respMarker,
    },
    textProps,
  );
}

export default function OrazionaleScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont, readingMode, fontFamilyId, isBold } = useSettings();
  const { width } = useWindowDimensions();

  const sections = useMemo(() => getOrazionaleSections(), []);
  const [mode, setMode] = useState<ViewMode>("list");
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [activePrayerId, setActivePrayerId] = useState<string | null>(null);
  const [titleH, setTitleH] = useState(0);

  const styles = makeStyles(colors, fontSize, fontFamilyId, isBold);

  const activeSection = sections.find((s) => s.key === activeSectionKey);
  const activePrayer: OrazionalePrayer | null = activeSection
    ? activeSection.prayers.find((p) => p.id === activePrayerId) || null
    : null;

  const isTap = readingMode === "tap";
  const kindleEnabled = mode === "prayer" && isTap && !!activePrayer;
  const kindle = useKindleScrollPaging({
    enabled: kindleEnabled,
    resetKey: `${activePrayerId || ""}:${fontSize}:${fontFamilyId}:${isBold ? 1 : 0}`,
    fontSize,
    tapAreaTestId: "orazionale-kindle-area",
  });

  const goBack = () => {
    if (mode === "prayer") {
      setMode("section");
      setActivePrayerId(null);
      setTitleH(0);
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
    setTitleH(0);
    setMode("prayer");
  };

  // ===== HEADER =====
  const renderHeader = (subtitle?: string) => (
    <SectionScreenTopBar
      title="Orazionale"
      onHome={goBack}
      colors={colors}
      fontSize={fontSize}
      textStyle={styles.title}
      homeTestID="btn-back"
      leading={
        mode === "list" ? undefined : (
          <TouchableOpacity style={styles.backBtn} onPress={goBack} testID="btn-back">
            <Ionicons name="chevron-back" size={scaledFont(36)} color={colors.textPrimary} />
            <Text style={styles.backBtnText}>Indietro</Text>
          </TouchableOpacity>
        )
      }
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <BrandScreenTitle
          title="Orazionale"
          textStyle={styles.title}
          numberOfLines={1}
          markSize={Math.max(28, Math.round(fontSize * 0.85))}
        />
        {subtitle ? (
          <Text style={styles.subtitleHeader} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </SectionScreenTopBar>
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
    const TAP_LEFT_RATIO = 0.35;
    const tapLeftWidth = Math.round(width * TAP_LEFT_RATIO);
    const { index: microI, total: microTotal } = kindle.microPageUi;

    const handlePagePress = (e: any) => {
      void triggerAppHaptic("selection");
      const x = e?.nativeEvent?.pageX ?? e?.nativeEvent?.locationX ?? 0;
      if (x < tapLeftWidth) kindle.tapPrev();
      else kindle.tapNext();
    };

    const bodyOffset = titleH + 16; // gap in prayerBody
    const Body = (
      <View
        key={`prayer-body-${fontSize}-${fontFamilyId}-${isBold ? 1 : 0}`}
        style={styles.prayerBody}
      >
        <Text
          style={styles.prayerHeader}
          onLayout={(e) => setTitleH(e.nativeEvent.layout.height)}
        >
          {activePrayer.title}
        </Text>
        {renderRespText(
          activePrayer.body,
          styles,
          isTap
            ? { onTextLayout: kindle.onBodyTextLayoutWithOffset(bodyOffset) }
            : undefined,
        )}
      </View>
    );

    return (
      <SafeAreaView style={styles.container} testID="orazionale-prayer">
        {renderHeader(activeSection?.label)}
        {isTap ? (
          <View style={styles.pageStatusBar}>
            <Text style={styles.pageStatusText}>
              {microI + 1} / {Math.max(1, microTotal)}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} testID="orazionale-kindle-area">
          <ScrollView
            ref={kindle.scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.prayerScroll,
              isTap ? { paddingBottom: kindle.pageBottomPad } : null,
            ]}
            showsVerticalScrollIndicator={!isTap}
            scrollEnabled={!isTap}
            onLayout={isTap ? kindle.onLayout : undefined}
            onContentSizeChange={isTap ? kindle.onContentSizeChange : undefined}
          >
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
          {isTap && kindle.maskH > 2 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: kindle.maskH,
                backgroundColor: colors.background,
                zIndex: 5,
                elevation: 5,
              }}
              testID="orazionale-kindle-mask"
            />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const makeStyles = (colors: any, fontSize: number, fontFamilyId: FontFamilyId, isBold?: boolean) => {
  const bodyFont = resolveBodyFont(fontFamilyId, !!isBold);
  const headingFont = resolveHeadingFont(fontFamilyId);

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  title: { fontSize: Math.round(fontSize * 0.9), fontWeight: "700", color: colors.textPrimary, textAlign: "left" },
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
    fontFamily: bodyFont.fontFamily,
    fontWeight: bodyFont.fontWeight,
  },
  respMarker: {
    color: colors.rubrics,
    fontFamily: headingFont.fontFamily,
    fontWeight: headingFont.fontWeight,
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
};
