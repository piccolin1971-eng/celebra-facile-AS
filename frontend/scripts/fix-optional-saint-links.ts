/**
 * Aggiorna wikipediaUrl e santiebeatiUrl in optionalSaintBios.json
 * e riscrive optionalSaintExternalLinks.ts.
 * Uso: npx tsx scripts/fix-optional-saint-links.ts
 */
import fs from "fs";
import path from "path";
import catalog from "../src/data/optionalSaintsCatalog.json";
const OUT = path.resolve(__dirname, "../src/data/optionalSaintBios.json");
const LINKS_TS = path.resolve(__dirname, "../src/data/optionalSaintExternalLinks.ts");

/** Non rigenerato: link per il secondo santo in memorie composte. */
const OPTIONAL_SAINT_EXTRA_LINKS: Record<string, { label: string; url: string }[]> = {
  "fabiano-sebastiano": [
    {
      label: "Wikipedia — Sebastiano",
      url: "https://it.wikipedia.org/wiki/San_Sebastiano",
    },
    {
      label: "Santi e Beati — Sebastiano",
      url: "https://www.santiebeati.it/dettaglio/25800",
    },
  ],
};

type Bio = {
  title: string;
  wikipediaUrl: string;
  santiebeatiUrl: string;
};

const WIKI_MANUAL: Record<string, string> = {
  "nome-gesu": "https://it.wikipedia.org/wiki/Santissimo_Nome_di_Ges%C3%B9",
  "fabiano-sebastiano": "https://it.wikipedia.org/wiki/Papa_Fabiano",
  "angela-merici": "https://it.wikipedia.org/wiki/Sant%27Angela_Merici",
  "san-biagio": "https://it.wikipedia.org/wiki/Biagio_di_Sebaste",
  "pier-damiani": "https://it.wikipedia.org/wiki/Pier_Damiani",
  "cirillo-gerusalemme": "https://it.wikipedia.org/wiki/Cirillo_di_Gerusalemme",
  anselmo: "https://it.wikipedia.org/wiki/Anselmo_d%27Aosta",
  "bernardino-siena": "https://it.wikipedia.org/wiki/Bernardino_da_Siena",
  "cirillo-alessandria": "https://it.wikipedia.org/wiki/Cirillo_di_Alessandria",
  "rosa-lima": "https://it.wikipedia.org/wiki/Rosa_da_Lima",
  "san-bruno": "https://it.wikipedia.org/wiki/Bruno_di_Colonia",
  "giovanni-xxiii": "https://it.wikipedia.org/wiki/Papa_Giovanni_XXIII",
  "alberto-magno": "https://it.wikipedia.org/wiki/Alberto_Magno",
  "caterina-alessandria": "https://it.wikipedia.org/wiki/Caterina_d%27Alessandria",
  "giovanni-damasceno": "https://it.wikipedia.org/wiki/Giovanni_Damasceno",
  "sant-orso-d-aosta": "https://it.wikipedia.org/wiki/Orso_di_Aosta",
  "maria-lourdes": "https://it.wikipedia.org/wiki/Nostra_Signora_di_Lourdes",
  "gabriele-addolorata": "https://it.wikipedia.org/wiki/Gabriele_dell%27Addolorata",
  "san-patrizio": "https://it.wikipedia.org/wiki/San_Patrizio",
  "francesco-paola": "https://it.wikipedia.org/wiki/Francesco_da_Paola",
  "san-giorgio": "https://it.wikipedia.org/wiki/San_Giorgio",
  "giuseppe-lavoratore": "https://it.wikipedia.org/wiki/San_Giuseppe",
  "maria-fatima": "https://it.wikipedia.org/wiki/Madonna_di_F%C3%A1tima",
  "santi-vittore-e-corona": "https://it.wikipedia.org/wiki/Vittore_e_Corona",
  "rita-cascia": "https://it.wikipedia.org/wiki/Rita_da_Cascia",
  "pier-giorgio-frassati": "https://it.wikipedia.org/wiki/Pier_Giorgio_Frassati",
  "elisabetta-portogallo":
    "https://it.wikipedia.org/wiki/Isabella_d%27Aragona_(regina_del_Portogallo_1271)",
  "maria-goretti": "https://it.wikipedia.org/wiki/Maria_Goretti",
  "camillo-de-lellis": "https://it.wikipedia.org/wiki/Camillo_de_Lellis",
  "monte-carmelo": "https://it.wikipedia.org/wiki/Madonna_del_Carmelo",
  "san-grato-d-aosta": "https://it.wikipedia.org/wiki/Grato_di_Aosta",
  "nome-maria": "https://it.wikipedia.org/wiki/Santissimo_Nome_di_Maria",
  faustina: "https://it.wikipedia.org/wiki/Maria_Faustina_Kowalska",
  "carlo-acutis": "https://it.wikipedia.org/wiki/Carlo_Acutis",
  "margherita-maria": "https://it.wikipedia.org/wiki/Margherita_Maria_Alacoque",
  "paolo-della-croce": "https://it.wikipedia.org/wiki/Paolo_della_Croce",
  "giovanni-paolo-ii": "https://it.wikipedia.org/wiki/Papa_Giovanni_Paolo_II",
  "martino-porres": "https://it.wikipedia.org/wiki/Martino_de_Porres",
  "san-nicola": "https://it.wikipedia.org/wiki/San_Nicola_di_Mira",
  loreto: "https://it.wikipedia.org/wiki/Santa_Casa_di_Loreto",
  guadalupe: "https://it.wikipedia.org/wiki/Madonna_di_Guadalupe",
};

/** Schede santiebeati.it/dettaglio verificate (titolo h1 ↔ catalogo). */
const SANTIE_BEATI_MANUAL: Record<string, string> = {
  "nome-gesu": "https://www.santiebeati.it/dettaglio/25625",
  "fabiano-sebastiano": "https://www.santiebeati.it/dettaglio/25750",
  "angela-merici": "https://www.santiebeati.it/dettaglio/25900",
  "san-biagio": "https://www.santiebeati.it/dettaglio/25950",
  "maria-lourdes": "https://www.santiebeati.it/dettaglio/26100",
  "pier-damiani": "https://www.santiebeati.it/dettaglio/26200",
  "gabriele-addolorata": "https://www.santiebeati.it/dettaglio/31500",
  "san-patrizio": "https://www.santiebeati.it/dettaglio/26400",
  "cirillo-gerusalemme": "https://www.santiebeati.it/dettaglio/26450",
  "francesco-paola": "https://www.santiebeati.it/dettaglio/26550",
  anselmo: "https://www.santiebeati.it/dettaglio/26800",
  "san-giorgio": "https://www.santiebeati.it/dettaglio/26860",
  "giuseppe-lavoratore": "https://www.santiebeati.it/dettaglio/27050",
  "maria-fatima": "https://www.santiebeati.it/dettaglio/53050",
  "santi-vittore-e-corona": "https://www.santiebeati.it/dettaglio/92614",
  "bernardino-siena": "https://www.santiebeati.it/dettaglio/27300",
  "rita-cascia": "https://www.santiebeati.it/dettaglio/32950",
  "pier-giorgio-frassati":
    "https://www.santiebeati.it/ricerca/?s=Pier+Giorgio+Frassati",
  "elisabetta-portogallo": "https://www.santiebeati.it/dettaglio/28050",
  "maria-goretti": "https://www.santiebeati.it/dettaglio/28150",
  "camillo-de-lellis": "https://www.santiebeati.it/dettaglio/28250",
  "monte-carmelo": "https://www.santiebeati.it/dettaglio/28300",
  "cirillo-alessandria": "https://www.santiebeati.it/dettaglio/27950",
  "rosa-lima": "https://www.santiebeati.it/dettaglio/28950",
  "sant-orso-d-aosta": "https://www.santiebeati.it/dettaglio/31250",
  "san-grato-d-aosta": "https://www.santiebeati.it/dettaglio/34550",
  "nome-maria": "https://www.santiebeati.it/dettaglio/69950",
  faustina: "https://www.santiebeati.it/dettaglio/73200",
  "san-bruno": "https://www.santiebeati.it/dettaglio/29400",
  "giovanni-xxiii": "https://www.santiebeati.it/dettaglio/55725",
  "carlo-acutis": "https://www.santiebeati.it/dettaglio/93910",
  "margherita-maria": "https://www.santiebeati.it/dettaglio/29650",
  "paolo-della-croce": "https://www.santiebeati.it/dettaglio/29750",
  "giovanni-paolo-ii": "https://www.santiebeati.it/dettaglio/90026",
  "martino-porres": "https://www.santiebeati.it/dettaglio/29900",
  "alberto-magno": "https://www.santiebeati.it/dettaglio/29950",
  "caterina-alessandria": "https://www.santiebeati.it/dettaglio/79050",
  "giovanni-damasceno": "https://www.santiebeati.it/dettaglio/30250",
  "san-nicola": "https://www.santiebeati.it/dettaglio/30300",
  loreto: "https://www.santiebeati.it/dettaglio/80900",
  guadalupe: "https://www.santiebeati.it/dettaglio/81100",
};

async function resolveSantiebeati(_mmdd: string, title: string, saintId: string): Promise<string> {
  const manual = SANTIE_BEATI_MANUAL[saintId];
  if (manual) return manual;
  return `https://www.santiebeati.it/ricerca/?s=${encodeURIComponent(title)}`;
}

function formatExtraLinksTs(): string {
  const blocks = Object.entries(OPTIONAL_SAINT_EXTRA_LINKS).map(([id, links]) => {
    const key = /^[a-z]+$/.test(id) ? id : `"${id}"`;
    const items = links
      .map(
        (l) =>
          `    {\n      label: ${JSON.stringify(l.label)},\n      url: ${JSON.stringify(l.url)},\n    }`,
      )
      .join(",\n");
    return `  ${key}: [\n${items},\n  ],`;
  });
  return `/** Link aggiuntivi per memorie con più santi (oltre a wikipediaUrl / santiebeatiUrl principali). */
export const OPTIONAL_SAINT_EXTRA_LINKS: Record<
  string,
  { label: string; url: string }[]
> = {
${blocks.join("\n")}
};`;
}

function writeExternalLinksTs(wiki: Record<string, string>, sb: Record<string, string>) {
  const ids = Object.keys(wiki).sort();
  const wikiLines = ids.map((id) => {
    const key = /^[a-z]+$/.test(id) ? id : `"${id}"`;
    return `  ${key}: "${wiki[id]}",`;
  });
  const sbIds = Object.keys(sb).sort();
  const sbLines = sbIds.map((id) => {
    const key = /^[a-z]+$/.test(id) ? id : `"${id}"`;
    return `  ${key}: "${sb[id]}",`;
  });
  const content = `/**
 * Link esterni verificati per le bio dei santi facoltativi (Wikipedia + Santiebeati dettaglio).
 * Generato da: npx tsx scripts/fix-optional-saint-links.ts
 */
export const OPTIONAL_SAINT_WIKIPEDIA: Record<string, string> = {
${wikiLines.join("\n")}
};

/** Schede santiebeati.it/dettaglio/… (non ricerca generica). */
export const OPTIONAL_SAINT_SANTIE_BEATI: Record<string, string> = {
${sbLines.join("\n")}
};

${formatExtraLinksTs()}
`;
  fs.writeFileSync(LINKS_TS, content, "utf8");
}

async function main() {
  const bios = JSON.parse(fs.readFileSync(OUT, "utf8")) as Record<string, Bio>;
  const saints = (catalog as { saints: { id: string; date: string; title: string }[] }).saints;
  const wikiOut: Record<string, string> = {};
  const sbOut: Record<string, string> = {};

  console.log("Aggiornamento link optional saints…\n");
  for (const s of saints) {
    const bio = bios[s.id];
    if (!bio) {
      console.log(`! bio mancante: ${s.id}`);
      continue;
    }
    const wiki = WIKI_MANUAL[s.id] ?? bio.wikipediaUrl;
    const sb = await resolveSantiebeati(s.date, s.title, s.id);
    bio.wikipediaUrl = wiki;
    bio.santiebeatiUrl = sb;
    wikiOut[s.id] = wiki;
    sbOut[s.id] = sb;
    console.log(
      `${s.id.padEnd(24)} wiki: ${wiki.replace("https://it.wikipedia.org/wiki/", "")} | sb: ${sb.replace("https://www.santiebeati.it", "")}`,
    );
  }

  fs.writeFileSync(OUT, JSON.stringify(bios, null, 2) + "\n", "utf8");
  writeExternalLinksTs(wikiOut, sbOut);
  console.log("\nScritto", OUT);
  console.log("Scritto", LINKS_TS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
