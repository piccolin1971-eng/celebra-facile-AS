import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { SectionScreenTopBar } from "../src/components/SectionScreenTopBar";
import {
  ensureRitualCelebrateSession,
  listRitualFamilies,
  type RitualMass,
} from "../src/ritualMasses";
import { triggerAppHaptic } from "../src/appHaptics";
import { ACTION_MIN_HEIGHT, ACTION_RADIUS, ACTION_TITLE_WEIGHT } from "../src/uiActionTokens";

const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

function liturgicalFrameColor(
  colorName: string | undefined,
  colors: ReturnType<typeof useSettings>["colors"],
): string {
  switch ((colorName || "").toLowerCase()) {
    case "rosso":
      return colors.liturgicalRed;
    case "verde":
      return colors.liturgicalGreen;
    case "viola":
      return colors.liturgicalPurple;
    case "rosa":
      return colors.liturgicalRose;
    case "bianco":
      return colors.liturgicalWhite;
    default:
      return colors.border;
  }
}

function familyFrameColor(
  familyId: string,
  masses: RitualMass[],
  colors: ReturnType<typeof useSettings>["colors"],
): string {
  if (familyId === "defunti") return colors.liturgicalPurple;
  if (familyId === "matrimonio_anniversario") return colors.liturgicalWhite;
  const first = masses[0]?.color;
  return liturgicalFrameColor(first, colors);
}

export default function MesseRitualiScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont } = useSettings();
  const styles = makeStyles(colors, fontSize);
  const families = useMemo(() => listRitualFamilies(), []);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const selectedFamily = families.find((f) => f.id === familyId) || null;

  const startRitual = async (mass: RitualMass) => {
    if (startingId) return;
    void triggerAppHaptic("light");
    setStartingId(mass.id);
    try {
      await ensureRitualCelebrateSession(mass.id);
      router.push({
        pathname: "/celebra" as any,
        params: { votive: mass.id, from: "indice", index: "1" },
      });
    } catch (e) {
      if (__DEV__) console.log("Messa votiva/rituale:", e);
      Alert.alert(
        "Messe votive e rituali",
        "Non è stato possibile avviare la celebrazione. Riprova.",
      );
    } finally {
      setStartingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="messe-rituali-screen">
      <SectionScreenTopBar
        title="Messe votive e rituali"
        onHome={() => (familyId ? setFamilyId(null) : router.back())}
        colors={colors}
        fontSize={fontSize}
        textStyle={styles.title}
        homeTestID="btn-rituali-back"
      />

      <ScrollView contentContainerStyle={styles.content}>
        {!selectedFamily ? (
          <>
            <Text style={styles.lead}>
              Celebrazione tipo «Celebra subito»: scegli il formulario, poi l&apos;indice con le
              preghiere già impostate.
            </Text>
            {families.map((f) => {
              const frame = familyFrameColor(f.id, f.masses, colors);
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.card, { borderColor: frame }, webClickable]}
                  onPress={() => setFamilyId(f.id)}
                  testID={`rituali-family-${f.id}`}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{f.title}</Text>
                    <Text style={styles.cardSub}>
                      {f.id === "votive"
                        ? `${f.masses.length} formulari`
                        : `${f.masses.length} formulari · ${f.masses.map((m) => m.formula).filter(Boolean).join(" · ")}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={scaledFont(28)} color={frame} />
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.lead}>{selectedFamily.title}</Text>
            {selectedFamily.masses.map((m) => {
              const frame = liturgicalFrameColor(m.color, colors);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.card, { borderColor: frame }, webClickable]}
                  onPress={() => void startRitual(m)}
                  disabled={!!startingId}
                  testID={`rituali-mass-${m.id}`}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      styles.colorPill,
                      {
                        backgroundColor: frame,
                        borderWidth: m.color === "bianco" ? 1 : 0,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {m.family === "votive" ? m.title : m.shortLabel}
                    </Text>
                    <Text style={styles.cardSub}>
                      {m.family === "votive" ? `Colore: ${m.color}` : m.title}
                    </Text>
                  </View>
                  {startingId === m.id ? (
                    <ActivityIndicator color={frame} />
                  ) : (
                    <Ionicons name="play-circle" size={scaledFont(34)} color={frame} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, fontSize: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: {
      fontSize: Math.round(fontSize * 0.9),
      fontWeight: "800",
      color: colors.textPrimary,
    },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    lead: {
      fontSize: Math.round(fontSize * 0.7),
      color: colors.textSecondary,
      marginBottom: 8,
      lineHeight: Math.round(fontSize * 1.05),
    },
    card: {
      minHeight: ACTION_MIN_HEIGHT,
      borderRadius: ACTION_RADIUS,
      borderWidth: 3,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    colorPill: {
      width: 14,
      alignSelf: "stretch",
      minHeight: 40,
      borderRadius: 999,
      flexShrink: 0,
    },
    cardTitle: {
      fontSize: Math.round(fontSize * 0.85),
      fontWeight: ACTION_TITLE_WEIGHT,
      color: colors.textPrimary,
    },
    cardSub: {
      fontSize: Math.round(fontSize * 0.62),
      color: colors.textSecondary,
      marginTop: 4,
    },
  });
