import React from "react";
import { Text, TextStyle } from "react-native";

const LITURGICAL_CROSS = "✠";

/** Prefisso interno: rubriche PE I nel testo appiattito (non visibile). */
export const PE1_RUBRIC_PREFIX = "<<RUBRIC>>";

export function isPe1RubricLine(line: string): boolean {
  return line.startsWith(PE1_RUBRIC_PREFIX);
}

export function unwrapPe1RubricLine(line: string): string {
  return isPe1RubricLine(line) ? line.slice(PE1_RUBRIC_PREFIX.length) : line;
}

/**
 * Croce ✠ e parentesi [ ] in colore accento (rubriche);
 * il resto della riga segue textStyle.
 */
export function renderPeLineWithRedCross(
  line: string,
  textStyle: TextStyle,
  crossColor: string,
): React.ReactNode {
  if (!line.includes(LITURGICAL_CROSS) && !line.includes("[") && !line.includes("]")) {
    return line;
  }
  const parts = line.split(/(✠|\[|\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part === LITURGICAL_CROSS || part === "[" || part === "]") {
          return (
            <Text key={i} style={{ color: crossColor }}>
              {part}
            </Text>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function isPeConsecrationLine(line: string): boolean {
  const alphaChars = line.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  return alphaChars.length >= 5 && alphaChars === alphaChars.toUpperCase();
}
