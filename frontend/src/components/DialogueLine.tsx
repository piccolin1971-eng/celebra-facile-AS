import React from "react";
import { Text, TextStyle } from "react-native";

export type DialogueRole = "celebrant" | "assembly";

const MARKERS: Record<DialogueRole, string> = {
  celebrant: "C.",
  assembly: "A.",
};

/** Rimuove un eventuale prefisso C./A. già presente nel testo sorgente. */
export function dialogueBodyText(role: DialogueRole, text: string): string {
  const re = role === "celebrant" ? /^C\.\s*/i : /^A\.\s*/i;
  return (text ?? "").replace(re, "");
}

type Props = {
  role: DialogueRole;
  text: string;
  baseStyle: TextStyle;
  markerColor: string;
};

/**
 * Riga di dialogo liturgico: solo i caratteri «C.» / «A.» usano markerColor;
 * il resto del testo segue baseStyle (incluso il corsivo per l'assemblea).
 */
export function DialogueLine({ role, text, baseStyle, markerColor }: Props) {
  const body = dialogueBodyText(role, text);
  const marker = MARKERS[role];
  const bodyColor = baseStyle.color;

  return (
    <Text
      style={[baseStyle, role === "assembly" ? { fontStyle: "normal" } : null]}
      selectable
    >
      <Text style={{ color: markerColor, fontWeight: "700", fontStyle: "normal" }}>
        {marker}{" "}
      </Text>
      {role === "assembly" ? (
        <Text style={{ fontStyle: "italic", color: bodyColor }}>{body}</Text>
      ) : (
        <Text style={{ color: bodyColor }}>{body}</Text>
      )}
    </Text>
  );
}
