/**
 * Redirect legacy: l'indice vive come overlay in /celebra (più veloce).
 */
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSettings } from "../src/SettingsContext";
import { parseCelebrationMode, routeParamStr } from "../src/massSession";
import { localDateStr } from "../src/dateUtils";

export default function CelebraIndiceRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; mode?: string }>();
  const { colors } = useSettings();

  useEffect(() => {
    const mode = parseCelebrationMode(routeParamStr(params.mode));
    const date = routeParamStr(params.date);
    const navParams: Record<string, string> = { mode, from: "indice", index: "1" };
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== localDateStr(new Date())) {
      navParams.date = date;
    }
    router.replace({ pathname: "/celebra" as any, params: navParams });
  }, [params.date, params.mode, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
    </SafeAreaView>
  );
}
