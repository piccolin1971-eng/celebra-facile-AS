/**
 * Controlli automatici (senza rete) su Compieta bundled e croce d'oro.
 * Esegui: yarn test:ore-parsers
 */
import { getBundledCompline } from "../src/ore/complineBundled";
import {
  JOIN_CROSS_MARK,
  joinCrossAfterAsterisk,
  joinCrossAtLineStart,
  normalizeJoinCrossBlocks,
  placeJoinCrossAfterAntiphonEcho,
} from "../src/ore/joinCross";
import type { OreBlock } from "../src/ore/types";

const show = (s: string) => s.replaceAll(JOIN_CROSS_MARK, "†");

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

function assert(cond: boolean, msg: string) {
  if (!cond) fail(msg);
}

function expectEchoThenCross(lines: string[], label: string) {
  assert(lines.length >= 2, `${label}: servono almeno 2 righe`);
  assert(!lines[0].includes(JOIN_CROSS_MARK), `${label}: eco senza †`);
  assert(/dal profondo/i.test(lines[0]), `${label}: eco dell'antifona`);
  assert(joinCrossAtLineStart(lines[1]), `${label}: † a inizio 2ª riga`);
  assert(!joinCrossAfterAsterisk(lines[0]) && !joinCrossAfterAsterisk(lines[1]), `${label}: niente † dopo *`);
}

const ant = `Dal profondo a te grido, o Signore! ${JOIN_CROSS_MARK}`;

// Mid-line CEI → spezza
{
  const r = placeJoinCrossAfterAntiphonEcho(ant, [
    `Dal profondo a te grido, o Signore; * ${JOIN_CROSS_MARK} Signore, ascolta la mia voce.`,
    "Siano i tuoi orecchi attenti *",
  ]);
  expectEchoThenCross(r.lines, "mid-line");
}

// † prima dell'eco → correggi
{
  const r = placeJoinCrossAfterAntiphonEcho(ant, [
    `${JOIN_CROSS_MARK} Dal profondo a te grido, o Signore; *`,
    "Signore, ascolta la mia voce.",
  ]);
  expectEchoThenCross(r.lines, "†-prima-eco");
}

// Eco tolta per errore → ripristina
{
  const r = placeJoinCrossAfterAntiphonEcho(ant, [
    `${JOIN_CROSS_MARK} Signore, ascolta la mia voce.`,
    "Siano i tuoi orecchi attenti *",
  ]);
  expectEchoThenCross(r.lines, "eco-ripristinata");
}

// normalizeJoinCrossBlocks su blocchi sporchi
{
  const dirty: OreBlock[] = [
    { k: "rubric", lab: "2 ant.", text: ant },
    { k: "psalmHead", num: "SALMO 129", name: "", sub: "", cite: "" },
    {
      k: "stanza",
      lines: [`Dal profondo a te grido, o Signore; * ${JOIN_CROSS_MARK} Signore, ascolta la mia voce.`],
    },
  ];
  const fixed = normalizeJoinCrossBlocks(dirty);
  const st = fixed[2];
  assert(st?.k === "stanza", "normalize: stanza");
  if (st.k === "stanza") expectEchoThenCross(st.lines, "normalize");
}

// Compieta mercoledì bundled (2026-10-07)
{
  const iso = "2026-10-07";
  const parsed = getBundledCompline(iso);
  assert(!!parsed?.blocks?.length, "compieta bundled presente");
  const blocks = parsed!.blocks;
  assert(blocks.some((b) => b.k === "marian"), "compieta: antifone mariane");
  const head = blocks.findIndex((b) => b.k === "psalmHead" && /129/.test(b.num));
  assert(head >= 0, "compieta: Salmo 129");
  const openAnt = blocks[head - 1];
  assert(
    openAnt?.k === "rubric" && /ant/i.test(openAnt.lab) && openAnt.text.includes(JOIN_CROSS_MARK),
    "compieta: 2 ant. con †",
  );
  const st = blocks[head + 1];
  assert(st?.k === "stanza", "compieta: strofa dopo 129");
  if (st.k === "stanza") {
    console.log("compieta 129:", st.lines.map(show));
    expectEchoThenCross(st.lines, "compieta-wed");
  }
  const nunc = blocks.some(
    (b) =>
      (b.k === "psalmHead" && /SIMEONE|Nunc/i.test(b.num + b.name)) ||
      (b.k === "stanza" && b.lines.some((l) => /lascia,?\s*o Signore/i.test(l))),
  );
  assert(nunc, "compieta: Nunc dimittis");
}

console.log("OK test-ore-parsers");
