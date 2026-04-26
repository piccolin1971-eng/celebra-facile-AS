import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Switch, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "../src/SettingsContext";
import { api, Liturgy, Preface, EucharisticPrayer, MysteryAcclamation, SolemnBlessing } from "../src/api";

type ReadingType =
  | "antifona_ingresso" | "colletta"
  | "prima_lettura" | "salmo" | "seconda_lettura" | "sequenza" | "acclamazione" | "vangelo"
  | "sulle_offerte" | "antifona_comunione" | "dopo_comunione";

export default function MessaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; preface?: string; votive?: string }>();
  const { colors, fontSize, scaledFont, readingMode } = useSettings();
  const [liturgy, setLiturgy] = useState<Liturgy | null>(null);
  const [fixedParts, setFixedParts] = useState<Record<string, any> | null>(null);
  const [prefaces, setPrefaces] = useState<Preface[]>([]);
  const [prayers, setPrayers] = useState<EucharisticPrayer[]>([]);
  const [acclamations, setAcclamations] = useState<MysteryAcclamation[]>([]);
  const [solemnBlessings, setSolemnBlessings] = useState<SolemnBlessing[]>([]);
  const [pasquaDismissal, setPasquaDismissal] = useState<any>(null);
  const [currentSeasonKey, setCurrentSeasonKey] = useState<string>("ordinario");
  const [loading, setLoading] = useState(true);

  // selezioni utente
  const [penitentialForm, setPenitentialForm] = useState<"A" | "B" | "C">("A");
  const [penitentialSeason, setPenitentialSeason] = useState<string>("ordinario");
  const [selectedPrefaceId, setSelectedPrefaceId] = useState<string>("");
  const [selectedPrayerId, setSelectedPrayerId] = useState<string>("pe2");
  const [selectedCredoId, setSelectedCredoId] = useState<"niceno" | "apostolico">("niceno");
  const [orateFratresId, setOrateFratresId] = useState<string>("A");
  const [padreNostroIntroId, setPadreNostroIntroId] = useState<string>("A");
  const [acclamationId, setAcclamationId] = useState<string>("A");
  const [useSolemnBlessing, setUseSolemnBlessing] = useState<boolean>(false);
  const [solemnBlessingId, setSolemnBlessingId] = useState<string>("");
  const [showGloria, setShowGloria] = useState<boolean>(true);
  const [showCredo, setShowCredo] = useState<boolean>(true);
  const [congedoId, setCongedoId] = useState("A");
  const [benedizioneId, setBenedizioneId] = useState("A");

  const [showPrefaces, setShowPrefaces] = useState(false);
  const [showPrayers, setShowPrayers] = useState(false);

  // Paginazione: tap-to-advance per facilitare la celebrazione
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = React.useRef<ScrollView | null>(null);

  const styles = makeStyles(colors, fontSize);

  useEffect(() => {
    (async () => {
      try {
        const dateParam = typeof params.date === "string" ? params.date : undefined;
        const [lit, parts, pr, pe, acc, bless] = await Promise.all([
          dateParam ? api.liturgyForDate(dateParam) : api.liturgyToday(),
          api.fixedParts(),
          api.prefaces(),
          api.eucharisticPrayers(),
          api.mysteryAcclamations(),
          api.solemnBlessings(),
        ]);
        setLiturgy(lit);
        setFixedParts(parts.parts);
        setPrefaces(pr.prefaces);
        setPrayers(pe.prayers);
        setAcclamations(acc.acclamations);
        setSolemnBlessings(bless.blessings);
        setPasquaDismissal(bless.pasqua_dismissal);
        const seasonName = (lit?.season?.season || "").toLowerCase();
        const seasonKey = seasonName.includes("avvento") ? "avvento"
          : seasonName.includes("natale") ? "natale"
          : seasonName.includes("quaresima") ? "quaresima"
          : seasonName.includes("pasqua") ? "pasqua"
          : "ordinario";
        setCurrentSeasonKey(seasonKey);
        const match = pr.prefaces.find(p => p.season === seasonKey) || pr.prefaces[0];
        if (match) setSelectedPrefaceId(match.id);
        // Override prefazio se passato esplicitamente (es. messa votiva)
        const prefaceParam = typeof params.preface === "string" ? params.preface : "";
        if (prefaceParam) {
          const forced = pr.prefaces.find(p => p.id === prefaceParam);
          if (forced) setSelectedPrefaceId(forced.id);
        }
        setPenitentialSeason(seasonKey);
        if (seasonKey === "avvento" || seasonKey === "quaresima") setShowGloria(false);
        // Benedizione solenne: preseleziona quella della stagione se disponibile
        const seasBless = bless.blessings.find(b => b.id === seasonKey) || bless.blessings.find(b => b.season === seasonKey);
        if (seasBless) setSolemnBlessingId(seasBless.id);
        // Congedo di Pasqua automatico
        if (seasonKey === "pasqua") setCongedoId("pasqua_alleluia");
      } catch (e) {
        console.log("Errore:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.date, params.preface]);

  if (loading || !fixedParts) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const selectedPreface = prefaces.find(p => p.id === selectedPrefaceId);
  const selectedPrayer = prayers.find(p => p.id === selectedPrayerId);
  const getReading = (type: ReadingType) => liturgy?.readings?.find(r => r.type === type);

  // Basic text renderers
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
    if (section.type === "rubric") return <R key={idx} kind="rubric">{section.text}</R>;
    if (section.type === "dialogue") {
      return (
        <View key={idx} style={styles.block}>
          <R kind="celebrante">C. {section.celebrante}</R>
          <R kind="assemblea">A. {section.assemblea}</R>
        </View>
      );
    }
    if (section.type === "monologue") return <R key={idx} kind="celebrante">{section.celebrante}</R>;
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

  // === Reading renderer (daily) ===
  const renderReading = (type: ReadingType, titleOverride?: string) => {
    const r = getReading(type);
    if (!r || !r.text) return null;
    return (
      <View style={styles.readingBlock} testID={`reading-${type}`}>
        <R kind="subtitle">{titleOverride || r.title}</R>
        {r.reference ? <R kind="rubric">{r.reference}</R> : null}
        <R>{r.text}</R>
      </View>
    );
  };

  // === Atto Penitenziale ===
  const renderAttoPenitenziale = () => {
    const atto = fixedParts["atto_penitenziale"];
    const choice = atto.sections.find((s: any) => s.type === "choice");
    const selectedOpt = choice?.options.find((o: any) => o.id === penitentialForm);
    const seasonVariant = selectedOpt?.season_variants?.[penitentialSeason];

    return (
      <View testID="section-atto-penitenziale">
        <R kind="title">Atto Penitenziale</R>
        {atto.sections.filter((s: any) => s.type !== "choice" && s.type !== "kyrie").map(renderSection)}

        <R kind="subtitle">Scegli formula</R>
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

        {/* Formula C: sub-selettore tempo liturgico */}
        {selectedOpt?.season_variants && (
          <View>
            <R kind="subtitle">Tempo liturgico (tropari)</R>
            <View style={styles.choiceRow}>
              {Object.entries(selectedOpt.season_variants).map(([key, v]: [string, any]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.choiceBtn, penitentialSeason === key && styles.choiceBtnActive]}
                  onPress={() => setPenitentialSeason(key)}
                  testID={`btn-pen-season-${key}`}
                >
                  <Text style={[styles.choiceBtnText, penitentialSeason === key && { color: "#FFFFFF" }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

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
            {seasonVariant?.dialogue && seasonVariant.dialogue.map((d: any, i: number) => (
              <View key={`sv-${i}`} style={styles.dialogBlock}>
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

  // === Credo ===
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

  // === Offertorio ===
  const renderOffertorio = () => {
    const off = fixedParts["offertorio"];
    const orateChoice = off.sections.find((s: any) => s.type === "choice_orate");
    const selectedOrate = orateChoice?.options.find((o: any) => o.id === orateFratresId);
    return (
      <View testID="part-offertorio">
        <R kind="title">Liturgia Eucaristica – Presentazione dei doni</R>
        {off.sections
          .filter((s: any) => s.type !== "choice_orate" && s.type !== "rubric")
          .map(renderSection)}

        {orateChoice && (
          <View style={styles.block}>
            <R kind="subtitle">Invito e risposta</R>
            <View style={styles.choiceRow}>
              {orateChoice.options.map((o: any) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.choiceBtn, orateFratresId === o.id && styles.choiceBtnActive]}
                  onPress={() => setOrateFratresId(o.id)}
                  testID={`btn-orate-${o.id}`}
                >
                  <Text style={[styles.choiceBtnText, orateFratresId === o.id && { color: "#FFFFFF" }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedOrate && (
              <View style={styles.block}>
                <R kind="celebrante">C. {selectedOrate.celebrante}</R>
                <R kind="assemblea">A. {selectedOrate.assemblea}</R>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // === Padre Nostro (con 4 introduzioni) ===
  const renderPadreNostro = () => {
    const pn = fixedParts["padre_nostro"];
    const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
    const selectedIntro = introChoice?.options.find((o: any) => o.id === padreNostroIntroId);
    return (
      <View testID="part-padre-nostro">
        <R kind="title">Riti di Comunione</R>

        {introChoice && (
          <View style={styles.block}>
            <R kind="subtitle">Monizione d'introduzione</R>
            <View style={styles.choiceRow}>
              {introChoice.options.map((o: any) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.choiceBtn, padreNostroIntroId === o.id && styles.choiceBtnActive]}
                  onPress={() => setPadreNostroIntroId(o.id)}
                  testID={`btn-pn-intro-${o.id}`}
                >
                  <Text style={[styles.choiceBtnText, padreNostroIntroId === o.id && { color: "#FFFFFF" }]}>Forma {o.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedIntro && <R kind="celebrante">C. {selectedIntro.text}</R>}
          </View>
        )}

        {pn.sections.filter((s: any) => s.type !== "choice_intro").map(renderSection)}
      </View>
    );
  };

  // === Riti di Conclusione ===
  const renderConclusione = () => {
    const rc = fixedParts["riti_conclusione"];
    const dialogue = rc.sections[0];
    const benedChoice = rc.sections[1];
    const congedoChoice = rc.sections[2];
    const bened = benedChoice.options.find((o: any) => o.id === benedizioneId);
    const congedo = congedoChoice.options.find((o: any) => o.id === congedoId);
    // Lista congedi: i 4 standard + eventualmente quello pasquale
    const congedoOptions = [...congedoChoice.options];
    if (pasquaDismissal && currentSeasonKey === "pasqua") {
      congedoOptions.push({
        id: pasquaDismissal.id,
        label: "Pasqua",
        celebrante: pasquaDismissal.celebrante,
        assemblea: pasquaDismissal.assemblea,
      });
    }
    const selectedCongedo = congedoOptions.find((o: any) => o.id === congedoId) || congedo;
    const selectedSolemn = solemnBlessings.find(b => b.id === solemnBlessingId);

    return (
      <View testID="section-conclusione">
        <R kind="title">Riti di Conclusione</R>
        {renderSection(dialogue, 0)}

        {/* Toggle benedizione solenne */}
        {solemnBlessings.length > 0 && (
          <View style={[styles.block, styles.solemnToggle]} testID="solemn-toggle">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Usa benedizione solenne</Text>
              <Switch
                value={useSolemnBlessing}
                onValueChange={setUseSolemnBlessing}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }}
                testID="switch-solemn-blessing"
              />
            </View>
          </View>
        )}

        {useSolemnBlessing ? (
          <View testID="section-solemn-blessing">
            <R kind="subtitle">Benedizione Solenne</R>
            <View style={styles.choiceRow}>
              {solemnBlessings.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.choiceBtn, solemnBlessingId === b.id && styles.choiceBtnActive]}
                  onPress={() => setSolemnBlessingId(b.id)}
                  testID={`btn-solemn-${b.id}`}
                >
                  <Text style={[styles.choiceBtnText, solemnBlessingId === b.id && { color: "#FFFFFF" }]}>
                    {b.id.charAt(0).toUpperCase() + b.id.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedSolemn && (
              <View style={styles.block}>
                <R kind="subtitle">{selectedSolemn.title}</R>
                {selectedSolemn.rubric && <R kind="rubric">{selectedSolemn.rubric}</R>}
                {selectedSolemn.invocations.map((inv, i) => (
                  <View key={i} style={styles.dialogBlock}>
                    <R kind="celebrante">C. {inv.c}</R>
                    <R kind="assemblea">A. {inv.a}</R>
                  </View>
                ))}
                <View style={styles.dialogBlock}>
                  <R kind="celebrante">C. {selectedSolemn.final.c}</R>
                  <R kind="assemblea">A. {selectedSolemn.final.a}</R>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View>
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
          </View>
        )}

        <R kind="subtitle">Congedo</R>
        <View style={styles.choiceRow}>
          {congedoOptions.map((o: any) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.choiceBtn, congedoId === o.id && styles.choiceBtnActive]}
              onPress={() => setCongedoId(o.id)}
              testID={`btn-congedo-${o.id}`}
            >
              <Text style={[styles.choiceBtnText, congedoId === o.id && { color: "#FFFFFF" }]}>
                {o.label || o.id}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedCongedo && (
          <View style={styles.block}>
            <R kind="celebrante">C. {selectedCongedo.celebrante}</R>
            <R kind="assemblea">A. {selectedCongedo.assemblea}</R>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} testID="mass-screen">
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="btn-back">
          <Ionicons name="arrow-back" size={scaledFont(36)} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Santa Messa</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/impostazioni")} testID="btn-settings-mass">
          <Ionicons name="settings-outline" size={scaledFont(36)} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Definizione delle pagine della messa */}
      {(() => {
        // Costruisce dinamicamente le pagine in base ai toggle
        const pages: { key: string; title: string; render: () => React.ReactNode; disableTapAdvance?: boolean }[] = [];

        // PAGINA 0: Frontespizio
        pages.push({
          key: "intro",
          title: "Inizio",
          disableTapAdvance: true, // Evita avanzamento accidentale mentre si toccano i toggle Gloria/Credo
          render: () => (
            <View style={styles.partBox}>
              <View style={[styles.dayHeader, { borderColor: liturgy?.season?.color_hex || colors.border }]}>
                <Text style={styles.dayDate} testID="mass-date">{liturgy?.date_label}</Text>
                {liturgy?.title ? <Text style={styles.dayTitle}>{liturgy.title}</Text> : null}
                <Text style={styles.daySeason}>{liturgy?.season?.season} · Colore liturgico: {liturgy?.liturgical_color || liturgy?.season?.color}</Text>
              </View>
              <View style={styles.togglesBox}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Mostra Gloria</Text>
                  <Switch value={showGloria} onValueChange={setShowGloria} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Mostra Credo</Text>
                  <Switch value={showCredo} onValueChange={setShowCredo} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }], marginLeft: 16 }} />
                </View>
              </View>
              <Text style={[styles.toggleLabel, { textAlign: "center", marginTop: 16, fontStyle: "italic" }]}>
                Premi «Avanti» in basso per iniziare la celebrazione
              </Text>
            </View>
          ),
        });

        // PAGINA: Riti di Introduzione + Colletta combinati (Colletta chiude i riti iniziali)
        pages.push({
          key: "riti-iniziali",
          title: "Riti di Introduzione",
          render: () => (
            <View style={styles.partBox}>
              {renderReading("antifona_ingresso", "Antifona d'ingresso")}
              <R kind="title">Riti di Introduzione</R>
              {fixedParts["riti_iniziali"].sections.map(renderSection)}
            </View>
          ),
        });

        // PAGINA: Atto Penitenziale
        pages.push({
          key: "penitenziale",
          title: "Atto Penitenziale",
          render: () => <View style={styles.partBox}>{renderAttoPenitenziale()}</View>,
        });

        // PAGINA: Gloria
        if (showGloria) {
          pages.push({
            key: "gloria",
            title: "Gloria",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Gloria</R>
                {fixedParts["gloria"].sections.map(renderSection)}
              </View>
            ),
          });
        }

        // PAGINA: Colletta del giorno
        pages.push({
          key: "colletta",
          title: "Colletta",
          render: () => (
            <View style={styles.partBox}>
              {renderReading("colletta", "Colletta (Orazione del giorno)") || (
                <R kind="rubric">Colletta non disponibile per oggi.</R>
              )}
            </View>
          ),
        });

        // PAGINE: Liturgia della Parola (suddivisa in più schermate)
        const readings = liturgy?.readings || [];
        const hasReading = (type: string) => readings.some(r => r.type === type);

        if (hasReading("prima_lettura")) {
          pages.push({
            key: "prima-lettura",
            title: "Prima Lettura",
            render: () => <View style={styles.partBox}>{renderReading("prima_lettura")}</View>,
          });
        }
        if (hasReading("salmo")) {
          pages.push({
            key: "salmo",
            title: "Salmo Responsoriale",
            render: () => <View style={styles.partBox}>{renderReading("salmo")}</View>,
          });
        }
        if (hasReading("seconda_lettura")) {
          pages.push({
            key: "seconda-lettura",
            title: "Seconda Lettura",
            render: () => <View style={styles.partBox}>{renderReading("seconda_lettura")}</View>,
          });
        }
        if (hasReading("sequenza")) {
          pages.push({
            key: "sequenza",
            title: "Sequenza",
            render: () => <View style={styles.partBox}>{renderReading("sequenza")}</View>,
          });
        }
        // Acclamazione + Vangelo (insieme perché molto correlati)
        if (hasReading("vangelo") || hasReading("acclamazione")) {
          pages.push({
            key: "vangelo",
            title: "Acclamazione e Vangelo",
            render: () => (
              <View style={styles.partBox}>
                {renderReading("acclamazione")}
                {renderReading("vangelo")}
              </View>
            ),
          });
        }
        if (!hasReading("prima_lettura") && !hasReading("vangelo")) {
          pages.push({
            key: "letture-vuote",
            title: "Liturgia della Parola",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Liturgia della Parola</R>
                <R kind="rubric">Letture non disponibili. Verifica connessione internet.</R>
              </View>
            ),
          });
        }

        // PAGINA: Credo
        if (showCredo) {
          pages.push({
            key: "credo",
            title: "Professione di Fede",
            render: () => <View style={styles.partBox}>{renderCredo()}</View>,
          });
        }

        // PAGINA: Offertorio
        pages.push({
          key: "offertorio",
          title: "Presentazione dei Doni",
          render: () => (
            <View style={styles.partBox}>
              {renderOffertorio()}
              {renderReading("sulle_offerte", "Sulle offerte")}
            </View>
          ),
        });

        // PAGINA: Prefazio + Sanctus
        pages.push({
          key: "prefazio",
          title: "Prefazio",
          render: () => (
            <View style={styles.partBox} testID="part-prefazio">
              <R kind="title">Prefazio</R>
              <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrefaces(true)} testID="btn-select-preface">
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
          ),
        });

        // PAGINE: Preghiera Eucaristica (suddivisa: Consacrazione | Mistero della Fede + Dossologia)
        if (selectedPrayer) {
          const marker = "Mistero della fede.";
          const text = selectedPrayer.text;
          const idx = text.indexOf(marker);
          let beforePart = text;
          let afterPart = "";
          if (idx >= 0) {
            beforePart = text.substring(0, idx).trimEnd();
            const rest = text.substring(idx + marker.length);
            const nextBreak = rest.indexOf("\n\n");
            afterPart = nextBreak > 0 ? rest.substring(nextBreak + 2).trimStart() : rest.trimStart();
          }
          const selAcc = acclamations.find(x => x.id === acclamationId);

          // Pagina 1: Selettore + parte iniziale fino alla Consacrazione
          pages.push({
            key: "pe-1",
            title: "Preghiera Eucaristica – Consacrazione",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Preghiera Eucaristica</R>
                <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrayers(true)} testID="btn-select-prayer">
                  <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                  <Text style={styles.selectorBtnText}>Scegli Preghiera Eucaristica</Text>
                </TouchableOpacity>
                <View style={styles.block}>
                  <R kind="subtitle">{selectedPrayer.title}</R>
                  <R>{beforePart}</R>
                </View>
              </View>
            ),
          });

          // Pagina 2: Acclamazione Mistero della Fede + Anamnesi/Dossologia
          if (afterPart || acclamations.length > 0) {
            pages.push({
              key: "pe-2",
              title: "Mistero della Fede e Dossologia",
              render: () => (
                <View style={styles.partBox}>
                  <R kind="title">Acclamazione e Dossologia</R>
                  {acclamations.length > 0 && (
                    <View style={styles.acclamationBox}>
                      <R kind="subtitle">Mistero della fede</R>
                      <View style={styles.choiceRow}>
                        {acclamations.map(a => (
                          <TouchableOpacity key={a.id} style={[styles.choiceBtn, acclamationId === a.id && styles.choiceBtnActive]} onPress={() => setAcclamationId(a.id)} testID={`btn-acclamation-${a.id}`}>
                            <Text style={[styles.choiceBtnText, acclamationId === a.id && { color: "#FFFFFF" }]}>Forma {a.id}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {selAcc && (
                        <View style={styles.block}>
                          <R kind="celebrante">C. {selAcc.celebrante}</R>
                          <R kind="assemblea">A. {selAcc.assemblea}</R>
                        </View>
                      )}
                    </View>
                  )}
                  {afterPart ? <R>{afterPart}</R> : null}
                </View>
              ),
            });
          }
        } else {
          pages.push({
            key: "pe",
            title: "Preghiera Eucaristica",
            render: () => (
              <View style={styles.partBox}>
                <R kind="title">Preghiera Eucaristica</R>
                <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowPrayers(true)} testID="btn-select-prayer">
                  <Ionicons name="swap-horizontal" size={scaledFont(28)} color={colors.primary} />
                  <Text style={styles.selectorBtnText}>Scegli Preghiera Eucaristica</Text>
                </TouchableOpacity>
              </View>
            ),
          });
        }

        // PAGINA: Padre Nostro (solo Pater + monizione + embolismo)
        pages.push({
          key: "padre-nostro",
          title: "Padre Nostro",
          render: () => {
            const pn = fixedParts["padre_nostro"];
            const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
            const selectedIntro = introChoice?.options.find((o: any) => o.id === padreNostroIntroId);
            // Le prime 3 sezioni: monizione, Pater, embolismo. Saltiamo la rubrica iniziale "Il sacerdote..."
            const padreSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(0, 2); // Pater + embolismo
            return (
              <View testID="part-padre-nostro">
                <R kind="title">Padre Nostro</R>
                {introChoice && (
                  <View style={styles.block}>
                    <R kind="subtitle">Monizione d'introduzione</R>
                    <View style={styles.choiceRow}>
                      {introChoice.options.map((o: any) => (
                        <TouchableOpacity
                          key={o.id}
                          style={[styles.choiceBtn, padreNostroIntroId === o.id && styles.choiceBtnActive]}
                          onPress={() => setPadreNostroIntroId(o.id)}
                          testID={`btn-pn-intro-${o.id}`}
                        >
                          <Text style={[styles.choiceBtnText, padreNostroIntroId === o.id && { color: "#FFFFFF" }]}>Forma {o.id}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {selectedIntro && <R kind="celebrante">C. {selectedIntro.text}</R>}
                  </View>
                )}
                {padreSections.map(renderSection)}
              </View>
            );
          },
        });

        // PAGINA: Rito della Pace
        pages.push({
          key: "pace",
          title: "Rito della Pace",
          render: () => {
            const pn = fixedParts["padre_nostro"];
            // Sezioni 3, 4, 5: preghiera Signore Gesù Cristo + saluto pace + scambio
            const peaceSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(2);
            return (
              <View>
                <R kind="title">Rito della Pace</R>
                {peaceSections.map(renderSection)}
              </View>
            );
          },
        });

        // PAGINA: Frazione del Pane (Agnello di Dio)
        pages.push({
          key: "frazione",
          title: "Frazione del Pane",
          render: () => {
            const com = fixedParts["comunione"];
            // Prime 2 sezioni: rubrica frazione + Agnello di Dio
            return (
              <View testID="part-frazione">
                <R kind="title">Frazione del Pane</R>
                {com.sections.slice(0, 2).map(renderSection)}
              </View>
            );
          },
        });

        // PAGINA: Comunione (Beati invitati + antifona + rubrica)
        pages.push({
          key: "comunione",
          title: "Comunione",
          render: () => {
            const com = fixedParts["comunione"];
            return (
              <View testID="part-comunione">
                <R kind="title">Comunione</R>
                {com.sections.slice(2).map((s: any, i: number) => renderSection(s, i + 2))}
                {renderReading("antifona_comunione", "Antifona alla Comunione")}
              </View>
            );
          },
        });

        // PAGINA: Dopo la Comunione
        pages.push({
          key: "dopo-comunione",
          title: "Dopo la Comunione",
          render: () => <View style={styles.partBox}>{renderReading("dopo_comunione", "Dopo la Comunione")}</View>,
        });

        // PAGINA: Riti di Conclusione
        pages.push({
          key: "conclusione",
          title: "Riti di Conclusione",
          render: () => <View style={styles.partBox}>{renderConclusione()}</View>,
        });

        const total = pages.length;
        const safeIdx = Math.max(0, Math.min(currentPage, total - 1));
        const cur = pages[safeIdx];
        const prev = () => {
          const next = Math.max(0, safeIdx - 1);
          setCurrentPage(next);
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        };
        const advance = () => {
          const next = Math.min(total - 1, safeIdx + 1);
          setCurrentPage(next);
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        };

        // ===== MODALITÀ "scroll": tutta la messa in scorrimento continuo =====
        if (readingMode === "scroll") {
          return (
            <ScrollView contentContainerStyle={styles.content} testID="mass-scroll-continuous">
              {pages.map((p) => (
                <View key={p.key}>{p.render()}</View>
              ))}
              <View style={{ height: 80 }} />
            </ScrollView>
          );
        }

        // ===== MODALITÀ "tap": una pagina alla volta + tap-to-advance =====
        return (
          <>
            {/* Barra di stato pagina */}
            <View style={styles.pageStatusBar} testID="page-status-bar">
              <Text style={styles.pageStatusText} numberOfLines={1}>
                {safeIdx + 1}/{total} · {cur.title}
              </Text>
            </View>

            {/* Contenuto: ScrollView per testi lunghi, ma il tap su area vuota/contenuto avanza la pagina.
                Lo scroll si attiva solo se l'utente trascina (pan gesture), il tap singolo va avanti. */}
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
              testID="mass-scroll"
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {cur.disableTapAdvance ? (
                <View testID="page-no-tap">
                  {cur.render()}
                </View>
              ) : (
                <Pressable onPress={advance} testID="page-tap-area">
                  {cur.render()}
                </Pressable>
              )}
            </ScrollView>

            {/* Bottoni grandi di navigazione fissi */}
            <View style={styles.navBar} testID="nav-bar">
              <TouchableOpacity
                style={[styles.navBtn, safeIdx === 0 && styles.navBtnDisabled]}
                onPress={prev}
                disabled={safeIdx === 0}
                testID="btn-prev-page"
                accessibilityRole="button"
                accessibilityLabel="Pagina precedente"
              >
                <Ionicons name="chevron-back" size={scaledFont(40)} color={safeIdx === 0 ? colors.textSecondary : "#FFFFFF"} />
                <Text style={[styles.navBtnText, safeIdx === 0 && { color: colors.textSecondary }]}>Indietro</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnPrimary, safeIdx === total - 1 && styles.navBtnDisabled]}
                onPress={advance}
                disabled={safeIdx === total - 1}
                testID="btn-next-page"
                accessibilityRole="button"
                accessibilityLabel="Pagina successiva"
              >
                <Text style={[styles.navBtnText, { color: "#FFFFFF" }]}>Avanti</Text>
                <Ionicons name="chevron-forward" size={scaledFont(40)} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        );
      })()}

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
            {(() => {
              // Ordina prefazi: tempo corrente in cima, poi comune, poi gli altri
              const sorted = [...prefaces].sort((a, b) => {
                const rank = (p: Preface) => p.season === currentSeasonKey ? 0
                  : p.season === "comune" ? 1
                  : 2;
                const ra = rank(a), rb = rank(b);
                if (ra !== rb) return ra - rb;
                return 0;
              });
              return sorted.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.listItem, selectedPrefaceId === p.id && styles.listItemActive]}
                  onPress={() => { setSelectedPrefaceId(p.id); setShowPrefaces(false); }}
                  testID={`preface-item-${p.id}`}
                >
                  {p.season === currentSeasonKey && (
                    <Text style={styles.badgeSeasonal}>▸ TEMPO CORRENTE</Text>
                  )}
                  <Text style={styles.listItemText}>{p.title}</Text>
                  <Text style={styles.listItemSub}>Tempo: {p.season}</Text>
                </TouchableOpacity>
              ));
            })()}
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
    marginBottom: 16,
  },
  dayDate: { fontSize: Math.round(fontSize * 0.85), fontWeight: "700", color: colors.textPrimary },
  dayTitle: { fontSize: Math.round(fontSize * 0.8), color: colors.textPrimary, fontStyle: "italic", marginTop: 8 },
  daySeason: { fontSize: Math.round(fontSize * 0.65), color: colors.textSecondary, marginTop: 6 },
  togglesBox: {
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 24,
    gap: 14,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: Math.round(fontSize * 0.75), color: colors.textPrimary, fontWeight: "600" },
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
  pageStatusBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  pageStatusText: {
    fontSize: Math.round(fontSize * 0.7),
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  navBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  navBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: Math.round(fontSize * 0.8),
    fontWeight: "700",
    color: colors.textPrimary,
  },
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
  badgeSeasonal: { fontSize: Math.round(fontSize * 0.5), color: colors.primary, fontWeight: "800", marginBottom: 6, letterSpacing: 1 },
  solemnToggle: { borderWidth: 2, borderColor: colors.border, borderRadius: 10, padding: 16, backgroundColor: colors.surface },
  acclamationBox: {
    marginVertical: 18,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
});
