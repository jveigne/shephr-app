/**
 * Réglages des notifications, une catégorie par interrupteur — lot N4b (J-3 14/09).
 *
 * <p><b>Aucune catégorie n'est envoyée sans son interrupteur.</b> C'est la règle de
 * `com.excellence.back.push.CategoriePush`, et c'est ici qu'elle se tient : un push qu'on ne
 * peut pas couper est exactement ce qui fait désinstaller. La quatrième catégorie livrée par
 * N4a — « Rappels » (`pref_rappels`) — a donc son interrupteur au même titre que les autres.
 *
 * <p>Ce que l'interrupteur « Rappels » coupe, et ce qu'il ne coupe pas : il coupe la BANNIÈRE,
 * pas le message. La relance est une `UserNotification` écrite en base, que `NotificationGate`
 * présente de toute façon à l'ouverture de l'application. C'est ce qui rend l'interrupteur
 * honnête — et c'est pour la même raison que refuser les notifications système ne fait perdre
 * aucune information (recette §11.8).
 *
 * <p>Les réglages vivent sur l'APPAREIL, pas sur le compte : le jeton Expo appartient à
 * l'installation. Le filtre est appliqué CÔTÉ SERVEUR au moment de l'envoi — un filtre seulement
 * local laisserait partir la notification, que le téléphone recevrait puis masquerait.
 *
 * <p>Les interrupteurs disent la VÉRITÉ : ils ne s'allument que si la permission système est
 * accordée. Tant qu'elle ne l'est pas, un bandeau propose de l'obtenir — second chemin
 * d'activation, avec l'invitation du premier lancement. Un refus définitif ne se répare que dans
 * les réglages du téléphone : le bandeau change alors de bouton, et l'écouteur `AppState`
 * rattrape l'autorisation donnée là-bas au retour dans l'application.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { TOUT_ACTIVE, ecrirePreferences, lirePreferences } from '../components/push/preferencesPush';
import {
  activerNotifications,
  estSupporte,
  lireEtatPermission,
  synchroniserAppareil,
  type EtatPermissionPush,
  type EtatPush,
} from '../components/push/usePushNotifications';
import type { CategoriePush, PreferencesPush } from '../services/pushApi';

/**
 * Ordre d'affichage. « Rappels » d'abord : c'est la catégorie pour laquelle Shephr envoie
 * réellement, et celle que l'on vient couper ou rallumer.
 */
const REGLAGES: { categorie: CategoriePush; titre: string; aide: string }[] = [
  { categorie: 'RAPPELS', titre: 'push.reminders', aide: 'push.remindersHelp' },
  { categorie: 'INFOS', titre: 'push.infos', aide: 'push.infosHelp' },
  { categorie: 'MAJ', titre: 'push.updates', aide: 'push.updatesHelp' },
];

export default function NotificationSettingsScreen() {
  const { t, language } = useLanguage();
  const { me } = useAuth();

  const [preferences, setPreferences] = useState<PreferencesPush | null>(null);
  /**
   * Permission système, à quatre valeurs : elle pilote à la fois le bandeau et l'activation des
   * interrupteurs. `null` tant qu'elle n'est pas lue — l'écran attend plutôt que de deviner.
   */
  const [permission, setPermission] = useState<EtatPermissionPush | null>(null);
  /** Un enregistrement qui n'est pas passé : dit sans dramatiser qu'il sera réessayé. */
  const [enAttente, setEnAttente] = useState(false);

  const accordee = permission === 'accordee';

  /**
   * Dernière permission connue, lisible depuis l'écouteur `AppState`.
   *
   * <p>L'écouteur est posé une seule fois : la valeur capturée dans sa fermeture serait celle du
   * montage, et il croirait éternellement que rien n'a changé.
   */
  const permissionRef = useRef<EtatPermissionPush | null>(null);
  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  /** Relit l'état système. Appelé au montage, puis après chaque geste. */
  const rafraichirEtat = useCallback(async (issue?: EtatPush) => {
    setEnAttente(issue === 'echec');
    setPermission(await lireEtatPermission());
  }, []);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const lues = await lirePreferences();
      if (!vivant) return;
      setPreferences(lues);
      await rafraichirEtat();
    })();
    return () => {
      vivant = false;
    };
  }, [rafraichirEtat]);

  /**
   * « Activer les notifications » : demande la permission, puis allume toutes les catégories et
   * enregistre l'appareil.
   *
   * <p>Sans permission obtenue, rien n'est allumé : les préférences sont relues telles qu'elles
   * sont réellement stockées, pour que l'écran ne garde pas trace d'une activation qui n'a pas
   * eu lieu.
   */
  const activer = useCallback(async () => {
    const issue = await activerNotifications({ userId: me?.id ?? null, langue: language });
    setPreferences(issue === 'accordee' ? { ...TOUT_ACTIVE } : await lirePreferences());
    await rafraichirEtat(issue);
  }, [me?.id, language, rafraichirEtat]);

  // Retour dans l'application après un détour par les réglages du téléphone : c'est le seul
  // moment où la permission peut avoir changé sans qu'aucun geste in-app l'ait provoqué. Si elle
  // vient d'être accordée là-bas, on enregistre l'appareil — sans quoi elle serait accordée sans
  // que rien ne parte.
  const etatApplication = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (suivant: AppStateStatus) => {
      if (etatApplication.current.match(/inactive|background/) && suivant === 'active') {
        void (async () => {
          const etat = await lireEtatPermission();
          if (etat === 'accordee' && permissionRef.current !== 'accordee') {
            await activer();
            return;
          }
          setPermission(etat);
        })();
      }
      etatApplication.current = suivant;
    });
    return () => abonnement.remove();
  }, [activer]);

  const basculer = useCallback(
    async (categorie: CategoriePush, valeur: boolean) => {
      // Les préférences ne sont pas encore relues : basculer écrirait par-dessus un état inconnu.
      // L'interrupteur est déjà désactivé dans ce cas, la garde est là pour le rester.
      if (!preferences) return;
      const suite: PreferencesPush = { ...preferences, [categorie]: valeur };
      // L'interrupteur suit le doigt tout de suite : le stockage et le réseau viennent après, et
      // un échec de l'un ou de l'autre ne doit pas figer l'interface.
      setPreferences(suite);
      await ecrirePreferences(suite);

      const issue = await synchroniserAppareil({
        userId: me?.id ?? null,
        langue: language,
        demanderPermission: valeur,
      });

      if (valeur && issue !== 'accordee' && issue !== 'echec') {
        // La permission a manqué : l'interrupteur ne peut pas rester vert en promettant des
        // notifications qui ne partiront jamais. Il revient à `false` dans l'état ET dans le
        // stockage, sans quoi la charge utile suivante repartirait avec la catégorie allumée.
        const retour: PreferencesPush = { ...suite, [categorie]: false };
        setPreferences(retour);
        await ecrirePreferences(retour);
      }

      await rafraichirEtat(issue);
    },
    [preferences, me?.id, language, rafraichirEtat],
  );

  return (
    <ScreenShell withTabBar={false}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={24} color={colors.moss} />
      </Pressable>

      <Text style={styles.title}>{t('push.title')}</Text>
      <Text style={styles.intro}>{t('push.intro')}</Text>

      {!estSupporte() && (
        <Card style={styles.avis}>
          <Text style={styles.avisTitre}>{t('push.unsupportedTitle')}</Text>
          <Text style={styles.avisTexte}>{t('push.unsupportedBody')}</Text>
        </Card>
      )}

      {/* Permission jamais demandée ou encore demandable : la boîte système peut s'ouvrir ici
          même. Rien à afficher sur un appareil non supporté, où l'avis ci-dessus dit déjà
          pourquoi il n'y aura pas de notifications. */}
      {estSupporte() && (permission === 'jamais-demandee' || permission === 'refusee') && (
        <Card style={styles.avis}>
          <Text style={styles.avisTitre}>{t('push.enableTitle')}</Text>
          <Text style={styles.avisTexte}>{t('push.enableBody')}</Text>
          <Button
            label={t('push.enableAction')}
            onPress={() => void activer()}
            style={{ marginTop: 14 }}
            height={48}
          />
        </Card>
      )}

      {/* Refus définitif : la boîte système ne s'ouvrira plus, le seul chemin restant passe par
          les réglages du téléphone. */}
      {permission === 'bloquee' && (
        <Card style={styles.avis}>
          <Text style={styles.avisTitre}>{t('push.blockedTitle')}</Text>
          <Text style={styles.avisTexte}>{t('push.blockedBody')}</Text>
          <Button
            label={t('push.openSettings')}
            variant="soft"
            onPress={() => Linking.openSettings().catch(() => {})}
            style={{ marginTop: 14 }}
            height={48}
          />
        </Card>
      )}

      {enAttente && (
        <Card style={styles.avis}>
          <Text style={styles.avisTexte}>{t('push.saveError')}</Text>
        </Card>
      )}

      <Card style={styles.liste}>
        {REGLAGES.map(({ categorie, titre, aide }, rang) => (
          <View key={categorie} style={[styles.ligne, rang > 0 && styles.ligneSuivante]}>
            <View style={styles.libelle}>
              <Text style={styles.libelleTitre}>{t(titre)}</Text>
              <Text style={styles.libelleAide}>{t(aide)}</Text>
            </View>
            <Switch
              // Sans permission, l'interrupteur est éteint quoi qu'en dise le stockage :
              // afficher une catégorie active alors que rien ne peut arriver serait mentir.
              value={accordee ? (preferences?.[categorie] ?? false) : false}
              // Tant que les préférences ne sont pas relues, l'interrupteur attend : il ne
              // devine pas un état qu'il écraserait ensuite. Et tant que la permission n'est pas
              // accordée, c'est le bandeau ci-dessus qui porte le geste d'activation.
              disabled={!preferences || !accordee}
              onValueChange={(valeur) => void basculer(categorie, valeur)}
              trackColor={{ false: colors.hairStrong, true: colors.mossSoft }}
              thumbColor={colors.paper2}
            />
          </View>
        ))}
      </Card>

      {/* La promesse que l'in-app tient toujours (N4c) : couper une catégorie coupe la bannière,
          pas le message. */}
      <Text style={styles.pied}>{t('push.inAppNote')}</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    marginTop: 8,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.ink2,
    marginTop: 8,
    marginBottom: 18,
  },
  avis: { paddingHorizontal: 18, paddingVertical: 16, marginBottom: 12 },
  avisTitre: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 4,
  },
  avisTexte: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink2,
  },
  liste: { paddingHorizontal: 18, paddingVertical: 2 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  ligneSuivante: { borderTopWidth: 1, borderTopColor: colors.hair },
  libelle: { flex: 1 },
  libelleTitre: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    color: colors.ink,
  },
  libelleAide: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.ink3,
    marginTop: 2,
  },
  pied: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.ink3,
    marginTop: 16,
    paddingHorizontal: 4,
  },
});
