import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { SettingsProvider } from "../src/SettingsContext";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from "@expo-google-fonts/atkinson-hyperlegible";
import { Lora_400Regular, Lora_700Bold } from "@expo-google-fonts/lora";
import {
  PlaypenSans_400Regular,
  PlaypenSans_700Bold,
} from "@expo-google-fonts/playpen-sans";
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_400Regular_Italic,
} from "@expo-google-fonts/libre-baskerville";

export default function RootLayout() {
  // Carica i font selezionabili in Impostazioni → Carattere (Regular + Bold).
  // I file sono nel bundle APK (expo-font + @expo-google-fonts): funzionano offline.
  const [loaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
    Lora_400Regular,
    Lora_700Bold,
    PlaypenSans_400Regular,
    PlaypenSans_700Bold,
    LibreBaskerville_400Regular,
    LibreBaskerville_400Regular_Italic,
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
        <Stack.Screen name="celebra-indice" />
        <Stack.Screen name="calendario" />
        <Stack.Screen name="anteprima" />
        <Stack.Screen name="impostazioni" />
        <Stack.Screen name="ore" />
        <Stack.Screen name="ore-leggi" />
      </Stack>
    </SettingsProvider>
  );
}
