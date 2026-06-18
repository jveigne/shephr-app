import { Alert, Platform } from 'react-native';
import i18n from './i18n/i18n';

/**
 * Confirmation cross-platform : react-native-web ne supporte pas les boutons
 * d'Alert.alert (le onPress ne se déclenche jamais) → window.confirm sur web,
 * Alert natif sinon. (Même raison que le fix logout de profile.tsx.)
 */
export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = i18n.t('common.confirm'),
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window === 'undefined' || window.confirm(`${title}\n\n${message}`),
    );
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Notification simple cross-platform (Alert est aussi un no-op complet sur web). */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
