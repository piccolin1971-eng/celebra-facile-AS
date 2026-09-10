/**
 * Anteprima icone per i tasti hero Home (Scegli liturgia / Celebra la Messa).
 * Apri: /anteprima-icone-hero  (es. http://localhost:8084/anteprima-icone-hero)
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { HomeHeroIcon } from "../src/components/HomeHeroIcon";
import { useSettings } from "../src/SettingsContext";

type IconSet = "ionicons" | "material";

type Proposal = {
  id: string;
  title: string;
  note: string;
  recommended?: boolean;
  layout: "column" | "row" | "textOnly";
  prep: { set: IconSet; name: string };
  celebra: { set: IconSet; name: string };
  ghost?: boolean;
  homeHero?: boolean;
};

const PROPOSALS: Proposal[] = [
  {
    id: "A",
    title: "Stock — libro aperto + chiesa",
    note: "MaterialCommunityIcons, nitide su tablet, zero asset custom.",
    recommended: true,
    layout: "column",
    prep: { set: "material", name: "book-open-variant" },
    celebra: { set: "material", name: "church" },
    homeHero: true,
  },
  {
    id: "B",
    title: "Stock — libro + calice",
    note: "Più eucaristico su Celebra.",
    layout: "column",
    prep: { set: "ionicons", name: "book-outline" },
    celebra: { set: "ionicons", name: "wine-outline" },
  },
  {
    id: "C",
    title: "Stock — lista + croce",
    note: "Preparazione = scelte; Celebra = liturgia.",
    layout: "column",
    prep: { set: "material", name: "clipboard-list-outline" },
    celebra: { set: "material", name: "cross" },
  },
  {
    id: "D",
    title: "Layout riga (icona a sinistra)",
    note: "Compatto come la prima bozza Home.",
    layout: "row",
    prep: { set: "material", name: "book-open-page-variant" },
    celebra: { set: "material", name: "church" },
  },
  {
    id: "E",
    title: "Celebra disabilitato (ghost)",
    note: "Stesse icone della proposta A, card tratteggiata.",
    layout: "column",
    prep: { set: "material", name: "book-open-variant" },
    celebra: { set: "material", name: "church" },
    ghost: true,
    homeHero: true,
  },
  {
    id: "F",
    title: "Solo testo (attuale)",
    note: "Nessuna icona — massima leggibilità.",
    layout: "textOnly",
    prep: { set: "material", name: "book-open-variant" },
    celebra: { set: "material", name: "church" },
  },
];

function HeroIcon({
  spec,
  size,
  color,
}: {
  spec: { set: IconSet; name: string };
  size: number;
  color: string;
}) {
  if (spec.set === "ionicons") {
    return <Ionicons name={spec.name as any} size={size} color={color} />;
  }
  return <MaterialCommunityIcons name={spec.name as any} size={size} color={color} />;
}

function HeroMock({
  label,
  bg,
  ghost,
  layout,
  iconSpec,
  homeHero,
  celebraRole,
  colors,
  iconSize,
  styles,
}: {
  label: string;
  bg: string;
  ghost?: boolean;
  layout: Proposal["layout"];
  iconSpec: { set: IconSet; name: string };
  homeHero?: boolean;
  celebraRole: "prep" | "celebra";
  colors: ReturnType<typeof useSettings>["colors"];
  iconSize: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  const fg = ghost ? colors.textSecondary : colors.onPrimary;
  const showIcon = layout !== "textOnly";

  return (
    <View
      style={[
        styles.heroCard,
        ghost ? styles.heroGhost : { backgroundColor: bg },
        layout === "row" && styles.heroRow,
      ]}
    >
      {showIcon && homeHero ? (
        <HomeHeroIcon
          variant={celebraRole}
          size={iconSize}
          ghost={ghost}
          activeColor={colors.onPrimary}
          ghostColor={colors.textSecondary}
        />
      ) : null}
      {showIcon && !homeHero ? <HeroIcon spec={iconSpec} size={iconSize} color={fg} /> : null}
      <Text style={[styles.heroLabel, ghost && styles.heroLabelGhost]}>{label}</Text>
    </View>
  );
}

export default function AnteprimaIconeHeroScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont } = useSettings();
  const styles = useMemo(() => makeStyles(colors, fontSize), [colors, fontSize]);
  const iconSize = Math.round(scaledFont(40));

  return (
    <SafeAreaView style={styles.container} testID="anteprima-icone-hero">
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={scaledFont(24)} color={colors.textPrimary} />
          <Text style={styles.backText}>Indietro</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Icone tasti hero</Text>
        <Text style={styles.intro}>
          Proposte per «Scegli la liturgia» e «Celebra la Messa». Scegli una lettera e
          comunicamela per implementarla in Home.
        </Text>
        <Text style={styles.htmlHint}>
          Anteprima HTML: canvases-preview/hero-icons-liturgia.html
        </Text>

        {PROPOSALS.map((p) => (
          <View key={p.id} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {p.id} — {p.title}
              </Text>
              {p.recommended ? <Text style={styles.badge}>Consigliata</Text> : null}
            </View>
            <Text style={styles.sectionNote}>{p.note}</Text>
            <View style={styles.heroPair}>
              <HeroMock
                label="Scegli la liturgia"
                bg={colors.primary}
                layout={p.layout}
                iconSpec={p.prep}
                homeHero={p.homeHero}
                celebraRole="prep"
                colors={colors}
                iconSize={iconSize}
                styles={styles}
              />
              <HeroMock
                label="Celebra la Messa"
                bg={colors.liturgicalGreen}
                ghost={p.ghost}
                layout={p.layout}
                iconSpec={p.celebra}
                homeHero={p.homeHero}
                celebraRole="celebra"
                colors={colors}
                iconSize={iconSize}
                styles={styles}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useSettings>["colors"], fontSize: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
    backText: { fontSize: Math.round(fontSize * 0.75), color: colors.textPrimary, fontWeight: "600" },
    content: { padding: 16, paddingBottom: 40, gap: 8 },
    h1: { fontSize: Math.round(fontSize * 0.95), fontWeight: "800", color: colors.textPrimary },
    intro: {
      fontSize: Math.round(fontSize * 0.72),
      color: colors.textSecondary,
      lineHeight: Math.round(fontSize * 0.95),
      marginBottom: 4,
    },
    htmlHint: {
      fontSize: Math.round(fontSize * 0.62),
      color: colors.textSecondary,
      fontStyle: "italic",
      marginBottom: 16,
    },
    section: {
      marginBottom: 20,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    sectionHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    sectionTitle: {
      fontSize: Math.round(fontSize * 0.78),
      fontWeight: "700",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    badge: {
      fontSize: Math.round(fontSize * 0.5),
      fontWeight: "800",
      textTransform: "uppercase",
      color: "#fff",
      backgroundColor: colors.liturgicalGreen,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      overflow: "hidden",
    },
    sectionNote: {
      fontSize: Math.round(fontSize * 0.65),
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: 12,
    },
    heroPair: { flexDirection: "row", gap: 12 },
    heroCard: {
      flex: 1,
      minHeight: 96,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    heroRow: { flexDirection: "row", minHeight: 72, gap: 10 },
    heroGhost: {
      backgroundColor: "transparent",
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: "dashed",
      opacity: 0.58,
    },
    heroLabel: {
      fontSize: Math.round(fontSize * 0.72),
      fontWeight: "700",
      color: colors.onPrimary,
      textAlign: "center",
    },
    heroLabelGhost: { color: colors.textSecondary, fontWeight: "600" },
  });
