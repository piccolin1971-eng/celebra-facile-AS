/**
 * Feedback tattile globale (opzione Impostazioni).
 * Su web non fa nulla; su native usa expo-haptics se abilitato.
 */
import { Platform } from "react-native";

let hapticEnabled = false;

export function setAppHapticEnabled(enabled: boolean) {
  hapticEnabled = !!enabled;
}

export function isAppHapticEnabled() {
  return hapticEnabled;
}

export async function triggerAppHaptic(
  kind: "selection" | "light" | "medium" = "selection",
): Promise<void> {
  if (!hapticEnabled || Platform.OS === "web") return;
  try {
    const Haptics = await import("expo-haptics");
    if (kind === "medium") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (kind === "light") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      await Haptics.selectionAsync();
    }
  } catch {
    // dispositivo senza supporto / simulatore
  }
}
