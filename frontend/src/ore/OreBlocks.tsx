import React from "react";
import { Text, View, StyleSheet } from "react-native";
import type { OreBlock } from "./types";
import type { DayHoursMeta } from "./types";

const GOLD = "#E0B429";
const FONT = "LibreBaskerville_400Regular";
const FONT_IT = "LibreBaskerville_400Regular_Italic";

type Props = {
  blocks: OreBlock[];
  meta: DayHoursMeta;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  rubricColor: string;
  afterFirstAnt?: React.ReactNode;
};

function endsHang(line: string): boolean {
  const core = line.replace(/\s*\(Ant\.\)\.?\s*$/i, "").trim();
  return /[*†]$/.test(core);
}

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

export function OreBlocksView({
  blocks,
  meta,
  fontSize,
  lineHeight,
  textColor,
  rubricColor,
  afterFirstAnt,
}: Props) {
  const body = { fontFamily: FONT, fontSize, lineHeight, color: textColor, fontWeight: "400" as const };
  let antSeen = false;

  return (
    <View>
      <OreHourHead meta={meta} fontSize={fontSize} />
      {blocks.map((b, i) => {
        const node = renderBlock(b, i, body, fontSize, rubricColor);
        if (b.k === "rubric" && /^Ant/i.test(b.lab) && !antSeen) {
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
  body: { fontFamily: string; fontSize: number; lineHeight: number; color: string; fontWeight: "400" },
  fontSize: number,
  rubricColor: string,
) {
  if (b.k === "title") {
    return (
      <Text key={i} style={[body, styles.title, { marginTop: Math.round(fontSize * 0.9) }]}>
        {b.text}
      </Text>
    );
  }
  if (b.k === "psalmHead") {
    return (
      <View key={i} style={{ marginTop: Math.round(fontSize * 0.8), marginBottom: 4 }}>
        <Text style={[body, { color: GOLD, fontSize: Math.round(fontSize * 1.05) }]}>{b.num}</Text>
        {b.name ? <Text style={body}>{b.name}</Text> : null}
        {b.sub || b.cite ? (
          <Text style={[body, { fontFamily: FONT_IT, fontSize: Math.round(fontSize * 0.82) }]}>
            {b.sub}
            {b.cite ? ` ${b.cite}` : ""}
          </Text>
        ) : null}
      </View>
    );
  }
  if (b.k === "sub") {
    return (
      <Text key={i} style={[body, { fontFamily: FONT_IT, fontSize: Math.round(fontSize * 0.82) }]}>
        {b.text}
      </Text>
    );
  }
  if (b.k === "rubric") {
    return (
      <Text key={i} style={[body, { marginTop: 6 }]}>
        {b.lab ? <Text style={{ color: rubricColor, fontFamily: FONT }}>{b.lab} </Text> : null}
        <Text style={body}>{b.text}</Text>
      </Text>
    );
  }
  if (b.k === "omit") {
    return (
      <Text key={i} style={[body, { fontFamily: FONT_IT, marginVertical: 8, color: rubricColor }]}>
        {b.text}
      </Text>
    );
  }
  if (b.k === "stanza") {
    return (
      <View key={i} style={{ marginTop: Math.round(fontSize * 0.45) }}>
        {b.lines.map((line, j) => {
          const ant = /\s*\(Ant\.\)\.?\s*$/i.test(line);
          const core = line.replace(/\s*\(Ant\.\)\.?\s*$/i, "");
          return (
            <Text
              key={j}
              style={[body, !endsHang(line) ? { paddingLeft: Math.round(fontSize * 1.1) } : null]}
            >
              {core}
              {ant ? <Text style={{ color: rubricColor, fontFamily: FONT }}> (Ant.).</Text> : null}
            </Text>
          );
        })}
      </View>
    );
  }
  if (b.k === "hymn") {
    return (
      <View key={i} style={{ marginTop: Math.round(fontSize * 0.6) }}>
        <Text style={[body, styles.title]}>INNO</Text>
        {b.hymns.map((h, hi) => (
          <View key={hi}>
            {h.label ? (
              <Text style={[body, { fontFamily: FONT_IT, marginVertical: 8, color: rubricColor }]}>
                {h.label}
              </Text>
            ) : null}
            {h.stanzas.map((st, si) => (
              <View key={si} style={{ marginTop: Math.round(fontSize * 0.55) }}>
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
              <Text style={[body, { fontFamily: FONT_IT, marginVertical: 8, color: rubricColor }]}>
                Oppure:
              </Text>
            ) : null}
            <View style={{ marginTop: 4 }}>
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
    <Text key={i} style={[body, { marginTop: 8 }]}>
      {b.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: "400",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});

const headStyles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 16,
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
  },
  sub: {
    color: "#fff",
    fontWeight: "800",
  },
});
