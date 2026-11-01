import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CeiMassFormula } from "./liturgyScraper";

const KEY = "@cei_mass_formula_v1";

export function parseCeiMassFormula(raw: unknown): CeiMassFormula {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

async function readAll(): Promise<Record<string, CeiMassFormula>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, CeiMassFormula> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = parseCeiMassFormula(v);
    }
    return out;
  } catch {
    return {};
  }
}

export async function getPreferredCeiMassFormula(dateISO: string): Promise<CeiMassFormula> {
  const all = await readAll();
  return all[dateISO] ?? 1;
}

export async function setPreferredCeiMassFormula(
  dateISO: string,
  formula: CeiMassFormula,
): Promise<void> {
  const all = await readAll();
  if (formula === 1) {
    delete all[dateISO];
  } else {
    all[dateISO] = formula;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}
