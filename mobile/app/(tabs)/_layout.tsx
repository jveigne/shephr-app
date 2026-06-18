import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { colors, fonts } from '../../theme';
import { FEATURES } from '../../constants/features';
import NotificationGate from '../../components/NotificationGate';

export default function TabLayout() {
  const { t, applyAccountLanguage } = useLanguage();
  const insets = useSafeAreaInsets();
  const { isLeader, hasGoals, me } = useAuth();

  // Initialise la langue depuis le compte (me.language) tant que l'utilisateur
  // n'a pas choisi explicitement une langue dans l'app (cf. LanguageContext).
  React.useEffect(() => {
    applyAccountLanguage(me?.language);
  }, [me?.language, applyAccountLanguage]);

  return (
    <>
    <NotificationGate />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.moss,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: {
          backgroundColor: 'rgba(245,236,216,0.96)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(42,38,32,0.08)',
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 14,
          borderRadius: 24,
          borderWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          fontFamily: fonts.sans,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="donations"
        options={{
          // Livraison « Goals only » : onglet Dons masqué (FEATURES.donations).
          href: FEATURES.donations ? '/(tabs)/donations' : null,
          title: t('tabs.donations'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          href: hasGoals ? '/(tabs)/goals' : null,
          title: t('tabs.goals'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flag-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leader"
        options={{
          // « Périmètre » = vues de lecture des DONS → masqué avec le flag donations.
          href: FEATURES.donations && isLeader ? '/(tabs)/leader' : null,
          title: t('tabs.leader'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
    </>
  );
}
