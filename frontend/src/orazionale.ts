/**
 * Helper per accedere all'Orazionale per la Preghiera Universale (CEI 2020).
 * I dati sono bundlati nell'APK come JSON statico.
 */
import orazionaleData from "./data/orazionale.json";
import { resolveOrazionalePrayerId } from "./orazionaleFeastMap";

export type OrazionalePrayer = {
  id: string;
  title: string;
  body: string;
};

export type OrazionaleSection = {
  key: keyof typeof orazionaleData;
  label: string;
  description: string;
  prayers: OrazionalePrayer[];
};

const SECTION_LABELS: Record<string, { label: string; description: string }> = {
  proprio_tempo: {
    label: "Proprio del Tempo",
    description: "Domeniche e solennità (Avvento, Natale, Quaresima, Pasqua, Tempo Ordinario)",
  },
  quattro_tempora: {
    label: "Quattro Tempora",
    description: "Inverno, Primavera, Estate, Autunno",
  },
  santi: {
    label: "Celebrazioni dei Santi",
    description: "Solennità, feste e memorie del calendario dei santi",
  },
  varie: {
    label: "Varie Necessità",
    description: "Per l'unità dei cristiani e altre necessità",
  },
  defunti: {
    label: "Per i Defunti",
    description: "Esequie, anniversari e commemorazioni",
  },
  forma_breve: {
    label: "Forma Breve",
    description: "Preghiera universale breve per i giorni feriali",
  },
};

export function getOrazionaleSections(): OrazionaleSection[] {
  const data = orazionaleData as Record<string, OrazionalePrayer[]>;
  const order = ["proprio_tempo", "santi", "quattro_tempora", "varie", "defunti", "forma_breve"];
  return order.map((key) => ({
    key: key as keyof typeof orazionaleData,
    label: SECTION_LABELS[key].label,
    description: SECTION_LABELS[key].description,
    prayers: data[key] || [],
  }));
}

export function getAllPrayers(): OrazionalePrayer[] {
  const data = orazionaleData as Record<string, OrazionalePrayer[]>;
  return ([] as OrazionalePrayer[]).concat(
    data.proprio_tempo || [],
    data.santi || [],
    data.quattro_tempora || [],
    data.varie || [],
    data.defunti || [],
    data.forma_breve || []
  );
}

export function getPrayerById(id: string): OrazionalePrayer | undefined {
  return getAllPrayers().find((p) => p.id === id);
}

/**
 * Suggerisce automaticamente la preghiera dei fedeli più appropriata
 * in base al tempo liturgico e/o al titolo della celebrazione.
 * Restituisce l'ID della preghiera suggerita oppure undefined se non si trova
 * un abbinamento certo.
 */
export function suggestPrayerForLiturgy(liturgy: {
  title?: string;
  date?: string;
  saints?: { title: string; rank: string }[];
  season?: { season?: string };
} | null | undefined): string | undefined {
  if (!liturgy) return undefined;

  const data = orazionaleData as Record<string, OrazionalePrayer[]>;
  const proprio = data.proprio_tempo || [];

  // 1) Mappa festa → preghiera Orazionale (santi, solennità a data fissa, feste mobili)
  const fromMap = resolveOrazionalePrayerId(liturgy);
  if (fromMap && getPrayerById(fromMap)) return fromMap;

  const title = (liturgy.title || "").toLowerCase();
  const seasonName = (liturgy.season?.season || "").toLowerCase();

  // 2) Domenica numerata del tempo ordinario / quaresima / pasqua / avvento / natale
  const romanMatch = title.match(
    /\b(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx|xxi|xxii|xxiii|xxiv|xxv|xxvi|xxvii|xxviii|xxix|xxx|xxxi|xxxii|xxxiii|xxxiv)\s+domenica/i
  );
  const arabicMatch = title.match(/\b(\d{1,2})[°ª]?\s+domenica/i);
  const sundayRoman = romanMatch ? romanMatch[1].toUpperCase() : null;
  const sundayArabic = arabicMatch ? parseInt(arabicMatch[1], 10) : null;
  const arabicToRoman = (n: number): string => {
    const arr: [number, string][] = [
      [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
    ];
    let res = "";
    let v = n;
    while (v > 0) {
      for (const [num, sym] of arr) {
        if (v >= num) { res += sym; v -= num; break; }
      }
    }
    return res;
  };
  const targetRoman = sundayRoman || (sundayArabic ? arabicToRoman(sundayArabic) : null);

  if (targetRoman) {
    if (seasonName.includes("ordinario")) {
      const found = proprio.find((p) => p.title === `Tempo Ordinario ${targetRoman}`);
      if (found) return found.id;
    }
    if (seasonName.includes("avvento")) {
      // Mappatura: I-VI dei testi disponibili
      const found = proprio.find((p) => p.title === `Tempo di Avvento ${targetRoman}`);
      if (found) return found.id;
    }
    if (seasonName.includes("quaresima")) {
      const found = proprio.find((p) => p.title === `Tempo di Quaresima ${targetRoman}`);
      if (found) return found.id;
    }
    if (seasonName.includes("pasqua")) {
      // II..VI Domenica di Pasqua
      const found = proprio.find((p) => p.title.startsWith(`${targetRoman} Domenica di Pasqua`));
      if (found) return found.id;
    }
  }

  // 3) Fallback per tempo liturgico
  if (seasonName.includes("avvento")) {
    return proprio.find((p) => p.title === "Tempo di Avvento I")?.id;
  }
  if (seasonName.includes("natale")) {
    return proprio.find((p) => p.title.startsWith("Tempo di Natale"))?.id;
  }
  if (seasonName.includes("quaresima")) {
    return proprio.find((p) => p.title === "Tempo di Quaresima I")?.id;
  }
  if (seasonName.includes("pasqua")) {
    return proprio.find((p) => p.title.startsWith("Tempo di Pasqua"))?.id;
  }
  if (seasonName.includes("ordinario")) {
    return proprio.find((p) => p.title === "Tempo Ordinario I")?.id;
  }

  return undefined;
}
