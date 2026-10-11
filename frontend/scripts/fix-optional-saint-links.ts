/**
 * Aggiorna wikipediaUrl e santiebeatiUrl in optionalSaintBios.json.
 * Uso: npx tsx scripts/fix-optional-saint-links.ts
 */
import fs from "fs";
import path from "path";
import catalog from "../src/data/optionalSaintsCatalog.json";

const OUT = path.resolve(__dirname, "../src/data/optionalSaintBios.json");

type Bio = {
  title: string;
  wikipediaUrl: string;
  santiebeatiUrl: string;
};

/** Verificati manualmente o non risolvibili in modo affidabile dalla pagina del giorno. */
const SANTIE_BEATI_MANUAL: Record<string, string> = {
  "san-grato-d-aosta": "https://www.santiebeati.it/dettaglio/34550",
  "gabriele-addolorata": "https://www.santiebeati.it/dettaglio/26000",
  "pier-giorgio-frassati": "https://www.santiebeati.it/dettaglio/88050",
  faustina: "https://www.santiebeati.it/dettaglio/57000",
};

const WIKI_MANUAL: Record<string, string> = {
  "nome-gesu": "https://it.wikipedia.org/wiki/Santissimo_Nome_di_Ges%C3%B9",
  "angela-merici": "https://it.wikipedia.org/wiki/Sant%27Angela_Merici",
  "maria-lourdes": "https://it.wikipedia.org/wiki/Nostra_Signora_di_Lourdes",
  "san-patrizio": "https://it.wikipedia.org/wiki/San_Patrizio",
  "francesco-paola": "https://it.wikipedia.org/wiki/Francesco_di_Paola_(santo)",
  "san-giorgio": "https://it.wikipedia.org/wiki/Giorgio_(santo)",
  "giuseppe-lavoratore": "https://it.wikipedia.org/wiki/San_Giuseppe_lavoratore",
  "maria-fatima": "https://it.wikipedia.org/wiki/Madonna_di_F%C3%A1tima",
  "rita-cascia": "https://it.wikipedia.org/wiki/Rita_da_Cascia",
  "elisabetta-portogallo": "https://it.wikipedia.org/wiki/Elisabetta_di_Portogallo",
  "maria-goretti": "https://it.wikipedia.org/wiki/Maria_Goretti",
  "monte-carmelo": "https://it.wikipedia.org/wiki/Madonna_del_Carmelo",
  "nome-maria": "https://it.wikipedia.org/wiki/Beata_Vergine_Maria,_santissimo_nome",
  "margherita-maria": "https://it.wikipedia.org/wiki/Margherita_Maria_Alacoque",
  "paolo-della-croce": "https://it.wikipedia.org/wiki/Paolo_della_Croce_(santo)",
  "martino-porres": "https://it.wikipedia.org/wiki/Martino_de_Porres",
  "san-nicola": "https://it.wikipedia.org/wiki/San_Nicola_di_Mira",
  loreto: "https://it.wikipedia.org/wiki/Santa_Casa_di_Loreto",
  guadalupe: "https://it.wikipedia.org/wiki/Madonna_di_Guadalupe",
  "sant-orso-d-aosta": "https://it.wikipedia.org/wiki/Orso_d%27Aosta",
  "san-grato-d-aosta": "https://it.wikipedia.org/wiki/Grato_d%27Aosta",
  "santi-vittore-e-corona": "https://it.wikipedia.org/wiki/Vittore_e_Corona",
  "carlo-acutis": "https://it.wikipedia.org/wiki/Carlo_Acutis",
  "pier-giorgio-frassati": "https://it.wikipedia.org/wiki/Pier_Giorgio_Frassati",
  faustina: "https://it.wikipedia.org/wiki/Maria_Faustina_Kowalska",
  "gabriele-addolorata": "https://it.wikipedia.org/wiki/San_Gabriele_dell%27Addolorata",
};

function cleanOcr(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u02B9\u02BB\u02BC\u00B4\u0060]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(s: string): string {
  return cleanOcr(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsant'\s*/g, "s ")
    .replace(/\bsant[ao]\b/g, "s")
    .replace(/\bbeat[ao]\b/g, "b")
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(title: string): string[] {
  const skip = new Set([
    "santo",
    "santa",
    "santi",
    "sant",
    "s",
    "b",
    "presbitero",
    "vescovo",
    "vergine",
    "martire",
    "religiosa",
    "religioso",
    "eremita",
    "della",
    "del",
    "di",
    "e",
    "lavoratore",
    "addolorata",
    "portogallo",
    "carmelo",
    "lourdes",
    "fatima",
    "loreto",
    "guadalupe",
    "gesu",
    "maria",
    "vergine",
    "beata",
    "santissimo",
    "nome",
  ]);
  return normalize(title)
    .split(" ")
    .filter((w) => w.length > 2 && !skip.has(w));
}

function titleScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 92;
  const wa = significantTokens(a);
  const wb = significantTokens(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.includes(w)) inter++;
  const base = Math.round((100 * inter) / Math.max(wa.length, wb.length));
  if (wa[0] && wb[0] && (wa[0] === wb[0] || wa[0].startsWith(wb[0]) || wb[0].startsWith(wa[0]))) {
    return Math.max(base, 70) + 10;
  }
  return base;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function resolveSantiebeati(mmdd: string, title: string, saintId: string): Promise<string> {
  const manual = SANTIE_BEATI_MANUAL[saintId];
  if (manual) return manual;

  const [mm, dd] = mmdd.split("-");
  const dayUrl = `https://www.santiebeati.it/${mm}/${dd}/`;
  try {
    const res = await fetch(dayUrl, { headers: { "User-Agent": "CelebraFacileBioBuilder/1.2" } });
    if (!res.ok) return dayUrl;
    const html = await res.text();
    const re = /href="(\/dettaglio\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    let bestHref = "";
    let bestScore = 0;
    const nameTokens = significantTokens(title);
    while ((m = re.exec(html)) !== null) {
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!label || label.length > 120) continue;
      const labelNorm = normalize(label);
      if (nameTokens.length && !nameTokens.some((t) => t.length >= 4 && labelNorm.includes(t))) {
        continue;
      }
      const score = titleScore(title, label);
      if (score > bestScore) {
        bestScore = score;
        bestHref = m[1];
      }
    }
    if (bestScore >= 40 && bestHref) return `https://www.santiebeati.it${bestHref}`;
  } catch {
    /* ignore */
  }
  return `https://www.santiebeati.it/ricerca/?s=${encodeURIComponent(title)}`;
}

async function main() {
  const bios = JSON.parse(fs.readFileSync(OUT, "utf8")) as Record<string, Bio>;
  const saints = (catalog as { saints: { id: string; date: string; title: string }[] }).saints;

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
    console.log(
      `${s.id.padEnd(24)} wiki: ${wiki.includes("Speciale:Ricerca") ? "RICERCA" : "articolo"} | sb: ${sb.replace("https://www.santiebeati.it", "")}`,
    );
    await sleep(120);
  }

  fs.writeFileSync(OUT, JSON.stringify(bios, null, 2) + "\n", "utf8");
  console.log("\nScritto", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
