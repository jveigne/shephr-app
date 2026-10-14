import React from 'react';
import { Stack } from 'expo-router';

/**
 * Onglet « Évènements » — plan 14/10, §6.3 (lot E7) : agenda + statistiques pour les dirigeants /
 * LEADER / SECRETARIAT ; vue de son assemblée pour le simple membre (D-EVT-14, JP 14/10,
 * `EventMemberView`). Détail, saisie et programmation vivent dans la pile racine
 * (`app/events/[id]`, `app/events/declare`, `app/events/plan`), partagés avec « Mes actions » et la
 * tuile d'accueil.
 */
export default function EventsTabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
