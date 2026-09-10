import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../../src/SettingsContext";
import data from "../../src/data/eucharisticPrayersFull.json";
import childrenData from "../../src/data/eucharisticPrayersChildren.json";
import {
  eucharisticPrayerAccentColor,
  eucharisticPrayerFamilyLabel,
} from "../../src/eucharisticPrayerUi";

interface PE {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
}

export default function PreghiereEucaristicheList() {
  const router = useRouter();
  const { colors, fontSize } = useSettings();
  const list: PE[] = useMemo(
    () => [...((data as PE[]) || []), ...((childrenData as PE[]) || [])],
    [],
  );

  const styles = makeStyles(colors, fontSize);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20}>
          <Ionicons name="chevron-back" size={Math.max(28, fontSize * 0.9)} color={colors.primary} />
          <Text style={styles.backText}>Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Preghiere Eucaristiche</Text>
        <Text style={styles.subtitle}>dal Messale Romano 2020</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => {
          const accent = eucharisticPrayerAccentColor(item.id);
          const familyLabel = eucharisticPrayerFamilyLabel(item.id);
          return (
          <TouchableOpacity
            style={[styles.card, { borderColor: accent, borderWidth: 3 }]}
            onPress={() => router.push(`/preghiere-eucaristiche/${item.id}`)}
            testID={`pe-card-${item.id}`}
          >
            <View style={{ flex: 1 }}>
              {familyLabel ? (
                <Text style={[styles.cardFamily, { color: accent }]}>{familyLabel}</Text>
              ) : null}
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={Math.max(28, fontSize * 0.9)} color={accent} />
          </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: any, fs: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { color: c.primary, fontSize: Math.max(18, fs * 0.55), marginLeft: 4, fontWeight: "600" },
  title: { color: c.textPrimary, fontSize: Math.max(28, fs * 0.85), fontWeight: "700" },
  subtitle: { color: c.textSecondary, fontSize: Math.max(16, fs * 0.5), marginTop: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 20,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: c.border,
  },
  cardFamily: {
    fontSize: Math.max(13, fs * 0.38),
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  cardTitle: { color: c.textPrimary, fontSize: Math.max(20, fs * 0.65), fontWeight: "700", marginBottom: 4 },
  cardDesc: { color: c.textSecondary, fontSize: Math.max(15, fs * 0.45) },
});
