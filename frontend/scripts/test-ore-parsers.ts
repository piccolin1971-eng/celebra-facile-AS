/**
 * Controlli automatici (senza rete) su Compieta bundled e croce d'oro.
 * Esegui: yarn test:ore-parsers
 */
import { getBundledCompline } from "../src/ore/complineBundled";
import {
  JOIN_CROSS_MARK,
  hasJoinCross,
  joinCrossAfterAsterisk,
  joinCrossAtLineStart,
  fixMidLineJoinCrossLines,
  normalizeJoinCrossBlocks,
  placeJoinCrossAfterAntiphonEcho,
} from "../src/ore/joinCross";
import { peelGluedCanticleCites } from "../src/ore/parseHour";
import { enrichPsalmHead, enrichPsalmHeads } from "../src/ore/psalmHeadings";
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

// «eco * † resto» senza eco riconosciuta (punteggiatura) ma con * prima della †
{
  const ant = "Ti amo, Signore, mia forza.";
  const r = placeJoinCrossAfterAntiphonEcho(`${ant} ${JOIN_CROSS_MARK}`, [
    `Ti amo, Signore, mia forza, * ${JOIN_CROSS_MARK} Signore, mia roccia, *`,
  ]);
  assert(r.lines.length >= 2, "ti amo: spezzato");
  assert(!joinCrossAfterAsterisk(r.lines[0]), "ti amo: eco senza † dopo *");
  assert(joinCrossAtLineStart(r.lines[1]), "ti amo: † a inizio 2ª riga");
}

// † a metà strofa (Sal 147 lodi): eco interna, non testo dell’antifona
{
  const lines = fixMidLineJoinCrossLines([
    "Glorifica il Signore, Gerusalemme, *",
    `loda, Sion, il tuo Dio. ${JOIN_CROSS_MARK} Perché ha rinforzato le sbarre delle tue porte, *`,
    "in mezzo a te ha benedetto i tuoi figli.",
  ]);
  assert(lines.length === 4, "sal147: quattro righe");
  assert(joinCrossAtLineStart(lines[2]), "sal147: † a inizio riga");
}

// Salmo senza † in antifona ma † nel corpo dopo l’eco (IV sett.)
{
  const ant = "Loda, Sion, il tuo Dio.";
  const dirty: OreBlock[] = [
    { k: "rubric", lab: "1 ant.", text: ant },
    { k: "psalmHead", num: "SALMO 147", name: "", sub: "", cite: "" },
    {
      k: "stanza",
      lines: [`loda, Sion, il tuo Dio. ${JOIN_CROSS_MARK} Perché ha rinforzato le sbarre delle tue porte, *`],
    },
  ];
  const fixed = normalizeJoinCrossBlocks(dirty);
  const st = fixed[2];
  assert(st?.k === "stanza", "loda sion: stanza");
  if (st.k === "stanza") {
    assert(!hasJoinCross(st.lines[0]) || !st.lines[0].includes(JOIN_CROSS_MARK), "loda sion: eco pulita");
    assert(joinCrossAtLineStart(st.lines[1] || st.lines[0]), "loda sion: † a inizio riga resto");
  }
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

// Cantico «Cfr. Col …»: cite staccata, tematica in name (CEI lo_rosso → oro)
{
  const [head] = peelGluedCanticleCites([
    {
      k: "psalmHead",
      num: "CANTICO Cfr. Col 1, 3. 12-20",
      name: "Cristo fu generato prima di ogni creatura, è il primogenito di coloro che risuscitano dai morti",
      sub: "",
      cite: "",
    },
  ]);
  assert(head?.k === "psalmHead", "cfr: psalmHead");
  if (head.k === "psalmHead") {
    assert(/CANTICO\s+Cfr\./i.test(head.num), "cfr: titolo con Cfr");
    assert(/Col\s+1,\s*3\.\s*12-20/i.test(head.num), "cfr: ref nel titolo oro");
    assert(head.cite === "", "cfr: niente riga cite grigia");
    assert(/Cristo fu generato/i.test(head.name), "cfr: tematica in name");
    assert(head.sub === "", "cfr: no sub grigio");
  }
  assert(head.k === "psalmHead", "cfr: head type");
  const enriched = enrichPsalmHead(head);
  assert(/Cristo fu generato/i.test(enriched.name), "cfr enrich: tematica in name");
  assert(enriched.sub === "", "cfr enrich: sub vuoto");
  assert(enriched.cite === "", "cfr enrich: cite non duplicata");
  assert(head.k === "psalmHead", "cfr: type");
  const withDupCite = enrichPsalmHead({ ...head, cite: "Col 1, 3. 12-20" });
  assert(withDupCite.cite === "", "cfr enrich: cite tolta se già nel titolo");
}

// Sal 147: nome+sub dal CEI, cite da psalmHeadings + niente prose duplicata
{
  const head = enrichPsalmHead({
    k: "psalmHead",
    num: "SALMO 147",
    name: "La Gerusalemme riedificata",
    sub: "Vieni, ti mostrerò la fidanzata, la sposa dell'Agnello",
    cite: "",
  });
  assert(head.cite === "(Ap 21, 9).", "sal147: cite da json");
  const blocks = enrichPsalmHeads([
    head,
    { k: "prose", text: "(Ap 21, 9)." },
    { k: "stanza", lines: ["Glorifica il Signore, Gerusalemme, *"] },
  ]);
  assert(blocks.length === 2, "sal147: prose cite rimossa");
  assert(blocks[0].k === "psalmHead" && blocks[0].cite === "(Ap 21, 9).", "sal147: head cite");
  assert(blocks[1].k === "stanza", "sal147: versetti dopo head");
}

console.log("OK test-ore-parsers");
