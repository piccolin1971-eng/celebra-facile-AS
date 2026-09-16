import { parseHourHtml, extractInvitatoryAntiphon, splitOraMediaHtml } from "../src/ore/parseHour";
import { extractHoursBanner } from "../src/ore/html";
import { splitPsalmTitle } from "../src/ore/bundled";
import { hymnNeedsItalianAlternate, prependItalianHymn } from "../src/ore/hymnLang";
import { parseLdoHymn } from "../src/ore/ldo";
import { packSegmentIndicesIntoPages } from "../src/liturgyPaginationEngine";
import { hourHeadMeta } from "../src/ore/dayHead";
import { ceiHourSlug, hourTitle } from "../src/ore/titles";
import { parseLocalDate } from "../src/dateUtils";
import type { OreBlock, OreHourId } from "../src/ore/types";

const START = "2026-09-10";
const DAYS = 20;
const PARSE_PASSES = 10;
const HOURS: OreHourId[] = ["invitatorio", "ufficio", "lodi", "ora-media", "vespri", "compieta"];
const JUNK = /facebook|twitter|whatsapp|condividi|\bsharer\.php|\bjavascript:/i;
const ENTITY = /&(?:egrave|eacute|agrave|ograve|ugrave|igrave|aelig|oelig|nbsp|rsquo|dagger|laquo)[;]?/i;

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function blobOf(blocks: OreBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "stanza") return b.lines.join("\n");
      if (b.k === "hymn") return b.hymns.map((h) => h.stanzas.map((s) => s.join("\n")).join("\n\n")).join("\n");
      if (b.k === "rubric") return `${b.lab} ${b.text}`;
      if (b.k === "psalmHead") return `${b.num} ${b.name} ${b.sub} ${b.cite}`;
      if (b.k === "marian") return b.antiphons.map((a) => a.join(" ")).join(" ");
      if (b.k === "tone") return `${b.intro}\n${b.refrain}`;
      if (b.k === "title" || b.k === "sub" || b.k === "omit" || b.k === "prose") return b.text;
      return "";
    })
    .join("\n");
}

function hymnStats(blocks: OreBlock[]) {
  const hymns = blocks.filter((b): b is Extract<OreBlock, { k: "hymn" }> => b.k === "hymn");
  const nHymns = hymns.reduce((n, h) => n + h.hymns.length, 0);
  const st = hymns.reduce((n, h) => n + h.hymns.reduce((m, x) => m + x.stanzas.length, 0), 0);
  const labels = hymns.flatMap((h) => h.hymns.map((x) => x.label || ""));
  return { hymns, nHymns, st, labels };
}

function issuesFor(label: string, blocks: OreBlock[], extra: string[] = []): string[] {
  const out = [...extra];
  const blob = blobOf(blocks);
  if (!blocks.length) out.push("VUOTO");
  if (JUNK.test(blob)) out.push("JUNK_SOCIAL");
  if (ENTITY.test(blob)) out.push("ENTITA_HTML");
  if (/Grandezza Testo|cci-share|Invia\s+Stampa/i.test(blob)) out.push("CHROME_CEI");
  const { hymns, nHymns, st } = hymnStats(blocks);
  if (!label.includes("invitatorio") && st === 0 && !/Te Deum/i.test(blob)) {
    out.push("SENZA_INNO");
  }
  for (const h of hymns) {
    for (const hy of h.hymns) {
      if (hy.label && /^Oppure\b/i.test(hy.label) === false && /^Oppure:?$/i.test(hy.stanzas[0]?.[0] || "")) {
        out.push("OPPURE_COME_STROFA");
      }
      for (const stanza of hy.stanzas) {
        const first = stanza[0] || "";
        if (stanza.length < 2 && !/^Amen\.?$/i.test(first)) {
          out.push(`STROFA_CORTA(${stanza.length}:${first.slice(0, 24)})`);
        }
        if (stanza.length > 8) out.push(`STROFA_LUNGA(${stanza.length})`);
        if (/^Oppure:?$/i.test(first) && stanza.length <= 2) out.push("OPPURE_COME_STROFA");
      }
    }
  }
  if (nHymns >= 2 && !hymns.some((h) => h.hymns.some((x) => x.label && /^Oppure\b/i.test(x.label)))) {
    out.push("SECONDO_INNO_SENZA_OPPURE");
  }
  if (
    blocks.some((b, i) => {
      if (b.k !== "prose" || b.text.length <= 400) return false;
      if (JUNK.test(b.text)) return true;
      for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
        const prev = blocks[j];
        if (prev.k === "title" && /LETTURA|ORAZIONE|RESPONSORIO/i.test(prev.text)) return false;
        if (prev.k === "sub" || prev.k === "omit") continue;
        if (prev.k === "prose" && prev.text.length < 400) continue;
        if (prev.k === "stanza") continue;
        break;
      }
      return b.text.length > 1200;
    })
  ) {
    out.push("PROSA_LUNGA");
  }
  return out;
}

async function fetchHtml(dateISO: string, slug: string): Promise<string> {
  const data = dateISO.replace(/-/g, "");
  const url = `http://localhost:8081/cei-ore?data-liturgia=${data}&ora=${encodeURIComponent(slug)}`;
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        last = `HTTP ${res.status} ${slug}`;
        if (attempt < 3) await sleep(800 * attempt);
        continue;
      }
      const html = await res.text();
      if (html.length < 400) {
        last = `HTML corto ${html.length} ${slug}`;
        if (attempt < 3) await sleep(800 * attempt);
        continue;
      }
      return html;
    } catch (e) {
      last = (e as Error).message;
      if (attempt < 3) await sleep(800 * attempt);
    }
  }
  throw new Error(last || `fetch ${slug}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function expectedSlug(hour: OreHourId, date: Date): string {
  return ceiHourSlug(hour, date);
}

function selfTests(): string[] {
  const fails: string[] = [];
  const wrap = (inner: string) =>
    `<div class="cci-opere-giorni-liturgia">GIOVEDI' - XXIII SETTIMANA DEL TEMPO ORDINARIO - III SETTIMANA DEL SALTERIO</div><div class="cci-liturgia-ore">${inner}</div>`;

  const oppureHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Te lucis ante términum,<br>rerum Creator, póscimus</div>
    <div class="lo_rosso">Oppure:</div>
    <div class="lo_versetto">Gesù, luce da luce,<br>splendore del Padre,</div>
    <div class="lo_titolo">SALMO 4</div>
    <div class="lo_sottotitolo">Sicuro riposo in Dio</div>
    <div class="lo_versetto">Quando ti invoco, rispondimi, * Dio mia giustizia;</div>
  `);
  const oppure = parseHourHtml(oppureHtml, "compieta");
  const oh = hymnStats(oppure.blocks);
  if (oh.nHymns !== 2) fails.push(`fixture Oppure inni=${oh.nHymns} attesi 2`);
  if (!oh.labels.some((l) => /^Oppure\b/i.test(l))) fails.push("fixture Oppure senza label");
  if (!oppure.blocks.some((b) => b.k === "psalmHead")) fails.push("fixture Oppure senza salmo dopo inno");

  const latinHtml = wrap(`
    <div class="lo_versetto">
      <div class="lo_rosso">INNO</div>
      Virgo v&iacute;rgimum pr&aelig;cl&aacute;ra,<br>
      mihi iam non sis am&aacute;ra,<br>
      fac me tecum pl&aacute;ngere.<br><br>
      Iuxta crucem tecum stare,<br>
      et me tibi soci&aacute;re<br>
      in planctu des&iacute;dero.
    </div>
    <div class="lo_versetto">1 ant. Cristo, nostra pace.</div>
    <div class="lo_titolo">SALMO 122</div>
    <div class="lo_versetto">A te levo i miei occhi, * a te che abiti nei cieli.</div>
  `);
  const latin = parseHourHtml(latinHtml, "vespri");
  const lh = hymnStats(latin.blocks);
  if (lh.nHymns < 1) fails.push("fixture latino SENZA_INNO");
  if (lh.st < 2) fails.push(`fixture latino strofe=${lh.st} attese >=2`);
  const latinBlob = blobOf(latin.blocks);
  if (!/præclára|præclara|praeclara/i.test(latinBlob) && !/præcl/i.test(latinBlob)) {
    if (/&aelig;|&aacute;/.test(latinBlob)) fails.push("fixture latino ENTITA_HTML");
    else if (!/Virgo/.test(latinBlob)) fails.push("fixture latino testo assente");
  }
  if (latin.blocks.filter((b) => b.k === "psalmHead").length < 1) fails.push("fixture latino senza salmo");

  const banner = extractHoursBanner(oppureHtml);
  const meta = hourHeadMeta("2026-09-10", "", banner);
  if (!/XXIII Settimana del Tempo Ordinario/i.test(meta.seasonLine)) fails.push(`fixture banner season=${meta.seasonLine}`);
  if (!/III Settimana del Salterio/i.test(meta.psalterLine)) fails.push(`fixture banner psalter=${meta.psalterLine}`);

  const sunBanner = extractHoursBanner(
    `<div class="cci-opere-giorni-liturgia">DOMENICA - XXIV DOMENICA DEL TEMPO ORDINARIO - IV SETTIMANA DEL SALTERIO</div><div class="cci-liturgia-ore"></div>`,
  );
  const metaS = hourHeadMeta("2026-09-13", "", sunBanner);
  if (!/XXIV Domenica del Tempo Ordinario/i.test(metaS.seasonLine)) fails.push(`fixture domenica season=${metaS.seasonLine}`);
  if (!/IV Settimana del Salterio/i.test(metaS.psalterLine)) fails.push(`fixture domenica psalter=${metaS.psalterLine}`);

  const ones = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Virgo vírginum præclára,</div>
    <div class="lo_versetto">mihi iam non sis amára,</div>
    <div class="lo_versetto">fac me tecum plángere.</div>
    <div class="lo_versetto">Iuxta crucem tecum stare,</div>
    <div class="lo_versetto">et me tibi sociáre</div>
    <div class="lo_versetto">in planctu desídero.</div>
    <div class="lo_versetto">1 ant. Cristo, nostra pace.</div>
    <div class="lo_titolo">SALMO 121</div>
  `);
  const oneH = hymnStats(parseHourHtml(ones, "vespri").blocks);
  if (oneH.st !== 2) fails.push(`fixture tercine strofe=${oneH.st} attese 2`);
  if (oneH.hymns[0]?.hymns[0]?.stanzas.some((s) => s.length !== 3)) {
    fails.push("fixture tercine non a 3 versi");
  }

  const longHymn = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">${Array.from({ length: 12 }, (_, i) => `verso latino numero ${i + 1}`).join("<br>")}</div>
    <div class="lo_titolo">SALMO 4</div>
  `);
  const long = hymnStats(parseHourHtml(longHymn, "vespri").blocks);
  if (long.hymns[0]?.hymns[0]?.stanzas.some((s) => s.length > 8)) {
    fails.push("fixture strofa lunga non spezzata");
  }

  const interHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Dio, che di chiara luce<br>tessi la trama al giorno,</div>
    <div class="lo_titolo">INTERCESSIONI</div>
    <div class="lo_versetto">A Cristo, buon pastore, aiuto, guida e conforto del<br />
&nbsp;&nbsp;&nbsp; suo popolo, rivolgiamo con fede la nostra<br />
&nbsp;&nbsp;&nbsp; preghiera:
<div class="lo_sottotitolo">&nbsp;&nbsp;&nbsp; Signore, nostro rifugio e nostra forza, ascoltaci.</div>
</div>
    <div class="lo_versetto">Benedetto sii tu, Signore, che ci hai chiamati a far<br />
&nbsp;&nbsp; &nbsp; parte della tua famiglia,
<div class="lo_rosso"><br />&mdash;</div>
conservaci sempre membra vive della tua santa Chiesa.</div>
  `);
  const inter = parseHourHtml(interHtml, "vespri");
  const tone = inter.blocks.find((b) => b.k === "tone");
  if (!tone || tone.k !== "tone") fails.push("fixture intercessioni senza frase del tono");
  else {
    if (!/rivolgiamo/i.test(tone.intro) || /ascoltaci/i.test(tone.intro)) {
      fails.push("fixture tono intro sbagliata");
    }
    if (!/Signore, nostro rifugio/i.test(tone.refrain)) fails.push("fixture tono senza risposta");
    if (/rivolgiamo/i.test(tone.refrain)) fails.push("fixture tono risposta con intro");
  }
  const lodiHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Al sorger della luce,<br>ascolta, o Padre santo,</div>
    <div class="lo_titolo">INVOCAZIONI</div>
    <div class="lo_versetto">Rendiamo grazie a Dio che nutre e guida il suo<br />
&nbsp;&nbsp;&nbsp; popolo. Uniti nella preghiera del mattino,<br />
&nbsp;&nbsp;&nbsp; acclamiamo:&nbsp;<i>Gloria a te nei secoli, Signore.</i></div>
  `);
  const lodiTone = parseHourHtml(lodiHtml, "lodi").blocks.find((b) => b.k === "tone");
  if (!lodiTone || lodiTone.k !== "tone") fails.push("fixture lodi senza frase del tono");
  else {
    if (!/acclamiamo/i.test(lodiTone.intro) || /Gloria a te/i.test(lodiTone.intro)) {
      fails.push("fixture lodi intro sbagliata");
    }
    if (!/Gloria a te nei secoli/i.test(lodiTone.refrain)) fails.push("fixture lodi senza risposta");
  }
  const dash = inter.blocks.find((b) => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));
  if (!dash || dash.k !== "stanza") fails.push("fixture intercessioni senza coppia —");
  else if (dash.lines.length !== 2) fails.push(`fixture coppia — righe=${dash.lines.length}`);

  const psalmHtml = wrap(`
    <div class="lo_titolo">SALMO 50 Pietà di me, o Signore</div>
    <div class="lo_versetto">Pietà di me, o Dio,<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; secondo la tua misericordia; *<br />
&nbsp;&nbsp; nel tuo grande amore<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; cancella il mio peccato.</div>
    <div class="lo_versetto">Lavami da tutte le mie colpe, *<br />
&nbsp; &nbsp;mondami dal mio peccato.<br />
Riconosco la mia colpa, *<br />
&nbsp; &nbsp;il mio peccato mi sta sempre dinanzi.</div>
    <div class="lo_versetto">Acclamate al Signore, voi tutti della terra, &dagger;<br />
&nbsp; &nbsp;servite il Signore nella gioia, *<br />
&nbsp; &nbsp;presentatevi a lui con esultanza.</div>
    <div class="lo_versetto">Gloria al Padre e al Figlio<br />
&nbsp;&nbsp; e allo Spirito Santo.<br />
Come era nel principio, e ora e sempre<br />
&nbsp;&nbsp; nei secoli dei secoli. Amen. Alleluia.</div>
  `);
  const psalm = parseHourHtml(psalmHtml, "lodi");
  const psalmStanzas = psalm.blocks.filter((b) => b.k === "stanza");
  if (psalmStanzas.length !== 4) {
    fails.push(`fixture salmo strofe=${psalmStanzas.length} attese 4 (non spezzate a 2)`);
  }
  const stanzaLens = psalmStanzas.map((b) => (b.k === "stanza" ? b.lines.length : 0));
  if (stanzaLens[0] !== 4) fails.push(`fixture salmo 4-righe spezzato: ${stanzaLens[0]}`);
  if (stanzaLens[1] !== 4) fails.push(`fixture salmo coppia-versetti spezzata: ${stanzaLens[1]}`);
  if (stanzaLens[2] !== 3) fails.push(`fixture salmo 3-righe: ${stanzaLens[2]}`);
  if (stanzaLens[3] !== 4) fails.push(`fixture gloria 4-righe: ${stanzaLens[3]}`);
  const four = psalmStanzas[0];
  if (four && four.k === "stanza") {
    const h = four.hang || [];
    if ((h[0] || 0) !== 0 || (h[1] || 0) < 1 || (h[2] || 0) < 1 || (h[3] || 0) < 1) {
      fails.push(`fixture salmo hang=${h.join(",")}`);
    }
  }

  const propria = extractHoursBanner(
    `<div class="cci-opere-giorni-liturgia">ESALTAZIONE DELLA SANTA CROCE - Festa - Liturgia propria</div><div class="cci-liturgia-ore"></div>`,
  );
  const metaP = hourHeadMeta("2026-09-14", "", propria);
  if (!/esaltazione/i.test(metaP.seasonLine)) fails.push(`fixture festa season=${metaP.seasonLine}`);
  if (!/liturgia propria/i.test(metaP.psalterLine)) fails.push(`fixture festa psalter=${metaP.psalterLine}`);

  const officePsalm = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Stabat mater dolorósa<br>iuxta crucem lacrimósa,<br>dum pendébat Fílius.</div>
    <div class="lo_versetto">1 ant. A te giunga, Signore, il mio grido.</div>
    <div class="lo_sottotitolo">SALMO 101 Aspirazioni e preghiere di un esule</div>
    <div class="lo_titolo">I (2-12)</div>
    <div class="lo_versetto">Signore, ascolta la mia preghiera, * a te giunga il mio grido.</div>
  `);
  const office = parseHourHtml(officePsalm, "ufficio");
  if (office.blocks.filter((b) => b.k === "psalmHead").length < 1) {
    fails.push("fixture ufficio SALMO in sottotitolo");
  }
  const sat = parseLocalDate("2026-09-12");
  const sun = parseLocalDate("2026-09-13");
  if (ceiHourSlug("vespri", sat) !== "primi-vespri") fails.push("slug sab vespri");
  if (ceiHourSlug("compieta", sat) !== "compieta-dopo-i-primi-vespri") fails.push("slug sab compieta");
  if (ceiHourSlug("vespri", sun) !== "secondi-vespri") fails.push("slug dom vespri");
  if (ceiHourSlug("compieta", sun) !== "compieta-dopo-i-secondi-vespri") fails.push("slug dom compieta");

  const rossoOra = wrap(`
    <div class="lo_titolo">INVOCAZIONI</div>
    <div class="lo_versetto">Acclamiamo:<br /><i>Signore, ascoltaci.</i></div>
    <div class="lo_rosso">ORAZIONE</div>
    <div class="lo_versetto">O Dio, vera luce, ascoltaci.</div>
  `);
  const rosso = parseHourHtml(rossoOra, "lodi");
  if (!rosso.blocks.some((b) => b.k === "title" && /ORAZIONE/i.test(b.text))) {
    fails.push("fixture lo_rosso ORAZIONE senza titolo");
  }
  const rossoTone = rosso.blocks.find((b) => b.k === "tone");
  if (!rossoTone || rossoTone.k !== "tone" || !/ascoltaci/i.test(rossoTone.refrain)) {
    fails.push("fixture italic risposta invocazioni");
  }

  const twoPreces = wrap(`
    <div class="lo_titolo">INVOCAZIONI</div>
    <div class="lo_versetto">Rivolgiamo la nostra lode al Cristo Salvatore e diciamo:
      <i>Maria, la Madre tua, sostenga la nostra preghiera.</i></div>
    <div class="lo_versetto">Sole di giustizia, che hai voluto farti precedere da Maria,
<div class="lo_rosso"><br />&mdash;</div>
fa' che camminiamo sempre nella luce della tua presenza.</div>
    <div class="lo_versetto">Verbo eterno, che hai scelto Maria come arca santa,
<div class="lo_rosso"><br />&mdash;</div>
liberaci dalla corruzione del peccato.</div>
    <div class="lo_rosso">Oppure:</div>
    <div class="lo_versetto">Ringraziamo il nostro Salvatore e preghiamo con fiducia.
      <i>Interceda per noi la Madre tua, o Signore.</i></div>
    <div class="lo_versetto">Salvatore del mondo, che hai preservato la Madre tua,
<div class="lo_rosso"><br />&mdash;</div>
conservaci liberi dal peccato.</div>
    <div class="lo_versetto">Redentore nostro, che in Maria hai posto la tua dimora,
<div class="lo_rosso"><br />&mdash;</div>
trasformaci in tempio vivo del tuo Spirito.</div>
    <div class="lo_versetto">Padre nostro.</div>
    <div class="lo_rosso">ORAZIONE</div>
    <div class="lo_versetto">O Dio, tu hai voluto che accanto al tuo Figlio.</div>
  `);
  const two = parseHourHtml(twoPreces, "lodi");
  const tones = two.blocks.filter((b) => b.k === "tone");
  const orElse = two.blocks.filter((b) => b.k === "omit" && /^Oppure\b/i.test(b.text));
  if (tones.length !== 2) fails.push(`fixture due formulari toni=${tones.length} attesi 2`);
  if (orElse.length !== 1) fails.push(`fixture due formulari oppure=${orElse.length}`);
  if (tones[0] && tones[0].k === "tone" && !/sostenga la nostra preghiera/i.test(tones[0].refrain)) {
    fails.push("fixture primo formulario senza risposta");
  }
  if (tones[1] && tones[1].k === "tone" && !/Interceda per noi/i.test(tones[1].refrain)) {
    fails.push("fixture secondo formulario senza risposta");
  }
  if (tones[0] && tones[1] && tones[0].k === "tone" && tones[1].k === "tone") {
    const i0 = two.blocks.indexOf(tones[0]);
    const iOr = two.blocks.findIndex((b) => b.k === "omit" && /^Oppure\b/i.test(b.text));
    const i1 = two.blocks.indexOf(tones[1]);
    if (!(i0 < iOr && iOr < i1)) fails.push("fixture Oppure non sta tra i due formulari");
  }
  const firstPetitions = two.blocks.filter((b) => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));
  if (firstPetitions.length < 4) {
    fails.push(`fixture invocazioni coppie=${firstPetitions.length} attese 4`);
  }

  const nestHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">O sole di giustizia,<br>Verbo del Dio vivente,</div>
    <div class="lo_titolo">SALMO 134, 1-12 Lodate il Signore che opera meraviglie</div>
    <div class="lo_versetto">
      <div class="lo_sottotitolo">Popolo che Dio si è acquistato, proclama le opere meravigliose</div>
      <div class="lo_versetto">Lodate il nome del Signore, * lodatelo, servi del Signore.</div>
      <div class="lo_titolo">LETTURA BREVE</div>
      <div class="lo_versetto">Ricordatevi che i vostri padri furono messi alla prova.</div>
      <div class="lo_titolo">CANTICO DI ZACCARIA
        <div class="lo_rif">Lc 1, 68-79</div>
      </div>
      <div class="lo_versetto">Benedetto il Signore Dio d'Israele, * perché ha visitato e redento il suo popolo.</div>
      <div class="lo_titolo">INVOCAZIONI</div>
      <div class="lo_versetto">Invochiamo il suo nome:
        <i>Tu sei la nostra speranza, Signore.</i></div>
      <div class="lo_versetto">O Dio, ricco di misericordia,
        <div class="lo_rosso"><br />&mdash;</div>
        noi ti ringraziamo per il tuo immenso amore.</div>
      <div class="lo_versetto">Padre nostro.</div>
      <div class="lo_titolo">ORAZIONE</div>
      <div class="lo_versetto">O Dio, che hai affidato all'uomo l'opera della creazione.</div>
    </div>
  `);
  const nest = parseHourHtml(nestHtml, "lodi");
  const nestBlob = blobOf(nest.blocks);
  if (!nest.blocks.some((b) => b.k === "title" && /LETTURA/i.test(b.text))) {
    fails.push("fixture salmo annidato senza LETTURA");
  }
  if (!/Benedetto il Signore Dio d.Israele/i.test(nestBlob)) {
    fails.push("fixture salmo annidato senza Benedictus");
  }
  if (!nest.blocks.some((b) => b.k === "title" && /INVOCAZIONI/i.test(b.text))) {
    fails.push("fixture salmo annidato senza INVOCAZIONI");
  }
  const nestTone = nest.blocks.find((b) => b.k === "tone");
  if (!nestTone || nestTone.k !== "tone" || !/speranza/i.test(nestTone.refrain)) {
    fails.push("fixture salmo annidato senza tono invocazioni");
  }
  if (!/Padre nostro/i.test(nestBlob)) fails.push("fixture salmo annidato senza Padre nostro");
  if (!nest.blocks.some((b) => b.k === "title" && /ORAZIONE/i.test(b.text))) {
    fails.push("fixture salmo annidato senza ORAZIONE");
  }

  const optHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Dio, che di chiara luce<br>tessi la trama al giorno,</div>
    <div class="lo_titolo">INTERCESSIONI</div>
    <div class="lo_versetto">Memori dei suoi benefici, diciamo:
      <i>Noi confidiamo in te, Signore.</i></div>
    <div class="lo_versetto">Dona e conserva i frutti della terra,
      <div class="lo_rosso"><br />&mdash;</div>
      perché nessun uomo sia privo del pane quotidiano.</div>
    <div class="lo_rosso">Oppure:</div>
    <div class="lo_versetto">( Difendi il nostro popolo da ogni pericolo,
      <div class="lo_rosso"><br />&mdash;</div>
      perché possa vivere nella prosperità e nella pace. )</div>
    <div class="lo_versetto">Accogli fra le braccia della tua misericordia i nostri defunti,
      <div class="lo_rosso"><br />&mdash;</div>
      concedi loro il riposo eterno.</div>
    <div class="lo_versetto">Padre nostro.</div>
    <div class="lo_titolo">ORAZIONE</div>
    <div class="lo_versetto">O Dio, che riveli la tua onnipotenza.</div>
  `);
  const opt = parseHourHtml(optHtml, "vespri");
  const optTones = opt.blocks.filter((b) => b.k === "tone");
  if (optTones.length !== 1) fails.push(`fixture Oppure petizione toni=${optTones.length} atteso 1`);
  const optPairs = opt.blocks.filter((b) => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));
  if (optPairs.length !== 3) fails.push(`fixture Oppure petizione coppie=${optPairs.length} attese 3`);
  const optBlob = blobOf(opt.blocks);
  if (!/Difendi il nostro popolo/i.test(optBlob) || !/Accogli fra le braccia/i.test(optBlob)) {
    fails.push("fixture Oppure petizione testi persi");
  }
  if (optTones[1]) fails.push("fixture Oppure petizione secondo tono spurio");

  const mediaHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">L'ora terza risuona<br>nel servizio di lode,<br>con cuore puro e ardente,<br>preghiamo il Dio glorioso.</div>
    <div class="lo_titolo">ORAZIONE</div>
    <div class="lo_versetto">O Dio, che all'ora terza hai effuso lo Spirito Santo.</div>
    <h2>Ora sesta</h2>
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">L'ora sesta c'invita<br>alla lode di Dio,<br>inneggiamo al Signore<br>con cuore riconoscente.</div>
    <h2>Ora nona</h2>
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">L'ora nona ci chiama<br>al servizio divino,<br>adoriamo cantando<br>l'uno e trino Signore.</div>
  `);
  const media = splitOraMediaHtml(mediaHtml);
  if (/Inno di sesta|ora sesta c.invita/i.test(media.terza)) fails.push("fixture terza contiene sesta");
  if (!/ora terza risuona/i.test(media.terza) || !/hai effuso/i.test(media.terza)) {
    fails.push("fixture terza tagliata da «ora terza» nel testo");
  }
  if (!/ora sesta c.invita/i.test(media.sesta) || /ora nona ci chiama/i.test(media.sesta)) {
    fails.push("fixture sesta slice");
  }
  if (!/ora nona ci chiama/i.test(media.nona) || /ora sesta c.invita/i.test(media.nona)) {
    fails.push("fixture nona slice");
  }

  const psalm62 = splitPsalmTitle("SALMO 62, 2-9 L'anima assetata del Signore");
  if (psalm62.num !== "SALMO 62, 2-9" || !/assetata/i.test(psalm62.name)) {
    fails.push(`splitPsalmTitle 62: ${JSON.stringify(psalm62)}`);
  }
  const cantDn = splitPsalmTitle("CANTICO Dn 3, 57-88. 56 Ogni creatura lodi il Signore");
  if (!/^CANTICO Dn 3, 57-88\. 56$/i.test(cantDn.num) || !/Ogni creatura/i.test(cantDn.name)) {
    fails.push(`splitPsalmTitle Dn: ${JSON.stringify(cantDn)}`);
  }

  const lodiFix = wrap(`
    <div class="lo_titolo">SALMO 62, 2-9&nbsp;&nbsp;&nbsp; L&#39;anima assetata del Signore</div>
    <div class="lo_versetto">
      <div class="lo_sottotitolo">La Chiesa ha sete del suo Salvatore
        <div class="lo_normal">(cfr. Cassiodoro).</div>
      </div>
    </div>
    <div class="lo_versetto">O Dio, tu sei il mio Dio, * all'aurora ti cerco.</div>
    <div class="lo_titolo">CANTICO Dn 3, 57-88. 56&nbsp;&nbsp;&nbsp; Ogni creatura lodi il Signore</div>
    <div class="lo_sottotitolo">
      <div class="lo_versetto">Lodate il nostro Dio voi tutti suoi servi
        <div class="lo_normal">(Ap 19, 5).</div>
      </div>
    </div>
    <div class="lo_versetto">
      <div class="lo_titolo">RESPONSORIO BREVE</div>
      <div class="lo_rosso"><br />R.</div>
      Noi ti adoriamo,
      <div class="lo_rosso">*</div>
      ti benediciamo, o Cristo.<br />
      Noi ti adoriamo, ti benediciamo, o Cristo.
      <div class="lo_rosso"><br />V.</div>
      Con la tua croce hai redento il mondo:<br />
      ti benediciamo, o Cristo.
    </div>
    <div class="lo_versetto">
      <div class="lo_antifona">Ant. al Ben.</div>
      Adoriamo la tua croce, Signore;<br />
      la gioia &egrave; venuta nel mondo.&nbsp;<br </div>
    <div class="lo_titolo">CANTICO DI ZACCARIA
      <div class="lo_rif">Lc 1, 68-79</div>
    </div>
    <div class="lo_sottotitolonoi">
      <div class="lo_versetto">Il Messia e il suo Precursore</div>
    </div>
    <div class="lo_versetto">
      <div class="lo_titolo">INVOCAZIONI<br />&nbsp;</div>
      Esaltiamo Cristo Signore e, supplicandolo con fede, diciamo:
      <div class="lo_sottotitolo">Salvaci, Signore, per la tua croce.</div>
      Figlio di Dio, che nel deserto guarivi,
      <div class="lo_rosso"><br />&mdash;</div>
      per la tua croce curaci dai morsi velenosi dell&#39;orgoglio<br />
      &nbsp;&nbsp; e della sensualit&agrave;.<br />
      Figlio dell&#39;uomo, che fosti elevato in croce,
      <div class="lo_rosso"><br />&mdash;</div>
      per la tua passione donaci la vita.<br />
    </div>
    <div class="lo_versetto">Il Signore ci benedica.
      <div class="lo_antifona"><br />R.</div>
      Amen.</div>
                </div>
                <div class="
  `);
  const lodiParsed = parseHourHtml(lodiFix, "lodi");
  const lodiBlob = blobOf(lodiParsed.blocks);
  const heads = lodiParsed.blocks.filter((b): b is Extract<OreBlock, { k: "psalmHead" }> => b.k === "psalmHead");
  const sal62 = heads.find((h) => /SALMO 62/i.test(h.num));
  if (!sal62 || !/62, 2-9/.test(sal62.num) || !/assetata/i.test(sal62.name)) {
    fails.push(`fixture salmo 62 head ${JSON.stringify(sal62)}`);
  }
  const cantHead = heads.find((h) => /CANTICO Dn/i.test(h.num));
  if (!cantHead || !/Dn 3, 57-88/.test(cantHead.num) || !/Ogni creatura/i.test(cantHead.name)) {
    fails.push(`fixture cantico Dn head ${JSON.stringify(cantHead)}`);
  }
  if (/CANTICO Dn 3[^\n]*Ogni creatura/i.test(cantHead?.num || "")) {
    fails.push("fixture cantico Dn titolo non spezzato");
  }
  if (/nel mondo\.\s*br\b/i.test(lodiBlob) || /\sbr\s*$/im.test(lodiBlob)) {
    fails.push("fixture Ant. al Ben. con br residuo");
  }
  const zac = heads.find((h) => /ZACCARIA/i.test(h.num));
  if (!zac || !/Lc 1, 68-79/.test(zac.cite) || !/Messia/i.test(zac.sub)) {
    fails.push(`fixture Zaccaria ${JSON.stringify(zac)}`);
  }
  if (!/R\.\s*Noi ti adoriamo/i.test(lodiBlob) || !/V\.\s*Con la tua croce/i.test(lodiBlob)) {
    fails.push("fixture responsorio senza R./V.");
  }
  const preces = lodiParsed.blocks.filter((b) => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));
  if (preces.length < 2) fails.push(`fixture invocazioni coppie=${preces.length}`);
  else {
    const first = preces[0];
    const second = preces[1];
    if (first.k === "stanza" && first.lines.some((l) => /Figlio dell.uomo/i.test(l))) {
      fails.push("fixture invocazioni risposta incollata alla petizione successiva");
    }
    if (first.k === "stanza" && !first.lines.some((l) => /sensualit/i.test(l))) {
      fails.push(`fixture invocazioni wrap risposta: ${first.lines.join(" | ")}`);
    }
    if (second.k === "stanza" && !/Figlio dell.uomo/i.test(second.lines[0] || "")) {
      fails.push(`fixture invocazioni seconda petizione: ${second.lines.join(" | ")}`);
    }
  }
  if (/div class=/i.test(lodiBlob)) fails.push("fixture coda HTML nel testo");

  const paceSegs = [
    { kind: "normal", text: "Padre nostro" },
    { kind: "sectionTitle", text: "Rito della Pace" },
    { kind: "celebrante", text: "Signore Gesù Cristo" },
    { kind: "sectionTitle", text: "Frazione del Pane" },
    { kind: "celebrante", text: "Agnello di Dio" },
  ];
  const paceH = new Map<number, number>([
    [0, 200],
    [1, 40],
    [2, 80],
    [3, 40],
    [4, 60],
  ]);
  const packedPace = packSegmentIndicesIntoPages(paceSegs, paceH, 278, { paddingBottom: 28 });
  const pacePage = packedPace.find((p) => p.includes(1));
  if (!pacePage || !pacePage.includes(2)) {
    fails.push(`fixture pace orfana pages=${JSON.stringify(packedPace)}`);
  }

  const latinH = {
    label: null as string | null,
    stanzas: [["Eia, mater, fons amóris,", "me sentíre vim dolóris", "fac, ut tecum lúgeam."]],
  };
  if (!hymnNeedsItalianAlternate([latinH])) fails.push("fixture Stabat non rilevato come latino");
  const ldoInno = parseLdoHymn(
    `<FONT CLASS=Risalto>I<FONT CLASS=Minuscoletto>NNO</FONT></FONT><br><br>O Donna gloriosa,<br>alta sopra le stelle,<br>tu nutri sul tuo seno<br>il Dio che ti ha creato.<br><br>La gioia che Eva ci tolse<br>ci rendi nel tuo Figlio<br>e dischiudi il cammino<br>verso il regno dei cieli.<br><br><FONT CLASS=Risalto>1 ant.</FONT> A te si stringe`,
  );
  if (!ldoInno || !/Donna gloriosa/i.test(ldoInno.stanzas[0]?.[0] || "")) {
    fails.push(`fixture LDO inno ${JSON.stringify(ldoInno)}`);
  } else {
    const merged = prependItalianHymn([latinH], ldoInno);
    if (merged.length !== 2 || merged[0].label || merged[1].label !== "Oppure:") {
      fails.push(`fixture merge inno labels ${merged.map((h) => h.label).join("|")}`);
    }
    if (!/Donna gloriosa/i.test(merged[0].stanzas[0]?.[0] || "") || !/amóris/i.test(merged[1].stanzas[0]?.[0] || "")) {
      fails.push("fixture merge inno ordine italiano/latino");
    }
  }

  const nestInnoHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Re immortale e glorioso,<br />
che accogli nella luce<br />
i tuoi servi fedeli,
    <div class="lo_versetto">esaudisci il tuo popolo,<br />
che canta le tue lodi<br />
nel ricordo dei martiri.</div>
    <div class="lo_versetto">La forza del tuo Spirito<br />
ci guidi alla vittoria<br />
sul male e sulla morte.</div>
    </div>
    <div class="lo_rosso">Oppure:</div>
    <div class="lo_versetto">
      Sanctórum méritis ínclita gáudia<br />
      pangámus, sócii, géstaque fórtia;<br />
      nam gliscit ánimus prómere cántibus<br />
      victórum genus óptimum.<br />
      <br />
      Hi
      <div class="lo_rosso">(</div>
      Hæ
      <div class="lo_rosso">)</div>
      sunt quos
      <div class="lo_rosso">(</div>
      quas
      <div class="lo_rosso">)</div>
      rétinens mundus inhórruit.
    </div>
    <div class="lo_versetto">1 ant. Come splende la tua sapienza.</div>
    <div class="lo_titolo">SALMO 138</div>
  `);
  const nestInno = parseHourHtml(nestInnoHtml, "vespri");
  const nestH = hymnStats(nestInno.blocks);
  if (nestH.nHymns < 2) fails.push(`fixture inno annidato inni=${nestH.nHymns} attesi 2`);
  if (!/Re immortale e glorioso/i.test(blobOf(nestInno.blocks))) {
    fails.push("fixture inno annidato senza prima strofa italiana");
  }
  const latinHymn = nestH.hymns[0]?.hymns.find((h) => /Sanctórum|Sanctorum/i.test(h.stanzas.flat().join(" ")));
  if (!latinHymn) fails.push("fixture inno latino assente");
  else {
    const joined = latinHymn.stanzas.map((s) => s.join(" | "));
    if (latinHymn.stanzas.some((st) => st.some((l) => /^\($/.test(l) || /^Hæ$/.test(l) || /^\)$/.test(l)))) {
      fails.push(`fixture latino spezzato sui parentesi: ${joined.join(" / ")}`);
    }
    if (!latinHymn.stanzas.some((st) => /Hi \(Hæ\) sunt quos/i.test(st.join(" ")))) {
      fails.push(`fixture latino senza Hi (Hæ) in riga: ${joined.join(" / ")}`);
    }
    if ((latinHymn.stanzas[0]?.length || 0) !== 4) {
      fails.push(`fixture latino strofa1=${latinHymn.stanzas[0]?.length} attesa 4`);
    }
  }

  const antInStanza = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">O Cristo, Verbo del Padre,<br />re glorioso fra gli angeli,<br />luce e salvezza del mondo,<br />in te crediamo.</div>
    <div class="lo_versetto">Cibo e bevanda di vita,<br />balsamo, veste, dimora,<br />forza, rifugio, conforto,<br />in te speriamo.</div>
    <div class="lo_versetto">Illumina col tuo Spirito<br />l'oscura notte del male,<br />orienta il nostro cammino<br />incontro al Padre. Amen.
      <div class="lo_versetto">
        <div class="lo_antifona">1 ant.</div>
        La tua destra, Signore, ha salvato i nostri padri.
      </div>
      <div class="lo_titolo">SALMO 43 Il popolo di Dio nella sventura</div>
    </div>
  `);
  const antIn = parseHourHtml(antInStanza, "ufficio");
  const antBlob = blobOf(antIn.blocks);
  if (!/Illumina col tuo Spirito/i.test(antBlob)) fails.push("fixture Illumina persa nell'inno");
  const antH = hymnStats(antIn.blocks);
  if (antH.st < 3) fails.push(`fixture Illumina strofe=${antH.st} attese 3`);
  if (!antIn.blocks.some((b) => b.k === "rubric" && /1\s*ant/i.test(b.lab))) {
    fails.push("fixture 1 ant. persa dopo inno misto");
  }
  if (!antIn.blocks.some((b) => b.k === "psalmHead" && /SALMO 43/i.test(b.num))) {
    fails.push("fixture SALMO 43 perso dopo inno misto");
  }

  const doxOppHtml = wrap(`
    <div class="lo_titolo">INNO</div>
    <div class="lo_versetto">Gerusalemme nuova,<br />immagine di pace.</div>
    <div class="lo_versetto">Sia onore al Padre e al Figlio<br />e allo Spirito Santo.
      <div class="lo_rosso">Oppure:</div>
      Rex glorióse mártyrum,<br />coróna confiténtium.
    </div>
    <div class="lo_versetto">1 ant. Cristo, nostra pace.</div>
    <div class="lo_titolo">SALMO 4</div>
  `);
  const doxOpp = parseHourHtml(doxOppHtml, "ufficio");
  const doxH = hymnStats(doxOpp.blocks);
  const doxBlob = blobOf(doxOpp.blocks);
  if (!/Sia onore al Padre/i.test(doxBlob)) fails.push("fixture dossologia italiana persa");
  if (!/Rex glorióse|Rex gloriose/i.test(doxBlob)) fails.push("fixture inno latino dopo Oppure perso");
  if (!doxH.labels.some((l) => /^Oppure\b/i.test(l))) fails.push("fixture dossologia senza label Oppure");
  const itHymn = doxH.hymns[0]?.hymns.find((h) => !h.label);
  if (itHymn && /Rex glorióse|Rex gloriose/i.test(itHymn.stanzas.flat().join(" "))) {
    fails.push("fixture latino finito nell'inno italiano");
  }
  const laHymn = doxH.hymns[0]?.hymns.find((h) => h.label && /^Oppure\b/i.test(h.label));
  if (laHymn && /Sia onore al Padre/i.test(laHymn.stanzas.flat().join(" "))) {
    fails.push("fixture dossologia finita nell'inno latino");
  }

  const multiSubHtml = wrap(`
    <div class="lo_titolo">INTERCESSIONI</div>
    <div class="lo_versetto">Nell'ora in cui Cristo offrì la sua vita, s'innalzi a lui la lode della Chiesa:
      <div class="lo_sottotitolo">Noi ti lodiamo e ti adoriamo, Signore.</div>
      Noi ti lodiamo e ti adoriamo, o Cristo, causa e modello di ogni martirio,
      <div class="lo_sottotitolo"><div class="lo_rosso">–</div> noi ti lodiamo e ti adoriamo, Signore.</div>
      Perché hai chiamato i peccatori pentiti al premio della vita eterna,
      <div class="lo_sottotitolo"><div class="lo_rosso">–</div> noi ti lodiamo e ti adoriamo, Signore.</div>
    </div>
    <div class="lo_versetto">Padre nostro.</div>
    <div class="lo_titolo">ORAZIONE</div>
    <div class="lo_versetto">O Dio, che hai dato al tuo popolo i santi Cornelio e Cipriano.</div>
  `);
  const multiSub = parseHourHtml(multiSubHtml, "vespri");
  const multiPairs = multiSub.blocks.filter((b) => b.k === "stanza" && b.lines.some((l) => /^—/.test(l)));
  if (multiPairs.length !== 2) {
    fails.push(`fixture sottotitoli petizioni coppie=${multiPairs.length} attese 2`);
  } else if (multiPairs[0].k === "stanza" && multiPairs[1].k === "stanza") {
    if (/Perché hai chiamato/i.test(multiPairs[0].lines.join(" "))) {
      fails.push("fixture sottotitoli petizioni incollate");
    }
    if (!/modello di ogni martirio/i.test(multiPairs[0].lines[0] || "")) {
      fails.push(`fixture prima petizione: ${multiPairs[0].lines.join(" | ")}`);
    }
    if (!/Perché hai chiamato/i.test(multiPairs[1].lines[0] || "")) {
      fails.push(`fixture seconda petizione: ${multiPairs[1].lines.join(" | ")}`);
    }
  }
  if (!/L.anima mia magnifica il Signore/i.test(blobOf(parseHourHtml(wrap(`
    <div class="lo_titolo">CANTICO DELLA BEATA VERGINE<br />Lc 1, 46-55</div>
    <div class="lo_versetto">L'anima mia magnifica il Signore * e il mio spirito esulta.</div>
    <div class="lo_titolo">INTERCESSIONI</div>
    <div class="lo_versetto">Preghiamo:<i>Ascoltaci, Signore.</i></div>
  `), "vespri").blocks))) {
    fails.push("fixture Magnificat bundled assente");
  }

  return fails;
}

type ParsedRun = { extra: string[]; blocks: OreBlock[]; ant?: string };

function parseOnce(hour: OreHourId, html: string): ParsedRun {
  if (hour === "invitatorio") {
    const ant = extractInvitatoryAntiphon(html);
    const extra: string[] = [];
    if (!ant || ant.length < 8) extra.push("ANT_MANCANTE");
    if (/^V\.|^R\./.test(ant)) extra.push("ANT_E_VR");
    if (JUNK.test(ant)) extra.push("ANT_JUNK");
    return { extra, blocks: [], ant };
  }
  if (hour === "ora-media") {
    return { extra: [], blocks: [] };
  }
  const parsed = parseHourHtml(html, hour);
  const extra: string[] = [];
  if (parsed.error) extra.push(`ERR:${parsed.error}`);
  if (hour === "compieta" && !parsed.blocks.some((b) => b.k === "marian")) extra.push("SENZA_MARIANE");
  if (hour !== "compieta" && hour !== "invitatorio") {
    const psalms = parsed.blocks.filter((b) => b.k === "psalmHead").length;
    if (psalms === 0) extra.push("SALMI_ZERO");
  }
  return { extra, blocks: parsed.blocks };
}

async function main() {
  const fixtureFails = selfTests();
  if (fixtureFails.length) {
    console.log("SELFTEST FAIL\n" + fixtureFails.map((f) => `  ${f}`).join("\n"));
  } else {
    console.log("SELFTEST ok (Oppure, inno latino, banner, slugs sab/dom, salmi strofe)");
  }
  if (process.argv.includes("--selftest")) {
    if (fixtureFails.length) process.exitCode = 1;
    return;
  }

  const cache = new Map<string, string>();
  const fetched: Array<{ iso: string; hour: OreHourId; html: string; slug: string }> = [];
  const rows: string[] = [];
  let fail = 0;
  let drift = 0;

  for (let i = 0; i < DAYS; i++) {
    const iso = isoAdd(START, i);
    const date = parseLocalDate(iso);
    const wd = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][date.getDay()];
    for (const hour of HOURS) {
      const slug = expectedSlug(hour, date);
      const title = hourTitle(hour, date);
      let html = "";
      try {
        html = await fetchHtml(iso, slug);
        cache.set(`${iso}|${slug}`, html);
        fetched.push({ iso, hour, html, slug });
      } catch (e) {
        fail += 1;
        rows.push(`FAIL ${iso} ${wd} ${hour} slug=${slug} FETCH ${(e as Error).message}`);
        await sleep(250);
        continue;
      }

      const banner = extractHoursBanner(html);
      const meta = hourHeadMeta(iso, "", banner);
      const metaIssues: string[] = [];
      if (!banner) metaIssues.push("BANNER_ASSENTE");
      else {
        if (!meta.psalterLine) metaIssues.push("SALTERIO_ASSENTE");
        if (!meta.seasonLine) metaIssues.push("STAGIONE_ASSENTE");
      }

      if (hour === "ora-media") {
        const parts = splitOraMediaHtml(html);
        for (const id of ["terza", "sesta", "nona"] as const) {
          let firstSig = "";
          const extra: string[] = [];
          for (let p = 0; p < PARSE_PASSES; p++) {
            const parsed = parseHourHtml(parts[id], id);
            const sig = JSON.stringify(parsed.blocks);
            if (p === 0) firstSig = sig;
            else if (sig !== firstSig) {
              extra.push(`DRIFT_PASS_${p + 1}`);
              drift += 1;
            }
            extra.push(...(parsed.error ? [`ERR:${parsed.error}`] : []));
          }
          const parsed = parseHourHtml(parts[id], id);
          const iss = issuesFor(`${iso} ${id}`, parsed.blocks, extra);
          const { st } = hymnStats(parsed.blocks);
          const mark = iss.length ? "FAIL" : "ok";
          if (iss.length) fail += 1;
          rows.push(
            `${mark} ${iso} ${wd} ${id} slug=${slug} blocks=${parsed.blocks.length} inniStrofe=${st} ${iss.join(",")}`,
          );
        }
        if (metaIssues.length) {
          fail += 1;
          rows.push(`FAIL ${iso} ${wd} ora-media-meta ${metaIssues.join(",")}`);
        }
        await sleep(250);
        continue;
      }

      let firstSig = "";
      const passExtra: string[] = [];
      for (let p = 0; p < PARSE_PASSES; p++) {
        const run = parseOnce(hour, html);
        const sig = hour === "invitatorio" ? run.ant || "" : JSON.stringify(run.blocks);
        if (p === 0) firstSig = sig;
        else if (sig !== firstSig) {
          passExtra.push(`DRIFT_PASS_${p + 1}`);
          drift += 1;
        }
      }
      const run = parseOnce(hour, html);
      const extra = [...passExtra, ...run.extra, ...metaIssues];
      if (hour === "invitatorio") {
        const mark = extra.length ? "FAIL" : "ok";
        if (extra.length) fail += 1;
        rows.push(
          `${mark} ${iso} ${wd} invitatorio slug=${slug} ant="${(run.ant || "").replace(/\s+/g, " ").slice(0, 70)}" ${extra.join(",")}`,
        );
      } else {
        const iss = issuesFor(`${iso} ${hour}`, run.blocks, extra);
        const { nHymns, st } = hymnStats(run.blocks);
        const psalms = run.blocks.filter((b) => b.k === "psalmHead").length;
        const mark = iss.length ? "FAIL" : "ok";
        if (iss.length) fail += 1;
        rows.push(
          `${mark} ${iso} ${wd} ${hour} «${title}» slug=${slug} blocks=${run.blocks.length} inni=${nHymns}/${st} salmi=${psalms} ${iss.join(",")}`,
        );
      }
      await sleep(250);
    }
  }

  console.log(rows.join("\n"));
  console.log(`\nFAIL ${fail} / ${rows.length}  DRIFT ${drift}  PASSES ${PARSE_PASSES}  DAYS ${DAYS}`);

  const giroFails: number[] = [];
  for (let r = 1; r <= 10; r++) {
    let f = 0;
    for (const item of fetched) {
      if (item.hour === "ora-media") {
        const parts = splitOraMediaHtml(item.html);
        for (const id of ["terza", "sesta", "nona"] as const) {
          const parsed = parseHourHtml(parts[id], id);
          if (issuesFor(`${item.iso} ${id}`, parsed.blocks, parsed.error ? [`ERR:${parsed.error}`] : []).length) f += 1;
        }
        continue;
      }
      const run = parseOnce(item.hour, item.html);
      const banner = extractHoursBanner(item.html);
      const meta = hourHeadMeta(item.iso, "", banner);
      const metaIssues: string[] = [];
      if (!banner) metaIssues.push("BANNER_ASSENTE");
      else {
        if (!meta.psalterLine) metaIssues.push("SALTERIO_ASSENTE");
        if (!meta.seasonLine) metaIssues.push("STAGIONE_ASSENTE");
      }
      if (item.hour === "invitatorio") {
        if ([...run.extra, ...metaIssues].length) f += 1;
      } else if (issuesFor(`${item.iso} ${item.hour}`, run.blocks, [...run.extra, ...metaIssues]).length) {
        f += 1;
      }
    }
    giroFails.push(f);
    console.log(`giro ${r}/10 FAIL ${f} / ${fetched.length} giorni×ore in cache`);
  }
  if (giroFails.some((n) => n > 0)) process.exitCode = 1;
  if (fixtureFails.length) process.exitCode = 1;
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
