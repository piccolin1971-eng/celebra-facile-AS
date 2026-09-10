import { Alert, Platform } from "react-native";

/** Conferma azione distruttiva: Alert nativo su mobile, window.confirm su web. */
export function confirmDestructive(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmLabel = "Azzera",
): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) {
      void onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Annulla", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: () => void onConfirm() },
  ]);
}
