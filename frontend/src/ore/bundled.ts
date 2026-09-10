import type { InvitPsalmId } from "./types";

export const GLORIA = [
  "Gloria al Padre e al Figlio *",
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
    cite: "(Eb 3, 13).",
    verses: verses(`
Venite, applaudiamo al Signore, *
acclamiamo alla roccia della nostra salvezza.
Accostiamoci a lui per rendergli grazie, *
a lui acclamiamo con canti di gioia

Poiché grande Dio è il Signore, *
grande re sopra tutti gli dèi.
Nella sua mano sono gli abissi della terra, *
sono sue le vette dei monti.
Suo è il mare, egli l’ha fatto, *
le sue mani hanno plasmato la terra

Venite, prostràti adoriamo, *
in ginocchio davanti al Signore che ci ha creati.
Egli è il nostro Dio, e noi il popolo del suo pascolo, *
il gregge che egli conduce

Ascoltate oggi la sua voce: †
«Non indurite il cuore, *
come a Merìba, come nel giorno di Massa nel deserto,
dove mi tentarono i vostri padri: *
mi misero alla prova, pur avendo visto le mie opere

Per quarant’anni mi disgustai di quella generazione †
e dissi: Sono un popolo dal cuore traviato, *
non conoscono le mie vie;
perciò ho giurato nel mio sdegno: *
Non entreranno nel luogo del mio riposo»
    `),
  },
  "99": {
    title: "SALMO 99  Esultanza di tutta la terra",
    sub: "Il Signore regna, il Redentore è sul trono",
    cite: "",
    verses: verses(`
Acclamate al Signore, voi tutti della terra, *
servite il Signore nella gioia,
presentatevi a lui con esultanza.

Riconoscete che il Signore è Dio; *
egli ci ha fatti e noi siamo suoi,
suo popolo e gregge del suo pascolo.

Varcate le sue porte con inni di grazie, *
i suoi atri con canti di lode;
lodatelo, benedite il suo nome.

Perché buono è il Signore, *
eterna la sua misericordia,
la sua fedeltà per ogni generazione.
    `),
  },
  "66": {
    title: "SALMO 66  Invocazione della benedizione di Dio",
    sub: "Sappiate che Dio ha concesso la salvezza a Israele",
    cite: "(At 28, 28).",
    verses: verses(`
Dio abbia pietà di noi e ci benedica, *
su di noi faccia splendere il suo volto;
perché si conosca sulla terra la tua via, *
la tua salvezza fra tutte le genti.

Ti lodino i popoli, Dio, *
ti lodino i popoli tutti.
Esultino le genti e gioiscano, *
perché giudichi i popoli con giustizia,
governi le nazioni sulla terra.

Ti lodino i popoli, Dio, *
ti lodino i popoli tutti.
La terra ha dato il suo frutto.
Ci benedica Dio, il nostro Dio, *
ci benedica Dio e lo temano
tutti i confini della terra.
    `),
  },
  "23": {
    title: "SALMO 23  Liturgia d’ingresso nel santuario",
    sub: "Le porte si aprono al Signore della gloria",
    cite: "",
    verses: verses(`
Del Signore è la terra e quanto contiene, *
l’universo e i suoi abitanti.
È lui che l’ha fondata sui mari, *
e sui fiumi l’ha stabilita.

Chi salirà il monte del Signore, *
chi starà nel suo luogo santo?
Chi ha mani innocenti e cuore puro, *
chi non pronunzia menzogna,
chi non giura a danno del suo prossimo.

Egli otterrà benedizione dal Signore, *
giustizia da Dio sua salvezza.
Ecco la generazione che lo cerca, *
che cerca il tuo volto, Dio di Giacobbe.

Sollevate, porte, i vostri frontali, *
alzatevi, porte antiche,
ed entri il re della gloria.

Chi è questo re della gloria? *
Il Signore forte e potente,
il Signore potente in battaglia.

Sollevate, porte, i vostri frontali, *
alzatevi, porte antiche,
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

export function splitPsalmTitle(title: string): { num: string; name: string } {
  const parts = String(title)
    .split(/\u2003+| {3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { num: parts[0], name: parts.slice(1).join(" ") };
  return { num: title, name: "" };
}
