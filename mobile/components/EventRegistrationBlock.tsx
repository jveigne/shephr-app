import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConsentCheck from '@/components/ConsentCheck';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  registerToEvent,
  unregisterFromEvent,
  type EventStatus,
  type MyEventRegistration,
} from '@/services/eventsApi';
import { eventActionMessage } from '@/utils/eventErrors';
import { todayLocal } from '@/utils/events';

/**
 * Bloc d'inscription d'un évènement OUVERT À TOUS — RG-PAYS-26 (JP 11/11, contrat 11/11 §8.1).
 * <ul>
 *   <li>« Je participe » si le serveur dit `canRegister` ; avant la PREMIÈRE inscription (`!me.contactConsent`),
 *       case de consentement « J'accepte que les responsables de l'église voient mon nom et mes coordonnées pour
 *       me recontacter. », non cochée, bouton inactif sans elle ;</li>
 *   <li>inscrit : « Vous participez » (+ venu / pas venu une fois pointé), « Je ne participe plus » tant que
 *       l'évènement est programmé et à venir ;</li>
 *   <li>en ligne seulement (la file hors ligne ne porte que les déclarations).</li>
 * </ul>
 * Après une inscription, le profil est relu (`contactConsent` a pu changer) et `onChanged` recharge l'évènement.
 */
export default function EventRegistrationBlock({
  event,
  onChanged,
}: {
  event: {
    id: string;
    status: EventStatus;
    eventDate: string;
    myRegistration?: MyEventRegistration | null;
    canRegister?: boolean;
  };
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const { me, refreshMe } = useAuth();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registered = event.myRegistration?.status === 'REGISTERED';
  const canRegister = !!event.canRegister;
  const upcoming = event.status === 'PLANNED' && event.eventDate >= todayLocal();
  const needsConsent = !me?.contactConsent;

  if (!registered && !canRegister) return null;

  const join = async () => {
    if (busy || (needsConsent && !consent)) return;
    setBusy(true);
    setError(null);
    try {
      await registerToEvent(event.id, needsConsent ? { consent: true } : {});
      void refreshMe();
      onChanged();
    } catch (e) {
      setError(eventActionMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await unregisterFromEvent(event.id);
      onChanged();
    } catch (e) {
      setError(eventActionMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const attended = event.myRegistration?.attended;

  return (
    <Card variant="tinted" style={styles.card}>
      {registered ? (
        <>
          <View style={styles.head}>
            <Ionicons name="checkmark-circle" size={20} color={colors.moss} />
            <Text style={styles.title}>{t('events.registration.registered')}</Text>
          </View>
          {attended != null && (
            <Text style={styles.hint}>
              {attended ? t('events.registration.youAttended') : t('events.registration.youMissed')}
            </Text>
          )}
          {upcoming && (
            <Button
              label={t('events.registration.leave')}
              variant="ghost"
              onPress={() => void leave()}
              loading={busy}
              fullWidth
              height={44}
              style={{ marginTop: 10 }}
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('events.registration.title')}</Text>
          <Text style={styles.hint}>{t('events.registration.hint')}</Text>
          {needsConsent && (
            <ConsentCheck
              checked={consent}
              onChange={setConsent}
              label={t('events.registration.consent')}
              style={{ marginTop: 8 }}
            />
          )}
          <Button
            label={t('events.registration.join')}
            onPress={() => void join()}
            loading={busy}
            disabled={needsConsent && !consent}
            fullWidth
            height={48}
            style={{ marginTop: 10 }}
            iconLeft={<Ionicons name="hand-right-outline" size={18} color={colors.white} />}
          />
        </>
      )}
      {!!error && <ErrorBanner message={error} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, letterSpacing: -0.2 },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, marginTop: 4, lineHeight: 18 },
});
