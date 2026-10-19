import React from 'react';
import { StyleSheet, TurboModuleRegistry, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';

/**
 * D-DOC-13 (JP 18/10) [HYPOTHÈSE] — lecteur PDF NATIF (`react-native-pdf` + `react-native-blob-util`,
 * plugins `@config-plugins/*`) : défilement vertical continu, rendu fluide sur un Android d'entrée de
 * gamme, et cache disque intégré (lecture hors-ligne, spec §6).
 *
 * <p>Chargé PARESSEUSEMENT et SEULEMENT si le module natif est présent dans le binaire : expo-router
 * charge tous les écrans au démarrage, et un `import` direct ferait tomber TOUTE l'application dans
 * un binaire construit avant l'ajout du module (dev build périmé, version du store pas encore
 * republiée) — même précaution que `expo-crypto` dans `services/eventQueue.ts`. Sans module :
 * `available = false`, l'écran propose de mettre l'application à jour ou d'ouvrir le PDF ailleurs.
 *
 * <p>Sur Expo web, `PdfReader.web.tsx` le remplace (l'écran y affiche la page web en `iframe`).
 */

export interface PdfSource {
  /** URL signée (10 min) ; vide pour une relecture depuis le cache disque seul. */
  uri: string;
  /** true : le fichier `cacheFileName` du cache est réutilisé tel quel s'il existe (RG-DOC-08). */
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

type PdfComponent = React.ComponentType<Record<string, unknown>>;

/** Résolu UNE fois, au chargement du module (jamais pendant un rendu). */
const NativePdf: PdfComponent | null = (() => {
  try {
    // `get` (et non `getEnforcing`) ne lève jamais : null dans un binaire sans le module.
    if (!TurboModuleRegistry.get('ReactNativeBlobUtil')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-pdf');
    return (mod?.default ?? mod) as PdfComponent;
  } catch {
    return null;
  }
})();

/** Le lecteur natif est-il utilisable dans ce binaire ? */
export function isPdfReaderAvailable(): boolean {
  return NativePdf != null;
}

export default function PdfReader({ source, style, onLoadComplete, onPageChanged, onError }: PdfReaderProps) {
  if (!NativePdf) return <View style={[styles.fill, style]} />;
  return (
    <NativePdf
      source={{
        // Une URI vide passerait par le SHA1 de '' : on garde le nom de cache explicite.
        uri: source.uri,
        cache: source.cache,
        ...(source.cacheFileName ? { cacheFileName: source.cacheFileName } : {}),
      }}
      style={[styles.fill, style]}
      trustAllCerts={false}
      enablePaging={false}
      fitPolicy={0}
      spacing={8}
      onLoadComplete={(n: number) => onLoadComplete?.(n)}
      onPageChanged={(page: number, n: number) => onPageChanged?.(page, n)}
      onError={(e: unknown) => onError?.(e)}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.parchmentDeep,
  },
});
