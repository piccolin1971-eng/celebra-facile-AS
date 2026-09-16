import type { InvitPsalmId, OreBlock } from "./types";

export const GLORIA = [
  "Gloria al Padre e al Figlio, *",
  "e allo Spirito Santo.",
  "Come era nel principio, e ora e sempre *",
  "nei secoli dei secoli. Amen.",
];

export const PADRE = [
  "Padre nostro, che sei nei cieli,",
  "sia santificato il tuo nome,",
  "venga il tuo regno,",
  "sia fatta la tua volontà, come in cielo così in terra.",
  "Dacci oggi il nostro pane quotidiano,",
  "e rimetti a noi i nostri debiti",
  "come noi li rimettiamo ai nostri debitori,",
  "e non ci indurre in tentazione,",
  "ma liberaci dal male.",
];

/** Magnificat CEI (Lc 1, 46-55) + Gloria. L’antifona resta dal sito. */
export const MAGNIFICAT: string[][] = verses(`
L’anima mia magnifica il Signore *
e il mio spirito esulta in Dio, mio salvatore,

perché ha guardato l’umiltà della sua serva. *
D’ora in poi tutte le generazioni
mi chiameranno beata.

Grandi cose ha fatto in me l’Onnipotente *
e Santo è il suo nome:

di generazione in generazione la sua misericordia *
si stende su quelli che lo temono.

Ha spiegato la potenza del suo braccio, *
ha disperso i superbi nei pensieri del loro cuore;

ha rovesciato i potenti dai troni, *
ha innalzato gli umili;

ha ricolmato di beni gli affamati, *
ha rimandato i ricchi a mani vuote.

Ha soccorso Israele, suo servo, *
ricordandosi della sua misericordia,

come aveva promesso ai nostri padri, *
ad Abramo e alla sua discendenza, per sempre.

Gloria al Padre e al Figlio *
e allo Spirito Santo.

Come era nel principio, e ora e sempre *
nei secoli dei secoli. Amen.
`);

/** Benedictus CEI (Lc 1, 68-79) + Gloria. L’antifona resta dal sito. */
export const BENEDICTUS: string[][] = verses(`
Benedetto il Signore Dio d’Israele, *
perché ha visitato e redento il suo popolo,

e ha suscitato per noi una salvezza potente *
nella casa di Davide, suo servo,

come aveva promesso *
per bocca dei suoi santi profeti d’un tempo:

salvezza dai nostri nemici, *
e dalle mani di quanti ci odiano.

Così egli ha concesso misericordia ai nostri padri *
e si è ricordato della sua santa alleanza,

del giuramento fatto ad Abramo, nostro padre, *
di concederci, liberàti dalle mani dei nemici,

di servirlo senza timore, in santità e giustizia *
al suo cospetto, per tutti i nostri giorni.

E tu, bambino, sarai chiamato profeta dell’Altissimo *
perché andrai innanzi al Signore
a preparargli le strade,

per dare al suo popolo la conoscenza della salvezza *
nella remissione dei suoi peccati,

grazie alla bontà misericordiosa del nostro Dio, *
per cui verrà a visitarci dall’alto un sole che sorge,

per rischiarare quelli che stanno nelle tenebre *
e nell’ombra della morte

e dirigere i nostri passi *
sulla via della pace.

Gloria al Padre e al Figlio *
e allo Spirito Santo.

Come era nel principio, e ora e sempre *
nei secoli dei secoli. Amen.
`);

function gospelCanticleKind(b: OreBlock): "mag" | "ben" | null {
  const t =
    b.k === "title" ? b.text : b.k === "psalmHead" ? `${b.num} ${b.name}` : "";
  if (!t) return null;
  if (/CANTICO DELLA BEATA|CANTICO DI MARIA|\bMAGNIFICAT\b/i.test(t)) return "mag";
  if (/CANTICO DI ZACCARIA|\bBENEDICTUS\b/i.test(t)) return "ben";
  return null;
}

function canticleSectionStop(b: OreBlock): boolean {
  if (b.k === "hymn" || b.k === "marian" || b.k === "tone") return true;
  if (b.k === "psalmHead") return true;
  if (b.k === "title") {
    return /^(INVOCAZIONI|INTERCESSIONI|ORAZIONE|PREGHIERA|TE DEUM|LETTURA|RESPONSORIO|SALMO|CANTICO)\b/i.test(
      b.text,
    );
  }
  return false;
}

function isBundledCanticleBody(b: OreBlock, startRe: RegExp): boolean {
  const blob = b.k === "stanza" ? b.lines.join(" ") : b.k === "prose" ? b.text : "";
  if (!blob) return false;
  if (startRe.test(blob)) return true;
  if (/gloria al padre/i.test(blob) && /spirito santo/i.test(blob)) return true;
  if (/come era nel principio/i.test(blob) && /secoli dei secoli/i.test(blob)) return true;
  if (b.k === "stanza" && /[*†]/.test(blob) && blob.length > 24) return true;
  return false;
}

/** Sostituisce il corpo di Magnificat/Benedictus col testo in app; antifone e titoli restano dal CEI. */
export function applyBundledGospelCanticles(blocks: OreBlock[]): OreBlock[] {
  const out: OreBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const kind = gospelCanticleKind(blocks[i]);
    if (!kind) {
      out.push(blocks[i]);
      continue;
    }
    out.push(blocks[i]);
    const verses = kind === "mag" ? MAGNIFICAT : BENEDICTUS;
    const startRe =
      kind === "mag" ? /l.anima mia magnifica|magnificat anima/i : /benedetto il signore dio/i;
    let j = i + 1;
    let inserted = false;
    while (j < blocks.length && !canticleSectionStop(blocks[j])) {
      if (isBundledCanticleBody(blocks[j], startRe)) {
        if (!inserted) {
          for (const v of verses) out.push({ k: "stanza", lines: v });
          inserted = true;
        }
        j += 1;
        continue;
      }
      out.push(blocks[j]);
      j += 1;
    }
    if (!inserted) {
      for (const v of verses) out.push({ k: "stanza", lines: v });
    }
    i = j - 1;
  }
  return out;
}

function verses(block: string): string[][] {
  return block
    .trim()
    .split(/\n\s*\n/)
    .map((st) =>
      st
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    );
}

export const INVIT_PSALM_IDS: InvitPsalmId[] = ["94", "99", "66", "23"];

export type BundledPsalm = {
  title: string;
  sub: string;
  cite: string;
  verses: string[][];
};

export const INVIT_PSALMS: Record<InvitPsalmId, BundledPsalm> = {
  "94": {
    title: "SALMO 94  Invito a lodare Dio",
    sub: "Esortatevi a vicenda ogni giorno, finché dura «quest’oggi»",
    cite: "(Eb 3, 13)",
    verses: verses(`
Venite, applaudiamo al Signore, *
acclamiamo alla roccia della nostra salvezza.
Accostiamoci a lui per rendergli grazie, *
a lui acclamiamo con canti di gioia.

Poiché grande Dio è il Signore, *
grande re sopra tutti gli dèi.
Nella sua mano sono gli abissi della terra, *
sono sue le vette dei monti.
Suo è il mare, egli l’ha fatto, *
le sue mani hanno plasmato la terra.

Venite, prostràti adoriamo, *
in ginocchio davanti al Signore che ci ha creati.
Egli è nostro Dio, e noi il popolo del suo pascolo, *
il gregge che egli conduce.

Ascoltate oggi la sua voce: «Non indurite il cuore, *
come a Merìba, come nel giorno di Massa
nel deserto,
dove mi tentarono i vostri padri: †
mi misero alla prova, *
pur avendo visto le mie opere.

Per quarant’anni mi disgustai di quella generazione †
e dissi: Sono un popolo dal cuore traviato, *
non conoscono le mie vie;
perciò ho giurato nel mio sdegno: *
Non entreranno nel luogo del mio riposo».
    `),
  },
  "99": {
    title: "SALMO 99  La gioia di coloro che entrano nel tempio",
    sub: "Il Signore fa cantare ai redenti il canto della vittoria",
    cite: "(sant’Atanasio).",
    verses: verses(`
Acclamate al Signore, voi tutti della terra, †
servite il Signore nella gioia, *
presentatevi a lui con esultanza.

Riconoscete che il Signore è Dio; †
egli ci ha fatti e noi siamo suoi, *
suo popolo e gregge del suo pascolo.

Varcate le sue porte con inni di grazie, †
i suoi atri con canti di lode, *
lodatelo, benedite il suo nome;

poiché buono è il Signore, †
eterna la sua misericordia, *
la sua fedeltà per ogni generazione.
    `),
  },
  "66": {
    title: "SALMO 66  Tutti i popoli glorifichino il Signore",
    sub: "Sia noto a voi che questa salvezza di Dio viene ora rivolta ai pagani",
    cite: "(At 28, 28).",
    verses: verses(`
Dio abbia pietà di noi e ci benedica, *
su di noi faccia splendere il suo volto;
perché si conosca sulla terra la tua via, *
fra tutte le genti la tua salvezza.

Ti lodino i popoli, Dio, *
ti lodino i popoli tutti.

Esultino le genti e si rallegrino, †
perché giudichi i popoli con giustizia, *
governi le nazioni sulla terra.

Ti lodino i popoli, Dio, *
ti lodino i popoli tutti.

La terra ha dato il suo frutto. *
Ci benedica Dio, il nostro Dio,
ci benedica Dio *
e lo temano tutti i confini della terra.
    `),
  },
  "23": {
    title: "SALMO 23  Il Signore entra nel suo tempio",
    sub: "Le porte del cielo si sono aperte a Cristo Signore, quando salì al cielo",
    cite: "(sant’Ireneo).",
    verses: verses(`
Del Signore è la terra e quanto contiene, *
l’universo e i suoi abitanti.
È lui che l’ha fondata sui mari, *
e sui fiumi l’ha stabilita.

Chi salirà il monte del Signore, *
chi starà nel suo luogo santo?

Chi ha mani innocenti e cuore puro, †
chi non pronunzia menzogna, *
chi non giura a danno del suo prossimo.

Egli otterrà benedizione dal Signore, *
giustizia da Dio sua salvezza.
Ecco la generazione che lo cerca, *
che cerca il tuo volto, Dio di Giacobbe.

Sollevate, porte, i vostri frontali, †
alzatevi, porte antiche, *
ed entri il re della gloria.

Chi è questo re della gloria? †
Il Signore forte e potente, *
il Signore potente in battaglia.

Sollevate, porte, i vostri frontali, †
alzatevi, porte antiche, *
ed entri il re della gloria.

Chi è questo re della gloria? *
Il Signore degli eserciti è il re della gloria.
    `),
  },
};

export const NUNC_DIMITTIS = verses(`
Ora lascia, o Signore, che il tuo servo *
vada in pace secondo la tua parola;

perché i miei occhi han visto la tua salvezza, *
preparata da te davanti a tutti i popoli,

luce per illuminare le genti *
e gloria del tuo popolo Israele.
`);

export const DEFAULT_INVIT_ANT =
  "Adoriamo il Signore,\nil Dio che ci ha creato.";

export const MARIAN_ANTIPHONS: string[][] = [
  [
    "O santa Madre del Redentore,",
    "porta dei cieli, stella del mare,",
    "soccorri il tuo popolo che anela a risorgere.",
    "Tu che accogliendo il saluto dell’angelo,",
    "nello stupore di tutto il creato,",
    "hai generato il tuo Creatore,",
    "madre sempre vergine,",
    "pietà di noi peccatori.",
  ],
  [
    "Ave, regina dei cieli,",
    "ave, signora degli angeli;",
    "porta e radice di salvezza,",
    "rechi nel mondo la luce.",
    "Godi, vergine gloriosa,",
    "bella fra tutte le donne;",
    "salve, o tutta santa,",
    "prega per noi Cristo Signore.",
  ],
  [
    "Salve, Regina, madre di misericordia;",
    "vita, dolcezza e speranza nostra, salve.",
    "A te ricorriamo, esuli figli di Eva:",
    "a te sospiriamo, gementi e piangenti",
    "in questa valle di lacrime.",
    "Orsù dunque, avvocata nostra,",
    "rivolgi a noi gli occhi tuoi misericordiosi.",
    "E mostraci, dopo questo esilio, Gesù,",
    "il frutto benedetto del tuo seno.",
    "O clemente, o pia, o dolce Vergine Maria.",
  ],
  [
    "Ave, o Maria, piena di grazia,",
    "il Signore è con te.",
    "Tu sei benedetta fra le donne,",
    "e benedetto è il frutto del tuo seno, Gesù.",
    "Santa Maria, Madre di Dio,",
    "prega per noi peccatori,",
    "adesso e nell’ora della nostra morte. Amen.",
  ],
  [
    "Sotto la tua protezione troviamo rifugio,",
    "santa Madre di Dio:",
    "non disprezzare le suppliche di noi che siamo nella prova,",
    "e liberaci da ogni pericolo,",
    "o vergine gloriosa e benedetta.",
  ],
  [
    "Regina dei cieli, rallegrati, alleluia:",
    "Cristo, che hai portato nel grembo, alleluia,",
    "è risorto, come aveva promesso, alleluia.",
    "Prega il Signore per noi, alleluia.",
  ],
];

const BIBLE_BOOK =
  "(?:[1-3]\\s*)?(?:Sam|Re|Cr|Mac|Cor|Ts|Tm|Pt|Gv|Tess|Tim|Dan|Dn|Is|Mt|Mc|Lc|At|Rm|Gal|Ef|Fil|Col|Eb|Ap|Ger|Ez|Tb|Gdt|Sap|Sir|Bar|Es|Lv|Nm|Dt|Gs|Gdc|Rt|Esd|Ne|Est|Gb|Pr|Qo|Ct|Lam|Gen|Sal|Os|Gl|Am|Ab|Na|So|Ag|Zc|Ml|Fm|Gc|Gd|Tt|Gio)";

export function splitPsalmTitle(title: string): { num: string; name: string } {
  const raw = String(title);
  const parts = raw
    .split(/\u2003+| {3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { num: parts[0], name: parts.slice(1).join(" ") };

  const t = raw.replace(/\s+/g, " ").trim();
  const psalm = t.match(
    /^(SALMO\s+\d+[a-zA-Z]?(?:\s*,\s*[\d.\-–ab ]+)?(?:\s*\((?:I{1,3}|IV)\))?)\s+([A-ZÀ-Ù«].+)$/,
  );
  if (psalm) return { num: psalm[1].trim(), name: psalm[2].trim() };

  const cant = t.match(
    new RegExp(
      `^(CANTICO(?:\\s+(?:DI|DEI|DEGLI|DELL[AEIO]'?|DELLE|DEL)\\s+[A-ZÀ-Ù][A-Za-zÀ-ÿ'’ ]*?)?)\\s+(${BIBLE_BOOK}\\s+[\\d.,\\-–ab ]+?)\\s+([A-ZÀ-Ù«].+)$`,
      "i",
    ),
  );
  if (cant) {
    return {
      num: `${cant[1].trim()} ${cant[2].replace(/\s+/g, " ").trim()}`,
      name: cant[3].trim(),
    };
  }
  return { num: t, name: "" };
}
