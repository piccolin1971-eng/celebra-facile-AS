import React from "react";
import { Text, type TextStyle } from "react-native";

const RESP_MARKER_SPLIT = /(R\/\.?|R\.)/g;
const RESP_MARKER_ONLY = /^(R\/\.?|R\.)$/;
const STRIP_RESP_PREFIX = /^(?:R\/\.?|R\.)\s*/i;

export type ResponsorialTextStyles = {
  body: TextStyle;
  marker: TextStyle;
};

export type SalmoBlock = { kind: "opening"; text: string } | { kind: "stanza"; text: string };

function normalizeRespText(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeRefrainKey(s: string): string {
  return s
    .replace(STRIP_RESP_PREFIX, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderRedR(markerStyle: TextStyle) {
  return <Text style={markerStyle}>R.</Text>;
}

function stripRespSuffixFromStanza(para: string, refrainKey: string): string {
  const lines = para.split("\n");
  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }
  if (lines.length === 0) return "";

  const last = lines[lines.length - 1].trim();
  if (/^(?:R\/\.?|R\.)/.test(last)) {
    lines.pop();
  } else {
    lines[lines.length - 1] = lines[lines.length - 1]
      .replace(/\s+(?:R\/\.?|R\.)\s*$/i, "")
      .trimEnd();
  }

  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  const cleaned = lines.join("\n").trim();
  if (!cleaned) return "";
  if (normalizeRefrainKey(cleaned) === refrainKey) return "";
  return cleaned;
}

function splitSalmoParagraphs(text: string): string[] {
  const normalized = normalizeRespText(text);
  const byBlank = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const byEmptyLine: string[] = [];
  let current: string[] = [];
  for (const line of normalized.split("\n")) {
    if (!line.trim()) {
      if (current.length) {
        byEmptyLine.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length) byEmptyLine.push(current.join("\n"));
  return byEmptyLine.length > 1 ? byEmptyLine : byBlank;
}

/** Spezza il salmo in blocchi impacchettabili (antifona + strofe con R.). */
export function buildSalmoBlocks(text: string): SalmoBlock[] {
  const paragraphs = splitSalmoParagraphs(text);
  if (paragraphs.length === 0) return [];

  // Il ritornello può essere su più righe (es. «R. … rifugio / di generazione…»).
  const refrainText = paragraphs[0].replace(STRIP_RESP_PREFIX, "").trim();
  if (!refrainText) return [{ kind: "stanza", text: normalizeRespText(text) }];

  const refrainKey = normalizeRefrainKey(refrainText);
  const blocks: SalmoBlock[] = [{ kind: "opening", text: refrainText }];

  for (let i = 1; i < paragraphs.length; i++) {
    const stanzaText = stripRespSuffixFromStanza(paragraphs[i], refrainKey);
    if (!stanzaText) continue;
    blocks.push({ kind: "stanza", text: stanzaText });
  }

  return blocks;
}

/** Render di un singolo blocco salmo (Engine C: un segmento = un blocco). */
export function renderSalmoBlock(
  block: SalmoBlock,
  styles: ResponsorialTextStyles,
  tail = "",
): React.ReactNode {
  if (block.kind === "opening") {
    return (
      <Text style={styles.body} selectable>
        {renderRedR(styles.marker)}
        <Text> {block.text}</Text>
        {tail}
      </Text>
    );
  }
  return (
    <Text style={styles.body} selectable>
      {renderStanzaWithTrailingR(block.text, styles.marker, tail, 0)}
    </Text>
  );
}

/**
 * Orazionale e Preghiera dei fedeli: testo CEI invariato; R/. → R. rosso.
 * Nessuna ripetizione aggiunta (il testo sorgente è già corretto).
 */
export function renderOrazionaleOrFedeliText(
  text: string,
  styles: ResponsorialTextStyles,
  textProps?: { onTextLayout?: React.ComponentProps<typeof Text>["onTextLayout"] },
): React.ReactNode {
  if (!text) return null;

  const rawLines = normalizeRespText(text).split("\n");
  const hasRespMarker = /(?:R\/\.?|R\.)/;
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const ln = rawLines[i];
    lines.push(ln);
    if (hasRespMarker.test(ln) && rawLines[i + 1] === "") i++;
  }

  return (
    <Text style={styles.body} selectable {...textProps}>
      {lines.map((ln, i) => {
        const parts = ln.split(RESP_MARKER_SPLIT);
        const hasResp = hasRespMarker.test(ln);
        const isLast = i === lines.length - 1;
        const tail = isLast ? "" : hasResp ? "\n\n" : "\n";

        return (
          <Text key={i}>
            {parts.map((p, j) => {
              if (RESP_MARKER_ONLY.test(p)) {
                return (
                  <Text key={j}>
                    {renderRedR(styles.marker)}
                    {" "}
                  </Text>
                );
              }
              return <Text key={j}>{p}</Text>;
            })}
            {tail}
          </Text>
        );
      })}
    </Text>
  );
}

/** @deprecated alias */
export function renderUniversalPrayerText(
  text: string,
  styles: ResponsorialTextStyles,
): React.ReactNode {
  return renderOrazionaleOrFedeliText(text, styles);
}

function renderStanzaWithTrailingR(
  stanzaText: string,
  markerStyle: TextStyle,
  tail: string,
  key: number,
) {
  const lines = stanzaText.split("\n");
  if (lines.length === 1) {
    return (
      <Text key={key}>
        <Text>{lines[0]} </Text>
        {renderRedR(markerStyle)}
        {tail}
      </Text>
    );
  }

  const head = lines.slice(0, -1).join("\n");
  const last = lines[lines.length - 1];
  return (
    <Text key={key}>
      <Text>{head}</Text>
      {"\n"}
      <Text>{last} </Text>
      {renderRedR(markerStyle)}
      {tail}
    </Text>
  );
}

export function renderSalmoResponsorialText(
  text: string,
  styles: ResponsorialTextStyles,
): React.ReactNode {
  if (!text) return null;

  const blocks = buildSalmoBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <Text style={styles.body} selectable>
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        const tail = isLast ? "" : "\n\n";

        if (block.kind === "opening") {
          return (
            <Text key={i}>
              {renderRedR(styles.marker)}
              <Text> {block.text}</Text>
              {tail}
            </Text>
          );
        }

        return renderStanzaWithTrailingR(block.text, styles.marker, tail, i);
      })}
    </Text>
  );
}
