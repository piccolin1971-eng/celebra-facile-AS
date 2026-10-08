import { decodeHtmlEntities, stripTags } from "./html";
import { normalizeTypewriterCapAccents } from "../litTextNormalize";
import {
  applyBundledGospelCanticles,
  marianAntiphonsForDate,
  splitPsalmTitle,
} from "./bundled";
import { enrichPsalmHeads } from "./psalmHeadings";
import { JOIN_CROSS_MARK, normalizeJoinCrossBlocks } from "./joinCross";
import { parseLocalDate } from "../dateUtils";
import { normalizeHymnStanzas } from "./hymns";
import type { Hymn, MediaId, OreBlock, OreHourId, ParsedHour } from "./types";
import { extractLdoHourHtml } from "./ldo";

function tidy(t: string): string {
  return normalizeTypewriterCapAccents(
    t
      .replace(/[\u200B\uFEFF\u200C\u200D]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function flattenRisaltoLabel(inner: string): string {
  return tidy(stripTags(inner).replace(/\s+/g, " "));
}

/** Converte HTML LDO in testo marcato a righe. */
function ldoToLines(hourHtml: string): string[] {
  let s = hourHtml
    .replace(/\r/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Selettore salmi invitatorio (widget, non testo).
    .replace(/<DIV\b[^>]*Id\s*=\s*CambioInvitatorio[^>]*>[\s\S]*?<\/DIV>/gi, "")
    .replace(/<\/?(?:NE|FNE)\b[^>]*>/gi, "")
    .replace(/<\/?DIV\b[^>]*>/gi, "")
    .replace(/<\/?SPAN\b[^>]*>/gi, "")
    .replace(/<\/?B\b[^>]*>/gi, "")
    // Minuscoletto dentro Risalto (I + NNO → INNO).
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Minuscoletto[^>]*>([\s\S]*?)<\/FONT>/gi, "$1")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Titolo[^>]*>[\s\S]*?<\/FONT>/gi, "")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Grado[^>]*>[\s\S]*?<\/FONT>/gi, "")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Ora[^>]*>[\s\S]*?<\/FONT>/gi, "")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*EvidenzaVersetto[^>]*>\s*&#x2123;\s*<\/FONT>\s*/gi, "{{V}}")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*EvidenzaVersetto[^>]*>\s*&#x211e;\s*<\/FONT>\s*/gi, "{{R}}")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*EvidenzaVersetto[^>]*>\s*℣\s*<\/FONT>\s*/gi, "{{V}}")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*EvidenzaVersetto[^>]*>\s*℟\s*<\/FONT>\s*/gi, "{{R}}")
    .replace(/&#x2123;/gi, "{{V}}")
    .replace(/&#x211e;/gi, "{{R}}")
    .replace(/&#x2020;|&dagger;/gi, "†")
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Risalto[^>]*>([\s\S]*?)<\/FONT>/gi, (_, inner) => {
      const lab = flattenRisaltoLabel(inner);
      return lab ? `\n{{LABEL:${lab}}}\n` : "\n";
    })
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Spiegazione[^>]*>([\s\S]*?)<\/FONT>/gi, (_, inner) => {
      const t = tidy(stripTags(inner));
      return t ? `\n{{SPIEG:${t}}}\n` : "\n";
    })
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Citazione[^>]*>([\s\S]*?)<\/FONT>/gi, (_, inner) => {
      const t = tidy(stripTags(inner));
      return t ? `\n{{CIT:${t}}}\n` : "\n";
    })
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Rubrica[^>]*>([\s\S]*?)<\/FONT>/gi, (_, inner) => {
      const t = tidy(stripTags(inner));
      return t ? `\n{{RUB:${t}}}\n` : "\n";
    })
    .replace(/<FONT\b[^>]*CLASS\s*=\s*Rosso[^>]*>([\s\S]*?)<\/FONT>/gi, (_, inner) => {
      const t = tidy(stripTags(inner));
      if (!t) return "";
      if (t === "*" || t === "†") return t;
      if (t === "-" || t === "–" || t === "—") return "—";
      if (/^Oppure\b/i.test(t)) return `\n{{OPPURE:${/:$/.test(t) ? t : `${t}:`}}}\n`;
      return t;
    })
    .replace(/<I\b[^>]*>([\s\S]*?)<\/I>/gi, (_, inner) => {
      const t = tidy(stripTags(inner));
      return t ? `\n{{ITAL:${t}}}\n` : "";
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ");

  s = decodeHtmlEntities(s).replace(/<[^>]+>/g, "");
  s = s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return s.split("\n");
}

function isLabel(line: string): string | null {
  const m = line.match(/^\{\{LABEL:(.+)\}\}$/);
  return m ? m[1].trim() : null;
}

function isMeta(line: string, kind: string): string | null {
  const m = line.match(new RegExp(`^\\{\\{${kind}:(.+)\\}\\}$`));
  return m ? m[1].trim() : null;
}

function isAntLabel(lab: string): boolean {
  return /^\d+\s*ant\.?$/i.test(lab) || /^Ant\./i.test(lab);
}

function antLabFrom(lab: string): string {
  if (/^\d+\s*ant\.?$/i.test(lab)) return "Ant.";
  if (/^Ant\.\s*al\s*Ben/i.test(lab)) return "Ant.";
  if (/^Ant\.\s*al\s*Magn/i.test(lab)) return "Ant.";
  if (/^Ant\./i.test(lab)) return "Ant.";
  return "Ant.";
}

function isPsalmLabel(lab: string): boolean {
  return /^(SALMO|CANTICO)\b/i.test(lab);
}

function isSectionTitle(lab: string): boolean {
  return /^(INNO|LETTURA|RESPONSORIO|ORAZIONE|INVOCAZIONI|INTERCESSIONI|TE DEUM|PREGHIERA|ESAME)\b/i.test(
    lab,
  );
}

function hangFromLeading(raw: string): { text: string; hang: number } {
  const spaces = (raw.match(/^[ \t]+/) || [""])[0].length;
  const text = tidy(raw);
  let hang = 0;
  if (spaces >= 6) hang = 2;
  else if (spaces >= 2) hang = 1;
  return { text, hang };
}

function pushStanza(blocks: OreBlock[], lines: { text: string; hang: number }[]) {
  const cleaned = lines.filter((l) => l.text);
  if (!cleaned.length) return;
  // Prosa senza *† e senza rientri tipici di emistichio.
  const allProse =
    cleaned.length >= 1 &&
    cleaned.every(
      (l) =>
        !/[*†]/.test(l.text) &&
        l.text !== JOIN_CROSS_MARK &&
        !l.text.includes(JOIN_CROSS_MARK) &&
        !/^(V\.|R\.|Ant\.|—)/.test(l.text) &&
        l.hang === 0,
    );
  if (allProse && cleaned.every((l) => l.text.length >= 40 || cleaned.length === 1)) {
    for (const l of cleaned) blocks.push({ k: "prose", text: l.text });
    return;
  }
  // Emistichio dopo *†: forza hang ≥ 1
  for (let i = 1; i < cleaned.length; i++) {
    if (/[*†]\s*$/.test(cleaned[i - 1].text) && cleaned[i].hang < 1) cleaned[i].hang = 1;
  }
  blocks.push({
    k: "stanza",
    lines: cleaned.map((l) => l.text),
    hang: cleaned.map((l) => l.hang),
  });
}

function flushBody(blocks: OreBlock[], buf: string[]) {
  if (!buf.length) return;
  // Spezza in strofe su riga vuota.
  let cur: { text: string; hang: number }[] = [];
  const flush = () => {
    if (cur.length) {
      pushStanza(blocks, cur);
      cur = [];
    }
  };
  for (const raw of buf) {
    if (!raw.trim()) {
      flush();
      continue;
    }
    // V./R. isolati in corpo (responsorio)
    const vr = raw.match(/^\{\{(V|R)\}\}(.*)$/);
    if (vr) {
      flush();
      const lab = `${vr[1]}.` as "V." | "R.";
      const rest = tidy(vr[2]);
      if (rest) blocks.push({ k: "rubric", lab, text: rest });
      else blocks.push({ k: "rubric", lab, text: "" });
      continue;
    }
    // Croce di congiunzione sola (dopo antifona, prima del salmo).
    if (/^[ \t]*†[ \t]*$/.test(raw) || tidy(raw) === "†") {
      flush();
      // Attacca alla precedente antifona se possibile.
      const prev = blocks[blocks.length - 1];
      if (prev?.k === "rubric" && /ant/i.test(prev.lab) && !prev.text.includes(JOIN_CROSS_MARK)) {
        prev.text = `${prev.text.replace(/\s+$/, "")}${JOIN_CROSS_MARK}`;
      } else {
        blocks.push({ k: "stanza", lines: [JOIN_CROSS_MARK] });
      }
      continue;
    }
    let line = hangFromLeading(raw.replace(/\{\{(V|R)\}\}/g, ""));
    // † finale dopo antifona già in testo: se riga è solo testo ant + †, gestito in collectAnt.
    if (line.text === "†") {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.k === "rubric" && /ant/i.test(prev.lab) && !prev.text.includes(JOIN_CROSS_MARK)) {
        prev.text = `${prev.text.replace(/\s+$/, "")}${JOIN_CROSS_MARK}`;
      }
      continue;
    }
    // * rosso già inline
    cur.push(line);
  }
  flush();
  buf.length = 0;
}

function collectUntilLabel(
  lines: string[],
  start: number,
): { textLines: string[]; next: number; trailingJoin: boolean } {
  const textLines: string[] = [];
  let i = start;
  let trailingJoin = false;
  while (i < lines.length) {
    const lab = isLabel(lines[i]);
    if (lab) break;
    if (isMeta(lines[i], "SPIEG") || isMeta(lines[i], "CIT") || isMeta(lines[i], "RUB")) break;
    if (isMeta(lines[i], "OPPURE") || isMeta(lines[i], "ITAL")) break;
    const t = lines[i];
    if (/^[ \t]*†[ \t]*$/.test(t) || tidy(t) === "†") {
      trailingJoin = true;
      i += 1;
      // salta blank dopo †
      while (i < lines.length && !lines[i].trim()) i += 1;
      break;
    }
    textLines.push(t);
    i += 1;
  }
  return { textLines, next: i, trailingJoin };
}

function antTextFromLines(textLines: string[], trailingJoin: boolean): string {
  const parts = textLines
    .map((l) => tidy(l))
    .filter(Boolean)
    .filter((l) => !/^\{\{/.test(l));
  let text = parts.join(" ").replace(/\s+/g, " ").trim();
  // † in coda al testo antifona
  if (/\s*†\s*$/.test(text)) {
    text = text.replace(/\s*†\s*$/, "").trim() + JOIN_CROSS_MARK;
  } else if (trailingJoin) {
    text = text + JOIN_CROSS_MARK;
  }
  return text;
}

function parseHymnFromLines(textLines: string[]): Hymn[] {
  const body = textLines
    .map((l) => l.replace(/\u00a0/g, " "))
    .join("\n")
    .replace(/\r/g, "")
    .trim();
  if (!body) return [];
  // Spezza su "Oppure:"
  const chunks = body.split(/\n\s*\{\{OPPURE:[^}]+\}\}\s*\n|\n\s*Oppure:?\s*\n/i);
  const hymns: Hymn[] = [];
  chunks.forEach((chunk, idx) => {
    const stanzas = chunk
      .split(/\n\s*\n/)
      .map((st) =>
        st
          .split("\n")
          .map((l) => tidy(l.replace(/^\{\{ITAL:(.+)\}\}$/, "$1")))
          .filter((l) => l && !/^\{\{/.test(l) && !/^INNO$/i.test(l)),
      )
      .filter((st) => st.length);
    if (!stanzas.length) return;
    hymns.push({
      label: idx === 0 ? null : "Oppure:",
      stanzas: normalizeHymnStanzas(stanzas),
    });
  });
  return hymns;
}

function parsePsalmHead(
  lab: string,
  lines: string[],
  start: number,
): { head: OreBlock; next: number } {
  let i = start;
  let spieg = "";
  let cit = "";
  while (i < lines.length) {
    const sp = isMeta(lines[i], "SPIEG");
    if (sp) {
      spieg = sp;
      i += 1;
      continue;
    }
    const ct = isMeta(lines[i], "CIT");
    if (ct) {
      cit = ct;
      i += 1;
      continue;
    }
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    break;
  }
  // A volte Spiegazione è già fusa nel label: "SALMO 62, 2-9" e spieg a parte.
  // Oppure label = "SALMO 62, 2-9" e name da spieg.
  let title = lab;
  let name = "";
  let sub = spieg;
  // Se subito dopo c'è testo senza *† prima di un altro label, potrebbe essere name inline già nel label.
  const { num, name: splitName } = splitPsalmTitle(spieg ? `${lab} ${spieg}` : lab);
  if (splitName && spieg && splitName === spieg) {
    title = num || lab;
    name = spieg;
    sub = "";
  } else if (splitName) {
    title = num || lab;
    name = splitName;
  } else {
    title = lab;
    name = spieg;
    sub = "";
  }
  // Citazione tipica LDO = frase tono / cite CEI.
  const cite = cit;
  // Se name era spieg e cit esiste, sub resta vuoto e cite = cit; name = spieg.
  // Preferisci: num=title, name=spieg/name, sub=cit come "sub" se sembra frase-tono corta, else cite field.
  let finalSub = "";
  let finalCite = cite;
  if (!name && spieg) {
    name = spieg;
  } else if (name && cit) {
    finalCite = cit;
  } else if (!cite && spieg && name && name !== spieg) {
    finalSub = spieg;
  }
  // Caso classico LDO: SALMO + Spiegazione (name) + Citazione (cite)
  if (spieg && !splitName) {
    name = spieg;
    finalSub = "";
    finalCite = cite;
  }
  if (spieg && splitName && splitName === spieg) {
    name = spieg;
    finalCite = cite;
  }

  const head: OreBlock = {
    k: "psalmHead",
    num: title.replace(/\s+/g, " ").trim(),
    name: (name || "").replace(/\s+/g, " ").trim(),
    sub: finalSub,
    cite: finalCite,
  };
  return { head, next: i };
}

function maybeAttachJoinToFirstVerse(_blocks: OreBlock[]) {
  // La posizione della † (dopo l’eco dell’antifona, a inizio riga) è in normalizeJoinCrossBlocks.
}

function parseInvocations(blocks: OreBlock[], bodyLines: string[]) {
  blocks.push({ k: "title", text: "INVOCAZIONI" });
  // Intro + eventuale refrain italico, poi petizioni con —
  let i = 0;
  const introParts: string[] = [];
  let refrain = "";
  while (i < bodyLines.length) {
    const ital = isMeta(bodyLines[i], "ITAL");
    if (ital) {
      refrain = ital;
      i += 1;
      break;
    }
    const lab = isLabel(bodyLines[i]);
    if (lab) break;
    const t = tidy(bodyLines[i]);
    if (!t) {
      i += 1;
      continue;
    }
    if (t.startsWith("—") || t.startsWith("-")) break;
    introParts.push(t);
    i += 1;
  }
  const intro = introParts.join(" ").replace(/\s+/g, " ").trim();
  if (intro || refrain) {
    blocks.push({ k: "tone", intro: intro || " ", refrain });
  }
  let pet: string[] = [];
  const flushPet = () => {
    const t = pet.join(" ").replace(/\s+/g, " ").trim();
    pet = [];
    if (!t || /^Padre nostro\b/i.test(t)) return;
    blocks.push({ k: "stanza", lines: [t] });
  };
  while (i < bodyLines.length) {
    const raw = bodyLines[i];
    i += 1;
    const opp = isMeta(raw, "OPPURE");
    if (opp) {
      flushPet();
      blocks.push({ k: "omit", text: opp });
      continue;
    }
    if (isLabel(raw) || isMeta(raw, "ITAL")) {
      i -= 1;
      break;
    }
    let t = tidy(raw);
    if (!t) {
      flushPet();
      continue;
    }
    if (t === "—" || t.startsWith("— ")) {
      const resp = t === "—" ? "" : t.replace(/^—\s*/, "");
      const petition = pet.join(" ").replace(/\s+/g, " ").trim();
      pet = [];
      if (petition) {
        const lines = resp ? [petition, `— ${resp}`] : [petition];
        blocks.push({ k: "stanza", lines });
      } else if (resp) {
        // risposta sulla stessa riga del trattino, petizione già flushata: ignora
      }
      continue;
    }
    // "— risposta" già unita? oppure petizione
    pet.push(t);
  }
  flushPet();
}

/**
 * Antifona invitatorio da frammento LInv (prima Ant. prima di Oppure/SALMO).
 */
export function extractLdoInvitAntiphon(hourHtml: string): string {
  if (!hourHtml) return "";
  const lines = ldoToLines(hourHtml);
  for (let i = 0; i < lines.length; i++) {
    const lab = isLabel(lines[i]);
    if (!lab || !/^Ant\./i.test(lab)) continue;
    const { textLines, trailingJoin } = collectUntilLabel(lines, i + 1);
    // stop early at Oppure inside collected — collectUntilLabel already stops at OPPURE meta
    const text = antTextFromLines(textLines, trailingJoin)
      .replace(JOIN_CROSS_MARK, "")
      .trim();
    if (text.length > 8) return text;
  }
  return "";
}

export function parseLdoHourHtml(
  hourHtml: string,
  hour: OreHourId | MediaId,
  dateISO?: string,
): ParsedHour {
  const missing: ParsedHour = {
    hour,
    blocks: [],
    error: "Testo non disponibile (né CEI né liturgiadelleore.it).",
  };
  if (!hourHtml || hourHtml.length < 80) return missing;

  const lines = ldoToLines(hourHtml);
  const blocks: OreBlock[] = [];
  let i = 0;
  let bodyBuf: string[] = [];

  const flush = () => flushBody(blocks, bodyBuf);

  while (i < lines.length) {
    const line = lines[i];
    const lab = isLabel(line);
    if (lab) {
      flush();
      i += 1;

      if (/^INNO$/i.test(lab)) {
        const { textLines, next } = collectUntilLabel(lines, i);
        i = next;
        const hymns = parseHymnFromLines(textLines);
        if (hymns.length) blocks.push({ k: "hymn", hymns });
        continue;
      }

      if (isAntLabel(lab)) {
        const { textLines, next, trailingJoin } = collectUntilLabel(lines, i);
        i = next;
        const text = antTextFromLines(textLines, trailingJoin);
        if (text) blocks.push({ k: "rubric", lab: antLabFrom(lab), text });
        continue;
      }

      if (isPsalmLabel(lab)) {
        const { head, next } = parsePsalmHead(lab, lines, i);
        i = next;
        blocks.push(head);
        // Corpo salmo fino al prossimo label
        const { textLines, next: n2, trailingJoin } = collectUntilLabel(lines, i);
        i = n2;
        if (trailingJoin) {
          // † isolato a fine corpo: di solito non capita; ignora
        }
        bodyBuf = textLines;
        flush();
        continue;
      }

      if (/^(INVOCAZIONI|INTERCESSIONI)\b/i.test(lab)) {
        const { textLines, next } = collectUntilLabel(lines, i);
        i = next;
        parseInvocations(blocks, textLines);
        continue;
      }

      if (isSectionTitle(lab)) {
        const title = lab.replace(/\s+/g, " ").trim().toUpperCase();
        // "LETTURA BREVE" + eventuale cite nello stesso label o label successivo vuoto
        if (/^LETTURA/i.test(lab)) {
          blocks.push({ k: "title", text: /^LETTURA\s+BREVE/i.test(lab) ? "LETTURA BREVE" : "LETTURA" });
          // Se il label include la cite (Ct 8, 7) — di solito label è solo LETTURA BREVE
          // e la cite è un altro Risalto subito dopo
          continue;
        }
        if (/^RESPONSORIO/i.test(lab)) {
          blocks.push({
            k: "title",
            text: /BREVE/i.test(lab) ? "RESPONSORIO BREVE" : "RESPONSORIO",
          });
          continue;
        }
        if (/^ORAZIONE|^PREGHIERA|^TE DEUM|^ESAME/i.test(lab)) {
          blocks.push({ k: "title", text: title.replace(/^ESAME.*/i, "Esame di coscienza") });
          continue;
        }
        blocks.push({ k: "title", text: title });
        continue;
      }

      // Cite biblica come Risalto isolato dopo LETTURA BREVE (es. "Ct 8, 7")
      if (/^[1-3]?\s*[A-Z][a-z]{0,12}\s+\d/.test(lab) || /^[A-Z][a-z]{1,4}\s+\d/.test(lab)) {
        blocks.push({ k: "sub", text: lab });
        continue;
      }

      // Altri label: tratta come titolo
      blocks.push({ k: "title", text: lab });
      continue;
    }

    const rub = isMeta(line, "RUB");
    if (rub) {
      flush();
      // "Alla fine di questo cantico non si dice il" + Gloria dal testo seguente
      let text = rub;
      i += 1;
      // Accumula eventuale Minuscoletto già flattenato sulla riga successiva corta
      if (i < lines.length && lines[i].trim() && !isLabel(lines[i]) && tidy(lines[i]).length < 40) {
        text = `${text} ${tidy(lines[i])}`;
        i += 1;
      }
      blocks.push({ k: "omit", text });
      continue;
    }

    const opp = isMeta(line, "OPPURE");
    if (opp) {
      flush();
      i += 1;
      // Secondo inno (Oppure) subito dopo il primo → resta nel blocco hymn.
      const last = blocks[blocks.length - 1];
      if (last?.k === "hymn") {
        const { textLines, next } = collectUntilLabel(lines, i);
        i = next;
        const extra = parseHymnFromLines(textLines);
        for (const h of extra) {
          last.hymns.push({ label: h.label || "Oppure:", stanzas: h.stanzas });
        }
        continue;
      }
      blocks.push({ k: "omit", text: opp });
      continue;
    }

    const ital = isMeta(line, "ITAL");
    if (ital) {
      flush();
      // refrain fuori invocazioni: prosa corsiva → prose
      blocks.push({ k: "prose", text: ital });
      i += 1;
      continue;
    }

    // Intro V./R. all'inizio ora
    const vrOnly = line.match(/^\{\{(V|R)\}\}(.*)$/);
    if (vrOnly) {
      flush();
      blocks.push({ k: "rubric", lab: `${vrOnly[1]}.`, text: tidy(vrOnly[2]) });
      i += 1;
      continue;
    }

    // Skip meta spieg/cit orfani (già consumati da psalm head)
    if (isMeta(line, "SPIEG") || isMeta(line, "CIT")) {
      i += 1;
      continue;
    }

    bodyBuf.push(line);
    i += 1;
  }
  flush();

  // Compieta: antifone mariane bundled se manca blocco marian
  if (hour === "compieta" && dateISO && !blocks.some((b) => b.k === "marian")) {
    const ants = marianAntiphonsForDate(parseLocalDate(dateISO));
    if (ants.length) blocks.push({ k: "marian", antiphons: ants });
  }

  maybeAttachJoinToFirstVerse(blocks);

  const clean = normalizeJoinCrossBlocks(
    enrichPsalmHeads(
      applyBundledGospelCanticles(
        blocks.filter((b) => {
          if (b.k === "stanza") return b.lines.some((l) => l && l !== JOIN_CROSS_MARK);
          if (b.k === "prose") return b.text.length > 0;
          if (b.k === "rubric") return !!(b.lab || b.text);
          if (b.k === "title") return b.text.length > 0;
          return true;
        }),
      ),
    ),
  );

  // precipitato: gloria d'inizio senza * (intro) — ok come stanza
  if (!clean.length) return missing;
  return { hour, blocks: clean };
}

/** Patch ore da HTML giorno LDO (solo ore ancora vuote). */
export function ldoFallbackPatch(
  dayHtml: string,
  hour: OreHourId,
  dateISO: string,
  existing: Partial<Record<OreHourId | MediaId, ParsedHour>> & {
    invitAnt?: string;
    invitFetched?: boolean;
  },
): Partial<Record<OreHourId | MediaId, ParsedHour>> & {
  invitAnt?: string;
  invitFetched?: boolean;
} {
  const out: Partial<Record<OreHourId | MediaId, ParsedHour>> & {
    invitAnt?: string;
    invitFetched?: boolean;
  } = {};

  if (hour === "invitatorio") {
    if (!existing.invitFetched) {
      const ant = extractLdoInvitAntiphon(extractLdoHourHtml(dayHtml, "invitatorio"));
      if (ant) {
        out.invitAnt = ant;
        out.invitFetched = true;
      }
    }
    return out;
  }

  if (hour === "ora-media") {
    for (const id of ["terza", "sesta", "nona"] as MediaId[]) {
      if (existing[id]?.blocks?.length) continue;
      const parsed = parseLdoHourHtml(extractLdoHourHtml(dayHtml, id), id, dateISO);
      if (parsed.blocks.length) out[id] = parsed;
    }
    return out;
  }

  const cur = existing[hour];
  if (cur?.blocks?.length) return out;
  const parsed = parseLdoHourHtml(extractLdoHourHtml(dayHtml, hour), hour, dateISO);
  if (parsed.blocks.length) out[hour] = parsed;
  return out;
}
