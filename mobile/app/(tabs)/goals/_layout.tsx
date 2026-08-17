import React from 'react';
import { Stack } from 'expo-router';

export default function GoalsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* RG-BQ-11 — « Mes objectifs » : l'écran de tout compte rattaché, dirigeants inclus. */}
      <Stack.Screen name="member" />
      {/* RG-BQ-04 — vues de LECTURE du dirigeant (agrégats de périmètre / ministère). */}
      <Stack.Screen name="perimeter" />
      {/* Drill-down du dirigeant, en lecture seule depuis le 16/08. */}
      <Stack.Screen name="units" />
      {/* RG-BQ-13 — changer d'assemblée soi-même. */}
      <Stack.Screen name="assembly" />
      <Stack.Screen name="pledge/[categoryId]" />
      {/* RG-BQ-06 — soumission INDIVIDUELLE : chacun verrouille ses propres engagements. */}
      <Stack.Screen name="submit" />
      <Stack.Screen name="progress" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
