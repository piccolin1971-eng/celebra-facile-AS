import AsyncStorage from "@react-native-async-storage/async-storage";

export type OptionalSaintLinePick = "calendar" | "optional";

const PREFIX = "@optional_saint_line_";

export async function loadOptionalSaintLinePick(
  dateISO: string,
): Promise<OptionalSaintLinePick | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}${dateISO}`);
    if (raw === "calendar" || raw === "optional") return raw;
    return null;
  } catch {
    return null;
  }
}

export async function saveOptionalSaintLinePick(
  dateISO: string,
  pick: OptionalSaintLinePick,
): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${dateISO}`, pick);
}
