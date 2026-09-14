/**
 * Invitation à activer les notifications, une fois dans la vie de l'installation — lot N4b
 * (J-3 14/09).
 *
 * <p>Elle s'interpose entre l'application et la boîte système. Sur iOS un refus est quasi
 * définitif : il ne se répare que dans les réglages du téléphone. Lâcher la boîte système telle
 * quelle, avant que la personne ait compris ce qu'on lui enverra, garantit ce refus — et avec
 * lui un compte que le trésorier ne pourra plus relancer autrement qu'à l'ouverture de l'app.
 *
 * <p>Le texte ne promet que le service rendu : des relances (déclarations, engagements) et les
 * annonces du ministère. Rien de promotionnel, rien de plus que ce que le backend envoie.
 *
 * <p>Elle ne se montre qu'UNE fois. « Plus tard » vaut réponse, pas report : l'invitation est
 * marquée comme vue dans les deux cas, et le bandeau de `app/notification-settings.tsx` reste
 * le seul chemin d'activation ensuite.
 *
 * <p>Elle attend que `NotificationGate` ait fini : deux `Modal` affichées en même temps ne
 * laissent voir que la dernière, et la porte des relances passe d'abord — elle, elle porte un
 * message qu'on a déjà écrit à cette personne.
 *
 * <p>Mise en page reprise de `components/NotificationGate.tsx` : même carte, même voile, mêmes
 * boutons. Une seconde grammaire de modale n'apporterait rien.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Button from '../Button';
import Card from '../Card';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { abonnerGate, gateEstOuverte } from './fileNotifications';
import { invitationDejaVue, marquerInvitationVue } from './preferencesPush';
import { activerNotifications, estSupporte, lireEtatPermission } from './usePushNotifications';

export default function ModaleActivationPush() {
  const { t, language } = useLanguage();
  const { ready, token, me } = useAuth();

  const [ouverte, setOuverte] = useState(false);
  /** Le temps de la boîte système : les deux boutons attendent, sans que l'écran se fige. */
  const [enCours, setEnCours] = useState(false);
  /** La porte des relances occupe-t-elle l'écran ? */
  const [gateOuverte, setGateOuverte] = useState(gateEstOuverte);
  /** L'évaluation n'a lieu qu'une fois par session, même si l'auth se résout en plusieurs temps. */
  const dejaEvaluee = useRef(false);

  useEffect(() => abonnerGate(setGateOuverte), []);

  useEffect(() => {
    // Tant qu'il n'y a ni auth résolue ni compte, une activation enregistrerait un `userId` faux
    // — et l'enregistrement partirait sans jeton, donc en 401 : la seule question qu'on a le
    // droit de poser serait gaspillée, accordée mais sans rien avoir pu enregistrer.
    if (!ready || !token || !me?.id || dejaEvaluee.current) return;
    // Web, simulateur, émulateur : aucun jeton Expo à obtenir, la boîte système s'ouvrirait pour
    // rien. On ne marque même pas l'invitation comme vue — elle sera présentée le jour où la
    // même personne ouvrira l'application sur un vrai appareil.
    if (!estSupporte()) return;
    dejaEvaluee.current = true;

    let vivant = true;
    (async () => {
      if (await invitationDejaVue()) return;
      const etat = await lireEtatPermission();
      if (etat === 'accordee') {
        // Permission déjà accordée — réinstallation, ou activation faite depuis les réglages :
        // il n'y a plus rien à demander, et l'invitation n'a plus lieu d'être un jour.
        await marquerInvitationVue();
        return;
      }
      if (!vivant) return;
      setOuverte(true);
    })();
    return () => {
      vivant = false;
    };
  }, [ready, token, me?.id]);

  const activer = useCallback(async () => {
    if (enCours) return;
    setEnCours(true);
    // Mémorisé AVANT d'ouvrir la boîte système : si l'application est tuée pendant qu'elle est
    // affichée, l'invitation ne doit pas revenir au lancement suivant.
    await marquerInvitationVue();
    await activerNotifications({ userId: me?.id ?? null, langue: language });
    setEnCours(false);
    setOuverte(false);
  }, [enCours, me?.id, language]);

  const plusTard = useCallback(async () => {
    if (enCours) return;
    await marquerInvitationVue();
    setOuverte(false);
  }, [enCours]);

  if (!ouverte || gateOuverte) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Le geste de retour d'Android ferme la modale : il vaut « Plus tard », pas une esquive
      // qui la ferait revenir au prochain démarrage.
      onRequestClose={() => void plusTard()}
    >
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <View style={styles.iconBubble}>
            <Ionicons name="notifications-outline" size={24} color={colors.moss} />
          </View>
          <Text style={styles.title}>{t('push.inviteTitle')}</Text>
          <Text style={styles.message}>{t('push.inviteBody')}</Text>
          <View style={styles.actions}>
            <Button
              label={t('push.inviteLater')}
              variant="ghost"
              onPress={() => void plusTard()}
              disabled={enCours}
              style={{ flex: 1 }}
              height={48}
            />
            <Button
              label={t('push.inviteAccept')}
              onPress={() => void activer()}
              loading={enCours}
              style={{ flex: 1 }}
              height={48}
            />
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
});
