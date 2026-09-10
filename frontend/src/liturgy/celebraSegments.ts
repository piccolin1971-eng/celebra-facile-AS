import { PE1_RUBRIC_PREFIX } from "./peLineRendering";
import { italianDateLabelFromISO } from "../dateUtils";
import type {
  Liturgy,
  Preface,
  EucharisticPrayer,
  MysteryAcclamation,
  SolemnBlessing,
} from "../api";
import { getPrayerById } from "../orazionale";
import { splitFedeliTextIntoChunks, FEDELI_CHARS_PER_PAGE } from "../orazionaleChunking";
import { pushPrefaceDialogues } from "./prefaceIntro";
import peFullData from "../data/eucharisticPrayersFull.json";
import { buildPeTextEngineChunks } from "../peEngineSegments";
import { DEFAULT_CONGEDO_ID } from "../massSession";
import { buildSalmoBlocks } from "../responsorialRendering";

export type SegKind =
  | "sectionTitle"
  | "sectionTitleBreak" // identico a sectionTitle ma forza salto pagina (CSS column-break)
  | "antifonaTitle"
  | "readingTitle"
  | "orazioneTitle"
  | "subtitle"
  | "troparioTitle" // titolo dei tropari Formula C atto penitenziale (arancio brillante)
  | "normal"
  | "rubric"
  | "readingRef" // riferimento biblico sotto Lettura/Vangelo (rosso, ma più grande della rubric)
  | "celebrante"
  | "assemblea"
  | "umili"
  | "peTitle"
  | "peText"
  | "peDossologia"
  | "salmo"
  | "preghieraFedeli" // R/. in rosso + riga vuota dopo ogni R/.
  | "spacer"
  | "kindleBreak"; // salto micro-pagina forzato (Engine C packSegmentIndicesIntoPages)

export type Segment = {
  kind: SegKind;
  text: string;
  packGroup?: string;
  noSplit?: boolean;
  salmoPart?: "opening" | "stanza";
};

// ===========================================================================
// Block type per JSON eucharisticPrayersFull
// ===========================================================================
type Block = {
  type: "title" | "t" | "c" | "r" | "rubric_section" | "var" | "acc";
  text?: string;
  selector?: string;
};

// PE con prefazio incorporato (Messale Romano 2020)
export const PE_WITH_PROPER_PREFACE = ["pe4", "per_r1", "per_r2", "pvn_1", "pvn_2", "pvn_3", "pvn_4"];

export const SANTO_TEXT =
  "Santo, Santo, Santo il Signore Dio dell'universo.\nI cieli e la terra sono pieni della tua gloria.\nOsanna nell'alto dei cieli.\nBenedetto colui che viene nel nome del Signore.\nOsanna nell'alto dei cieli.";

// Override per ID-specifici: dopo quale frase deve apparire il Santo nelle PE
// con prefazio incorporato (allineato a /messa).
const PE_SANTO_OVERRIDE: Record<string, RegExp> = {
  per_r2: /l'inno di benedizione e di lode/i,
  pvn_3: /cantando con gioia/i,
};

// ===========================================================================
// Espande il testo della PE (replica della logica in messa.tsx)
// ===========================================================================
export function expandPrayerText(
  peFull: any,
  peSelections: Record<string, string>,
): string {
  if (!peFull) return "";
  const out: Block[] = [];
  for (const b of peFull.blocks as Block[]) {
    if (b.type === "var" && b.selector && peFull.selectors?.[b.selector]) {
      const def = peFull.selectors[b.selector];
      const optId = peSelections[b.selector] || def.options?.[0]?.id;
      const variantBlocks: Block[] =
        def.variants?.[optId] || def.variants?.[def.options?.[0]?.id] || [];
      out.push(...variantBlocks);
    } else {
      out.push(b);
    }
  }
  const isPe1 = peFull.id === "pe1";
  const hasProperPreface = PE_WITH_PROPER_PREFACE.includes(peFull.id);
  const santoOverrideRe = PE_SANTO_OVERRIDE[peFull.id];

  const parts: string[] = [];
  let dossologiaSeen = false;
  let santoInserted = false;

  for (const b of out) {
    if (b.type === "title") {
      const tt = (b.text || "").trim().toLowerCase();
      if (tt.includes("dossologia") && !dossologiaSeen) {
        parts.push("<<DOSSOLOGIA>>");
        dossologiaSeen = true;
      }
      continue;
    }
    if (b.type === "acc") continue;
    if (b.type === "c") {
      const t = (b.text || "").trim();
      if (!t) continue;
      const isDossology = /^per cristo, con cristo/i.test(t);
      if (isDossology) {
        if (!dossologiaSeen) {
          parts.push("<<DOSSOLOGIA>>");
          dossologiaSeen = true;
        }
        parts.push(t.toUpperCase());
      } else {
        if (hasProperPreface && !santoInserted && !santoOverrideRe) {
          parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
          santoInserted = true;
        }
        parts.push(t);
      }
      continue;
    }
    const t = (b.text || "").trim();
    if (!t) continue;
    if (b.type === "r" || b.type === "rubric_section") {
      if (isPe1) parts.push(`${PE1_RUBRIC_PREFIX}${t}`);
      continue;
    }
    parts.push(t);
    if (
      hasProperPreface &&
      !santoInserted &&
      santoOverrideRe &&
      santoOverrideRe.test(t)
    ) {
      parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
      santoInserted = true;
      continue;
    }
    if (hasProperPreface && !santoInserted && !santoOverrideRe) {
      if (/cantiamo\b[^.]{0,80}[:\.\,]?\s*$/i.test(t)) {
        parts.push("<<SANTO_BLANK>>" + SANTO_TEXT);
        santoInserted = true;
      }
    }
  }

  const sentenceEnders = /[\.\!\?]$/;
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    if (i === 0) {
      result = cur;
      continue;
    }
    const prev = parts[i - 1];
    const prevLast = prev.replace(/\s+$/, "").slice(-1);
    const sep = sentenceEnders.test(prevLast) ? "\n\n" : "\n";
    result += sep + cur;
  }
  result = result.replace(/<<SANTO_BLANK>>/g, "\n\n");
  return result;
}

export function celebrationDateHeading(
  liturgy: { date?: string; date_label?: string } | null | undefined,
): string {
  const fromIso = italianDateLabelFromISO(liturgy?.date);
  if (fromIso) return fromIso;
  const label = (liturgy?.date_label || "").trim();
  if (label && !/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
  return "Celebrazione";
}

export function preSplitSegments(segments: Segment[]): Segment[] {
  const result: Segment[] = [];
  const SPLITTABLE: SegKind[] = [
    "normal",
    "preghieraFedeli",
    "umili",
    "peText",
    "peDossologia",
  ];
  for (const seg of segments) {
    if (seg.noSplit) {
      result.push(seg);
      continue;
    }
    // Dialoghi: un segmento = intera battuta (C./A. una sola volta).
    if (seg.kind === "celebrante" || seg.kind === "assemblea") {
      result.push(seg);
      continue;
    }
    if (!SPLITTABLE.includes(seg.kind) || !seg.text) {
      result.push(seg);
      continue;
    }
    const text = seg.text;
    // Letture/vangelo: una riga per segmento (evita blocchi alti che superano il viewport).
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (lines.length > 1) {
      for (const line of lines) {
        result.push({ ...seg, text: line });
      }
      continue;
    }
    if (text.length > 300) {
      // Split per paragrafi (doppio newline).
      const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
      if (paragraphs.length > 1) {
        for (const p of paragraphs) {
          result.push({ ...seg, text: p });
        }
        continue;
      }
      // Testo lungo senza a capo: chunk ~120 caratteri a confine di parola.
      if (text.length > 120) {
        const words = text.split(/\s+/);
        let chunk = "";
        for (const w of words) {
          const next = chunk ? `${chunk} ${w}` : w;
          if (next.length > 120 && chunk) {
            result.push({ ...seg, text: chunk });
            chunk = w;
          } else {
            chunk = next;
          }
        }
        if (chunk) result.push({ ...seg, text: chunk });
        continue;
      }
    }
    result.push(seg);
  }
  return result;
}

// ===========================================================================
export type BuildArgs = {
  liturgy: Liturgy | null;
  fixedParts: Record<string, any>;
  prefaces: Preface[];
  prayers: EucharisticPrayer[];
  acclamations: MysteryAcclamation[];
  solemnBlessings: SolemnBlessing[];
  prayersOverPeople: any[];
  pasquaDismissal: any;
  currentSeasonKey: string;
  session: any;
};

export function buildSegments(args: BuildArgs): Segment[] {
  const {
    liturgy,
    fixedParts,
    prefaces,
    prayers,
    acclamations,
    solemnBlessings,
    prayersOverPeople,
    pasquaDismissal,
    currentSeasonKey,
    session,
  } = args;
  const out: Segment[] = [];
  const push = (kind: SegKind, text: string) => {
    if (text != null && text !== "") out.push({ kind, text });
  };
  const sp = () => out.push({ kind: "spacer", text: "" });

  // Helper: aggiunge una sezione (rubrica/dialogo/orazione/kyrie) come segmenti
  const addSection = (s: any, opts?: { skipRubric?: boolean }) => {
    if (!s) return;
    if (s.type === "rubric") {
      if (opts?.skipRubric) return;
      push("rubric", s.text);
      return;
    }
    if (s.type === "dialogue") {
      push("celebrante", s.celebrante);
      push("assemblea", s.assemblea);
      return;
    }
    if (s.type === "monologue") {
      push("celebrante", s.celebrante);
      return;
    }
    if (s.type === "invitation_alternatives") {
      const options = s.options || [];
      for (let i = 0; i < options.length; i++) {
        if (i > 0) push("rubric", "oppure");
        push("celebrante", options[i]);
      }
      return;
    }
    if (s.type === "prayer") {
      if (s.rubric && !opts?.skipRubric) push("rubric", s.rubric);
      const isSilent = !!s.rubric && /sottovoce|inchinato/i.test(s.rubric);
      if (s.text) push("normal", s.text);
      if (s.celebrante && s.assemblea) {
        push("celebrante", s.celebrante);
        push("assemblea", s.assemblea);
      } else if (s.celebrante) {
        if (isSilent) push("umili", s.celebrante);
        else push("celebrante", s.celebrante);
      } else if (s.assemblea) {
        push("assemblea", s.assemblea);
      }
      return;
    }
    if (s.type === "kyrie") {
      if (s.rubric && !opts?.skipRubric) push("rubric", s.rubric);
      const pairs = s.dialogue || [];
      for (let i = 0; i < pairs.length; i++) {
        // Spazio tra le tre coppie del Kyrie (Signore pietà / Cristo pietà /
        // Signore pietà) per separazione visiva, come da richiesta utente.
        if (i > 0) sp();
        const d = pairs[i];
        push("celebrante", d.c);
        push("assemblea", d.a);
      }
      return;
    }
  };

  const addReading = (
    type: string,
    titleKind: "antifonaTitle" | "readingTitle" | "orazioneTitle",
    titleOverride?: string,
  ) => {
    const r = liturgy?.readings?.find((rr: any) => rr.type === type);
    if (!r || !r.text) return;
    push(titleKind, titleOverride || r.title);
    if (r.reference) push("rubric", r.reference);
    if (type === "salmo") {
      for (const block of buildSalmoBlocks(r.text)) {
        out.push({ kind: "salmo", text: block.text, salmoPart: block.kind });
      }
    } else push("normal", r.text);
    sp();
  };

  // ===== INTESTAZIONE =====
  const dateHeading = celebrationDateHeading(liturgy);
  if (dateHeading) push("sectionTitle", dateHeading);
  if (liturgy?.title) push("subtitle", liturgy.title);
  if (liturgy?.season?.season) {
    push(
      "rubric",
      `${liturgy.season.season}${
        liturgy.liturgical_color ? ` · Colore: ${liturgy.liturgical_color}` : ""
      }`,
    );
  }
  sp();

  // ===== ANTIFONA D'INGRESSO =====
  if (session.showAntifone === true) {
    addReading("antifona_ingresso", "antifonaTitle", "Antifona d'ingresso");
  }

  // ===== RITI DI INTRODUZIONE =====
  push("sectionTitleBreak", "Riti di Introduzione");
  for (const s of fixedParts["riti_iniziali"]?.sections || []) {
    addSection(s, { skipRubric: true });
  }
  // SALUTI INIZIALI ALTERNATIVI (Messale Romano 2020): 5 formule fra cui
  // il celebrante può scegliere a vista. kindleBreak = tap avanza per blocco.
  const SALUTI_INIZIALI = [
    "La grazia del Signore nostro Gesù Cristo,\nl'amore di Dio Padre\ne la comunione dello Spirito Santo siano con tutti voi.",
    "La grazia e la pace di Dio nostro Padre\ne del Signore nostro Gesù Cristo siano con tutti voi.",
    "Il Signore, che guida i nostri cuori all'amore\ne alla pazienza di Cristo, sia con tutti voi.",
    "Il Dio della speranza, che ci riempie di ogni gioia\ne pace nella fede\nper la potenza dello Spirito Santo, sia con tutti voi.",
    "La pace, la carità e la fede da parte di Dio Padre\ne del Signore Gesù Cristo siano con tutti voi.",
  ];
  push("kindleBreak", "");
  for (let si = 0; si < SALUTI_INIZIALI.length; si++) {
    if (si > 0) push("kindleBreak", "");
    push("celebrante", SALUTI_INIZIALI[si]);
    push("assemblea", "E con il tuo spirito.");
    sp();
  }
  sp();

  // ===== ATTO PENITENZIALE (kindleBreak tra blocchi liturgici) =====
  push("sectionTitleBreak", "Atto Penitenziale");
  push("kindleBreak", "");
  const atto = fixedParts["atto_penitenziale"];
  if (atto) {
    for (const s of atto.sections.filter(
      (x: any) => x.type !== "choice" && x.type !== "kyrie",
    )) {
      if (s.type === "invitation_alternatives") {
        const options = s.options || [];
        for (let i = 0; i < options.length; i++) {
          if (i > 0) {
            push("rubric", "oppure");
            push("kindleBreak", "");
          }
          push("celebrante", options[i]);
          push("kindleBreak", "");
        }
      } else {
        addSection(s);
        push("kindleBreak", "");
      }
    }
    const choice = atto.sections.find((s: any) => s.type === "choice");
    const penForm = (session.penitentialForm as "A" | "B" | "C") || "A";
    const penSeason = session.penitentialSeason || "ordinario";
    const selectedOpt = choice?.options.find((o: any) => o.id === penForm);
    if (selectedOpt) {
      push("kindleBreak", "");
      push("subtitle", selectedOpt.label);
      push("kindleBreak", "");
      if (selectedOpt.assemblea) {
        push("assemblea", selectedOpt.assemblea);
        push("kindleBreak", "");
      }
      if (selectedOpt.dialogue) {
        for (const d of selectedOpt.dialogue) {
          push("celebrante", d.c);
          push("assemblea", d.a);
          push("kindleBreak", "");
        }
      }
      const seasonVariant = selectedOpt.season_variants?.[penSeason];
      if (seasonVariant?.formulas && Array.isArray(seasonVariant.formulas)) {
        for (let fi = 0; fi < seasonVariant.formulas.length; fi++) {
          if (fi > 0) sp();
          const formula = seasonVariant.formulas[fi];
          if (formula.label) {
            push("troparioTitle", formula.label);
            push("kindleBreak", "");
          }
          for (const d of formula.dialogue || []) {
            push("celebrante", d.c);
            push("assemblea", d.a);
            push("kindleBreak", "");
          }
        }
      }
      if (seasonVariant?.dialogue) {
        for (const d of seasonVariant.dialogue) {
          push("celebrante", d.c);
          push("assemblea", d.a);
          push("kindleBreak", "");
        }
      }
      if (selectedOpt.celebrante) {
        push("celebrante", selectedOpt.celebrante);
        push("kindleBreak", "");
      }
      if (selectedOpt.risposta) {
        push("assemblea", selectedOpt.risposta);
        push("kindleBreak", "");
      }
    }
    if (penForm !== "C") {
      const kyrie = atto.sections.find((s: any) => s.type === "kyrie");
      if (kyrie) {
        push("kindleBreak", "");
        const pairs = kyrie.dialogue || [];
        for (let i = 0; i < pairs.length; i++) {
          if (i > 0) sp();
          push("celebrante", pairs[i].c);
          push("assemblea", pairs[i].a);
          push("kindleBreak", "");
        }
      }
    }
  }
  sp();

  // ===== GLORIA =====
  if (session.showGloria === true) {
    push("sectionTitleBreak", "Gloria");
    for (const s of fixedParts["gloria"]?.sections || []) {
      addSection(s, { skipRubric: true });
    }
    sp();
  }

  // ===== COLLETTA =====
  {
    const r = liturgy?.readings?.find((rr: any) => rr.type === "colletta");
    push("sectionTitleBreak", "Colletta");
    if (r?.text) {
      if (r.reference) push("rubric", r.reference);
      push("normal", r.text);
    } else {
      push(
        "rubric",
        liturgy?.error
          ? `Colletta non disponibile (${liturgy.error}). Vai in Home → Scarica letture, poi riprova.`
          : "Colletta non disponibile. Vai in Home → Scarica letture, poi riprova.",
      );
    }
    sp();
  }

  // ===== LITURGIA DELLA PAROLA =====
  // sectionTitleBreak forza un salto pagina (CSS column-break-before)
  // così Prima Lettura inizia sempre in una pagina nuova.
  push("sectionTitleBreak", "Liturgia della Parola");
  sp();
  const beforeWord = out.length;
  addReading("prima_lettura", "readingTitle", "Prima Lettura");
  addReading("salmo", "readingTitle", "Salmo Responsoriale");
  addReading("seconda_lettura", "readingTitle", "Seconda Lettura");
  addReading("sequenza", "antifonaTitle", "Sequenza");
  // Acclamazione al Vangelo: verde come Salmo Responsoriale (era arancione)
  addReading("acclamazione", "readingTitle", "Acclamazione al Vangelo");
  addReading("vangelo", "readingTitle", "Vangelo");
  if (out.length === beforeWord) {
    push(
      "rubric",
      liturgy?.error
        ? `Letture non disponibili (${liturgy.error}). Vai in Home → Scarica letture, poi riprova.`
        : "Letture non disponibili. Vai in Home → Scarica letture, poi riprova.",
    );
  }

  // ===== POST-VANGELO: una macro-pagina per sezione attiva =====
  // Credo, Preghiera dei fedeli e Presentazione doni hanno ciascuna un
  // sectionTitleBreak (come in /messa). Se un toggle è off, la sezione (e la
  // pagina) non vengono create.
  const pushSectionBreak = (text: string) => {
    push("sectionTitleBreak", text);
  };

  // ===== CREDO =====
  if (session.showCredo === true) {
    pushSectionBreak("Professione di Fede");
    const credo = fixedParts["credo"];
    if (credo) {
      const credoChoice = credo.sections[0];
      const credoId = (session.selectedCredoId as "niceno" | "apostolico") || "niceno";
      const sel = credoChoice?.options.find((o: any) => o.id === credoId);
      if (sel) push("normal", sel.text);
    }
    sp();
  }

  // ===== PREGHIERA DEI FEDELI =====
  if (session.showOrazionalePray === true && session.selectedOrazionaleId) {
    pushSectionBreak("Preghiera dei Fedeli");
    const orPrayer = getPrayerById(session.selectedOrazionaleId);
    if (orPrayer) {
      push("peTitle", orPrayer.title);
      const chunks = splitFedeliTextIntoChunks(orPrayer.body, FEDELI_CHARS_PER_PAGE);
      for (const chunk of chunks) {
        push("preghieraFedeli", chunk);
      }
    }
    sp();
  }

  // ===== PRESENTAZIONE DEI DONI (kindleBreak tra blocchi) =====
  pushSectionBreak("Presentazione dei Doni");
  push("kindleBreak", "");
  const off = fixedParts["offertorio"];
  if (off) {
    const allSections = off.sections;
    const idxInchinato = allSections.findIndex(
      (s: any) => s.type === "prayer" && s.rubric && /inchinato/i.test(s.rubric),
    );
    const headSections =
      idxInchinato > 0 ? allSections.slice(0, idxInchinato) : allSections.slice(0, 4);
    const inchinatoSection = idxInchinato >= 0 ? allSections[idxInchinato] : null;

    for (const s of headSections.filter((x: any) => x.type !== "rubric")) {
      addSection(s, { skipRubric: true });
      push("kindleBreak", "");
    }
    if (inchinatoSection?.celebrante) {
      push("umili", inchinatoSection.celebrante);
      push("kindleBreak", "");
    }
    const orateChoice = off.sections.find((s: any) => s.type === "choice_orate");
    const orateOpts = orateChoice?.options || [];
    for (let i = 0; i < orateOpts.length; i++) {
      if (i > 0) push("rubric", "oppure");
      push("celebrante", orateOpts[i].celebrante);
    }
    if (orateOpts[0]?.assemblea) {
      push("assemblea", orateOpts[0].assemblea);
    }
    if (orateOpts.length) push("kindleBreak", "");
    sp();
  }

  // ===== SULLE OFFERTE =====
  {
    const r = liturgy?.readings?.find((rr: any) => rr.type === "sulle_offerte");
    push("sectionTitleBreak", "Sulle offerte");
    if (r?.text) {
      if (r.reference) push("rubric", r.reference);
      push("normal", r.text);
    }
    sp();
  }

  // ===== PREFAZIO + SANTO =====
  const selectedPreface = prefaces.find((p) => p.id === session.selectedPrefaceId);
  const selectedPrayer = prayers.find((p) => p.id === session.selectedPrayerId);
  const isPe1 = selectedPrayer?.id === "pe1";
  const hasProperPreface = selectedPrayer
    ? PE_WITH_PROPER_PREFACE.includes(selectedPrayer.id)
    : false;

  // Per le 7 PE con prefazio incorporato, NON ripetiamo il prefazio del giorno:
  // il prefazio è dentro la PE stessa (con introduzione + Santo).
  if (selectedPreface && !hasProperPreface) {
    push("sectionTitleBreak", "Prefazio");
    push("peTitle", selectedPreface.title);
    pushPrefaceDialogues(
      (t) => push("celebrante", t),
      (t) => push("assemblea", t),
      () => push("kindleBreak", ""),
    );
    push("kindleBreak", "");
    push("normal", selectedPreface.text.trimEnd() + "\n\n" + SANTO_TEXT);
    sp();
  }

  // ===== PREGHIERA EUCARISTICA =====
  if (selectedPrayer) {
    // Pagina nuova dopo il Santo: il celebrante sceglie la PE mentre l'assemblea canta.
    push("sectionTitleBreak", "Preghiera Eucaristica");
    push("peTitle", selectedPrayer.title);
    if (hasProperPreface) {
      pushPrefaceDialogues(
        (t) => push("celebrante", t),
        (t) => push("assemblea", t),
        () => push("kindleBreak", ""),
      );
      push("kindleBreak", "");
      sp();
    }

    // Costruzione testo PE: usa expandPrayerText (per 7 PE Messale 2020)
    // o processPrayerText per le altre.
    const peFull = (peFullData as any[]).find((p) => p.id === selectedPrayer.id);
    let peText: string;
    if (peFull) {
      peText = expandPrayerText(peFull, session.peSelections || {});
    } else {
      // Fallback: testo grezzo dalla preghiera, rimuovendo rubriche [xxx] tranne PE I
      peText = isPe1
        ? selectedPrayer.text
        : selectedPrayer.text
            .replace(/\[[^\]]*\]\s*\n?/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    // Inserisce il Mistero della Fede (tutte le acclamazioni, come sul messale).
    const marker = "Mistero della fede.";
    const idxMarker = peText.indexOf(marker);
    let beforePart = peText;
    let afterPart = "";
    if (idxMarker >= 0) {
      beforePart = peText.substring(0, idxMarker).trimEnd();
      const rest = peText.substring(idxMarker + marker.length);
      const nextBreak = rest.indexOf("\n\n");
      afterPart = nextBreak > 0 ? rest.substring(nextBreak + 2).trimStart() : rest.trimStart();
    }

    // Pre Mistero della Fede (Engine C: chunk con blocchi azzurri indivisibili)
    const peChunks = buildPeTextEngineChunks(beforePart, selectedPrayer.id);
    for (let ci = 0; ci < peChunks.length; ci++) {
      if (ci > 0) push("kindleBreak", "");
      out.push({
        kind: "peText",
        text: peChunks[ci].text,
        packGroup: peChunks[ci].packGroup,
        noSplit: peChunks[ci].noSplit,
      });
    }

    // Mistero della Fede
    if (idxMarker >= 0 || acclamations.length > 0) {
      push("kindleBreak", "");
      sp();
      push("subtitle", "Mistero della Fede");
      if (acclamations[0]?.celebrante) {
        push("celebrante", acclamations[0].celebrante);
      }
      for (let i = 0; i < acclamations.length; i++) {
        if (i > 0) push("rubric", "oppure");
        push("assemblea", acclamations[i].assemblea);
      }
      sp();
    }

    // Post Mistero della Fede (Anamnesi + Dossologia)
    if (afterPart) {
      push("kindleBreak", "");
      push("peText", afterPart);
    }
    sp();
  }

  // ===== PADRE NOSTRO =====
  push("sectionTitleBreak", "Padre Nostro");
  const pn = fixedParts["padre_nostro"];
  if (pn) {
    const introChoice = pn.sections.find((s: any) => s.type === "choice_intro");
    const introOpts = introChoice?.options || [];
    for (let i = 0; i < introOpts.length; i++) {
      if (i > 0) push("rubric", "oppure");
      push("celebrante", introOpts[i].text);
    }
    push("normal", "Padre nostro, che sei nei cieli, sia santificato il tuo nome, venga il tuo regno, sia fatta la tua volontà, come in cielo così in terra. Dacci oggi il nostro pane quotidiano, e rimetti a noi i nostri debiti come anche noi li rimettiamo ai nostri debitori, e non abbandonarci alla tentazione, ma liberaci dal male.");
    // Embolismo (sezioni 1: monizione+pater | 2: embolismo)
    const pnSections = pn.sections.filter((s: any) => s.type !== "choice_intro");
    // Embolismo è normalmente in pnSections[1] (dopo pater)
    if (pnSections[1]) addSection(pnSections[1]);
    sp();
  }

  // ===== RITO DELLA PACE =====
  push("sectionTitle", "Rito della Pace");
  if (pn) {
    const peaceSections = pn.sections.filter((s: any) => s.type !== "choice_intro").slice(2);
    for (const s of peaceSections) addSection(s, { skipRubric: true });
  }
  sp();

  // ===== FRAZIONE DEL PANE (Agnello) =====
  push("sectionTitle", "Frazione del Pane");
  const com = fixedParts["comunione"];
  if (com) {
    for (const s of com.sections.slice(0, 2)) addSection(s, { skipRubric: true });
  }
  sp();

  // ===== COMUNIONE =====
  push("sectionTitle", "Comunione");
  if (com) {
    for (const s of com.sections.slice(2)) addSection(s, { skipRubric: true });
  }
  if (session.showAntifone === true) {
    addReading("antifona_comunione", "antifonaTitle", "Antifona alla Comunione");
  }

  // ===== DOPO LA COMUNIONE =====
  {
    const r = liturgy?.readings?.find((rr: any) => rr.type === "dopo_comunione");
    push("sectionTitleBreak", "Dopo la Comunione");
    if (r?.text) {
      if (r.reference) push("rubric", r.reference);
      push("normal", r.text);
    }
    sp();
  }

  // ===== RITI DI CONCLUSIONE (stessa macro-pagina di Dopo la Comunione) =====
  push("sectionTitle", "Riti di Conclusione");
  const rc = fixedParts["riti_conclusione"];
  if (rc) {
    // Saluto iniziale (dialogue) — sezione 0
    addSection(rc.sections[0]);

    // Orazione sul popolo (se attiva)
    if (session.useOrazionePopolo && session.orazionePopoloId) {
      const sel = prayersOverPeople.find((p) => p.id === session.orazionePopoloId);
      if (sel) {
        push("subtitle", `Orazione sul popolo n. ${sel.num}`);
        push("normal", sel.text);
        push("assemblea", "Amen.");
        sp();
      }
    }

    // Benedizione: solenne o semplice
    if (session.useSolemnBlessing && session.solemnBlessingId) {
      const sb = solemnBlessings.find((b) => b.id === session.solemnBlessingId);
      if (sb) {
        push(
          "subtitle",
          `Benedizione Solenne — ${(sb as any).num ? `${(sb as any).num}. ` : ""}${sb.title}`,
        );
        if ((sb as any).rubric) push("rubric", (sb as any).rubric);
        const invs = sb.invocations || [];
        for (let ii = 0; ii < invs.length; ii++) {
          if (ii > 0) sp();
          const inv = invs[ii];
          push("celebrante", inv.c);
          push("assemblea", inv.a);
        }
        if (sb.final) {
          sp();
          push("celebrante", sb.final.c);
          push("assemblea", sb.final.a);
        }
      }
    } else {
      // Benedizione semplice: sezione 1 (choice options A/B)
      const benedChoice = rc.sections[1];
      const benedId = session.benedizioneId || "A";
      const bened = benedChoice?.options?.find((o: any) => o.id === benedId);
      if (bened) {
        push("subtitle", "Benedizione");
        push("celebrante", bened.celebrante);
        push("assemblea", bened.assemblea);
      }
    }
    sp();

    // Congedo
    push("subtitle", "Congedo");
    const congedoChoice = rc.sections[2];
    let congedoOpts = [...(congedoChoice?.options || [])];
    if (pasquaDismissal && currentSeasonKey === "pasqua") {
      congedoOpts.push({
        id: pasquaDismissal.id,
        label: "Pasqua",
        celebrante: pasquaDismissal.celebrante,
        assemblea: pasquaDismissal.assemblea,
      });
    }
    const congedoId = session.congedoId || DEFAULT_CONGEDO_ID;
    const selectedCongedo =
      congedoOpts.find((o: any) => o.id === congedoId) || congedoOpts[0];
    if (selectedCongedo) {
      push("celebrante", selectedCongedo.celebrante);
      push("assemblea", selectedCongedo.assemblea);
    }
  }
  sp();

  return out;
}
