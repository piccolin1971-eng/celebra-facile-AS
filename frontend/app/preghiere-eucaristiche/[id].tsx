import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, StatusBar, TouchableOpacity, Pressable, Modal, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../../src/SettingsContext";
import data from "../../src/data/eucharisticPrayersFull.json";

type Block = {
  type: "r" | "t" | "title" | "c" | "acc" | "var" | "rubric_section";
  text?: string;
  selector?: string;
  title?: string;
};

interface SelectorOpt { id: string; label: string; }
interface SelectorDef {
  label: string;
  options: SelectorOpt[];
  variants: Record<string, Block[]>;
}
interface PEFull {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  selectors?: Record<string, SelectorDef>;
  blocks: Block[];
}

export default function PreghieraEucaristicaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fontSize } = useSettings();

  const list: PEFull[] = (data as any) || [];
  const pe = list.find((p) => p.id === id);

  // Selezioni utente per i selettori (Communicantes / Hanc ígitur)
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);

  // Inizializza con la prima opzione
  useEffect(() => {
    if (!pe?.selectors) return;
    const init: Record<string, string> = {};
    Object.entries(pe.selectors).forEach(([k, def]) => {
      init[k] = def.options[0]?.id || "";
    });
    setSelections(init);
  }, [pe?.id]);

  // Espande i blocchi sostituendo i `var` con i blocchi della variante selezionata
  const expandedBlocks: Block[] = useMemo(() => {
    if (!pe) return [];
    const out: Block[] = [];
    for (const b of pe.blocks) {
      if (b.type === "var" && b.selector && pe.selectors?.[b.selector]) {
        const def = pe.selectors[b.selector];
        const optId = selections[b.selector] || def.options[0]?.id;
        const variantBlocks = def.variants[optId] || def.variants[def.options[0]?.id] || [];
        out.push(...variantBlocks);
      } else {
        out.push(b);
      }
    }
    return out;
  }, [pe, selections]);

  // Dividi in pagine: ogni `title` inizia una nuova pagina
  const pages: Block[][] = useMemo(() => {
    const result: Block[][] = [];
    let cur: Block[] = [];
    for (const b of expandedBlocks) {
      if (b.type === "title" && cur.length > 0) {
        result.push(cur);
        cur = [b];
      } else {
        cur.push(b);
      }
    }
    if (cur.length > 0) result.push(cur);
    return result.length === 0 ? [[]] : result;
  }, [expandedBlocks]);

  const [pageIdx, setPageIdx] = useState(0);
  useEffect(() => { setPageIdx(0); }, [pe?.id, selections]);

  const goNext = () => {
    setPageIdx((i) => Math.min(i + 1, pages.length - 1));
  };
  const goPrev = () => {
    setPageIdx((i) => Math.max(i - 1, 0));
  };

  if (!pe) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontSize: 20 }}>PE non trovata</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={{ color: colors.primary, fontSize: 18 }}>← Indietro</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const styles = makeStyles(colors, fontSize);
  const currentPage = pages[pageIdx] || [];

  const renderBlock = (b: Block, key: string) => {
    if (b.type === "title") return <Text key={key} style={styles.title}>{b.text || b.title}</Text>;
    if (b.type === "r") return <Text key={key} style={styles.rubric}>{b.text}</Text>;
    if (b.type === "rubric_section") return <Text key={key} style={styles.rubricSection}>{b.text}</Text>;
    if (b.type === "c") return <Text key={key} style={styles.consacrazione}>{b.text}</Text>;
    if (b.type === "acc") return <Text key={key} style={styles.acclamazione}>{b.text}</Text>;
    return <Text key={key} style={styles.text}>{b.text}</Text>;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20} testID="btn-back">
          <Ionicons name="chevron-back" size={Math.max(28, fontSize * 0.85)} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{pe.shortTitle || pe.title}</Text>
        <Text style={styles.pageIndicator}>{pageIdx + 1}/{pages.length}</Text>
      </View>

      {/* Selettori (se presenti) */}
      {pe.selectors && Object.keys(pe.selectors).length > 0 ? (
        <View style={styles.selectorBar}>
          {Object.entries(pe.selectors).map(([key, def]) => {
            const optId = selections[key] || def.options[0]?.id;
            const opt = def.options.find((o) => o.id === optId);
            return (
              <TouchableOpacity
                key={key}
                style={styles.selectorBtn}
                onPress={() => setPickerOpen(key)}
                testID={`selector-${key}`}
              >
                <Text style={styles.selectorLabel}>{def.label}</Text>
                <Text style={styles.selectorValue} numberOfLines={1}>
                  {opt?.label || "—"} <Ionicons name="chevron-down" size={14} color={colors.primary} />
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Pagina con tap zones */}
      <View style={styles.pageContainer}>
        <ScrollView
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          {currentPage.map((b, i) => renderBlock(b, `${pageIdx}-${i}`))}
        </ScrollView>

        {/* Tap zones invisibili sopra il contenuto */}
        <View style={styles.tapZoneRow} pointerEvents="box-none">
          <Pressable
            style={[styles.tapZone, { width: "30%" }]}
            onPress={goPrev}
            testID="tap-prev"
          >
            {pageIdx > 0 ? (
              <View style={styles.tapHint}>
                <Ionicons name="chevron-back" size={28} color={colors.textSecondary} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }} pointerEvents="none" />
          <Pressable
            style={[styles.tapZone, { width: "30%", alignItems: "flex-end" }]}
            onPress={goNext}
            testID="tap-next"
          >
            {pageIdx < pages.length - 1 ? (
              <View style={styles.tapHint}>
                <Ionicons name="chevron-forward" size={28} color={colors.textSecondary} />
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Footer minimal */}
      <View style={styles.footer}>
        <Text style={styles.footerHint}>Tocca a destra per avanzare, a sinistra per tornare</Text>
      </View>

      {/* Modal selettore */}
      <Modal
        visible={pickerOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.modalTitle}>{pickerOpen && pe.selectors?.[pickerOpen]?.label}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {pickerOpen && pe.selectors?.[pickerOpen]?.options.map((o) => {
                const isSel = selections[pickerOpen] === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.modalOption, isSel && styles.modalOptionActive]}
                    onPress={() => {
                      setSelections((s) => ({ ...s, [pickerOpen]: o.id }));
                      setPickerOpen(null);
                    }}
                  >
                    <Text style={[styles.modalOptionText, isSel && { color: colors.primary, fontWeight: "700" }]}>
                      {o.label}
                    </Text>
                    {isSel ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickerOpen(null)}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}>Chiudi</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: any, fs: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: c.text, fontSize: Math.max(20, fs * 0.6), fontWeight: "700", marginLeft: 8 },
  pageIndicator: { color: c.textSecondary, fontSize: Math.max(16, fs * 0.5), fontWeight: "600" },

  selectorBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 8,
  },
  selectorBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
  selectorLabel: { color: c.textSecondary, fontSize: 12, marginBottom: 2 },
  selectorValue: { color: c.primary, fontSize: 15, fontWeight: "600" },

  pageContainer: { flex: 1, position: "relative" },
  pageContent: { padding: 24, paddingBottom: 60 },

  tapZoneRow: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: "row",
  },
  tapZone: { height: "100%", justifyContent: "center", paddingHorizontal: 8 },
  tapHint: { opacity: 0.25 },

  footer: { padding: 8, alignItems: "center", borderTopWidth: 1, borderTopColor: c.border },
  footerHint: { color: c.textSecondary, fontSize: 13 },

  // Tipi blocco
  title: { color: c.primary, fontSize: Math.max(22, fs * 0.7), fontWeight: "700", marginBottom: 14, marginTop: 4 },
  rubric: { color: "#cc3333", fontSize: Math.max(13, fs * 0.4), fontStyle: "italic", marginVertical: 4, lineHeight: Math.max(18, fs * 0.55) },
  rubricSection: { color: "#cc3333", fontSize: Math.max(13, fs * 0.4), fontStyle: "italic", marginVertical: 6, fontWeight: "600" },
  text: { color: c.text, fontSize: fs, lineHeight: fs * 1.4, marginVertical: 8 },
  consacrazione: { color: c.text, fontSize: fs, lineHeight: fs * 1.4, fontWeight: "700", marginVertical: 12 },
  acclamazione: { color: c.primary, fontSize: fs, lineHeight: fs * 1.4, fontStyle: "italic", marginVertical: 10 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: c.border },
  modalTitle: { color: c.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
  modalOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  modalOptionActive: { backgroundColor: c.background },
  modalOptionText: { color: c.text, fontSize: 18, flex: 1 },
  modalClose: { alignItems: "center", paddingVertical: 14, marginTop: 8, borderTopWidth: 1, borderTopColor: c.border },
});
