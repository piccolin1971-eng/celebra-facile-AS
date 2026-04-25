import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../../src/SettingsContext";
import { api, VotiveMass, Preface } from "../../src/api";

type VotiveMassFull = VotiveMass & {
  preface_id?: string;
  occasions?: string;
  antifona_ingresso?: string;
  antifona_comunione?: string;
  rubric?: string;
};

export default function VotiveMassDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { colors, fontSize, scaledFont } = useSettings();
  const styles = makeStyles(colors, fontSize);

  const [mass, setMass] = useState<VotiveMassFull | null>(null);
  const [preface, setPreface] = useState<Preface | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const id = typeof params.id === "string" ? params.id : "";
        const [vm, pf] = await Promise.all([
          api.votiveMasses(),
          api.prefaces(),
        ]);
        const found = (vm.masses as VotiveMassFull[]).find((m) => m.id === id);
        if (!found) {
          setNotFound(true);
          return;
        }
        setMass(found);
        if (found.preface_id) {
          const matchedPreface = pf.prefaces.find((p) => p.id === found.preface_id);
          if (matchedPreface) setPreface(matchedPreface);
        }
      } catch (e) {
        console.log("Errore:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const colorHex = (c: string) => {
    switch (c) {
      case "bianco": return colors.liturgicalWhite;
      case "rosso": return colors.liturgicalRed;
      case "verde": return colors.liturgicalGreen;
      case "viola": return colors.liturgicalPurple;
      case "rosa": return colors.liturgicalRose;
      default: return colors.border;
    }
  };

  const colorLabel = (c: string) => {
    switch (c) {
      case "bianco": return "Bianco";
      case "rosso": return "Rosso";
      case "verde": return "Verde";
      case "viola": return "Viola";
      case "rosa": return "Rosa";
      default: return c;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (notFound || !mass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="btn-back">
            <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
            <Text style={styles.backBtnText}>Indietro</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Ionicons name="alert-circle" size={64} color={colors.rubrics} />
          <Text style={[styles.body, { textAlign: "center", marginTop: 16 }]}>
            Messa votiva non trovata.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="votive-detail-screen">
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="btn-back">
          <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Messa votiva</Text>
        <View style={{ width: 100 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Intestazione */}
        <View style={[styles.headerCard, { borderColor: colorHex(mass.color) }]}>
          <View style={[styles.colorDot, { backgroundColor: colorHex(mass.color) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.massTitle}>{mass.title}</Text>
            <Text style={styles.colorLabel}>Colore liturgico: {colorLabel(mass.color)}</Text>
          </View>
        </View>

        {/* Quando si celebra */}
        {mass.occasions ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quando si celebra</Text>
            <Text style={styles.body}>{mass.occasions}</Text>
          </View>
        ) : null}

        {/* Antifona d'ingresso */}
        {mass.antifona_ingresso ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Antifona d'ingresso</Text>
            <Text style={styles.body}>{mass.antifona_ingresso}</Text>
          </View>
        ) : null}

        {/* Antifona alla comunione */}
        {mass.antifona_comunione ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Antifona alla comunione</Text>
            <Text style={styles.body}>{mass.antifona_comunione}</Text>
          </View>
        ) : null}

        {/* Prefazio consigliato */}
        {preface ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prefazio consigliato</Text>
            <Text style={styles.prefaceTitle}>{preface.title}</Text>
            <Text style={styles.body}>{preface.text}</Text>
          </View>
        ) : null}

        {/* Rubrica con riferimenti */}
        {mass.rubric ? (
          <View style={[styles.section, styles.rubricBox]}>
            <Ionicons name="information-circle" size={scaledFont(28)} color={colors.rubrics} style={{ marginBottom: 8 }} />
            <Text style={styles.rubricText}>{mass.rubric}</Text>
          </View>
        ) : null}

        {/* Pulsante "Celebra con questo formulario" */}
        <TouchableOpacity
          style={[styles.celebrateBtn, { backgroundColor: colors.primary }]}
          onPress={() =>
            router.push({
              pathname: "/messa",
              params: { votive: mass.id, preface: mass.preface_id || "" },
            })
          }
          testID="btn-celebrate-votive"
          accessibilityRole="button"
          accessibilityLabel={`Celebra la Messa ${mass.title}`}
        >
          <Ionicons name="book" size={scaledFont(40)} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.celebrateBtnTitle}>Celebra con questo formulario</Text>
            <Text style={styles.celebrateBtnSubtitle}>Apre la messa con prefazio preselezionato</Text>
          </View>
          <Ionicons name="chevron-forward" size={scaledFont(36)} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.footer}>
          Per i testi proprii completi (Colletta, Sulle offerte, Dopo la comunione) consultare il Messale Romano.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    minWidth: 100,
  },
  backBtnText: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "600" },
  title: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary, flex: 1, textAlign: "center" },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 24,
    borderWidth: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.border,
  },
  massTitle: { fontSize: Math.round(fontSize * 1.0), fontWeight: "700", color: colors.textPrimary },
  colorLabel: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 6 },
  section: {
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    fontSize: Math.round(fontSize * 0.75),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  body: {
    fontSize: Math.round(fontSize * 0.9),
    color: colors.textPrimary,
    lineHeight: fontSize * 1.3,
  },
  prefaceTitle: {
    fontSize: Math.round(fontSize * 0.75),
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 12,
    fontStyle: "italic",
  },
  rubricBox: {
    backgroundColor: colors.surface,
    borderColor: colors.rubrics,
  },
  rubricText: {
    fontSize: Math.round(fontSize * 0.7),
    color: colors.rubrics,
    fontStyle: "italic",
    lineHeight: fontSize * 1.0,
  },
  celebrateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 24,
    borderRadius: 14,
    minHeight: 100,
    marginTop: 8,
  },
  celebrateBtnTitle: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: "#FFFFFF" },
  celebrateBtnSubtitle: { fontSize: Math.round(fontSize * 0.6), color: "#FFFFFF", opacity: 0.9, marginTop: 4 },
  footer: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, textAlign: "center", marginTop: 16, fontStyle: "italic" },
});
