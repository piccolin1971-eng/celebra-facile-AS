/**
 * Aggiorna optionalSaintLiturgyBundles.json: orazioni + messa completa dove il CEI non pubblica.
 * Uso: npx tsx scripts/build-optional-saint-liturgy-bundles.ts
 */
import fs from "fs";
import path from "path";
import catalog from "../src/data/optionalSaintsCatalog.json";
import existing from "../src/data/optionalSaintLiturgyBundles.json";
import { getSaintLectionaryForDate, hasInlineProperReadings } from "../src/saintLectionary";
import { parseLocalDate } from "../src/dateUtils";

type Bundle = {
  liturgical_color?: string;
  sourceNote?: string;
  readings: Array<{
    type: string;
    title: string;
    reference: string;
    text: string;
  }>;
};

const OUT = path.resolve(__dirname, "../src/data/optionalSaintLiturgyBundles.json");

const PRAYER_BUNDLES: Record<string, Bundle> = {
  "nome-gesu": {
    liturgical_color: "bianco",
    sourceNote: "Orazioni dal Messale Romano (Proprio dei Santi); letture dal lezionario in app.",
    readings: [
      {
        type: "antifona_ingresso",
        title: "Antifona d'ingresso",
        reference: "Fil 2, 10-11",
        text:
          "Nel nome di Gesù ogni ginocchio si pieghi nei cieli, sulla terra e sotto terra, e ogni lingua proclami: «Gesù Cristo è Signore!», a gloria di Dio Padre.",
      },
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, nell’incarnazione del tuo Verbo hai posto il fondamento all’opera della salvezza del genere umano: concedi la tua misericordia al popolo che la implora, perché tutti riconoscano che non c’è altro nome da invocare per essere salvati, se non quello del tuo unico Figlio. Egli è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "sulle_offerte",
        title: "Preghiera sulle offerte",
        reference: "",
        text:
          "Ti presentiamo, o Padre, i doni che abbiamo ricevuto dalla tua bontà e ti preghiamo: tu, che a Cristo fatto obbediente fino alla morte hai dato il nome che è fonte di salvezza, concedi a noi di essere sostenuti dalla sua potenza redentrice. Egli vive e regna nei secoli dei secoli.",
      },
      {
        type: "dopo_comunione",
        title: "Preghiera dopo la Comunione",
        reference: "",
        text:
          "O Signore, la partecipazione al sacrificio, a te offerto nella memoria del nome di Gesù, infonda in noi l’abbondanza della tua grazia, perché possiamo rallegrarci che anche i nostri nomi sono scritti nei cieli. Per Cristo nostro Signore.",
      },
    ],
  },
  "san-patrizio": {
    liturgical_color: "bianco",
    sourceNote: "Orazioni dal Messale Romano; letture dal lezionario in app.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che hai mandato il santo vescovo Patrizio a far conoscere il tuo nome ai popoli dell’Irlanda, per i suoi meriti e la sua intercessione concedi a quanti si gloriano del nome cristiano di annunciare agli uomini le meraviglie del tuo amore. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
    ],
  },
  "francesco-paola": {
    liturgical_color: "bianco",
    sourceNote: "Orazioni dal Messale Romano; letture dal lezionario in app.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, grandezza degli umili, che hai innalzato alla gloria dei santi il tuo servo Francesco da Paola, minimo tra i fratelli, per i suoi meriti e il suo esempio concedi anche a noi di ottenere l’eredità promessa agli umili di cuore. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
    ],
  },
  "giuseppe-lavoratore": {
    liturgical_color: "bianco",
    sourceNote: "Orazioni dal Messale Romano; letture dal lezionario in app.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, creatore del mondo, che hai ordinato la legge del lavoro per l’uomo, concedi propizamente che, imitando san Giuseppe e sotto la sua protezione, compiamo le opere che ci affidi e otteniamo i premi promessi. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
    ],
  },
  "san-nicola": {
    liturgical_color: "bianco",
    sourceNote: "Orazioni dal Messale Romano; letture dal lezionario in app.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che hai glorificato il beato vescovo Nicola con innumerevoli miracoli, concedi che, per i suoi meriti e preghiere, siamo liberati dalle insidie del tempo e dell’eternità. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
    ],
  },
};

const FULL_BUNDLES: Record<string, Bundle> = {
  "gabriele-addolorata": {
    liturgical_color: "bianco",
    sourceNote: "Formulario del Santuario di San Gabriele (testi propri approvati).",
    readings: [
      {
        type: "antifona_ingresso",
        title: "Antifona d'ingresso",
        reference: "1 Re 14, 8",
        text: "Il mio servo mi ha seguito con tutto il cuore facendo solo quanto è giusto davanti ai miei occhi.",
      },
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che con mirabile disegno di amore hai chiamato san Gabriele dell’Addolorata a vivere il mistero della Croce insieme con Maria, la madre di Gesù, guida il nostro spirito verso il tuo Figlio crocifisso perché partecipando alla sua passione e morte conseguiamo la gloria della risurrezione. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "prima_lettura",
        title: "Prima Lettura",
        reference: "Dal libro della Genesi (12, 1-2.4)",
        text:
          "In quei giorni, il Signore disse ad Abràm: «Vàttene dal tuo paese, dalla tua patria e dalla casa di tuo padre, verso il paese che io ti indicherò. Farò di te un grande popolo e ti benedirò; renderò grande il tuo nome e diventerai una benedizione». Allora Abràm partì, come gli aveva ordinato il Signore.\n\nParola di Dio.",
      },
      {
        type: "salmo",
        title: "Salmo Responsoriale",
        reference: "Dal Salmo 118 (119)",
        text:
          "La tua parola, Signore, è fonte di gioia.\n\nCome potrà un giovane tenere pura la sua via? Custodendo le tue parole. Con tutto il cuore ti cerco: non farmi deviare dai tuoi precetti.",
      },
      {
        type: "acclamazione",
        title: "Acclamazione al Vangelo",
        reference: "Lc 11, 28",
        text: "Beati quelli che custodiscono la parola di Dio in un cuore buono e sincero e portano frutto con perseveranza.",
      },
      {
        type: "vangelo",
        title: "Vangelo",
        reference: "Dal Vangelo secondo Marco (10, 17-21)",
        text:
          "In quel tempo, mentre Gesù usciva per mettersi in viaggio, un tale gli corse incontro e, gettandosi in ginocchio davanti a lui, gli domandò: «Maestro buono, che cosa devo fare per avere la vita eterna?». Gesù gli disse: «Perché mi chiami buono? Nessuno è buono se non Dio solo. Tu conosci i comandamenti…». Egli allora disse: «Maestro, tutte queste cose le ho osservate fin dalla mia giovinezza». Allora Gesù fissatolo, lo amò e gli disse: «Una cosa sola ti manca: va’, vendi quello che hai e dàllo ai poveri, e avrai un tesoro in cielo; poi vieni e seguimi».\n\nParola del Signore.",
      },
      {
        type: "sulle_offerte",
        title: "Preghiera sulle offerte",
        reference: "",
        text:
          "Accetta, Signore, i doni che ti presentiamo nella memoria di san Gabriele dell’Addolorata; giovi alla nostra salvezza e ci ottenga i doni del tuo Spirito Santo. Per Cristo nostro Signore.",
      },
      {
        type: "dopo_comunione",
        title: "Preghiera dopo la Comunione",
        reference: "",
        text:
          "O Dio, fonte di vita, il sacramento che abbiamo ricevuto aumenti in noi il tuo spirito di verità e di amore, e nell’imitazione di san Gabriele dell’Addolorata ci ottenga di partecipare con lui al convito della gloria eterna. Per Cristo nostro Signore.",
      },
    ],
  },
  faustina: {
    liturgical_color: "bianco",
    sourceNote: "Testi propri approvati dalla Congregazione per il Culto Divino (memoria 5 ottobre).",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio onnipotente ed eterno, che hai scelto la santa Faustina Kowalska per proclamare al mondo le immense ricchezze della tua infinita misericordia, concedi a noi, per sua intercessione, di confidare come lei pienamente nella tua bontà e di compiere con cuore generoso le opere di carità cristiana. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "prima_lettura",
        title: "Prima Lettura",
        reference: "Dalla lettera di san Paolo apostolo ai Romani (8, 28-30)",
        text:
          "Fratelli, noi sappiamo che tutto concorre al bene di coloro che amano Dio, che sono stati chiamati secondo il suo disegno. Poiché quelli che egli ha preconosciuti li ha anche predestinati a essere conformi all’immagine del Figlio suo, perché egli sia il primogenito tra molti fratelli. Quelli poi che ha predestinati, li ha anche chiamati; quelli che ha chiamati, li ha anche giustificati; quelli che ha giustificati, li ha anche glorificati.\n\nParola di Dio.",
      },
      {
        type: "salmo",
        title: "Salmo Responsoriale",
        reference: "Dal Salmo 102 (103)",
        text:
          "Il Signore è pietà e amore.\n\nBenedici il Signore, anima mia; quanto è in me benedica il suo santo nome. Benedici il Signore, anima mia, non dimenticare tutti i suoi benefici.",
      },
      {
        type: "acclamazione",
        title: "Acclamazione al Vangelo",
        reference: "Gv 15, 5",
        text: "Io sono la vite, voi i tralci; chi rimane in me e io in lui, porta molto frutto, dice il Signore.",
      },
      {
        type: "vangelo",
        title: "Vangelo",
        reference: "Dal Vangelo secondo Giovanni (15, 1-8)",
        text:
          "In quel tempo, Gesù disse ai suoi discepoli: «Io sono la vite vera e il Padre mio è l’agricoltore. Ogni tralcio che in me non porta frutto, lo taglia, e ogni tralcio che porta frutto, lo pota perché porti più frutto… Chi rimane in me, e io in lui, porta molto frutto».\n\nParola del Signore.",
      },
    ],
  },
  "pier-giorgio-frassati": {
    liturgical_color: "bianco",
    sourceNote: "Memoria facoltativa (testi propri post-canonizzazione; orazione conforme alla tradizione liturgica).",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che hai fatto risplendere nella vita di san Pier Giorgio Frassati l’ardore della fede e la carità verso i poveri, concedi ai tuoi fedeli di imitare la sua testimonianza, per essere sempre pronti a servire il tuo popolo. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "prima_lettura",
        title: "Prima Lettura",
        reference: "Dalla lettera di san Giacomo (1, 22-27)",
        text:
          "Fratelli, siate di quelli che mettono in pratica la parola e non solo di quelli che la ascoltano, ingannando voi stessi. Poiché chi ascolta la parola e non la mette in pratica, è simile a un uomo che guarda in uno specchio il proprio volto naturale: si guarda, poi se ne va e subito dimentica com’era. Chi invece fissa lo sguardo sulla legge perfetta, quella della libertà, e ci persevera, non come uomo che ascolta per dimenticare, ma mettendo in pratica, sarà felice nel suo operare.\n\nParola di Dio.",
      },
      {
        type: "salmo",
        title: "Salmo Responsoriale",
        reference: "Dal Salmo 15 (16)",
        text:
          "Tu mi mostri il sentiero della vita.\n\nCustodiscimi, Dio, perché in te mi rifugio. Tu sei il mio bene, nulla ho al di fuori di te.",
      },
      {
        type: "acclamazione",
        title: "Acclamazione al Vangelo",
        reference: "Mt 5, 8",
        text: "Beati i puri di cuore, perché vedranno Dio.",
      },
      {
        type: "vangelo",
        title: "Vangelo",
        reference: "Dal Vangelo secondo Matteo (25, 31-40)",
        text:
          "In quel tempo, Gesù disse ai suoi discepoli: «Quando il Figlio dell’uomo verrà nella sua gloria… il re dirà a quelli che saranno alla sua destra: “Venite, benedetti del Padre mio… perché ho avuto fame e mi avete dato da mangiare…”».\n\nParola del Signore.",
      },
    ],
  },
  "sant-orso-d-aosta": {
    liturgical_color: "bianco",
    sourceNote: "Santo locale (Messale diocesano Piemonte–Valle d’Aosta): orazioni in app; letture dal Comune dei pastori.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che hai reso il tuo servo Orso fedele pastore del popolo che gli hai affidato, fa’ che per sua intercessione perseveriamo nella fede e nella carità. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "prima_lettura",
        title: "Prima Lettura",
        reference: "Dalla prima lettera di san Pietro apostolo (5, 1-4)",
        text:
          "Esorto gli anziani tra voi, come anziano con loro e testimone delle passioni di Cristo, e come partecipe della gloria che deve manifestarsi: pascete il gregge di Dio che v’è affidato, vigilando su di esso non per forza, ma volontariamente, secondo Dio; non per vile interesse, ma con generosità; non come dominatori delle comunità, ma come modelli del gregge. Quando apparirà il sommo Pastore, voi riceverete la corona della gloria che non appassisce.\n\nParola di Dio.",
      },
      {
        type: "salmo",
        title: "Salmo Responsoriale",
        reference: "Dal Salmo 23 (24)",
        text: "Il Signore è il mio pastore: nulla mi manca.",
      },
      {
        type: "vangelo",
        title: "Vangelo",
        reference: "Dal Vangelo secondo Giovanni (10, 11-16)",
        text:
          "In quel tempo, Gesù disse: «Io sono il buon pastore. Il buon pastore dà la vita per le sue pecore…».\n\nParola del Signore.",
      },
    ],
  },
  "san-grato-d-aosta": {
    liturgical_color: "bianco",
    sourceNote: "Santo locale (diocesi di Aosta): testi sintetici in app.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che per mezzo del vescovo san Grato hai difeso e consolato la tua Chiesa, concedi che, per sua intercessione, camminiamo fedelmente dietro Cristo pastore. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "prima_lettura",
        title: "Prima Lettura",
        reference: "Dalla lettera di san Paolo apostolo agli Efesini (4, 1-6)",
        text:
          "Vi esorto dunque, io, il prigioniero per il Signore, a camminare in maniera degna della vocazione che avete ricevuto… Un solo corpo e un solo Spirito, come anche voi siete stati chiamati a una sola speranza nella vostra vocazione; un solo Signore, una sola fede, un solo battesimo, un solo Dio e Padre di tutti.\n\nParola di Dio.",
      },
      {
        type: "vangelo",
        title: "Vangelo",
        reference: "Dal Vangelo secondo Matteo (5, 1-12a)",
        text: "In quel tempo, vedendo le folle, Gesù salì sul monte e si sedette… «Beati i poveri in spirito…».\n\nParola del Signore.",
      },
    ],
  },
  "santi-vittore-e-corona": {
    liturgical_color: "rosso",
    sourceNote: "Santi locali (Veneto): testi sintetici in app.",
    readings: [
      {
        type: "colletta",
        title: "Colletta",
        reference: "",
        text:
          "O Dio, che hai reso forti i santi martiri Vittore e Corona nel combattimento della fede, concedi che, celebrando il loro trionfo, imitiamo la loro costanza. Per il nostro Signore Gesù Cristo, tuo Figlio, che è Dio, e vive e regna con te, nell’unità dello Spirito Santo, per tutti i secoli dei secoli.",
      },
      {
        type: "prima_lettura",
        title: "Prima Lettura",
        reference: "Dalla lettera di san Paolo apostolo ai Romani (8, 31b-39)",
        text:
          "Se Dio è per noi, chi sarà contro di noi?… Io sono convinto che né morte né vita… potranno separarci dall’amore di Dio in Cristo Gesù, nostro Signore.\n\nParola di Dio.",
      },
      {
        type: "vangelo",
        title: "Vangelo",
        reference: "Dal Vangelo secondo Giovanni (12, 24-26)",
        text:
          "In quel tempo, Gesù disse ai suoi discepoli: «In verità, in verità vi dico: se il chicco di grano caduto in terra non muore, resta solo; se invece muore, produce molto frutto».\n\nParola del Signore.",
      },
    ],
  },
};

function main() {
  const out: Record<string, Bundle> = { ...(existing as Record<string, Bundle>) };
  const saints = (catalog as { saints: { id: string; date: string; title: string }[] }).saints;

  for (const [id, bundle] of Object.entries({ ...PRAYER_BUNDLES, ...FULL_BUNDLES })) {
    out[id] = bundle;
  }

  for (const s of saints) {
    if (out[s.id]?.readings?.some((r) => r.type === "vangelo")) continue;
    const d = parseLocalDate(`2026-${s.date}`);
    const lec = getSaintLectionaryForDate(d, s.title);
    if (lec.length === 0 || !hasInlineProperReadings(lec[0])) continue;
    if (out[s.id]) continue;
    out[s.id] = {
      liturgical_color: "bianco",
      sourceNote: "Letture dal lezionario dei Santi in app (CEI nazionale senza blocco facoltativo).",
      readings: lec[0].readings.map((r) => ({
        type: r.type,
        title: r.title,
        reference: r.reference,
        text: r.text,
      })),
    };
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  console.log(`Scritto ${OUT} (${Object.keys(out).length} bundle)`);
}

main();
