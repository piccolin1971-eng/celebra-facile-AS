/**
 * Verifica link Wikipedia e Santiebeati per i santi facoltativi.
 * Uso: npx tsx scripts/audit-optional-saint-links.ts
 */
import fs from "fs";
import path from "path";
import catalog from "../src/data/optionalSaintsCatalog.json";
import bios from "../src/data/optionalSaintBios.json";
import {
  OPTIONAL_SAINT_SANTIE_BEATI,
  OPTIONAL_SAINT_WIKIPEDIA,
} from "../src/data/optionalSaintExternalLinks";

type Bio = { title: string; wikipediaUrl: string; santiebeatiUrl: string };

async function headOk(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "CelebraFacile-audit/1.0 (contact: local)" },
    });
    if (res.status === 405 || res.status === 403) {
      const get = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "CelebraFacile-audit/1.0 (contact: local)" },
      });
      return { ok: get.ok, status: get.status };
    }
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function wikiKind(url: string): "articolo" | "ricerca" | "altro" {
  if (url.includes("Speciale:Ricerca") || url.includes("w/index.php?search=")) return "ricerca";
  if (url.includes("/wiki/")) return "articolo";
  return "altro";
}

function sbKind(url: string): "dettaglio" | "giorno" | "ricerca" | "altro" {
  if (url.includes("/dettaglio/")) return "dettaglio";
  if (/\/\d{2}\/\d{2}\/?$/.test(url.replace(/\/$/, "") + "/")) return "giorno";
  if (url.includes("/ricerca")) return "ricerca";
  return "altro";
}

async function main() {
  const saints = (catalog as { saints: { id: string; title: string; date: string }[] }).saints;
  const data = bios as Record<string, Bio>;
  let issues = 0;

  console.log("id | data | Wikipedia | Santiebeati");
  console.log("---|------|-----------|------------");

  for (const s of saints) {
    const bio = data[s.id];
    const row: string[] = [s.id, s.date];
    if (!bio) {
      console.log(`${s.id} | ${s.date} | MISSING BIO | —`);
      issues++;
      continue;
    }

    const expWiki = OPTIONAL_SAINT_WIKIPEDIA[s.id];
    const expSb = OPTIONAL_SAINT_SANTIE_BEATI[s.id];
    if (bio.wikipediaUrl !== expWiki) {
      row.push(`JSON≠tabella wiki`);
      issues++;
    } else {
      const wk = wikiKind(bio.wikipediaUrl);
      const wh = await headOk(bio.wikipediaUrl);
      row.push(
        wh.ok
          ? wk === "ricerca"
            ? "ricerca (ok)"
            : "articolo (ok)"
          : `HTTP ${wh.status}`,
      );
      if (!wh.ok && wk === "articolo") issues++;
    }

    if (bio.santiebeatiUrl !== expSb) {
      row.push(`JSON≠tabella sb`);
      issues++;
    } else {
      const sk = sbKind(bio.santiebeatiUrl);
      const sh = await headOk(bio.santiebeatiUrl);
      row.push(sh.ok ? `${sk} ${bio.santiebeatiUrl.split("/").pop()}` : `HTTP ${sh.status}`);
      if (!sh.ok || sk !== "dettaglio") issues++;
    }

    console.log(row.join(" | "));
  }

  console.log("\nTotale santi:", saints.length, "| problemi:", issues);
  process.exit(issues > 0 ? 1 : 0);
}

main();
