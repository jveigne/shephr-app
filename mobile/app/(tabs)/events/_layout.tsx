import React from 'react';
import { Stack } from 'expo-router';

/**
 * Onglet « Évènements » — plan 14/10, §6.3 (lot E7) : agenda + statistiques. Détail et
 * programmation vivent dans la pile racine (`app/events/[id]`, `app/events/plan`), partagés avec
 * « Mes actions » et la tuile d'accueil.
 */
export default function EventsTabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
