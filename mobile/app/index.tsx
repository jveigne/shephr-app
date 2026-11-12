import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/contexts/ThemeContext';
export default function Index() {
  const { couleurs: c } = useTheme();
  const { ready, isAuthenticated } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.page }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/(auth)/login'} />;
}
