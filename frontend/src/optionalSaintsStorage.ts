import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "messale_optional_saints_v1";

export type OptionalSaintsStorage = {
  /** MM-DD → saint id (un solo santo per giorno del calendario). */
  selectedByMonthDay: Record<string, string>;
};

const EMPTY: OptionalSaintsStorage = { selectedByMonthDay: {} };

export async function loadOptionalSaintsSelection(): Promise<OptionalSaintsStorage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<OptionalSaintsStorage>;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY };
    const map = parsed.selectedByMonthDay;
    if (!map || typeof map !== "object") return { ...EMPTY };
    const selectedByMonthDay: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (/^\d{2}-\d{2}$/.test(k) && typeof v === "string" && v.trim()) {
        selectedByMonthDay[k] = v.trim();
      }
    }
    return { selectedByMonthDay };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveOptionalSaintsSelection(data: OptionalSaintsStorage): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
