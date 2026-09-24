import React from 'react';
import { Stack } from 'expo-router';

/** Onglet « Assemblée » — Vie d'assemblée, §6.3 plan 23/09 (lot L5). */
export default function AssemblyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="form" />
      <Stack.Screen name="meeting/[id]" />
    </Stack>
  );
}
