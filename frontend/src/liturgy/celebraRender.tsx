import React from "react";
import { View, Text } from "react-native";
import { DialogueLine } from "../components/DialogueLine";
import {
  isPeConsecrationLine,
  isPe1RubricLine,
  renderPeLineWithRedCross,
  unwrapPe1RubricLine,
} from "./peLineRendering";
import { normalizeAnchorKey } from "../peEngineSegments";
import { renderSalmoBlock, renderOrazionaleOrFedeliText } from "../responsorialRendering";
import type { Segment } from "./celebraSegments";

export type LiturgyRenderColors = {
  markerCelebrant: string;
  markerAssembly: string;
  cross: string;
  /** Ancora testo bianco da agganciiare alla 1ª formula (PE1–PE4…). */
  pePreambleNeedle?: string;
};

// ===========================================================================
// buildSegments: costruisce l'intera Messa come array di Segment
// ===========================================================================
// renderSegment: converte un Segment in elementi React Native nativi (<Text />).
// ===========================================================================
export function renderSegment(
  seg: Segment,
  key: string,
  styles: any,
  liturgyColors: LiturgyRenderColors,
): React.ReactNode {
  const text = seg.text || "";
  switch (seg.kind) {
    case "spacer":
      return <View key={key} style={styles.segSpacer} />;
    case "kindleBreak":
      return (
        <View
          key={key}
          testID="kindle-force-break"
          style={{ height: 1, width: "100%" }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      );
    case "sectionTitle":
    case "sectionTitleBreak":
      return (
        <Text key={key} style={styles.segSectionTitle}>
          {text}
        </Text>
      );
    case "antifonaTitle":
      return (
        <Text key={key} style={styles.segAntifonaTitle}>
          {text}
        </Text>
      );
    case "readingTitle":
      return (
        <Text key={key} style={styles.segReadingTitle}>
          {text}
        </Text>
      );
    case "orazioneTitle":
      return (
        <Text key={key} style={styles.segOrazioneTitle}>
          {text}
        </Text>
      );
    case "subtitle":
      return (
        <Text key={key} style={styles.segSubtitle}>
          {text}
        </Text>
      );
    case "troparioTitle":
      return (
        <Text key={key} style={styles.segTroparioTitle}>
          {text}
        </Text>
      );
    case "peTitle":
      return (
        <Text key={key} style={styles.segPeTitle}>
          {text}
        </Text>
      );
    case "rubric":
      return (
        <Text key={key} style={styles.segRubric}>
          {text}
        </Text>
      );
    case "readingRef":
      return (
        <Text key={key} style={styles.segReadingRef}>
          {text}
        </Text>
      );
    case "readingSubtitle":
      return (
        <Text key={key} style={styles.segReadingSubtitle}>
          {text}
        </Text>
      );
    case "celebrante":
      return (
        <DialogueLine
          key={key}
          role="celebrant"
          text={text}
          baseStyle={styles.segCelebrante}
          markerColor={liturgyColors.markerCelebrant}
        />
      );
    case "assemblea":
      return (
        <DialogueLine
          key={key}
          role="assembly"
          text={text}
          baseStyle={styles.segAssemblea}
          markerColor={liturgyColors.markerAssembly}
        />
      );
    case "umili":
      return (
        <Text key={key} style={styles.segUmili}>
          {text}
        </Text>
      );
    case "peText":
    case "peDossologia":
      return renderPeTextNative(
        text,
        key,
        styles,
        liturgyColors.cross,
        liturgyColors.pePreambleNeedle,
      );
    case "salmo":
      return renderSalmoNative(seg, key, styles);
    case "preghieraFedeli":
      return renderPreghieraFedeliNative(text, key, styles);
    case "normal":
    default:
      return (
        <Text key={key} style={styles.segNormal}>
          {text}
        </Text>
      );
  }
}

// ===========================================================================
// renderPeTextNative: replica esatta della logica di /messa per il testo
// delle Preghiere Eucaristiche.
//  - Splitta il testo sul marker `<<DOSSOLOGIA>>` (inserito da expandPrayerText)
//  - Parte PRE: righe consacrazione in azzurro, peso normale; croce ✠ rossa.
//  - Parte POST: Dossologia bianca maiuscolo regular.
// ===========================================================================
function renderPeTextLines(
  text: string,
  key: string,
  styles: any,
  crossColor: string,
  preambleNeedle?: string,
): React.ReactNode {
  const lines = text.split("\n");
  const needleKey = preambleNeedle ? normalizeAnchorKey(preambleNeedle) : "";
  let preambleMarked = false;
  // Una <Text> per riga logica (non un unico Text con \n annidati):
  // misura più affidabile per Engine C nella PE.
  return (
    <View key={key}>
      {lines.map((ln, i) => {
        if (ln.length === 0) {
          const blankH = styles.segNormal?.lineHeight ?? 24;
          return <View key={i} style={{ height: Math.max(8, Math.round(blankH * 0.45)) }} />;
        }
        const isRubric = isPe1RubricLine(ln);
        const display = unwrapPe1RubricLine(ln);
        const isCon = !isRubric && isPeConsecrationLine(display);
        const isPreambleStart =
          !preambleMarked &&
          !!needleKey &&
          normalizeAnchorKey(display).includes(needleKey);
        if (isPreambleStart) preambleMarked = true;
        const lineContent = isRubric
          ? display
          : renderPeLineWithRedCross(
              display,
              isCon ? styles.segPeConsecration : styles.segNormal,
              crossColor,
            );
        return (
          <Text
            key={i}
            selectable
            testID={
              isCon
                ? "pe-con-line"
                : isPreambleStart
                  ? "pe-preamble-anchor"
                  : undefined
            }
            style={
              isRubric
                ? styles.segPeRubric
                : isCon
                  ? styles.segPeConsecration
                  : styles.segNormal
            }
          >
            {lineContent}
          </Text>
        );
      })}
    </View>
  );
}

function renderPeTextNative(
  text: string,
  key: string,
  styles: any,
  crossColor: string,
  preambleNeedle?: string,
): React.ReactNode {
  if (!text) return null;
  const dosMarker = "<<DOSSOLOGIA>>";
  const dosIdx = text.indexOf(dosMarker);
  if (dosIdx >= 0) {
    const before = text.slice(0, dosIdx).replace(/\n+$/, "");
    const after = text.slice(dosIdx + dosMarker.length).replace(/^\n+/, "");
    const dosFont = styles.segPeDossologia?.fontSize || styles.segNormal?.fontSize || 20;
    return (
      <View key={key}>
        {before
          ? renderPeTextLines(before, `${key}-pre`, styles, crossColor, preambleNeedle)
          : null}
        {after ? (
          <View key={`${key}-dos`} style={{ marginTop: Math.round(dosFont * 0.4) }}>
            {after.split("\n").map((ln, i) => {
              if (ln.length === 0) {
                return <View key={i} style={{ height: Math.max(10, dosFont * 0.55) }} />;
              }
              const isRubric = isPe1RubricLine(ln);
              const display = unwrapPe1RubricLine(ln);
              if (isRubric) {
                return (
                  <Text
                    key={i}
                    selectable
                    style={styles.segPeRubric}
                  >
                    {display}
                  </Text>
                );
              }
              return (
                <Text key={i} selectable style={styles.segPeDossologia}>
                  {display}
                </Text>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }
  return renderPeTextLines(text, key, styles, crossColor, preambleNeedle);
}

// Salmo responsoriale: un segmento = antifona o strofa (Engine C).
function renderSalmoNative(seg: Segment, key: string, styles: any): React.ReactNode {
  const part = seg.salmoPart ?? "stanza";
  const block =
    part === "opening"
      ? ({ kind: "opening" as const, text: seg.text })
      : ({ kind: "stanza" as const, text: seg.text });
  return (
    <React.Fragment key={key}>
      {renderSalmoBlock(block, {
        body: styles.segSalmo,
        marker: styles.segRespMarker,
      })}
    </React.Fragment>
  );
}

// Preghiera dei fedeli: R/. rosso. Dopo ogni intenzione (chiude con R/.) una riga vuota.
function renderPreghieraFedeliNative(text: string, key: string, styles: any): React.ReactNode {
  const gap = /(?:R\/\.?|R\.)/.test(text) ? styles.segNormal?.lineHeight || 0 : 0;
  return (
    <View key={key} style={gap ? { marginBottom: gap } : undefined}>
      {renderOrazionaleOrFedeliText(text, {
        body: styles.segNormal,
        marker: styles.segRespMarker,
      })}
    </View>
  );
}

// Pre-split: spezza i segmenti di testo lunghi (>1 paragrafo) in pezzi più
// piccoli mantenendo lo stesso kind. Necessario perché un body enorme
// (es. tutta la Preghiera dei Fedeli) misurato come UN solo elemento non
// permette allo Smart Tap di posizionarlo correttamente: finirebbe sempre da
