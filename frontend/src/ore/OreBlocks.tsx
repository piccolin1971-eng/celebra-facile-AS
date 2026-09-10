import React from "react";
import { Text, View, StyleSheet } from "react-native";
import type { OreBlock, DayHoursMeta } from "./types";

const GOLD_TITLE = "#c4b06a";
const RUBRIC = "#E24B4B";
const SUB = "#b7c4b0";
const CITE = "#8a9688";
const FONT = "LibreBaskerville_400Regular";
const FONT_IT = "LibreBaskerville_400Regular_Italic";

type Props = {
  blocks: OreBlock[];
  meta: DayHoursMeta;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  afterFirstAnt?: React.ReactNode;
};

const LAB_RE = /^(V\.|R\.|Ant\.|Ant\. al Ben\.|\d+\s*ant\.|—)\s*/i;

export function OreHourHead({
  meta,
  fontSize,
}: {
  meta: DayHoursMeta;
  fontSize: number;
}) {
  const pill = meta.colorHex || "#1b5e20";
  const dateSize = Math.round(fontSize * 0.95);
  const subSize = Math.round(fontSize * 0.82);
  return (
    <View style={[headStyles.box, { borderColor: pill }]}>
      <View style={[headStyles.pill, { backgroundColor: pill }]} />
      <View style={headStyles.body}>
        <Text style={[headStyles.date, { fontSize: dateSize, lineHeight: Math.round(dateSize * 1.28) }]}>
          {meta.dateLabel}
        </Text>
        {meta.seasonLine ? (
          <Text style={[headStyles.sub, { fontSize: subSize, lineHeight: Math.round(subSize * 1.28) }]}>
            {meta.seasonLine}
          </Text>
        ) : null}
        {meta.psalterLine ? (
          <Text style={[headStyles.sub, { fontSize: subSize, lineHeight: Math.round(subSize * 1.28) }]}>
            {meta.psalterLine}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function LitLine({
  text,
  body,
  hang,
}: {
  text: string;
  body: { fontFamily: string; fontSize: number; lineHeight: number; color: string };
  hang?: boolean;
}) {
  const ant = /\s*\(Ant\.\)\.?\s*$/i.test(text);
  const core = text.replace(/\s*\(Ant\.\)\.?\s*$/i, "");
  const lab = core.match(LAB_RE);
  const rest = lab ? core.slice(lab[0].length) : core;
  const pad = hang ? { paddingLeft: Math.round(body.fontSize * 1.1) } : null;
  return (
    <Text style={[body, pad]}>
      {lab ? <Text style={rubricStyle(body.fontSize)}>{lab[1].replace(/\s+$/, "")} </Text> : null}
      {colorStars(rest, body)}
      {ant ? <Text style={rubricStyle(body.fontSize)}> (Ant.).</Text> : null}
    </Text>
  );
}

function rubricStyle(fontSize: number) {
  return {
    color: RUBRIC,
    fontFamily: FONT_IT,
    fontSize,
    fontWeight: "700" as const,
  };
}

function colorStars(text: string, body: { fontFamily: string; fontSize: number; color: string }) {
  const parts = text.split(/([*†])/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    p === "*" || p === "†" ? (
      <Text key={i} style={rubricStyle(body.fontSize)}>
        {p}
      </Text>
    ) : (
      <Text key={i} style={{ color: body.color, fontFamily: body.fontFamily }}>
        {p}
      </Text>
    ),
  );
}

export function OreBlocksView({
  blocks,
  meta,
  fontSize,
  lineHeight,
  textColor,
  afterFirstAnt,
}: Props) {
  const body = {
    fontFamily: FONT,
    fontSize,
    lineHeight,
    color: textColor,
  };
  const titleLh = Math.round(fontSize * 1.3 * 1.1);
  let antSeen = false;

  return (
    <View>
      <OreHourHead meta={meta} fontSize={fontSize} />
      {blocks.map((b, i) => {
        const node = renderBlock(b, i, body, fontSize, lineHeight, titleLh, textColor);
        if (b.k === "rubric" && /ant/i.test(b.lab) && !antSeen) {
          antSeen = true;
          return (
            <View key={i}>
              {node}
              {afterFirstAnt}
            </View>
          );
        }
        return node;
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
          color: GOLD_TITLE,
          textAlign: "center",
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
            color: GOLD_TITLE,
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
              color: GOLD_TITLE,
              textAlign: "center",
              marginBottom: em(0.28),
            }}
          >
            {b.name}
          </Text>
        ) : null}
        {b.sub || b.cite ? (
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
            {b.cite ? (
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
  if (b.k === "sub") {
    return (
      <Text
        key={i}
        style={{
          fontFamily: FONT_IT,
          fontSize: Math.round(fontSize * 0.78),
          lineHeight: Math.round(fontSize * 1.4 * 1.1),
          color: SUB,
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
        {b.lab ? <Text style={rubricStyle(fontSize)}>{b.lab} </Text> : null}
        <Text style={body}>{b.text}</Text>
      </Text>
    );
  }
  if (b.k === "omit") {
    return (
      <Text
        key={i}
        style={{
          fontFamily: FONT_IT,
          fontSize,
          lineHeight,
          color: RUBRIC,
          marginVertical: em(0.7),
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
          <LitLine key={j} text={line} body={body} hang={j > 0} />
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
            color: GOLD_TITLE,
            textAlign: "center",
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
                  color: RUBRIC,
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
                  color: RUBRIC,
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
    paddingVertical: 10,
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
    gap: 4,
  },
  date: {
    color: "#fff",
    fontWeight: "800",
    fontFamily: undefined,
  },
  sub: {
    color: "#fff",
    fontWeight: "800",
    fontFamily: undefined,
  },
});
