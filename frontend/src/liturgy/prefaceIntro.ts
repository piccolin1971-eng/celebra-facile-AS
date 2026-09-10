/** Dialoghi fissi che precedono il prefazio eucaristico (Messale Romano). */
export type PrefaceDialoguePair = { c: string; a: string };

export const PREFACE_DIALOGUES: PrefaceDialoguePair[] = [
  { c: "Il Signore sia con voi.", a: "E con il tuo spirito." },
  { c: "In alto i nostri cuori.", a: "Sono rivolti al Signore." },
  { c: "Rendiamo grazie al Signore, nostro Dio.", a: "È cosa buona e giusta." },
];

export function pushPrefaceDialogues(
  pushCelebrant: (text: string) => void,
  pushAssembly: (text: string) => void,
  afterPair?: () => void,
): void {
  for (const d of PREFACE_DIALOGUES) {
    pushCelebrant(d.c);
    pushAssembly(d.a);
    afterPair?.();
  }
}
