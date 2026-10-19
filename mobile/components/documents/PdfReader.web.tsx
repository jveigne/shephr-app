import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * D-DOC-13 — Expo web (démos) : pas de `react-native-pdf`. L'écran `app/d/[slug]` affiche la page
 * web du lecteur en `iframe` et n'utilise jamais ce composant ; ce substitut évite seulement de
 * charger le module natif dans le bundle web.
 */

export interface PdfSource {
  uri: string;
  cache: boolean;
  cacheFileName?: string;
}

export interface PdfReaderProps {
  source: PdfSource;
  style?: StyleProp<ViewStyle>;
  onLoadComplete?: (numberOfPages: number) => void;
  onPageChanged?: (page: number, numberOfPages: number) => void;
  onError?: (error: unknown) => void;
}

export function isPdfReaderAvailable(): boolean {
  return false;
}

export default function PdfReader({ style }: PdfReaderProps) {
  return <View style={style} />;
}
