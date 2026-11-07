import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/contexts/AuthContext';
import { isOnline } from '@/services/eventQueue';
import { flushTeachingProgress } from '@/services/teachingCache';

/**
 * Lot « FIN » (JP 06/11, contrat 06/11 §5.5) — vidage de la file d'avancement des enseignements : démarrage, retour au
 * premier plan, retour du réseau. Une position envoyée hors ligne repart ainsi même si l'écran du chapitre est fermé.
 * Sur le modèle d'`EventQueueSync`, monté une fois à la racine sous `AuthProvider`. Ne rend rien.
 */
export default function TeachingProgressSync() {
  const { ready, token, me } = useAuth();
  const userId = me?.id ?? null;

  useEffect(() => {
    if (!ready || !token || !userId) return;
    void flushTeachingProgress(userId, token);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flushTeachingProgress(userId, token);
    });
    let wasOffline = false;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = isOnline(state);
      if (online && wasOffline) void flushTeachingProgress(userId, token);
      wasOffline = !online;
    });
    return () => {
      appState.remove();
      unsubscribeNet();
    };
  }, [ready, token, userId]);

  return null;
}
