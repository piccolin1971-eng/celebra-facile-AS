import React from "react";
import { Stack } from "expo-router";
import { SettingsProvider } from "../src/SettingsContext";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <SettingsProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="messa" />
        <Stack.Screen name="calendario" />
        <Stack.Screen name="impostazioni" />
      </Stack>
    </SettingsProvider>
  );
}
