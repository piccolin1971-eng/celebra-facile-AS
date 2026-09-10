import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { celebraWebPreviewUrl } from "../src/previewLinks";
import { useSettings } from "../src/SettingsContext";

const S = { sm: 8, md: 16, lg: 24, xl: 32 } as const;

type PreviewRoute = {
  title: string;
  subtitle: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  external?: boolean;
};

const ROUTES: PreviewRoute[] = [
  {
    title: "Celebra la Messa",
    subtitle: "Modalità altare — Smart Tap, pagine macro",
    path: "/celebra",
    icon: "book",
    color: "#2E7D32",
  },
  {
    title: "Scegli la liturgia",
    subtitle: "Preparazione — toggle scroll, scelte PE/prefazio",
    path: "/messa",
    icon: "settings",
    color: "#1565C0",
  },
  {
    title: "Home",
    subtitle: "Schermata principale",
    path: "/",
    icon: "home",
    color: "#5C6BC0",
  },
  {
    title: "Home — proposta UX",
    subtitle: "Mock ¾+¼ trasparente → 50/50 dopo preparazione",
    path: "/anteprima-home",
    icon: "color-wand",
    color: "#7B1FA2",
  },
  {
    title: "Impostazioni",
    subtitle: "Font, temi, scroll",
    path: "/impostazioni",
    icon: "options",
    color: "#78909C",
  },
];

export default function AnteprimaScreen() {
  const router = useRouter();
  const { colors, scaledFont } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const openRoute = (route: PreviewRoute) => {
    if (route.external) {
      void Linking.openURL(route.path);
      return;
    }
    router.push(route.path as never);
  };

  const openInNewTab = (path: string) => {
    const url = celebraWebPreviewUrl(path);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container} testID="preview-hub">
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} testID="btn-back-anteprima">
          <Ionicons name="arrow-back" size={scaledFont(28)} color={colors.textPrimary} />
          <Text style={styles.backText}>Indietro</Text>
        </Pressable>
        <Text style={styles.title}>Anteprima web</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.banner}>
          <Ionicons name="desktop-outline" size={scaledFont(32)} color={colors.primary} />
          <Text style={styles.bannerTitle}>Celebra facile — browser</Text>
          <Text style={styles.bannerDesc}>
            Usa questa pagina per provare layout e navigazione durante lo sviluppo. Il microfono e alcune
            funzioni native non sono disponibili sul web; per lo scroll vocale serve l&apos;APK.
          </Text>
          <Text style={styles.bannerUrl} selectable>
            {celebraWebPreviewUrl("/anteprima")}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Apri nello stesso pannello</Text>
        {ROUTES.map((route) => (
          <Pressable
            key={route.path}
            style={styles.card}
            onPress={() => openRoute(route)}
            testID={`preview-route-${route.path.replace(/\//g, "") || "home"}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: route.color + "22" }]}>
              <Ionicons name={route.icon} size={scaledFont(26)} color={route.color} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{route.title}</Text>
              <Text style={styles.cardSub}>{route.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={scaledFont(22)} color={colors.textSecondary} />
          </Pressable>
        ))}

        {Platform.OS === "web" ? (
          <>
            <Text style={[styles.sectionLabel, { marginTop: S.lg }]}>
              Apri in nuova scheda (affiancato a Canzoniere)
            </Text>
            <Pressable
              style={[styles.card, styles.cardHighlight]}
              onPress={() => openInNewTab("/celebra")}
              testID="preview-celebra-new-tab"
            >
              <Ionicons name="open-outline" size={scaledFont(28)} color={colors.primary} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Celebra in nuova scheda</Text>
                <Text style={styles.cardSub}>{celebraWebPreviewUrl("/celebra")}</Text>
              </View>
            </Pressable>
            <Pressable style={styles.card} onPress={() => openInNewTab("/messa")} testID="preview-messa-new-tab">
              <Ionicons name="open-outline" size={scaledFont(28)} color={colors.primary} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Messa in nuova scheda</Text>
                <Text style={styles.cardSub}>{celebraWebPreviewUrl("/messa")}</Text>
              </View>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useSettings>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: S.md,
      paddingVertical: S.sm,
      gap: S.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    backText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    title: { flex: 1, color: colors.textPrimary, fontSize: 20, fontWeight: "800", textAlign: "center", marginRight: 72 },
    content: { padding: S.md, paddingBottom: S.xl },
    banner: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: S.md,
      marginBottom: S.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: S.sm,
    },
    bannerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
    bannerDesc: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    bannerUrl: { color: colors.primary, fontSize: 13, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: S.sm,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: S.md,
      marginBottom: S.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHighlight: { borderColor: colors.primary, borderWidth: 2 },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    cardText: { flex: 1 },
    cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    cardSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  });
}
