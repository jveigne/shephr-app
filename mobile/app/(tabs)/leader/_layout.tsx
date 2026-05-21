import React from 'react';
import { Stack } from 'expo-router';

export default function LeaderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="unit/[unitId]" />
    </Stack>
  );
}
