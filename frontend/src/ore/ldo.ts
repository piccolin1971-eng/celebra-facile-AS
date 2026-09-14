import { stripTags } from "./html";
import { normalizeHymnStanzas } from "./hymns";
import { fetchCeiUrl } from "../liturgyScraper";
import type { Hymn, MediaId, OreHourId } from "./types";
import { parseLocalDate } from "../dateUtils";

const LDO_DAY = "https://www.liturgiadelleore.it/testo/SoloTestoGiorno.php";

const HOUR_TAG: Partial<Record<OreHourId | MediaId, string>> = {
  invitatorio: "LInv",
  ufficio: "LUff",
  lodi: "LLod",
  terza: "LOm3",
  sesta: "LOm6",
  nona: "LOm9",
  vespri: "LVes",
  compieta: "LCom",
};

function ldoDateParam(dateISO: string): string {
  const d = parseLocalDate(dateISO);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function ldoDayUrl(dateISO: string): string {
  return `${LDO_DAY}?data=${encodeURIComponent(ldoDateParam(dateISO))}`;
}

const ldoCache = new Map<string, Promise<string | null>>();

function looksLikeLdoDayHtml(html: string): boolean {
  return html.length > 800 && /<L(Inv|Uff|Lod|Om[369]|Ves|Com)>/i.test(html);
}

export function fetchLdoDayHtml(dateISO: string): Promise<string | null> {
  let p = ldoCache.get(dateISO);
  if (!p) {
    p = fetchLdoDayHtmlUncached(dateISO).then((html) => {
      if (!html) ldoCache.delete(dateISO);
      return html;
    });
    ldoCache.set(dateISO, p);
  }
  return p;
}

async function fetchLdoDayHtmlUncached(dateISO: string): Promise<string | null> {
  const ymd = dateISO.replace(/-/g, "");
  if (typeof document !== "undefined") {
    try {
      const res = await fetch(`/ldo-ore?data-liturgia=${ymd}`);
      if (res.ok) {
        const txt = await res.text();
        if (looksLikeLdoDayHtml(txt)) return txt;
      }
    } catch {
      /* fallback */
    }
  }
  const viaCei = await fetchCeiUrl(ldoDayUrl(dateISO));
  return viaCei && looksLikeLdoDayHtml(viaCei) ? viaCei : null;
}

export function extractLdoHourHtml(dayHtml: string, hour: OreHourId | MediaId): string {
  const tag = HOUR_TAG[hour];
  if (!tag) return "";
  const m = dayHtml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

/** Inno italiano da un frammento d'ora liturgiadelleore.it. */
export function parseLdoHymn(hourHtml: string): Hymn | null {
  if (!hourHtml) return null;
  const text = stripTags(hourHtml).replace(/\u00a0/g, " ");
  const m = text.match(
    /\bINNO\b\s*([\s\S]*?)(?=\n\s*\d+\s*ant\.|\n\s*Ant\.\s*al\b|\n\s*SALMO\b|\n\s*CANTICO\b|\n\s*LETTURA\b|\n\s*RESPONSORIO\b|$)/i,
  );
  if (!m) return null;
  const body = m[1].replace(/\r/g, "").trim();
  if (!body) return null;
  const stanzas = body
    .split(/\n\s*\n/)
    .map((st) =>
      st
        .split("\n")
        .map((l) => l.replace(/^[ \t\u00a0]+/, "").trim())
        .filter(Boolean),
    )
    .filter((st) => st.length && !/^(Oppure:?|INNO)$/i.test(st[0] || ""));
  if (!stanzas.length) return null;
  return { label: null, stanzas: normalizeHymnStanzas(stanzas) };
}

export function ldoHymnForHour(dayHtml: string, hour: OreHourId | MediaId): Hymn | null {
  return parseLdoHymn(extractLdoHourHtml(dayHtml, hour));
}
