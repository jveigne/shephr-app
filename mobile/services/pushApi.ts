/**
 * Enregistrement de l'appareil pour les notifications push Expo — lot N4b (décision J-3 14/09,
 * `docs/notifications.md` §2.4).
 *
 * <p>Deux routes, et deux seulement : `POST /api/push/devices` (upsert sur le jeton Expo) et
 * `DELETE /api/push/devices/{jeton}`. Elles vivent sous `/api/push/**` et non sous
 * `/api/church/**` : le backend est PARTAGÉ entre CMFIPraise, PassTheBall, Divinly et Shephr,
 * et c'est le champ `targetApp` du corps qui dit laquelle appelle. `apiClient` pointe déjà la
 * racine de l'API (Shephr n'a pas de préfixe applicatif), il n'y a donc rien à corriger ici —
 * contrairement à CMFIPraise, dont le client push doit contourner son propre `API_URL`.
 *
 * <p>On passe par `apiClient` plutôt que par `fetch` : l'intercepteur pose déjà le `Bearer`
 * depuis AsyncStorage, hors de l'arbre React — ce dont le hook push a précisément besoin, lui
 * qui tourne sans `useAuth()`. Une seule source de vérité pour le jeton, pas un second
 * mécanisme d'authentification.
 */
import { apiClient } from './apiClient';

/**
 * Les catégories réglables par l'utilisateur de Shephr, chacune avec son interrupteur.
 *
 * <p><b>Trois, et pas la quatrième.</b> Le serveur en connaît quatre
 * (`com.excellence.back.push.CategoriePush`), mais `VIDEOS` est la catégorie du job « nouvelle
 * vidéo » de CMFIPraise : aucune diffusion `VIDEOS` ne vise `TargetApp.Shephr`. Afficher un
 * interrupteur qui ne coupe rien serait aussi malhonnête que d'envoyer une catégorie sans
 * interrupteur — la règle de `CategoriePush` interdit le second cas, le bon sens le premier.
 * `prefVideos` est donc absent de la charge utile : le constructeur canonique du DTO serveur
 * ramène l'absence à `true`, sans effet puisque rien ne part.
 *
 * <p>`RAPPELS` est la quatrième catégorie serveur, livrée par le lot N4a (colonne
 * `pref_rappels`) : résumé des déclarations au trésorier, relance des non-déclarants, relance
 * des engagements Goals.
 */
export type CategoriePush = 'INFOS' | 'MAJ' | 'RAPPELS';

/** État des interrupteurs, tel qu'il vit sur l'APPAREIL (AsyncStorage), pas sur le compte. */
export interface PreferencesPush {
  /** Informations — campagnes `INFO` et `PROMO` du back-office. */
  INFOS: boolean;
  /** Mises à jour de l'application — campagnes `APP_UPDATE`. */
  MAJ: boolean;
  /** Relances personnelles : trésorerie et engagements (J-3 14/09). */
  RAPPELS: boolean;
}

/** Plateforme de l'installation. Le backend n'en connaît pas d'autre — le web n'a pas de jeton. */
export type PlateformePush = 'ANDROID' | 'IOS';

/**
 * Charge utile `data` d'un push, telle que le routeur de tap la reçoit.
 *
 * <p>UNION FERMÉE, et c'est une décision de sécurité : le serveur ne transmet jamais une route,
 * seulement un `type` parmi ceux-ci. Une route arbitraire venue du réseau ouvrirait n'importe
 * quel écran à quiconque sait émettre un push. Un `type` inconnu est ignoré, jamais interprété.
 *
 * Mirrors com.excellence.back.push.DonneesPush
 */
export type DonneesPush =
  /** Une notification personnelle précise (cas mono-destinataire) — `pourNotification(UUID)`. */
  | { type: 'NOTIFICATION'; notificationId: string }
  /**
   * Plusieurs notifications personnelles d'un coup, SANS identifiant — `pourNotifications()`.
   *
   * <p>Une relance groupée écrit une ligne par personne mais ne porte qu'une charge utile pour
   * tout le monde : y mettre l'identifiant de l'un ouvrirait chez les autres la notification
   * d'un tiers. Chacun ouvre donc sa propre file de non-lues (J-3 14/09).
   */
  | { type: 'NOTIFICATIONS' };

/**
 * Corps de `POST /api/push/devices`.
 *
 * <p>Un appareil = une installation. Le backend fait un upsert sur `expoToken` : renvoyer cet
 * objet à l'identique est sans effet de bord — d'où le garde-fou d'empreinte de
 * `components/push/preferencesPush.ts`, qui évite l'appel réseau quand rien n'a bougé.
 *
 * Mirrors com.excellence.back.push.dto.EnregistrerAppareilRequest
 */
export interface EnregistrementAppareil {
  /** Jeton Expo de l'installation (`ExponentPushToken[…]`). Clé d'unicité côté backend. */
  expoToken: string;
  /** Toujours `'Shephr'` : le backend est partagé, sans ce champ nos push partiraient ailleurs. */
  targetApp: string;
  platform: PlateformePush;
  /**
   * CONSERVÉ dans le contrat HTTP, mais IGNORÉ par le serveur, qui lit le compte dans le jeton
   * porté par l'en-tête `Authorization`. Un corps de requête n'est pas une source d'identité.
   */
  userId: string | null;
  /** Code pays issu d'`expo-localization` (système), pas du profil : c'est l'appareil qu'on décrit. */
  countryCode: string | null;
  /** Langue dans laquelle composer le message (`fr`, `en`). */
  locale: string | null;
  /** Fuseau IANA de l'appareil (`Europe/Paris`), pour ne pas relancer quelqu'un en pleine nuit. */
  deviceTimezone: string | null;
  /** Version de l'app, utilisée par le ciblage `versionMinimale` des campagnes. */
  appVersion: string | null;
  prefInfos: boolean;
  prefMaj: boolean;
  /** Quatrième catégorie, livrée par N4a. Absente = `true` côté serveur (rétro-compatibilité). */
  prefRappels: boolean;
}

/**
 * Enregistre — ou rafraîchit — l'appareil courant. 204 attendu, rien à lire.
 *
 * <p>Lève en cas d'échec : un enregistrement raté avalé en silence donne un appareil que rien
 * n'atteint, sans le moindre symptôme visible. L'appelant décide quoi en faire (il ne mémorise
 * pas l'empreinte, donc il réessaiera).
 */
export async function enregistrerAppareil(appareil: EnregistrementAppareil): Promise<void> {
  if (!appareil.expoToken) throw new Error('Jeton Expo manquant');
  await apiClient.post('/api/push/devices', appareil);
}

/**
 * Désenregistre définitivement l'appareil.
 *
 * <p>Le jeton voyage DANS l'URL et contient des crochets : sans `encodeURIComponent`, un `[`
 * brut est refusé par le conteneur avant même d'atteindre Spring.
 *
 * <p>`jeton` explicite et non l'intercepteur : à la déconnexion, le jeton d'authentification
 * vient d'être retiré d'AsyncStorage, et l'appel partirait sans en-tête `Authorization` —
 * c'est-à-dire en 401. On passe donc celui qu'on avait encore en main.
 */
export async function supprimerAppareil(expoToken: string, jeton?: string | null): Promise<void> {
  if (!expoToken) throw new Error('Jeton Expo manquant');
  await apiClient.delete(`/api/push/devices/${encodeURIComponent(expoToken)}`, {
    headers: jeton ? { Authorization: `Bearer ${jeton}` } : undefined,
  });
}
