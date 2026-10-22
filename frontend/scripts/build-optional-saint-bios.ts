/**
 * Genera optionalSaintBios.json per tutti i santi del catalogo memorie facoltative.
 * Uso: npx tsx scripts/build-optional-saint-bios.ts
 */
import fs from "fs";
import path from "path";
import catalog from "../src/data/optionalSaintsCatalog.json";
import saintBios from "../src/data/saintBios.json";
import saintsCalendar from "../src/data/saintsCalendar.json";
import { saintBioTitlesAlign } from "../src/saintBioPreview";
import type { SaintBioPreview } from "../src/saintBioPreview";
import { polishBiography } from "./messaleTextPolish";
import {
  extractFabianoSebastianoBio,
  extractMessaleBio,
  loadMessaleLines,
} from "./optionalSaintMessaleExtract";

const MESSALE = path.resolve(__dirname, "../../messale 2020.txt");
const OUT = path.resolve(__dirname, "../src/data/optionalSaintBios.json");

type CalDay = { date: string; celebrations: { title: string; rank: string }[] };
type CatalogSaint = { id: string; date: string; title: string; custom?: boolean };

function wikiSearchUrl(title: string): string {
  const q = title
    .replace(/^Santissimo /i, "")
    .replace(/^Sant'|^San |^Santa |^Santi |^Beata |^Beato /i, "")
    .trim();
  return `https://it.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`;
}

function santiebeatiSearchUrl(title: string): string {
  return `https://www.santiebeati.it/ricerca/?s=${encodeURIComponent(title)}`;
}

function rankLabel(rank: string): string {
  if (rank === "memoria_facoltativa" || rank === "memoria_obbligatoria") return "Memoria";
  if (rank === "festa") return "Festa";
  if (rank === "solennita") return "Solennità";
  return "Memoria";
}

function messaleBioForSaint(
  lines: string[] | null,
  s: CatalogSaint,
): string | null {
  if (!lines) return null;
  if (s.id === "fabiano-sebastiano") return extractFabianoSebastianoBio(lines);
  return extractMessaleBio(lines, s.title);
}

/** Biografie non nel messale 2020 o scritte a mano. */
const EXTRA_BIOS: Record<string, Partial<SaintBioPreview>> = {
  "pier-giorgio-frassati": {
    biography:
      "Nato a Torino nel 1901, laico appassionato di montagna e di amicizia, visse con intensa preghiera e carità verso i poveri. Morì a 24 anni nel 1925; beatificato nel 1990 e canonizzato nel 2025. Giovanni Paolo II lo chiamò «l'uomo delle beatitudini».",
    sourceNote: "Scheda sintetica per la memoria facoltativa scelta in app.",
  },
  "carlo-acutis": {
    biography:
      "Nato a Londra nel 1991, cresciuto a Milano. Giovane cattolico appassionato di informatica, promosse l'Eucaristia e l'amore ai poveri anche attraverso il web. Morì nel 2006; beatificato nel 2020 e canonizzato nel 2025.",
    sourceNote: "Scheda sintetica per la memoria facoltativa scelta in app.",
  },
  faustina: {
    biography:
      "Suor Maria Faustina Kowalska (1905-1938), religiosa polacca delle Suore della Beata Vergine Maria della Misericordia. Mistica e apostola della Divina Misericordia, annotò nel Diario le rivelazioni ricevute. Canonizzata da Giovanni Paolo II nel 2000; memoria facoltativa il 5 ottobre.",
    sourceNote: "Scheda sintetica per la memoria facoltativa scelta in app.",
  },
  "gabriele-addolorata": {
    biography:
      "Francesco Possenti (Assisi, 1838 – Isola del Gran Sasso, 1862), passionista con il nome di Gabriele dell'Addolorata. Giovane innamorato di Maria e della Croce, morì a 24 anni. Santo dal 1920, patrono dell'Abruzzo e della Gioventù cattolica italiana.",
    sourceNote: "Scheda sintetica per la memoria facoltativa scelta in app.",
  },
  "sant-orso-d-aosta": {
    biography:
      "Sant'Orso, vescovo di Aosta nel VI secolo, è uno dei santi fondatori della Chiesa valdostana. Tradizione lo ricorda come pastore della comunità cristiana locale, annunciatore della Parola e testimone di carità verso i poveri.",
  },
  "san-grato-d-aosta": {
    biography:
      "San Grato, vescovo di Aosta, è venerato come difensore della città e pastore della Chiesa locale nell'epoca dei primi barbari invasori. La sua memoria è legata al culto diffuso in Valle d'Aosta.",
  },
  "santi-vittore-e-corona": {
    biography:
      "Vittore e Corona, martiri venerati nell'antichità cristiana, sono patroni di Feltre e di molte comunità alpine. La loro testimonianza di fede è custodita dalla tradizione liturgica locale del Triveneto.",
  },
};

function main() {
  const bios = saintBios as Record<string, SaintBioPreview>;
  const calendar = saintsCalendar as CalDay[];
  const messaleLines = loadMessaleLines(MESSALE);
  const out: Record<string, SaintBioPreview> = {};

  for (const s of (catalog as { saints: CatalogSaint[] }).saints) {
    const cal = calendar.find((d) => d.date === s.date);
    const calHit = cal?.celebrations.find((c) => saintBioTitlesAlign(c.title, s.title));
    const rank = rankLabel(calHit?.rank || "memoria_facoltativa");

    let bio: SaintBioPreview | null = null;
    const byDate = bios[s.date];
    if (byDate && saintBioTitlesAlign(byDate.title, s.title)) {
      bio = { ...byDate, title: s.title };
    }

    const messale = messaleBioForSaint(messaleLines, s);
    const extra = EXTRA_BIOS[s.id];

    if (!bio) {
      bio = {
        title: s.title,
        rank,
        kind: /vergine maria|nome di maria|nome di gesù|lourdes|fatima|loreto|guadalupe|carmelo/i.test(
          s.title,
        )
          ? "festa"
          : "santo",
        biography:
          messale ||
          extra?.biography ||
          `Memoria facoltativa: ${s.title}. Celebrazione prevista il ${s.date.replace("-", "/")} nel calendario scelto in app.`,
        sourceNote: messale
          ? `Messale Romano, Proprio dei Santi — ${s.date}`
          : "Scheda sintetica per la memoria facoltativa scelta in app.",
        wikipediaUrl: wikiSearchUrl(s.title),
        santiebeatiUrl: santiebeatiSearchUrl(s.title),
      };
    } else if (messale) {
      bio.biography = messale;
      bio.sourceNote = `Messale Romano, Proprio dei Santi — ${s.date}`;
    }

    if (extra) {
      bio = {
        ...bio,
        ...extra,
        title: s.title,
        rank: bio.rank,
        biography: extra.biography ?? bio.biography,
        sourceNote: extra.sourceNote ?? bio.sourceNote,
      };
    }
    if (s.custom && !extra?.sourceNote && !messale) {
      bio.sourceNote = "Scheda sintetica per la memoria facoltativa scelta in app (santo locale).";
    }

    bio.biography = polishBiography(bio.biography);
    out[s.id] = bio;
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Scritto ${OUT} (${Object.keys(out).length} schede). Eseguire: npx tsx scripts/fix-optional-saint-links.ts`);
}

main();
