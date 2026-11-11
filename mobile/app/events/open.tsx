import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import EventOpenView from '@/components/EventOpenView';

/**
 * Évènements ouverts à tous + « Mes inscriptions » (`?tab=mine`) — D-PAYS-11 / RG-PAYS-24 (JP 11/11, contrat
 * 11/11 §10.4). Atteint depuis la vue d'un membre rattaché (section « Ouverts à tous ») et la tuile « Mes
 * inscriptions » de l'accueil d'un compte sans assemblée.
 */
export default function OpenEventsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <EventOpenView standalone initialTab={tab === 'mine' ? 'mine' : 'open'} />;
}
