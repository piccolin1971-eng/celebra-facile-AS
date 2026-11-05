import React from "react";
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { AppFontWeight } from "../fontFamily";
import type { OreBlock, DayHoursMeta } from "./types";
import { formatHourHeadLine } from "./dayHead";
import { enrichPsalmHeads } from "./psalmHeadings";
import { JOIN_CROSS_MARK } from "./joinCross";

const GOLD_TITLE = "#c4b06a";
const RUBRIC = "#E24B4B";
const SUB = "#b7c4b0";
const CITE = "#8a9688";
const TONE_REFRAIN = "#c4b06a";
const FONT = "LibreBaskerville_400Regular";
const FONT_IT = "LibreBaskerville_400Regular_Italic";

type Props = {
  blocks: OreBlock[];
  meta: DayHoursMeta;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  /** Rubriche e segni *† in Ore; default rosso fisso legacy. */
  rubricColor?: string;
  /** Titoli salmo, croce di congiunzione; default oro fisso legacy. */
  goldColor?: string;
  headFontFamily?: string;
  headFontWeight?: AppFontWeight;
  afterFirstAnt?: React.ReactNode;
  /** Es. scelta Terza/Sesta/Nona subito sotto il box giorno, prima dell’apertura V./R. */
  afterHourHead?: React.ReactNode;
  /** y nel contenitore OreBlocksView (per scroll mirato, es. salto all’inno). */
  onBlockLayout?: (blockIndex: number, y: number) => void;
};

const LAB_RE = /^(V\.|R\.|Ant\.|Ant\. al (?:Ben|Magn)\.|\d+\s*ant\.|—)\s*/i;

/** Box giorno Ore: +20% sul vecchio indice (data 0.78, sotto 0.62, padV 10). */
const ORE_DAY_DATE = 0.94;
const ORE_DAY_SUB = 0.74;

export function OreHourHead({
  meta,
  fontSize,
  fontFamily,
  fontWeight,
  style,
}: {
  meta: DayHoursMeta;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: AppFontWeight;
  style?: StyleProp<ViewStyle>;
}) {
  const pill = meta.colorHex || "#1b5e20";
  const dateSize = Math.round(fontSize * ORE_DAY_DATE);
  const subSize = Math.round(fontSize * ORE_DAY_SUB);
  const boldOn = fontWeight && fontWeight !== "400";
  const dateFont = {
    fontSize: dateSize,
    lineHeight: Math.round(dateSize * 1.28),
    fontFamily,
    fontWeight: (boldOn ? fontWeight : "800") as AppFontWeight,
  };
  const subFont = {
    fontSize: subSize,
    lineHeight: Math.round(subSize * 1.32),
    fontFamily,
    fontWeight: (boldOn ? fontWeight : "700") as AppFontWeight,
  };
  return (
    <View style={[headStyles.box, { borderColor: pill }, style]} testID="ore-day-banner">
      <View style={[headStyles.pill, { backgroundColor: pill }]} />
      <View style={headStyles.body}>
        <Text style={[headStyles.line, dateFont]}>{meta.dateLabel}</Text>
        {meta.seasonLine ? (
          <Text style={[headStyles.line, subFont]}>{formatHourHeadLine(meta.seasonLine)}</Text>
        ) : null}
        {meta.psalterLine ? (
          <Text style={[headStyles.line, subFont]}>{formatHourHeadLine(meta.psalterLine)}</Text>
        ) : null}
      </View>
    </View>
  );
}

function stanzaHangLevel(lines: string[], j: number): number {
  const line = lines[j] || "";
  if (/^—/.test(line)) return 1;
  if (j <= 0) return 0;
  const prev = lines[j - 1] || "";
  // Flessa *† a fine riga; non la croce di congiunzione.
  if (/[*†]\s*$/.test(prev.replace(new RegExp(JOIN_CROSS_MARK, "g"), ""))) return 1;
  return 0;
}

function lineHang(b: Extract<OreBlock, { k: "stanza" }>, j: number): number {
  const heuristic = stanzaHangLevel(b.lines, j);
  if (!b.hang || j >= b.hang.length) return heuristic;
  // Max: hang CEI + euristica *† (se l'array è tutto 0 per strofe orfane).
  return Math.max(b.hang[j] || 0, heuristic);
}

function hangPad(fontSize: number, hang: number) {
  if (hang <= 0) return null;
  const em = hang >= 2 ? 1.85 : 1.1;
  return { paddingLeft: Math.round(fontSize * em) };
}

function LitLine({
  text,
  body,
  hang,
  responseBullet,
  rubricColor,
  goldColor,
}: {
  text: string;
  body: { fontFamily: string; fontSize: number; lineHeight: number; color: string };
  hang?: number;
  responseBullet?: boolean;
  rubricColor: string;
  goldColor: string;
}) {
  const ant = /\s*\(Ant\.\)\.?\s*$/i.test(text);
  const core = text.replace(/\s*\(Ant\.\)\.?\s*$/i, "");
  const lab = core.match(LAB_RE);
  const rest = lab ? core.slice(lab[0].length) : core;
  const pad = hangPad(body.fontSize, hang || 0);
  const useResponseBullet = responseBullet && lab?.[1] === "—";
  if (useResponseBullet) {
    const bulletSize = Math.round(body.fontSize * 1.24 * 0.85);
    return (
      <Text style={[body, pad]}>
        <Text
          style={[
            rubricStyle(body.fontSize, rubricColor),
            {
              fontFamily: FONT,
              fontSize: bulletSize,
              lineHeight: body.lineHeight,
            },
          ]}
        >
          ●{" "}
        </Text>
        {colorStars(rest, body, rubricColor, goldColor)}
        {ant ? <Text style={rubricStyle(body.fontSize, rubricColor)}> (Ant.).</Text> : null}
      </Text>
    );
  }
  return (
    <Text style={[body, pad]}>
      {lab ? (
        <Text style={rubricStyle(body.fontSize, rubricColor)}>{lab[1].replace(/\s+$/, "")} </Text>
      ) : null}
      {colorStars(rest, body, rubricColor, goldColor)}
      {ant ? <Text style={rubricStyle(body.fontSize, rubricColor)}> (Ant.).</Text> : null}
    </Text>
  );
}

function rubricStyle(fontSize: number, rubricColor: string) {
  return {
    color: rubricColor,
    fontFamily: FONT_IT,
    fontSize,
    fontWeight: "700" as const,
  };
}

function colorStars(
  text: string,
  body: { fontFamily: string; fontSize: number; color: string },
  rubricColor: string,
  goldColor: string,
) {
  const glued = text
    .replace(/ ([*†])/g, "\u00A0$1")
    .replace(new RegExp(` (${JOIN_CROSS_MARK})`, "g"), `\u00A0${JOIN_CROSS_MARK}`);
  const parts = glued.split(new RegExp(`(${JOIN_CROSS_MARK}|[*†])`)).filter((p) => p.length > 0);
  if (parts.length === 1) return glued;
  return parts.map((p, i) => {
    if (p === JOIN_CROSS_MARK) {
      return (
        <Text key={i} style={{ color: goldColor, fontFamily: body.fontFamily, fontSize: body.fontSize, fontWeight: "700" }}>
          †
        </Text>
      );
    }
    if (p === "*" || p === "†") {
      return (
        <Text key={i} style={rubricStyle(body.fontSize, rubricColor)}>
          {p}
        </Text>
      );
    }
    return (
      <Text key={i} style={{ color: body.color, fontFamily: body.fontFamily }}>
        {p}
      </Text>
    );
  });
}

export function OreBlocksView({
  blocks: rawBlocks,
  meta,
  fontSize,
  lineHeight,
  textColor,
  rubricColor = RUBRIC,
  goldColor = GOLD_TITLE,
  headFontFamily,
  headFontWeight,
  afterFirstAnt,
  afterHourHead,
  onBlockLayout,
}: Props) {
  const blocks = React.useMemo(() => enrichPsalmHeads(rawBlocks), [rawBlocks]);
  const wrapLayout = (index: number, node: React.ReactNode) => {
    if (!onBlockLayout) return node;
    return (
      <View
        key={index}
        collapsable={false}
        onLayout={(e) => onBlockLayout(index, e.nativeEvent.layout.y)}
      >
        {node}
      </View>
    );
  };
  const body = {
    fontFamily: FONT,
    fontSize,
    lineHeight,
    color: textColor,
  };
  const titleLh = Math.round(fontSize * 1.3 * 1.1);
  let antSeen = false;
  let inPrecesSection = false;
  let inPreces = false;

  return (
    <View>
      <OreHourHead
        meta={meta}
        fontSize={fontSize}
        fontFamily={headFontFamily}
        fontWeight={headFontWeight}
      />
      {afterHourHead}
      {blocks.map((b, i) => {
        if (b.k === "title" && /^(INVOCAZIONI|INTERCESSIONI)\b/i.test(b.text)) {
          inPrecesSection = true;
          inPreces = false;
        } else if (inPrecesSection && b.k === "title") {
          inPrecesSection = false;
          inPreces = false;
        }
        const node = renderBlock(
          b,
          i,
          body,
          fontSize,
          lineHeight,
          titleLh,
          textColor,
          inPreces,
          rubricColor,
          goldColor,
        );
        if (inPrecesSection && b.k === "tone") inPreces = true;
        if (b.k === "rubric" && /ant/i.test(b.lab) && !antSeen) {
          antSeen = true;
          if (!onBlockLayout) {
            return (
              <View key={i}>
                {node}
                {afterFirstAnt}
              </View>
            );
          }
          return (
            <View key={i} collapsable={false} onLayout={(e) => onBlockLayout(i, e.nativeEvent.layout.y)}>
              {node}
              {afterFirstAnt}
            </View>
          );
        }
        return wrapLayout(i, node);
      })}
    </View>
  );
}

function renderBlock(
  b: OreBlock,
  i: number,
  body: { fontFamily: string; fontSize: number; lineHeight: number; color: string },
  fontSize: number,
  lineHeight: number,
  titleLh: number,
  textColor: string,
  inPreces: boolean,
  rubricColor: string,
  goldColor: string,
) {
  const em = (n: number) => Math.round(fontSize * n);

  if (b.k === "title") {
    return (
      <Text
        key={i}
        style={{
          fontFamily: FONT,
          fontSize: Math.round(fontSize * 0.88),
          lineHeight: titleLh,
          color: goldColor,
          textAlign: "left",
          marginTop: em(0.85),
          marginBottom: em(0.35),
          letterSpacing: 0.2,
        }}
      >
        {b.text}
      </Text>
    );
  }
  if (b.k === "psalmHead") {
    return (
      <View key={i} style={{ marginTop: em(0.85), marginBottom: em(0.5) }}>
        <Text
          style={{
            fontFamily: FONT,
            fontSize: Math.round(fontSize * 0.95),
            lineHeight: titleLh,
            color: goldColor,
            textAlign: "center",
            marginBottom: 2,
          }}
        >
          {b.num}
        </Text>
        {b.name ? (
          <Text
            style={{
              fontFamily: FONT,
              fontSize: Math.round(fontSize * 0.88),
              lineHeight: titleLh,
              color: goldColor,
              textAlign: "center",
              marginBottom: em(0.28),
            }}
          >
            {b.name}
          </Text>
        ) : null}
        {b.cite && !/^\(/.test(b.cite.trim()) ? (
          <Text
            style={{
              fontFamily: FONT_IT,
              fontSize: Math.round(fontSize * 0.78),
              lineHeight: Math.round(fontSize * 1.4 * 1.1),
              color: CITE,
              textAlign: "center",
              marginBottom: em(0.12),
            }}
          >
            {b.cite}
          </Text>
        ) : null}
        {b.sub || (b.cite && /^\(/.test(b.cite.trim())) ? (
          <Text
            style={{
              fontFamily: FONT_IT,
              fontSize: Math.round(fontSize * 0.78),
              lineHeight: Math.round(fontSize * 1.4 * 1.1),
              color: SUB,
              textAlign: "center",
              marginBottom: em(0.5),
            }}
          >
            {b.sub}
            {b.cite && /^\(/.test(b.cite.trim()) ? (
              <Text style={{ fontFamily: FONT_IT, fontSize: Math.round(fontSize * 0.78), color: CITE }}>
                {b.sub ? " " : ""}
                {b.cite}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>
    );
  }
  if (b.k === "readHead") {
    const emRh = (n: number) => Math.round(fontSize * n);
    if (b.role === "source") {
      return (
        <Text
          key={i}
          style={{
            fontFamily: FONT,
            fontSize,
            lineHeight,
            color: textColor,
            textAlign: "center",
            marginTop: emRh(0.35),
            marginBottom: emRh(0.15),
          }}
        >
          {b.text}
        </Text>
      );
    }
    if (b.role === "ref") {
      return (
        <Text
          key={i}
          style={{
            fontFamily: FONT,
            fontSize: Math.round(fontSize * 0.92),
            lineHeight: Math.round(fontSize * 1.25),
            color: rubricColor,
            textAlign: "center",
            marginBottom: emRh(0.2),
          }}
        >
          {b.text}
        </Text>
      );
    }
    if (b.role === "theme") {
      return (
        <Text
          key={i}
          style={{
            fontFamily: FONT,
            fontSize: Math.round(fontSize * 0.95),
            lineHeight: titleLh,
            color: rubricColor,
            textAlign: "center",
            marginTop: emRh(0.25),
            marginBottom: emRh(0.55),
            fontWeight: "600",
          }}
        >
          {b.text}
        </Text>
      );
    }
    return (
      <Text
        key={i}
        style={{
          fontFamily: FONT_IT,
          fontSize: Math.round(fontSize * 0.78),
          lineHeight: Math.round(fontSize * 1.4 * 1.1),
          color: rubricColor,
          textAlign: "center",
          marginBottom: emRh(0.45),
        }}
      >
        {b.text}
      </Text>
    );
  }
  if (b.k === "sub") {
    // Riferimento di edizione (es. «(Nn. 1. 2; CCL 73, 1-3)»): sul CEI è rosso, non il titolo in oro.
    const editionRef = /^\([^)]*(?:\bNn\.|\bCCL\b|\bCSEL\b|\bSCh\b|\bPG\b|\bPL\b|\bLib\.|\bDisc\.|\bOpera omnia\b|\bCisterc)[^)]*\)$/i.test(
      b.text.trim(),
    );
    return (
      <Text
        key={i}
        style={{
          fontFamily: FONT_IT,
          fontSize: Math.round(fontSize * 0.78),
          lineHeight: Math.round(fontSize * 1.4 * 1.1),
          color: editionRef ? rubricColor : SUB,
          textAlign: "center",
          marginBottom: em(0.5),
        }}
      >
        {b.text}
      </Text>
    );
  }
  if (b.k === "rubric") {
    return (
      <Text key={i} style={[body, { marginTop: em(0.45), marginBottom: em(0.35) }]}>
        {b.lab ? <Text style={rubricStyle(fontSize, rubricColor)}>{b.lab} </Text> : null}
        <Text style={body}>{colorStars(b.text, body, rubricColor, goldColor)}</Text>
      </Text>
    );
  }
  if (b.k === "omit") {
    const cei = b.ceiRubric === true;
    return (
      <Text
        key={i}
        style={{
          fontFamily: cei ? FONT_IT : FONT,
          fontSize,
          lineHeight,
          fontStyle: cei ? "italic" : "normal",
          color: rubricColor,
          marginVertical: em(cei ? 0.85 : 0.7),
        }}
      >
        {b.text}
      </Text>
    );
  }
  if (b.k === "stanza") {
    return (
      <View key={i} style={{ marginVertical: em(0.85) }}>
        {b.lines.map((line, j) => (
          <LitLine
            key={j}
            text={line}
            body={body}
            hang={lineHang(b, j)}
            responseBullet={inPreces}
            rubricColor={rubricColor}
            goldColor={goldColor}
          />
        ))}
      </View>
    );
  }
  if (b.k === "hymn") {
    return (
      <View key={i} style={{ marginTop: em(0.6) }}>
        <Text
          style={{
            fontFamily: FONT,
            fontSize: Math.round(fontSize * 0.88),
            lineHeight: titleLh,
            color: goldColor,
            textAlign: "left",
            marginTop: em(0.85),
            marginBottom: em(0.35),
          }}
        >
          INNO
        </Text>
        {b.hymns.map((h, hi) => (
          <View key={hi}>
            {h.label ? (
              <Text
                style={{
                  fontFamily: FONT_IT,
                  fontSize,
                  lineHeight,
                  color: rubricColor,
                  marginVertical: em(0.7),
                }}
              >
                {h.label}
              </Text>
            ) : null}
            {h.stanzas.map((st, si) => (
              <View key={si} style={{ marginBottom: em(1.35) }}>
                {st.map((line, li) => (
                  <Text key={li} style={body}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (b.k === "marian") {
    return (
      <View key={i}>
        {b.antiphons.map((ant, ai) => (
          <View key={ai}>
            {ai > 0 ? (
              <Text
                style={{
                  fontFamily: FONT_IT,
                  fontSize,
                  lineHeight,
                  color: rubricColor,
                  marginVertical: em(0.7),
                }}
              >
                Oppure:
              </Text>
            ) : null}
            <View style={{ marginBottom: em(1.35) }}>
              {ant.map((line, li) => (
                <Text key={li} style={body}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }
  if (b.k === "tone") {
    const introLines = b.intro.split("\n").filter((l) => l.trim());
    return (
      <View key={i} style={{ marginTop: em(0.85), marginBottom: em(0.55) }}>
        {introLines.map((line, li) => (
          <Text
            key={li}
            style={{
              fontFamily: FONT,
              fontSize,
              lineHeight,
              color: textColor,
              ...(li > 0 ? hangPad(fontSize, 1) : null),
            }}
          >
            {line}
          </Text>
        ))}
        {b.refrain ? (
          <Text
            style={{
              fontFamily: FONT_IT,
              fontSize: Math.round(fontSize * 1.2),
              lineHeight: Math.round(lineHeight * 1.2),
              color: goldColor,
              marginTop: em(0.4),
            }}
          >
            {b.refrain}
          </Text>
        ) : null}
      </View>
    );
  }
  if (b.k === "prose") {
    return (
      <Text key={i} style={[body, { marginTop: em(0.85), marginBottom: em(0.45) }]}>
        {b.text}
      </Text>
    );
  }
  return (
    <Text key={i} style={[body, { marginTop: em(0.85), marginBottom: em(0.45) }]}>
      {b.text}
    </Text>
  );
}

const headStyles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#000",
    borderWidth: 3,
    borderRadius: 12,
  },
  pill: {
    width: 8,
    borderRadius: 99,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    justifyContent: "center",
  },
  line: {
    color: "#fff",
  },
});
