import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import PerimeterScreen from './perimeter';

/**
 * Aiguillage de l'onglet Objectifs.
 *
 * <p>Chantier « objectifs individuels » (JP 16/08) — RG-BQ-03/11 : **tout compte rattaché à une
 * assemblée atterrit sur SES objectifs**, dirigeant compris. L'écran d'engagement « au nom de
 * l'assemblée » (`UnitGoalsScreen`) a été supprimé avec les routes d'écriture qu'il appelait ;
 * un dirigeant déclare comme tout le monde, dans son assemblée de rattachement.
 *
 * <p>Les vues de périmètre (ministère-large, région/ville/nation) restent accessibles, mais en
 * LECTURE et depuis « Mes objectifs » (bloc « Mon périmètre ») — plus comme un aiguillage
 * d'entrée : un dirigeant a désormais toujours un `goalUnitId`, la garde `!goalUnitId` qui les
 * exposait ne se déclencherait donc plus jamais.
 */
export default function GoalsOverviewScreen() {
  const { me } = useAuth();

  if (me?.goalUnitId) {
    return <Redirect href="/(tabs)/goals/member" />;
  }

  // Compte sans assemblée de rattachement : il ne peut rien déclarer (RG-BQ-03). On lui montre
  // quand même son périmètre de lecture s'il en a un, sinon l'invitation à choisir une assemblée.
  return <PerimeterScreen />;
}
