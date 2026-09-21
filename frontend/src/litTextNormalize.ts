/**
 * Normalizzazioni tipografiche su testi liturgici CEI.
 * Es. «E' Cristo» (macchina da scrivere) → «È Cristo».
 * Non tocca «De'», «NE'», ecc. (lettera prima di E).
 */
const APOS = "[''`\\u2018\\u2019\\u2032\\u00B4]";
const BEFORE = "(^|[^A-Za-zÀ-ÖØ-öø-ÿ])";

const TYPEWRITER_CAP: Array<[RegExp, string]> = [
  [new RegExp(`${BEFORE}A${APOS}`, "g"), "$1À"],
  [new RegExp(`${BEFORE}E${APOS}`, "g"), "$1È"],
  [new RegExp(`${BEFORE}I${APOS}`, "g"), "$1Ì"],
  [new RegExp(`${BEFORE}O${APOS}`, "g"), "$1Ò"],
  [new RegExp(`${BEFORE}U${APOS}`, "g"), "$1Ù"],
];

export function normalizeTypewriterCapAccents(s: string): string {
  let out = s;
  for (const [re, rep] of TYPEWRITER_CAP) {
    out = out.replace(re, rep);
  }
  return out;
}
