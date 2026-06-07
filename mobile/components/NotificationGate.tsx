import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Button from './Button';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import {
  getUnreadNotifications,
  markNotificationRead,
  type UserNotification,
} from '../services/notificationsApi';

/**
 * Rappels in-app à l'ouverture (UC-MBR-09, Lot 4.4) : les notifications non lues
 * s'affichent en modales empilées, traitées une par une. « OK » marque comme lu
 * (ne réapparaît plus) ; « Plus tard » referme tout (réapparaît à la prochaine session).
 */
export default function NotificationGate() {
  const { isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<UserNotification[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      setQueue(await getUnreadNotifications());
    } catch {
      // silencieux : un échec de chargement ne doit pas bloquer l'app
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      load();
    } else {
      setQueue([]);
      setDismissed(false);
    }
  }, [isAuthenticated, load]);

  const current = queue[0] ?? null;
  if (!current || dismissed) return null;

  const onAck = async () => {
    try {
      await markNotificationRead(current.id);
    } catch {
      // au pire la notification réapparaîtra à la prochaine session
    }
    setQueue((q) => q.slice(1));
  };

  const onLater = () => setDismissed(true); // A2 : réapparaît à la prochaine session

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <View style={styles.iconBubble}>
            <Ionicons name="notifications-outline" size={24} color={colors.moss} />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.message}>{current.message}</Text>
          {queue.length > 1 && (
            <Text style={styles.counter}>{queue.length - 1} autre(s) rappel(s) en attente</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Button label="Plus tard" variant="ghost" onPress={onLater} style={{ flex: 1 }} height={48} />
            <Button label="OK" onPress={onAck} style={{ flex: 1 }} height={48} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { paddingHorizontal: 22, paddingVertical: 24, alignItems: 'center' },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginTop: 14,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  counter: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink3,
    marginTop: 10,
  },
});
