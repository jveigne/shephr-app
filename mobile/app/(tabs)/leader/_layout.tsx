import React from 'react';
import { Stack } from 'expo-router';

export default function LeaderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="unit/[unitId]" />
      {/* Lot T8 — file « À vérifier » du trésorier et fiche de validation. */}
      <Stack.Screen name="verify" />
      <Stack.Screen name="declaration/[id]" />
    </Stack>
  );
}
