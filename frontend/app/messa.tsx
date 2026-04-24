import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, Liturgy, Preface, EucharisticPrayer } from "../src/api";

export default function MessaScreen() {
  const router = useRouter();
  const { colors, fontSize, scaledFont } = useSettings();
  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [fixedParts, setFixedParts] = useState<Record<string, any> | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [loading, setLoading] = useState(true);

  // user selections
  const [penitentialForm, setPenitentialForm] = useState<"A" | "B" | "C">("A");
  const [selectedPrefaceId, setSelectedPrefaceId] = useState<string>("");
  const [selectedPrayerId, setSelectedPrayerId] = useState<string>("pe2");
  const [selectedCredoId, setSelectedCredoId] = useState<"niceno" | "apostolico">("niceno");

  const [showPrefaces, setShowPrefaces] = useState(false);
  const [showPrayers, setShowPrayers] = useState(false);
  const [congedoId, setCongedoId] = useState("A");
  const [benedizioneId, setBenedizioneId] = useState("A");

  const styles = makeStyles(colors, fontSize);

  useEffect(() => {
    (async () => {
      try {
        const [lit, parts, pr, pe] = await Promise.all([
          api.liturgyToday(),
          api.fixedParts(),
          api.prefaces(),
          api.eucharisticPrayers(),
        ]);
        setLiturgy(lit);
        setFixedParts(parts.parts);
        setPrefaces(pr.prefaces);
        setPrayers(pe.prayers);
        // pre-select a preface matching the season
        const seasonName = (lit?.season?.season || "").toLowerCase();
        const seasonKey = seasonName.includes("avvento") ? "avvento"
          : seasonName.includes("natale") ? "natale"
          : seasonName.includes("quaresima") ? "quaresima"
          : seasonName.includes("pasqua") ? "pasqua"
          : "ordinario";
        const match = pr.prefaces.find(p => p.season === seasonKey) || pr.prefaces[0];
        if (match) setSelectedPrefaceId(match.id);
      } catch (e) {
        console.log("Errore:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !fixedParts) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const selectedPreface = prefaces.find(p => p.id === selectedPrefaceId);
  const selectedPrayer = prayers.find(p => p.id === selectedPrayerId);

  // Renderers
  const R = ({ children, kind = "normal" }: { children: React.ReactNode; kind?: "normal" | "rubric" | "celebrante" | "assemblea" | "title" | "subtitle" }) => {
    const s = kind === "rubric" ? styles.rubric
      : kind === "celebrante" ? styles.celebrante
      : kind === "assemblea" ? styles.assemblea
      : kind === "title" ? styles.sectionTitle
      : kind === "subtitle" ? styles.subtitle
      : styles.text;
    return <Text style={s} selectable>{children}</Text>;
  };

  const renderSection = (section: any, idx: number) => {
    if (section.type === "rubric") {
      return <R key={idx} kind="rubric">{section.text}</R>;
    }
    if (section.type === "dialogue") {
      return (
        <View key={idx} style={styles.block}>
          <R kind="celebrante">C. {section.celebrante}</R>
          <R kind="assemblea">A. {section.assemblea}</R>
        </View>
      );
    }
    if (section.type === "monologue") {
      return <R key={idx} kind="celebrante">{section.celebrante}</R>;
    }
    if (section.type === "prayer") {
      return (
        <View key={idx} style={styles.block}>
          {section.rubric && <R kind="rubric">{section.rubric}</R>}
          {section.celebrante && <R kind="celebrante">{section.celebrante}</R>}
          {section.text && <R>{section.text}</R>}
          {section.assemblea && <R kind="assemblea">A. {section.assemblea}</R>}
        </View>
      );
    }
    if (section.type === "kyrie") {
      return (
        <View key={idx} style={styles.block}>
          {section.rubric && <R kind="rubric">{section.rubric}</R>}
          {section.dialogue.map((d: any, i: number) => (
            <View key={i} style={styles.dialogBlock}>
              <R kind="celebrante">C. {d.c}</R>
              <R kind="assemblea">A. {d.a}</R>
            </View>
          ))}
        </View>
      );
    }
    return null;
  };

  // Special rendering for Atto Penitenziale choice
  const renderAttoPenitenziale = () => {
    const atto = fixedParts["atto_penitenziale"];
    const choice = atto.sections.find((s: any) => s.type === "choice");
    const selectedOpt = choice?.options.find((o: any) => o.id === penitentialForm);

    return (
      <View testID="section-atto-penitenziale">
        <R kind="title">Atto Penitenziale</R>
        {atto.sections.filter((s: any) => s.type !== "choice" && s.type !== "kyrie").map(renderSection)}

        <View style={styles.choiceRow}>
          {(["A", "B", "C"] as const).map(id => (
            <TouchableOpacity
              key={id}
              style={[styles.choiceBtn, penitentialForm === id && styles.choiceBtnActive]}
              onPress={() => setPenitentialForm(id)}
              testID={`btn-penitential-${id}`}
            >
              <Text style={[styles.choiceBtnText, penitentialForm === id && { color: "#FFFFFF" }]}>Formula {id}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedOpt && (
          <View style={styles.block}>
            <R kind="subtitle">{selectedOpt.label}</R>
            {selectedOpt.assemblea && <R kind="assemblea">A. {selectedOpt.assemblea}</R>}
            {selectedOpt.dialogue && selectedOpt.dialogue.map((d: any, i: number) => (
              <View key={i} style={styles.dialogBlock}>
                <R kind="celebrante">C. {d.c}</R>
                <R kind="assemblea">A. {d.a}</R>
              </View>
            ))}
            {selectedOpt.celebrante && <R kind="celebrante">C. {selectedOpt.celebrante}</R>}
            {selectedOpt.risposta && <R kind="assemblea">A. {selectedOpt.risposta}</R>}
          </View>
        )}

        {penitentialForm !== "C" && atto.sections.find((s: any) => s.type === "kyrie") &&
          renderSection(atto.sections.find((s: any) => s.type === "kyrie"), 99)}
      </View>
    );
  };

  const renderCredo = () => {
    const credo = fixedParts["credo"];
    const choice = credo.sections[0];
    const sel = choice.options.find((o: any) => o.id === selectedCredoId);
    return (
      <View testID="section-credo">
        <R kind="title">Professione di Fede (Credo)</R>
        <View style={styles.choiceRow}>
          {choice.options.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, selectedCredoId === o.id && styles.choiceBtnActive]}
              onPress={() => setSelectedCredoId(o.id)}
              testID={`btn-credo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, selectedCredoId === o.id && { color: "#FFFFFF" }]}>
                {o.id === "niceno" ? "Niceno" : "Apostolico"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {sel && <R>{sel.text}</R>}
      </View>
    );
  };

  // Riti di conclusione with choices
  const renderConclusione = () => {
    const rc = fixedParts["riti_conclusione"];
    const dialogue = rc.sections[0];
    const benedChoice = rc.sections[1];
    const congedoChoice = rc.sections[2];
    const bened = benedChoice.options.find((o: any) => o.id === benedizioneId);
    const congedo = congedoChoice.options.find((o: any) => o.id === congedoId);
    return (
      <View testID="section-conclusione">
        <R kind="title">Riti di Conclusione</R>
        {renderSection(dialogue, 0)}

        <R kind="subtitle">Benedizione</R>
        <View style={styles.choiceRow}>
          {benedChoice.options.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, benedizioneId === o.id && styles.choiceBtnActive]}
              onPress={() => setBenedizioneId(o.id)}
              testID={`btn-bened-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, benedizioneId === o.id && { color: "#FFFFFF" }]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {bened && (
          <View style={styles.block}>
            <R kind="celebrante">C. {bened.celebrante}</R>
            <R kind="assemblea">A. {bened.assemblea}</R>
          </View>
        )}

        <R kind="subtitle">Congedo</R>
        <View style={styles.choiceRow}>
          {congedoChoice.options.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, congedoId === o.id && styles.choiceBtnActive]}
              onPress={() => setCongedoId(o.id)}
              testID={`btn-congedo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, congedoId === o.id && { color: "#FFFFFF" }]}>{o.id}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {congedo && (
          <View style={styles.block}>
            <R kind="celebrante">C. {congedo.celebrante}</R>
            <R kind="assemblea">A. {congedo.assemblea}</R>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} testID="mass-screen">
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="btn-back"
          accessibilityLabel="Torna alla home"
        >
          <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Santa Messa</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.push("/impostazioni")}
          testID="btn-settings-mass"
          accessibilityLabel="Impostazioni"
        >
          <Ionicons name="settings-outline" size={scaledFont(36)} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} testID="mass-scroll">
        {/* Header del giorno */}
        <View style={[styles.dayHeader, { borderColor: liturgy?.season?.color_hex || colors.border }]}>
          <Text style={styles.dayDate} testID="mass-date">{liturgy?.date_label}</Text>
          {liturgy?.title ? <Text style={styles.dayTitle}>{liturgy.title}</Text> : null}
          <Text style={styles.daySeason}>{liturgy?.season?.season} · Colore liturgico: {liturgy?.liturgical_color || liturgy?.season?.color}</Text>
        </View>

        {/* 1. Riti Iniziali */}
        <View style={styles.partBox} testID="part-riti-iniziali">
          <R kind="title">Riti di Introduzione</R>
          {fixedParts["riti_iniziali"].sections.map(renderSection)}
        </View>

        {/* 2. Atto Penitenziale */}
        <View style={styles.partBox}>
          {renderAttoPenitenziale()}
        </View>

        {/* 3. Gloria */}
        <View style={styles.partBox} testID="part-gloria">
          <R kind="title">Gloria</R>
          {fixedParts["gloria"].sections.map(renderSection)}
        </View>

        {/* 4. Liturgia della Parola - letture */}
        <View style={styles.partBox} testID="part-letture">
          <R kind="title">Liturgia della Parola</R>
          {liturgy?.readings && liturgy.readings.length > 0 ? (
            liturgy.readings.map((r, i) => (
              <View key={i} style={styles.readingBlock}>
                <R kind="subtitle">{r.title}</R>
                {r.reference ? <R kind="rubric">{r.reference}</R> : null}
                <R>{r.text || "(Testo non disponibile)"}</R>
              </View>
            ))
          ) : (
            <R kind="rubric">Letture non disponibili. Verifica connessione internet.</R>
          )}
        </View>

        {/* 5. Credo */}
        <View style={styles.partBox}>
          {renderCredo()}
        </View>

        {/* 6. Offertorio */}
        <View style={styles.partBox} testID="part-offertorio">
          <R kind="title">Liturgia Eucaristica – Presentazione dei doni</R>
          {fixedParts["offertorio"].sections.map(renderSection)}
        </View>

        {/* 7. Prefazio - scelta */}
        <View style={styles.partBox} testID="part-prefazio">
          <R kind="title">Prefazio</R>
          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => setShowPrefaces(true)}
            testID="btn-select-preface"
          >
            <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
            <Text style={styles.selectorBtnText}>Scegli Prefazio</Text>
          </TouchableOpacity>
          {selectedPreface && (
            <View style={styles.block}>
              <R kind="subtitle">{selectedPreface.title}</R>
              <R>{selectedPreface.text}</R>
              <View style={styles.block}>
                <R>Santo, Santo, Santo il Signore Dio dell'universo.{"\n"}I cieli e la terra sono pieni della tua gloria.{"\n"}Osanna nell'alto dei cieli.{"\n"}Benedetto colui che viene nel nome del Signore.{"\n"}Osanna nell'alto dei cieli.</R>
              </View>
            </View>
          )}
        </View>

        {/* 8. Preghiera Eucaristica */}
        <View style={styles.partBox} testID="part-preghiera-eucaristica">
          <R kind="title">Preghiera Eucaristica</R>
          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => setShowPrayers(true)}
            testID="btn-select-prayer"
          >
            <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
            <Text style={styles.selectorBtnText}>Scegli Preghiera Eucaristica</Text>
          </TouchableOpacity>
          {selectedPrayer && (
            <View style={styles.block}>
              <R kind="subtitle">{selectedPrayer.title}</R>
              <R kind="rubric">{selectedPrayer.description}</R>
              <R>{selectedPrayer.text}</R>
            </View>
          )}
        </View>

        {/* 9. Padre Nostro */}
        <View style={styles.partBox} testID="part-padre-nostro">
          <R kind="title">Riti di Comunione</R>
          {fixedParts["padre_nostro"].sections.map(renderSection)}
        </View>

        {/* 10. Comunione */}
        <View style={styles.partBox} testID="part-comunione">
          {fixedParts["comunione"].sections.map((s: any, i: number) => {
            if (i === 0 && s.type === "rubric") return <View key="title"><R kind="title">Frazione del Pane e Comunione</R>{renderSection(s, i)}</View>;
            return renderSection(s, i);
          })}
        </View>

        {/* 11. Riti di Conclusione */}
        <View style={styles.partBox}>
          {renderConclusione()}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Modal Prefazi */}
      <Modal visible={showPrefaces} animationType="slide" onRequestClose={() => setShowPrefaces(false)}>
        <SafeAreaView style={styles.container} testID="modal-prefaces">
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowPrefaces(false)} testID="btn-close-prefaces">
              <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>Chiudi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Scegli Prefazio</Text>
            <View style={{ width: 100 }} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {prefaces.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.listItem, selectedPrefaceId === p.id && styles.listItemActive]}
                onPress={() => { setSelectedPrefaceId(p.id); setShowPrefaces(false); }}
                testID={`preface-item-${p.id}`}
              >
                <Text style={styles.listItemText}>{p.title}</Text>
                <Text style={styles.listItemSub}>Tempo: {p.season}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal Preghiere Eucaristiche */}
      <Modal visible={showPrayers} animationType="slide" onRequestClose={() => setShowPrayers(false)}>
        <SafeAreaView style={styles.container} testID="modal-prayers">
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowPrayers(false)} testID="btn-close-prayers">
              <Ionicons name="close" size={scaledFont(36)} color={colors.textPrimary} />
              <Text style={styles.backBtnText}>Chiudi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Preghiere Eucaristiche</Text>
            <View style={{ width: 100 }} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {prayers.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.listItem, selectedPrayerId === p.id && styles.listItemActive]}
                onPress={() => { setSelectedPrayerId(p.id); setShowPrayers(false); }}
                testID={`prayer-item-${p.id}`}
              >
                <Text style={styles.listItemText}>{p.title}</Text>
                <Text style={styles.listItemSub}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    minWidth: 100,
  },
  backBtnText: { fontSize: Math.round(fontSize * 0.65), color: colors.textPrimary, fontWeight: "600" },
  title: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  content: { padding: 20, paddingBottom: 40 },
  dayHeader: {
    padding: 20,
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 24,
  },
  dayDate: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  dayTitle: { fontSize: Math.round(fontSize * 0.8), color: colors.textPrimary, fontStyle: "italic", marginTop: 8 },
  daySeason: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 6 },
  partBox: {
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: Math.round(fontSize * 1.1),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 14,
    marginTop: 8,
  },
  subtitle: {
    fontSize: Math.round(fontSize * 0.85),
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  text: {
    fontSize: fontSize,
    lineHeight: fontSize * 1.55,
    color: colors.textPrimary,
    marginVertical: 8,
  },
  rubric: {
    fontSize: Math.round(fontSize * 0.75),
    fontStyle: "italic",
    color: colors.rubrics,
    marginVertical: 8,
    lineHeight: fontSize * 1.3,
  },
  celebrante: {
    fontSize: fontSize,
    color: colors.textPrimary,
    marginVertical: 6,
    lineHeight: fontSize * 1.5,
  },
  assemblea: {
    fontSize: fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
    marginVertical: 6,
    lineHeight: fontSize * 1.5,
  },
  block: { marginVertical: 10 },
  dialogBlock: { marginVertical: 6 },
  readingBlock: { marginVertical: 14 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 14 },
  choiceBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 64,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  choiceBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceBtnText: { fontSize: Math.round(fontSize * 0.7), color: colors.textPrimary, fontWeight: "700" },
  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 10,
    marginVertical: 10,
    minHeight: 64,
  },
  selectorBtnText: { fontSize: Math.round(fontSize * 0.75), color: colors.primary, fontWeight: "700" },
  listItem: {
    padding: 22,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: 12,
    minHeight: 90,
  },
  listItemActive: { borderColor: colors.primary, borderWidth: 4 },
  listItemText: { fontSize: Math.round(fontSize * 0.8), color: colors.textPrimary, fontWeight: "700" },
  listItemSub: { fontSize: Math.round(fontSize * 0.6), color: colors.textSecondary, marginTop: 6 },
});
