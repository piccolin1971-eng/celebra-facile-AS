import type { CelebrationMode } from "./massSession";
import {
  availableEveningCelebrationModes,
  coerceEveningCelebrationMode,
  eveningFestiveTitle,
  isSundayEveMassContext,
  type MassEveningChoiceContext,
} from "./massEveningContext";
import { bannerCeiTitleWithRank } from "./homeBannerUtils";
import { parseLocalDate } from "./dateUtils";

export {
  availableEveningCelebrationModes as availableCelebrationModes,
  coerceEveningCelebrationMode as coerceCelebrationMode,
};

/** Etichetta breve del tipo di messa (es. «Messa del giorno»). */
export function celebrationKindLabel(
  mode: CelebrationMode,
  eveningCtx: MassEveningChoiceContext | null,
): string {
  switch (mode) {
    case "calendar_day":
      return "Messa del giorno";
    case "vigil_proper":
      return "Messa vespertina nella vigilia";
    case "solemnity_day":
      return "Messa vespertina della solennità";
    case "sunday_day":
      return "Messa vespertina della domenica";
    default:
      return "Messa del giorno";
  }
}

/** Sottotitolo per card home e pulsante Celebra. */
export function celebrationShortLabel(
  mode: CelebrationMode,
  eveningCtx: MassEveningChoiceContext | null,
  liturgyTitle?: string,
): string {
  if (mode === "calendar_day" && liturgyTitle?.trim()) {
    return liturgyTitle.trim();
  }
  if (
    eveningCtx &&
    (mode === "vigil_proper" || mode === "solemnity_day" || mode === "sunday_day")
  ) {
    return eveningFestiveTitle(eveningCtx);
  }
  return liturgyTitle?.trim() || celebrationKindLabel(mode, eveningCtx);
}

/** Descrizione estesa sotto ogni opzione nel pannello Messa. */
export function celebrationOptionDescription(
  mode: CelebrationMode,
  eveningCtx: MassEveningChoiceContext,
  calendarTitle: string,
): string {
  const cal = calendarTitle.trim() || "Liturgia del giorno di calendario";
  const festive = eveningFestiveTitle(eveningCtx);

  switch (mode) {
    case "calendar_day":
      return `${cal} — per celebrazione al mattino o prima dei vespri`;
    case "vigil_proper":
      return `${festive} — testi propri della vigilia`;
    case "solemnity_day":
      return `${festive} — Messa della solennità che inizia nei Primi Vespri`;
    case "sunday_day":
      return `${festive} — Messa della domenica che inizia nei Primi Vespri`;
    default:
      return cal;
  }
}

/** Titolo da salvare in sessione per la modalità scelta. */
export function liturgyTitleForMode(
  mode: CelebrationMode,
  calendarTitle: string,
  eveningCtx: MassEveningChoiceContext | null,
): string {
  if (mode === "calendar_day") return calendarTitle.trim();
  if (eveningCtx) {
    if (mode === "sunday_day") return eveningFestiveTitle(eveningCtx);
    return bannerCeiTitleWithRank(eveningFestiveTitle(eveningCtx), mode, eveningCtx);
  }
  return calendarTitle.trim();
}

/** Messaggio informativo in home (sabato / vigilia). */
export function eveningChoiceBannerMessage(ctx: MassEveningChoiceContext): string {
  if (isSundayEveMassContext(ctx)) {
    return `La sera del sabato, dopo i Primi Vespri, inizia ${ctx.sundayTitle}. Puoi preparare la Messa del sabato o della domenica.`;
  }
  if (ctx.hasVigilProper) {
    return `La sera del ${formatShortIt(ctx.vigilDateISO)} puoi celebrare la Messa vespertina nella vigilia di ${ctx.solemnityTitle}. Scegli la liturgia in «Scegli la liturgia».`;
  }
  return `La sera del ${formatShortIt(ctx.vigilDateISO)}, dopo i Primi Vespri, inizia ${ctx.solemnityTitle}. Puoi preparare la Messa del giorno o della solennità.`;
}

function formatShortIt(iso: string): string {
  const d = parseLocalDate(iso);
  const months = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
