import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/theme';
import { readBrandingCache } from '@/theme/branding';

export default function Index() {
  const { ready, isAuthenticated } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchment }}>
        <ActivityIndicator color={colors.moss} />
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(tabs)/home" />;
  // RG-PAYS-03 (JP 11/11, contrat 11/11 §5.5) : premier lancement, non connecté → « Dans quel pays êtes-vous ? ».
  // Un lien universel (`/d/…`, `/e/…`) n'arrive pas sur `index` : l'écran est alors sauté, `returnTarget`
  // inchangé, et le pays viendra du compte (RG-PAYS-04).
  if (!readBrandingCache().deviceCountryChosen) return <Redirect href={'/country' as never} />;
  return <Redirect href="/(auth)/login" />;
}
