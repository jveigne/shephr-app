/**
 * Notifications push — permission, jeton, enregistrement et écouteurs (lot N4b, décision J-3
 * 14/09, `docs/notifications.md` §2.4). Transposé de l'implémentation en production de
 * CMFIPraise (`cmfipraise-app/components/push/usePushNotifications.ts`, plan §7-10).
 *
 * <p>Le fichier porte DEUX choses volontairement séparées :
 * <ul>
 *   <li>des fonctions de module, sans React, appelées aussi bien par l'écran de réglages que
 *       par `PushBridge` à la connexion et à la déconnexion ;
 *   <li>le hook {@link usePushNotifications}, monté une seule fois à la racine, qui installe le
 *       comportement au premier plan, les canaux Android et les écouteurs de tap.
 * </ul>
 *
 * <p>Ce module n'importe PAS `AuthContext` : c'est `PushBridge` qui lui passe l'identifiant du
 * compte. Un cycle d'imports entre les deux ferait dépendre le bon fonctionnement de l'ordre
 * d'évaluation des modules par Metro.
 *
 * <p>Toutes les fonctions publiques sont INERTES hors appareil réel : web et simulateur
 * n'obtiennent pas de jeton Expo. Elles ne lèvent pas pour autant, et rien ici ne bloque le
 * démarrage — <b>sans clé APNs ni `google-services.json`, l'application doit s'ouvrir et
 * fonctionner exactement pareil</b>, la file in-app comprise.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getCalendars, getLocales } from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { useNavigationContainerRef } from 'expo-router';

import {
  enregistrerAppareil,
  supprimerAppareil,
  type CategoriePush,
  type EnregistrementAppareil,
} from '../../services/pushApi';
import {
  TOUT_ACTIVE,
  aChangeDepuisDernierEnvoi,
  ecrirePreferences,
  lirePreferences,
  memoriserEnvoi,
  oublierEnvoi,
} from './preferencesPush';

/** Application ciblée (`TargetApp.Shephr`). Le backend est partagé : sans ce champ, on recevrait les push de CMFIPraise. */
const APPLICATION = 'Shephr';

/**
 * Canaux Android, un par catégorie réglable.
 *
 * <p>Les identifiants sont ceux que le serveur envoie dans `channelId`
 * (`CategoriePush.canalAndroid()`) et doivent coïncider <b>au caractère près</b> : un
 * `channelId` inconnu du téléphone retombe silencieusement sur le canal par défaut, et le
 * réglage système de la catégorie ne s'applique plus.
 *
 * <p>Le quatrième canal serveur, `videos`, n'est volontairement pas créé ici : aucune diffusion
 * `VIDEOS` ne vise Shephr (voir `services/pushApi.ts`, type `CategoriePush`).
 */
export const CANAUX: Record<CategoriePush, string> = {
  INFOS: 'infos',
  MAJ: 'mises-a-jour',
  RAPPELS: 'rappels',
};

/** Clés i18n des noms de canaux, tels qu'Android les affichera dans ses propres réglages. */
const LIBELLES_CANAUX: Record<CategoriePush, string> = {
  INFOS: 'push.infos',
  MAJ: 'push.updates',
  RAPPELS: 'push.reminders',
};

/**
 * Dernier tap traité au démarrage à froid.
 *
 * <p>`getLastNotificationResponseAsync` rend le dernier tap reçu, y compris plusieurs
 * lancements plus tard : sans cette mémoire persistante, la relance de mardi se rouvrirait à
 * chaque ouverture jusqu'au push suivant. Une mémoire de session ne suffit pas — elle disparaît
 * précisément avec le processus qu'on essaie de couvrir.
 */
const CLE_DERNIER_TAP = 'shephr.push.dernierTap';

/** Attente du montage du navigateur racine, au démarrage à froid : ~3 s au plus. */
const ATTENTE_NAVIGATION_MS = 150;
const ESSAIS_NAVIGATION = 20;

/**
 * Issue d'une tentative de synchronisation.
 *
 * <p>`echec` et `refusee` sont distingués parce que l'écran de réglages n'en dit pas la même
 * chose : un refus se répare dans les réglages du téléphone, un échec réseau se réessaiera tout
 * seul à la prochaine ouverture.
 */
export type EtatPush = 'accordee' | 'refusee' | 'non-supporte' | 'echec';

/**
 * État de la permission système, à quatre valeurs.
 *
 * <p>La distinction porte l'interface : quelqu'un qui n'a jamais vu la boîte système et
 * quelqu'un qui l'a refusée se voient tous deux proposer de l'ouvrir, alors qu'un refus
 * définitif ne se répare que dans les réglages du téléphone.
 */
export type EtatPermissionPush = 'jamais-demandee' | 'refusee' | 'bloquee' | 'accordee';

/**
 * Dernier enregistrement construit dans cette session.
 *
 * <p>Mémoire de {@link oublierAppareil}, qui doit retrouver le jeton Expo à supprimer alors que
 * `PushBridge` n'en a jamais rien su. Tant qu'il est `null`, aucun jeton n'a été obtenu
 * (permission jamais accordée) et il n'y a donc rien à désenregistrer.
 */
let appareilCourant: EnregistrementAppareil | null = null;

/**
 * Attend que le navigateur racine soit monté.
 *
 * <p>`router.push()` LÈVE tant qu'il ne l'est pas — et au démarrage à froid, le tap est relevé
 * avant que l'arbre de navigation ait fini de se monter. On patiente donc plutôt que de naviguer
 * dans le vide ; passé le délai on renonce, sans faire attendre indéfiniment.
 */
async function attendreNavigation(
  navigation: { isReady: () => boolean },
  encore: () => boolean,
): Promise<boolean> {
  for (let essai = 0; essai < ESSAIS_NAVIGATION; essai += 1) {
    if (!encore()) return false;
    if (navigation.isReady()) return true;
    await new Promise((resoudre) => setTimeout(resoudre, ATTENTE_NAVIGATION_MS));
  }
  return false;
}

/**
 * L'appareil peut-il recevoir des push ?
 *
 * <p>Deux gardes, et elles ne sont pas décoratives : sur le web les modules natifs n'existent
 * pas, et sur un simulateur `getExpoPushTokenAsync` échoue. Demander la permission dans ces deux
 * cas afficherait une boîte de dialogue pour rien.
 */
export function estSupporte(): boolean {
  return Platform.OS !== 'web' && Device.isDevice;
}

/**
 * Comportement quand une notification arrive app ouverte.
 *
 * <p>Bandeau, liste ET son. Le son n'est pas un choix d'ambiance : sur Android,
 * `shouldPlaySound: false` supprime le bandeau de premier plan avec lui, et on perdrait
 * l'affichage demandé juste au-dessus. Qui ne veut pas de son coupe celui du canal dans les
 * réglages d'Android.
 */
function installerComportement(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Remet la pastille de l'icône à zéro.
 *
 * <p>Le gestionnaire pose `shouldSetBadge: true` : sans remise à zéro, le compteur ne fait que
 * monter et reste affiché indéfiniment. Ouvrir l'application vaut lecture — la file des non-lues
 * est de toute façon présentée par `NotificationGate` dès l'ouverture.
 *
 * <p>Silencieux en cas d'échec : un badge non effacé est un désagrément, pas une panne.
 */
async function remettreBadgeAZero(): Promise<void> {
  if (!estSupporte()) return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    console.log('[push] badge non remis à zéro', e);
  }
}

/**
 * Crée les canaux Android. Sans effet ailleurs qu'Android.
 *
 * <p>Les canaux ne remplacent PAS les interrupteurs in-app : iOS n'a pas d'équivalent, et le
 * filtre serveur évite d'envoyer une notification qui serait de toute façon masquée.
 *
 * <p>Importance HAUTE : c'est le seuil à partir duquel Android affiche réellement un bandeau
 * par-dessus l'écran en cours. L'importance d'un canal ne se change plus après sa création.
 */
export async function configurerCanauxAndroid(t: (cle: string) => string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Promise.all(
      (Object.keys(CANAUX) as CategoriePush[]).map((categorie) =>
        Notifications.setNotificationChannelAsync(CANAUX[categorie], {
          name: t(LIBELLES_CANAUX[categorie]),
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: '#1E3A2F',
        }),
      ),
    );
  } catch (e) {
    // Un canal non créé fait retomber la notification dans le canal par défaut : dégradé, pas
    // cassé. Rien ne justifie d'interrompre le démarrage de l'app pour ça.
    console.log('[push] canaux Android non configurés', e);
  }
}

/**
 * État actuel de la permission, sans jamais la demander.
 *
 * <p>Hors appareil réel, et si la lecture échoue, on répond `jamais-demandee` : c'est le seul
 * repli qui laisse un bouton d'activation utile à l'écran. Répondre `bloquee` enverrait dans les
 * réglages du téléphone pour un problème qui n'y est pas.
 */
export async function lireEtatPermission(): Promise<EtatPermissionPush> {
  if (!estSupporte()) return 'jamais-demandee';
  try {
    const { granted, canAskAgain, status } = await Notifications.getPermissionsAsync();
    if (granted) return 'accordee';
    // `undetermined` est l'état d'avant la première boîte : explicite sur iOS, lisible sur
    // Android 13+ à `canAskAgain` encore vrai.
    if (status === 'undetermined') return 'jamais-demandee';
    return canAskAgain ? 'refusee' : 'bloquee';
  } catch (e) {
    console.log('[push] permission illisible', e);
    return 'jamais-demandee';
  }
}

/** Charge utile d'enregistrement, à partir des préférences locales et de la localisation. */
async function construireAppareil(
  expoToken: string,
  userId: string | null,
  langue: string,
): Promise<EnregistrementAppareil> {
  const preferences = await lirePreferences();
  const locale = getLocales()[0];
  return {
    expoToken,
    targetApp: APPLICATION,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    userId,
    // Le pays vient du SYSTÈME, pas du profil : c'est l'appareil qu'on décrit, et le ciblage
    // par pays des campagnes doit marcher même quand `/me` n'a pas encore répondu.
    countryCode: locale?.regionCode ?? null,
    locale: langue || locale?.languageCode || null,
    appVersion: Constants.expoConfig?.version ?? null,
    // Fuseau IANA de l'appareil, pour que le backend ne relance pas au milieu de la nuit qui
    // vit trois fuseaux plus loin. Il vient du calendrier système et non du pays : un même pays
    // peut en porter plusieurs, et le pays peut manquer.
    deviceTimezone: getCalendars()[0]?.timeZone ?? null,
    prefInfos: preferences.INFOS,
    prefMaj: preferences.MAJ,
    // Quatrième catégorie livrée par N4a (colonne `pref_rappels`, J-3 14/09) : elle part à
    // CHAQUE enregistrement comme les autres. L'omettre vaudrait `true` côté serveur — ce qui
    // est le bon défaut pour une version antérieure, mais pas un état à laisser deviner ici.
    prefRappels: preferences.RAPPELS,
  };
}

/**
 * Enregistre l'appareil auprès du backend, en demandant la permission si — et seulement si —
 * l'appelant le décide.
 *
 * <p>`demanderPermission` n'est vrai qu'à l'ACTIVATION explicite, c'est-à-dire depuis
 * {@link activerNotifications}. Un refus iOS est quasi définitif : d'où la modale d'explication
 * qui précède la boîte système, plutôt que la boîte lâchée seule au premier lancement.
 */
export async function synchroniserAppareil(options: {
  userId: string | null;
  langue: string;
  demanderPermission?: boolean;
}): Promise<EtatPush> {
  const { userId, langue, demanderPermission = false } = options;
  if (!estSupporte()) return 'non-supporte';

  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    let accordee = granted;
    if (!accordee) {
      if (!demanderPermission || !canAskAgain) return 'refusee';
      // iOS ET Android 13+ (POST_NOTIFICATIONS) demandent la permission à l'exécution.
      accordee = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!accordee) return 'refusee';

    // `projectId` doit être passé EXPLICITEMENT : il est déduit du manifeste en développement,
    // pas en build de production, où l'appel échoue sans lui.
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.log('[push] eas.projectId absent de app.json — jeton impossible à obtenir');
      return 'echec';
    }

    const { data: jeton } = await Notifications.getExpoPushTokenAsync({ projectId });
    // Indispensable pour envoyer un push de test à la main (curl vers exp.host) tant que la
    // chaîne Apple/Google n'est pas en place. `__DEV__` UNIQUEMENT : qui détient ce jeton peut
    // notifier l'appareil, il n'a rien à faire dans les journaux d'un build de production.
    if (__DEV__) {
      console.log('[push] jeton Expo de cet appareil :', jeton);
    }
    const appareil = await construireAppareil(jeton, userId, langue);
    // Mémorisé même si l'envoi échoue : c'est la trace du jeton pour cette session, elle sert à
    // `resynchroniserAppareil` et à `oublierAppareil` que le POST ait abouti ou non.
    appareilCourant = appareil;

    // Le backend fait un upsert : réenvoyer à l'identique serait sans dommage, mais ce serait un
    // appel réseau à chaque démarrage pour rien.
    if (!(await aChangeDepuisDernierEnvoi(appareil))) return 'accordee';

    await enregistrerAppareil(appareil);
    await memoriserEnvoi(appareil);
    return 'accordee';
  } catch (e) {
    console.log('[push] synchronisation impossible', e);
    return 'echec';
  }
}

/**
 * Active les notifications : demande la permission, puis allume toutes les catégories.
 *
 * <p>Unique chemin d'activation de l'application. Il sert la modale d'invitation du premier
 * lancement comme le bandeau de l'écran de réglages : les deux gestes veulent exactement la même
 * chose, et les écrire deux fois serait le meilleur moyen d'en laisser un diverger.
 *
 * <p>Les préférences passent à `true` AVANT l'enregistrement, et sont persistées : c'est la
 * charge utile envoyée au backend qui les porte, et un enregistrement parti avec les défauts à
 * `false` produirait un appareil connu du serveur mais que rien ne peut atteindre.
 *
 * <p>N'écrit rien si la permission n'est pas obtenue : un refus ne doit pas laisser derrière lui
 * des interrupteurs allumés qui mentent.
 */
export async function activerNotifications(options: {
  userId: string | null;
  langue: string;
}): Promise<EtatPush> {
  if (!estSupporte()) return 'non-supporte';

  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (!granted) {
      // Plus redemandable : la boîte système ne s'ouvrira pas, l'appelant doit renvoyer vers les
      // réglages du téléphone plutôt que d'attendre une réponse qui ne viendra pas.
      if (!canAskAgain) return 'refusee';
      if (!(await Notifications.requestPermissionsAsync()).granted) return 'refusee';
    }
  } catch (e) {
    console.log('[push] permission indisponible', e);
    return 'echec';
  }

  await ecrirePreferences({ ...TOUT_ACTIVE });
  // La permission vient d'être obtenue : `demanderPermission` n'y rouvrira aucune boîte, il
  // couvre seulement le cas où elle aurait été révoquée entre les deux appels.
  return synchroniserAppareil({ ...options, demanderPermission: true });
}

/**
 * Oublie l'appareil : le retire côté serveur et efface la mémoire locale d'enregistrement.
 *
 * <p>Appelée à la DÉCONNEXION et à la suppression de compte. À la différence de CMFIPraise — qui
 * garde une ligne anonyme parce qu'un visiteur y reçoit encore les nouveautés du catalogue —
 * Shephr n'a pas de mode visiteur : un appareil déconnecté n'est destinataire de rien, et une
 * ligne qui porterait encore l'ancien compte enverrait ses relances à un téléphone qu'il n'a
 * plus. On supprime donc, et la reconnexion réenregistre.
 *
 * <p>Le jeton d'authentification est passé explicitement : `logout()` vient de le retirer
 * d'AsyncStorage, et l'appel partirait sinon sans en-tête `Authorization`, c'est-à-dire en 401.
 *
 * <p>Ne lève jamais : une déconnexion réussie ne doit pas paraître avoir échoué parce que le
 * désenregistrement d'un jeton n'a pas abouti.
 */
export async function oublierAppareil(jetonAuth?: string | null): Promise<void> {
  const jeton = appareilCourant?.expoToken;
  appareilCourant = null;
  try {
    if (jeton) {
      await supprimerAppareil(jeton, jetonAuth);
    }
  } catch (e) {
    console.log("[push] désenregistrement de l'appareil impossible", e);
  }
  // Sans cet oubli, la reconnexion depuis le même téléphone serait vue comme « déjà enregistrée,
  // rien n'a changé » et n'enverrait jamais le nouvel appareil.
  await oublierEnvoi();
}

/** Paramètres du hook racine. */
export interface OptionsPush {
  /** Identifiant du compte connecté, `null` quand personne ne l'est. */
  userId: string | null;
  /**
   * Auth résolue ET compte connu. Tant que c'est `false`, aucun enregistrement ne part :
   * `POST /api/push/devices` est `authenticated()`, et un appel sans compte donnerait un 401
   * pour une ligne que le ciblage par utilisateur (N4a) ne pourrait de toute façon pas viser.
   */
  pret: boolean;
  /** Langue courante de l'app (`fr`, `en`) — celle dans laquelle composer les messages. */
  langue: string;
  /** Traduction, pour les noms de canaux visibles dans les réglages système d'Android. */
  t: (cle: string) => string;
  /** Routage du tap, construit par `useRouteurPush`. */
  routerPush: (donnees: unknown) => void;
}

/**
 * Hook racine, monté une seule fois (par `PushBridge`, dans `app/_layout.tsx`).
 *
 * <p>Il ne rend rien et ne bloque jamais l'affichage : tout y est asynchrone et tolérant à
 * l'échec. Une app sans push doit démarrer exactement comme une app avec.
 */
export function usePushNotifications({
  userId,
  pret,
  langue,
  t,
  routerPush,
}: OptionsPush): void {
  const navigation = useNavigationContainerRef();

  // Comportement au premier plan : posé une fois pour toutes, avant tout écouteur.
  useEffect(() => {
    if (!estSupporte()) return;
    installerComportement();
  }, []);

  // Badge effacé à l'ouverture ET à chaque retour au premier plan. Les notifications reçues
  // application fermée l'incrémentent sans que rien ne le décrémente : sans cet écouteur, la
  // pastille reste sur l'icône jusqu'à la désinstallation.
  useEffect(() => {
    if (!estSupporte()) return;
    void remettreBadgeAZero();
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void remettreBadgeAZero();
    });
    return () => abonnement.remove();
  }, []);

  // Les canaux se recréent au changement de langue : leur nom est visible dans les réglages
  // système d'Android, il ne doit pas rester figé dans la langue du premier lancement.
  useEffect(() => {
    if (!estSupporte()) return;
    void configurerCanauxAndroid(t);
  }, [t]);

  // Réenregistrement au démarrage et à chaque changement de compte, SANS demander la permission :
  // il ne se produit que pour qui l'a déjà accordée, et seulement si la charge utile a changé.
  // Tant que l'auth n'est pas résolue (`pret`), rien ne part — un enregistrement avec un
  // `userId` encore à `null` ferait sortir l'appareil du ciblage de ses propres relances.
  useEffect(() => {
    if (!pret || !estSupporte()) return;
    void synchroniserAppareil({ userId, langue, demanderPermission: false });
  }, [pret, userId, langue]);

  /**
   * Taps déjà traités.
   *
   * <p>Au démarrage à froid, le tap qui a lancé l'app est rendu à la fois par
   * `getLastNotificationResponseAsync` et — selon la plateforme et le moment du montage — par
   * l'écouteur. Sans cette mémoire, la file se rechargerait deux fois.
   */
  const tapsTraites = useRef<Set<string>>(new Set());

  const traiter = useCallback(
    (reponse: Notifications.NotificationResponse | null) => {
      if (!reponse) return;
      const identifiant = reponse.notification.request.identifier;
      if (tapsTraites.current.has(identifiant)) return;
      tapsTraites.current.add(identifiant);
      routerPush(reponse.notification.request.content.data);
    },
    [routerPush],
  );

  useEffect(() => {
    if (!estSupporte()) return;
    const abonnement = Notifications.addNotificationResponseReceivedListener(traiter);
    return () => abonnement.remove();
  }, [traiter]);

  // Démarrage à froid : l'app tuée, le tap qui l'a lancée n'atteint aucun écouteur — il est à
  // relever explicitement, sans quoi il est simplement perdu.
  useEffect(() => {
    if (!estSupporte()) return;
    let vivant = true;
    (async () => {
      try {
        const reponse = await Notifications.getLastNotificationResponseAsync();
        if (!vivant || !reponse) return;
        const identifiant = reponse.notification.request.identifier;
        if ((await AsyncStorage.getItem(CLE_DERNIER_TAP)) === identifiant) return;
        // Mémorisé AVANT le routage : un échec de navigation ne doit pas condamner l'app à
        // rejouer le même tap à chaque lancement.
        await AsyncStorage.setItem(CLE_DERNIER_TAP, identifiant);
        if (!(await attendreNavigation(navigation, () => vivant))) return;
        traiter(reponse);
      } catch (e) {
        console.log('[push] dernier tap illisible', e);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [navigation, traiter]);
}

export default usePushNotifications;
