import type { CelebrationMode } from "./massSession";
import type { VigilEveContext } from "./vigilCatalog";
import { bannerCeiTitleWithRank } from "./homeBannerUtils";



/** Messa del giorno sempre prima, vespertina / solennità sempre dopo. */
const VIGIL_PANEL_MODE_ORDER: CelebrationMode[] = [
  "calendar_day",
  "vigil_proper",
  "solemnity_day",
];

/** Modalità disponibili nella vigilia vespertina (sempre 2 opzioni). */
export function availableCelebrationModes(vigilCtx: VigilEveContext): CelebrationMode[] {
  const modes: CelebrationMode[] = ["calendar_day"];
  if (vigilCtx.hasVigilProper) modes.push("vigil_proper");
  else modes.push("solemnity_day");
  return modes.sort(
    (a, b) => VIGIL_PANEL_MODE_ORDER.indexOf(a) - VIGIL_PANEL_MODE_ORDER.indexOf(b),
  );
}



export function coerceCelebrationMode(

  mode: CelebrationMode,

  vigilCtx: VigilEveContext | null,

): CelebrationMode {

  if (!vigilCtx) return "calendar_day";

  const available = availableCelebrationModes(vigilCtx);

  return available.includes(mode) ? mode : "calendar_day";

}



/** Etichetta breve del tipo di messa (es. «Messa del giorno»). */

export function celebrationKindLabel(

  mode: CelebrationMode,

  vigilCtx: VigilEveContext | null,

): string {

  switch (mode) {

    case "calendar_day":

      return "Messa del giorno";

    case "vigil_proper":

      return "Messa vespertina nella vigilia";

    case "solemnity_day":

      return "Messa vespertina della solennità";

    default:

      return "Messa del giorno";

  }

}



/** Sottotitolo per card home e pulsante Celebra. */

export function celebrationShortLabel(

  mode: CelebrationMode,

  vigilCtx: VigilEveContext | null,

  liturgyTitle?: string,

): string {

  if (mode === "calendar_day" && liturgyTitle?.trim()) {

    return liturgyTitle.trim();

  }

  if (vigilCtx && (mode === "vigil_proper" || mode === "solemnity_day")) {

    return vigilCtx.solemnityTitle;

  }

  return liturgyTitle?.trim() || celebrationKindLabel(mode, vigilCtx);

}



/** Descrizione estesa sotto ogni opzione nel pannello Messa. */

export function celebrationOptionDescription(

  mode: CelebrationMode,

  vigilCtx: VigilEveContext,

  calendarTitle: string,

): string {

  const cal = calendarTitle.trim() || "Liturgia del giorno di calendario";

  switch (mode) {

    case "calendar_day":

      return `${cal} — per celebrazione al mattino o prima dei vespri`;

    case "vigil_proper":

      return `${vigilCtx.solemnityTitle} — testi propri della vigilia`;

    case "solemnity_day":

      return `${vigilCtx.solemnityTitle} — Messa della solennità che inizia nei Primi Vespri`;

    default:

      return cal;

  }

}



/** Titolo da salvare in sessione per la modalità scelta. */

export function liturgyTitleForMode(

  mode: CelebrationMode,

  calendarTitle: string,

  vigilCtx: VigilEveContext | null,

): string {

  if (mode === "calendar_day") return calendarTitle.trim();

  if (vigilCtx) return bannerCeiTitleWithRank(vigilCtx.solemnityTitle, mode, vigilCtx);

  return calendarTitle.trim();

}


