import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { prefetchEventCatalog } from '../hooks/useEventCatalog';
import { claimEventQueue, flushEventQueue, isOnline, useEventQueue } from '../services/eventQueue';

/**
 * Lot E6 (plan 14/10, §6.3) — les déclencheurs du vidage de la file hors-ligne des déclarations
 * d'action (RG-ACT-08) : le DÉMARRAGE (dès qu'un compte abonné est connu), le RETOUR AU PREMIER
 * PLAN, le RETOUR DU RÉSEAU (`@react-native-community/netinfo`), et un NOUVEL ESSAI DIFFÉRÉ tant
 * qu'il reste des éléments en attente alors que l'application est ouverte et en ligne.
 *
 * <p>Ce dernier couvre ce que les trois autres ne voient pas : un envoi direct qui échoue EN LIGNE
 * (délai de 8 s dépassé, 503, 401) met l'élément en file sans qu'aucun passage hors ligne → en
 * ligne ne vienne jamais le rattraper. Délai croissant (15 s, 30 s, 1 min… plafonné à 5 min),
 * remis à zéro dès que la file bouge : un serveur en panne n'est pas martelé, une déclaration
 * dont la réponse s'est perdue repart vite — et le rejeu, idempotent (RG-EVT-07), la retrouve
 * enregistrée au lieu d'en créer une seconde.
 *
 * <p>Monté une fois à la racine, sous `AuthProvider`, comme `PushBridge` : `AuthContext` n'a pas à
 * connaître la file au-delà de sa réclamation et de sa libération au changement de session. Ne
 * rend rien.
 *
 * <p>Au même moment, le catalogue de saisie (types, nœuds) est préchargé : c'est ce qui permet de
 * déclarer hors ligne sans avoir ouvert le formulaire tant que le réseau était là.
 *
 * <p>Rien ne part sans l'abonnement EVENTS (RG-06 : les fronts n'appellent jamais ces routes
 * sinon). Les éléments restent alors en file — c'est le sort d'un 403 MODULE_ACCESS_DENIED
 * (§3.3 du contrat), et ils partiront si l'abonnement revient.
 */

/** Premier nouvel essai différé, puis doublé à chaque essai sans progrès. */
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;

export default function EventQueueSync() {
  const { ready, token, me, hasEvents } = useAuth();
  const userId = me?.id ?? null;
  const active = ready && !!token && !!userId && hasEvents;
  const queue = useEventQueue(active ? userId : null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!active || !userId || !token) return;

    // La file est (re)réclamée avant chaque vidage : les effets d'un enfant passent AVANT ceux de
    // son parent, celui-ci peut donc tourner avant la réclamation d'`AuthContext`. Réclamer le
    // compte déjà propriétaire ne fait que confirmer son jeton.
    const sync = () => {
      void claimEventQueue(userId, token).then(() => flushEventQueue());
      prefetchEventCatalog(userId);
    };

    sync();

    const appState = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      if (next === 'active') sync();
    });

    // L'écouteur NetInfo est appelé tout de suite avec l'état courant : seul un passage
    // hors ligne → en ligne déclenche un vidage (le démarrage a déjà le sien, ci-dessus).
    let wasOffline = false;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const nowOnline = isOnline(state);
      setOnline(nowOnline);
      if (nowOnline && wasOffline) sync();
      wasOffline = !nowOnline;
    });

    return () => {
      appState.remove();
      unsubscribeNet();
    };
  }, [active, userId, token]);

  // Nouvel essai différé. L'effet se rejoue à la fin de chaque vidage (`syncing` repasse à faux) :
  // c'est ce qui enchaîne les essais, chacun plus espacé tant que la file ne bouge pas.
  const attempts = useRef(0);
  const lastPendingCount = useRef(0);
  const pendingCount = queue.pending.length;
  useEffect(() => {
    if (pendingCount !== lastPendingCount.current) attempts.current = 0;
    lastPendingCount.current = pendingCount;
    if (!active || !foreground || !online || pendingCount === 0 || queue.syncing) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempts.current, RETRY_MAX_MS);
    const timer = setTimeout(() => {
      attempts.current += 1;
      void flushEventQueue();
    }, delay);
    return () => clearTimeout(timer);
  }, [active, foreground, online, pendingCount, queue.syncing]);

  return null;
}
