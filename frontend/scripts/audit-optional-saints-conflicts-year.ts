/**
 * Per ogni santo del catalogo: giorni 2026 in cui serve scelta Calendario/Santo.
 */
import catalog from "../src/data/optionalSaintsCatalog.json";
import { resolveOptionalSaintHome } from "../src/optionalSaintHome";
import { calendarCelebrationBannerTitle } from "../src/homeBannerUtils";
import { parseLocalDate, localDateStr } from "../src/dateUtils";
import { getVigilEveContext } from "../src/vigilCatalog";

const YEAR = 2026;
const SAINTS = (catalog as { saints: { id: string; date: string; title: string }[] }).saints;

function daysForSaint(saintId: string): string[] {
  const selected: Record<string, string> = {};
  for (const s of SAINTS) {
    if (s.id === saintId) selected[s.date] = s.id;
  }
  const out: string[] = [];
  const start = parseLocalDate(`${YEAR}-01-01`);
  const end = parseLocalDate(`${YEAR}-12-31`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    if (getVigilEveContext(d)) continue;
    const iso = localDateStr(d);
    const res = resolveOptionalSaintHome({
      useSelection: true,
      selectedByMonthDay: selected,
      date: d,
      dateISO: iso,
      calendarCeiTitle: calendarCelebrationBannerTitle(d),
      savedLinePick: null,
    });
    if (res.showLineChoice) out.push(iso);
  }
  return out;
}

for (const s of SAINTS) {
  const days = daysForSaint(s.id);
  const own = `${YEAR}-${s.date}`;
  const extra = days.filter((d) => d !== own);
  const mark = days.length ? `choice×${days.length}` : "auto-optional";
  console.log(s.id.padEnd(24), mark, extra.length ? `+alt:${extra.join(",")}` : "");
}
