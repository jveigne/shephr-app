import React from 'react';
import { Stack } from 'expo-router';

export default function GoalsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pledge/[categoryId]" />
      <Stack.Screen name="submit" />
      <Stack.Screen name="progress" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
