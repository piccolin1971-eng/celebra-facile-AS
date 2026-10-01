/**
 * Impaginazione Messa (+ Ore in 1ª passata).
 * Uso: npx tsx --require ./scripts/_rn-mock.cjs scripts/audit-impaginazione.ts [YYYY-MM-DD] [giorni] [passate]
 */
import { writeFileSync } from "node:fs";
import { buildSegments, preSplitSegments, type Segment } from "../src/liturgy/celebraSegments";
import { buildDefaultMassSession } from "../src/defaultMassSession";
import { getMassToggleDefaults } from "../src/massToggleDefaults";
import { localDateStr, parseLocalDate, todayStr } from "../src/dateUtils";
import { getLiturgicalSeasonKey } from "../src/prefaceUtils";
import {
  getEucharisticPrayers,
  getFixedParts,
  getFullLiturgyByDateStr,
  getMysteryAcclamations,
  getPrefaces,
  getSolemnBlessings,
} from "../src/localLiturgy";
import { fetchCeiUrl } from "../src/liturgyScraper";
import { parseHourHtml } from "../src/ore/parseHour";
import { ceiHourSlug } from "../src/ore/titles";
import type { OreBlock, OreHourId } from "../src/ore/types";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const START = process.argv[2] || todayStr();
const DAYS = Math.max(1, Number(process.argv[3] || 20));
const PASSES = Math.max(1, Number(process.argv[4] || 2));
const END = (() => {
  const d = parseLocalDate(START);
  d.setDate(d.getDate() + DAYS - 1);
  return localDateStr(d);
})();

type Issue = { date: string; code: string; detail?: string };

function isoAdd(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function dates(): string[] {
  const out: string[] = [];
  let iso = START;
  for (let i = 0; i < DAYS; i++) {
    out.push(iso);
    iso = isoAdd(iso, 1);
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasTitle(segs: Segment[], re: RegExp): boolean {
  return segs.some(
    (s) =>
      (s.kind === "sectionTitle" || s.kind === "sectionTitleBreak" || s.kind === "readingTitle") &&
      re.test(s.text || ""),
  );
}

function sectionSlice(segs: Segment[], startRe: RegExp, endRe: RegExp): Segment[] {
  const start = segs.findIndex(
    (s) =>
      (s.kind === "sectionTitle" || s.kind === "sectionTitleBreak" || s.kind === "readingTitle") &&
      startRe.test(s.text || ""),
  );
  if (start < 0) return [];
  const rest = segs.slice(start + 1);
  const end = rest.findIndex(
    (s) =>
      (s.kind === "sectionTitle" || s.kind === "sectionTitleBreak" || s.kind === "readingTitle") &&
      endRe.test(s.text || ""),
  );
  return rest.slice(0, end < 0 ? rest.length : end);
}

function isSigla(line: string): boolean {
  return /^(?:[1-3]\s*)?[A-ZÈÉ][a-zèéì]{0,6}\.?\s*\d+[,.:]/.test(line.trim());
}

function checkMass(iso: string, segs: Segment[], toggles: { showGloria: boolean; showCredo: boolean; showOrazionalePray: boolean }, prayerId: string | undefined, liturgyReadings?: Array<{ type?: string; text?: string }>): Issue[] {
  const issues: Issue[] = [];
  const push = (code: string, detail?: string) => issues.push({ date: iso, code, detail });

  if (!segs.length) {
    push("MESSA_VUOTA");
    return issues;
  }

  const gloria = hasTitle(segs, /^Gloria$/);
  const credo = hasTitle(segs, /Professione di Fede/);
  const fedeli = hasTitle(segs, /Preghiera dei Fedeli/);
  if (toggles.showGloria !== gloria) push(gloria ? "GLORIA_INDEBITA" : "GLORIA_ASSENTE");
  if (toggles.showCredo !== credo) push(credo ? "CREDO_INDEBITO" : "CREDO_ASSENTE");
  if (toggles.showOrazionalePray !== fedeli) push(fedeli ? "FEDELI_INDEBITI" : "FEDELI_ASSENTI");
  if (toggles.showOrazionalePray && !prayerId) push("FEDELI_SENZA_TESTO");

  const hasIng = !!liturgyReadings?.find((r) => r.type === "antifona_ingresso" && (r.text || "").trim());
  const hasCom = !!liturgyReadings?.find((r) => r.type === "antifona_comunione" && (r.text || "").trim());
  const antIng = segs.some((s) => s.kind === "antifonaTitle" && /ingresso/i.test(s.text || ""));
  const antCom = segs.some((s) => s.kind === "antifonaTitle" && /comunione/i.test(s.text || ""));
  const antBody = segs.filter((s) => s.kind === "antifona");
  if (hasIng && !antIng) push("ANTIFONA_INGRESSO_ASSENTE");
  if (hasCom && !antCom) push("ANTIFONA_COMUNIONE_ASSENTE");
  if ((antIng || antCom) && antBody.length === 0) push("ANTIFONA_SENZA_CORPO");

  // Spazio tra Padre nostro ed embolismo
  const pnIdx = segs.findIndex(
    (s) => (s.kind === "sectionTitle" || s.kind === "sectionTitleBreak") && /Padre Nostro/i.test(s.text || ""),
  );
  if (pnIdx >= 0) {
    const paterIdx = segs.findIndex(
      (s, i) => i > pnIdx && s.kind === "normal" && /^Padre nostro/i.test(s.text || ""),
    );
    const embIdx = segs.findIndex(
      (s, i) => i > pnIdx && (s.kind === "celebrante" || s.kind === "normal") && /^Liberaci/i.test(s.text || ""),
    );
    if (paterIdx >= 0 && embIdx > paterIdx) {
      const between = segs.slice(paterIdx + 1, embIdx);
      if (!between.some((s) => s.kind === "spacer")) push("PADRE_NOSTRO_SENZA_SPAZIO");
    }
  }

  if (gloria) {
    const body = sectionSlice(segs, /^Gloria$/, /Colletta|Liturgia della Parola/);
    const blob = body.map((s) => s.text).join("\n");
    if (!/Gloria a Dio/i.test(blob)) push("GLORIA_SENZA_TESTO");
  }
  if (credo) {
    const body = sectionSlice(segs, /Professione di Fede/, /Preghiera dei Fedeli|Presentazione/);
    if (!/Credo in/i.test(body.map((s) => s.text).join("\n"))) push("CREDO_SENZA_TESTO");
  }

  for (const title of ["Riti di Introduzione", "Atto Penitenziale", "Colletta", "Liturgia della Parola", "Presentazione dei Doni", "Sulle offerte", "Prefazio", "Preghiera Eucaristica", "Padre Nostro", "Comunione", "Dopo la Comunione", "Riti di Conclusione"]) {
    if (!hasTitle(segs, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))) push("MANCA_SEZIONE", title);
  }

  const colletta = sectionSlice(segs, /^Colletta$/, /Liturgia della Parola/);
  if (colletta.filter((s) => s.kind !== "spacer" && s.text.trim()).length === 0) push("COLLETTA_VUOTA");

  const dopo = sectionSlice(segs, /Dopo la Comunione/, /Riti di Conclusione/);
  if (dopo.filter((s) => /normal|celebrante|assemblea/.test(s.kind) && s.text.trim()).length === 0) push("DOPO_COMUNIONE_VUOTO");

  const pref = sectionSlice(segs, /^Prefazio$/, /Preghiera Eucaristica/);
  if (!pref.some((s) => s.kind === "celebrante" || s.kind === "assemblea" || s.kind === "normal")) push("PREFAZIO_VUOTO");

  const pe = sectionSlice(segs, /Preghiera Eucaristica/, /Padre Nostro/);
  const peText = pe.filter((s) => s.kind === "peText" || s.kind === "normal" || s.kind === "celebrante").map((s) => s.text).join("\n");
  if (peText.length < 80) push("PE_CORTA", String(peText.length));

  let buf: Segment[] = [];
  const flushPage = () => {
    const meaningful = buf.filter((s) => s.kind !== "spacer" && s.kind !== "kindleBreak" && (s.text || "").trim());
    if (
      meaningful.length > 0 &&
      meaningful.every((s) => s.kind === "sectionTitle" || s.kind === "sectionTitleBreak" || s.kind === "readingTitle" || s.kind === "peTitle")
    ) {
      push("PAGINA_SOLO_TITOLO", meaningful.map((s) => s.text).join(" / "));
    }
    buf = [];
  };
  for (const s of segs) {
    if (s.kind === "sectionTitleBreak" && buf.length) {
      flushPage();
      buf = [s];
    } else buf.push(s);
  }
  flushPage();

  let run = 0;
  let runSample = "";
  const flushRun = () => {
    if (run >= 4) push("FEDELI_SPEZZATE", `${run} righe: ${runSample}`);
    run = 0;
    runSample = "";
  };
  for (const s of segs) {
    if (s.kind === "preghieraFedeli" && !(s.text || "").includes("\n")) {
      run += 1;
      if (!runSample) runSample = (s.text || "").slice(0, 60);
    } else flushRun();
    if (s.kind === "preghieraFedeli" && /Preghiamo[\s\S]{0,30}R\/?\.[\s\S]*\n\s*Per /i.test(s.text || "")) {
      push("FEDELI_ATTACCATE", (s.text || "").slice(0, 80));
    }
  }
  flushRun();

  if (fedeli) {
    const blocks = segs.filter((s) => s.kind === "preghieraFedeli");
    if (blocks.length < 2) push("FEDELI_POCHE", String(blocks.length));
    const withR = blocks.filter((s) => /R\/?\.|R\./.test(s.text || "")).length;
    if (withR < 2) push("FEDELI_SENZA_R", String(withR));
  }

  const readingNames = ["Prima Lettura", "Seconda Lettura", "Vangelo"];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.kind !== "readingTitle" || !readingNames.includes(s.text)) continue;
    const chunk: Segment[] = [];
    for (let j = i + 1; j < segs.length; j++) {
      const n = segs[j];
      if (n.kind === "readingTitle" || n.kind === "sectionTitle" || n.kind === "sectionTitleBreak") break;
      chunk.push(n);
    }
    const sub = chunk.find((c) => c.kind === "readingSubtitle");
    const ref = chunk.find((c) => c.kind === "readingRef" && c.text !== "Forma breve");
    if (!sub) push("SENZA_SOTTOTITOLO", s.text);
    if (!ref) push("SENZA_CITAZIONE", s.text);
    else if (!/\([^)]+\d/.test(ref.text)) push("CITAZIONE_SENZA_SIGLA", `${s.text}: ${ref.text}`);
    const firstNormal = chunk.find((c) => c.kind === "normal");
    if (firstNormal && isSigla(firstNormal.text)) push("SIGLA_NEL_TESTO", `${s.text}: ${firstNormal.text}`);
    const forma = chunk.findIndex((c) => c.kind === "readingRef" && c.text === "Forma breve");
    if (forma >= 0) {
      const after = chunk.slice(forma + 1);
      if (!after.some((c) => c.kind === "readingSubtitle")) push("FORMA_BREVE_SENZA_SOTTOTITOLO", s.text);
      const cite = after.find((c) => c.kind === "readingRef");
      if (!cite || !/\([^)]+\d/.test(cite.text)) push("FORMA_BREVE_CITAZIONE", s.text + (cite ? `: ${cite.text}` : ""));
    }
    const normals = chunk.filter((c) => c.kind === "normal").map((c) => c.text.trim());
    for (let k = 1; k < normals.length; k++) {
      const prev = normals[k - 1];
      const line = normals[k];
      if (prev.length >= 60 && !/[.!?…:;»"”']$/.test(prev) && /^[a-zàèéìòù]/.test(line) && line.length < 40) {
        push("ACAPO_COLONNA", `${s.text}: …${prev.slice(-30)} / ${line}`);
      }
    }
  }

  const salmo = segs.filter((s) => s.kind === "salmo");
  const opening = salmo.find((s) => s.salmoPart === "opening");
  if (!opening) push("SALMO_SENZA_RITORNELLO");
  else if (/^R\./i.test(opening.text) && !/[.!?…»"”']$/.test(opening.text) && !opening.text.includes("\n")) {
    push("RITORNELLO_MONCO", opening.text.slice(0, 80));
  }

  return issues;
}

function hourIssues(iso: string, hour: string, blocks: OreBlock[]): Issue[] {
  const issues: Issue[] = [];
  const push = (code: string, detail?: string) => issues.push({ date: iso, code: `${hour}:${code}`, detail });
  if (!blocks.length) return issues;
  if (hour === "lodi" || hour === "vespri") {
    let inResp = false;
    for (const b of blocks) {
      if (b.k === "title") {
        inResp = /responsorio/i.test(b.text);
        continue;
      }
      if (!inResp || b.k !== "stanza") continue;
      for (let i = 0; i < b.lines.length; i++) {
        if (/^R\..+\*\s*$/.test(b.lines[i].trim())) push("RESPONSORIO_SPEZZATO", b.lines[i].slice(0, 80));
      }
    }
  }
  return issues;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = await Promise.all(items.slice(i, i + limit).map(fn));
    out.push(...chunk);
    if (i + limit < items.length) await sleep(120);
  }
  return out;
}

const fixed = getFixedParts().parts;
const prefaces = getPrefaces().prefaces;
const prayers = getEucharisticPrayers().prayers;
const acclamations = getMysteryAcclamations().acclamations;
const blessings = getSolemnBlessings();

async function onePass(pass: number, withHours: boolean) {
  const list = dates();
  const dayIssues = await mapPool(list, 4, async (iso) => {
    const issues: Issue[] = [];
    try {
      const liturgy = await getFullLiturgyByDateStr(iso, "calendar_day");
      const toggles = getMassToggleDefaults(liturgy);
      const session = buildDefaultMassSession({
        liturgy,
        mode: "calendar_day",
        prefaces: prefaces as any,
        solemnBlessings: blessings.blessings as any,
        vigilEve: null,
      });
      const raw = buildSegments({
        liturgy,
        fixedParts: fixed,
        prefaces: prefaces as any,
        prayers: prayers as any,
        acclamations: acclamations as any,
        solemnBlessings: blessings.blessings as any,
        prayersOverPeople: blessings.prayersOverPeople,
        pasquaDismissal: blessings.pasqua_dismissal,
        currentSeasonKey: getLiturgicalSeasonKey(liturgy.season?.season || ""),
        session,
      });
      const segs = preSplitSegments(raw);
      issues.push(...checkMass(iso, segs, toggles, session.selectedOrazionaleId, liturgy.readings as any));
      if (!liturgy.readings?.length) issues.push({ date: iso, code: "SENZA_LETTURE", detail: liturgy.error || liturgy.title });
    } catch (e) {
      issues.push({ date: iso, code: "ERRORE", detail: String(e).slice(0, 160) });
    }
    if (withHours) {
      for (const hour of ["ufficio", "lodi", "vespri"] as OreHourId[]) {
        const slug = ceiHourSlug(hour, parseLocalDate(iso));
        const html = await fetchCeiUrl(
          `https://www.chiesacattolica.it/la-liturgia-delle-ore/?data-liturgia=${iso.replace(/-/g, "")}&ora=${encodeURIComponent(slug)}`,
        );
        if (!html || /nessun contenuto trovato/i.test(html)) {
          issues.push({ date: iso, code: `${hour}:NON_DISPONIBILE` });
          continue;
        }
        const parsed = parseHourHtml(html, hour, iso);
        if (parsed.error || !parsed.blocks?.length) issues.push({ date: iso, code: `${hour}:VUOTO` });
        else issues.push(...hourIssues(iso, hour, parsed.blocks));
      }
    }
    return issues;
  });
  const flat = dayIssues.flat();
  console.log(`pass ${pass}: ${flat.length} segnalazioni`);
  return flat;
}

function fingerprint(issues: Issue[]): string {
  return issues
    .map((i) => `${i.date}|${i.code}|${i.detail || ""}`)
    .sort()
    .join("\n");
}

async function main() {
  const passes: Issue[][] = [];
  for (let p = 1; p <= PASSES; p++) {
    passes.push(await onePass(p, p === 1));
  }
  const massOnly = (list: Issue[]) => list.filter((i) => !/^(ufficio|lodi|vespri):/.test(i.code));
  const fp = passes.map((p) => fingerprint(massOnly(p)));
  const stable = fp.every((f) => f === fp[0]);
  const byCode: Record<string, number> = {};
  for (const i of passes[0]) byCode[i.code] = (byCode[i.code] || 0) + 1;
  const summary = {
    from: START,
    to: END,
    days: dates().length,
    passes: PASSES,
    massStableAcrossPasses: stable,
    passCounts: passes.map((p) => p.length),
    massCounts: passes.map((p) => massOnly(p).length),
    byCode,
    issues: passes[0],
  };
  writeFileSync("scripts/_impaginazione-audit.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ days: summary.days, massStableAcrossPasses: stable, passCounts: summary.passCounts, massCounts: summary.massCounts, byCode }, null, 2));
  const interesting = passes[0].filter((i) => !/:NON_DISPONIBILE$/.test(i.code));
  for (const i of interesting) console.log(`${i.date}\t${i.code}\t${i.detail || ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
