import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Preface } from "../api";
import { getSuggestedPrefaces } from "../prefaceUtils";
import { FontFamilyId, resolveBodyFont, ResolvedAppFont } from "../fontFamily";

interface Props {
  visible: boolean;
  onClose: () => void;
  prefaces: Preface[];
  selectedId: string;
  onSelect: (id: string) => void;
  currentSeasonKey: string;
  colors: any;
  scaledFont: (base: number) => number;
  fontFamilyId: FontFamilyId;
  isBold: boolean;
  expandedSeason: string | null;
  setExpandedSeason: (key: string | null) => void;
}

export const PrefaceSelectorModal: React.FC<Props> = ({
  visible,
  onClose,
  prefaces,
  selectedId,
  onSelect,
  currentSeasonKey,
  colors,
  scaledFont,
  fontFamilyId,
  isBold,
  expandedSeason,
  setExpandedSeason,
}) => {
  const [search, setSearch] = useState("");
  const bodyFont = resolveBodyFont(fontFamilyId, isBold);
  const styles = makeStyles(colors, scaledFont, bodyFont);

  const query = search.toLowerCase().trim();
  const isSearching = query.length >= 2;

  const categories = [
    { key: 'suggeriti', label: '⭐ Suggeriti per oggi' },
    { key: 'avvento', label: '🕒 Tempo di Avvento' },
    { key: 'natale', label: '🕒 Tempo di Natale ed Epifania' },
    { key: 'quaresima', label: '🕒 Tempo di Quaresima' },
    { key: 'passione', label: '🕒 Passione e Settimana Santa' },
    { key: 'pasqua', label: '🕒 Pasqua, Ascensione e Pentecoste' },
    { key: 'ordinario', label: '🕒 Tempo Ordinario (I–X)' },
    { key: 'comune', label: '⛪ Prefazi comuni (I–IX)' },
    { key: 'misteri', label: '✝️ Misteri del Signore e pericopi' },
    { key: 'eucaristia', label: '🍞 Santissima Eucaristia' },
    { key: 'sacramenti', label: '⛪ Sacramenti e riti' },
    { key: 'bvm', label: '😇 Beata Vergine Maria e San Giuseppe' },
    { key: 'santi', label: '😇 Santi e Angeli' },
    { key: 'defunti', label: '✟ Per i Defunti' },
  ];

  const sortPrefaces = (items: Preface[], categoryKey: string) => {
    if (categoryKey === 'pasqua' || categoryKey === 'ordinario') {
      return [...items].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    }
    return items;
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    setSearch("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
            <Text style={styles.backBtnText}>Chiudi</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Scegli Prefazio (2020)</Text>
          <View style={{ width: 100 }} />
        </View>

        <View style={styles.searchBox}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={24} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca per titolo o parola chiave..."
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {isSearching ? (
            (() => {
              const results = prefaces.filter(p =>
                p.title.toLowerCase().includes(query) ||
                p.text.toLowerCase().includes(query)
              );

              if (results.length === 0) {
                return <Text style={styles.empty}>Nessun prefazio trovato per "{search}"</Text>;
              }

              return (
                <View style={styles.resultsList}>
                  {results.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.listItem, selectedId === p.id && styles.listItemActive]}
                      onPress={() => handleSelect(p.id)}
                    >
                      <Text style={[styles.listItemText, selectedId === p.id && styles.listItemTextActive]}>{p.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()
          ) : (
            categories.map(cat => {
              let filtered = [];
              if (cat.key === 'suggeriti') {
                filtered = getSuggestedPrefaces(prefaces, currentSeasonKey);
                if (filtered.length === 0) return null;
              } else {
                filtered = prefaces.filter(p => (p.season === cat.key || p.category === cat.key));
              }

              if (filtered.length === 0) return null;

              const isExpanded = expandedSeason === cat.key;
              const sorted = sortPrefaces(filtered, cat.key);

              return (
                <View key={cat.key} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.sectionHeader, isExpanded && styles.sectionHeaderExpanded]}
                    onPress={() => setExpandedSeason(isExpanded ? null : cat.key)}
                  >
                    <Text style={styles.sectionTitle}>{cat.label}</Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={24}
                      color={colors.textPrimary}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.expandedList}>
                      {sorted.map(p => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.listItem, selectedId === p.id && styles.listItemActive]}
                          onPress={() => handleSelect(p.id)}
                        >
                          <Text style={[styles.listItemText, selectedId === p.id && styles.listItemTextActive]}>{p.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const makeStyles = (colors: any, scaledFont: any, bodyFont: ResolvedAppFont) => StyleSheet.create({
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
  backBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtnText: { fontSize: scaledFont(22), color: colors.textPrimary, fontWeight: "600" },
  title: { fontSize: scaledFont(28), fontWeight: "700", color: colors.textPrimary },
  searchBox: { paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: scaledFont(20),
    color: colors.textPrimary,
    fontFamily: bodyFont.fontFamily,
    fontWeight: bodyFont.fontWeight,
  },
  content: { padding: 20 },
  resultsList: { backgroundColor: colors.bgSecondary, borderRadius: 12, overflow: 'hidden' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: scaledFont(20), color: colors.textSecondary, fontStyle: 'italic' },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
  },
  sectionHeaderExpanded: { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sectionTitle: { fontSize: scaledFont(22), fontWeight: "700", color: colors.textPrimary },
  expandedList: { backgroundColor: colors.bgSecondary, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' },
  listItem: { padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  listItemActive: { backgroundColor: colors.primary + "20", borderLeftWidth: 4, borderLeftColor: colors.accentPe },
  listItemText: { fontSize: scaledFont(20), color: colors.textPrimary },
  listItemTextActive: { color: colors.accentPe, fontWeight: "700" },
});
