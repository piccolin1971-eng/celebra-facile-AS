import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { SettingsProvider } from "../src/SettingsContext";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { AtkinsonHyperlegible_400Regular } from "@expo-google-fonts/atkinson-hyperlegible";
import { Lora_400Regular } from "@expo-google-fonts/lora";
import { VarelaRound_400Regular } from "@expo-google-fonts/varela-round";
import { PatrickHand_400Regular } from "@expo-google-fonts/patrick-hand";

export default function RootLayout() {
  // Carica i 4 font selezionabili dall'utente in Impostazioni → Carattere.
  // useFonts (expo-font) gestisce caching e retry. La prima apertura dell'app
  // mostra brevemente lo spinner; alle successive i font sono già in cache.
  const [loaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    Lora_400Regular,
    VarelaRound_400Regular,
    PatrickHand_400Regular,
  });

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#4DA8DA" />
      </View>
    );
  }

  return (
    <SettingsProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="messa" />
        <Stack.Screen name="celebra" />
        <Stack.Screen name="calendario" />
        <Stack.Screen name="impostazioni" />
      </Stack>
    </SettingsProvider>
  );
}
