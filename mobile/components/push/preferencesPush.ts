/**
 * Persistance locale des réglages de notifications push — lot N4b (J-3 14/09).
 *
 * <p>Les préférences vivent sur l'APPAREIL, pas sur le compte : le jeton Expo appartient à
 * l'installation, et deux téléphones du même compte n'ont pas à être réglés ensemble. Elles
 * sont recopiées dans l'enregistrement envoyé au backend, qui applique le filtre AU MOMENT DE
 * L'ENVOI (`pref_infos` / `pref_maj` / `pref_rappels`) : un filtre seulement local laisserait
 * partir la notification, que le téléphone recevrait puis masquerait.
 *
 * <p>Clés préfixées `shephr.push.`, comme `shephr.auth.token` et `shephr.campaigns.state`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EnregistrementAppareil, PreferencesPush } from '../../services/pushApi';

const CLE_PREFERENCES = 'shephr.push.preferences';

/**
 * Empreinte du dernier enregistrement accepté par le backend.
 *
 * <p>Clé distincte des préférences : ce qui doit déclencher un réenregistrement n'est pas
 * seulement un interrupteur basculé, c'est aussi un changement de version, de pays, de langue,
 * de fuseau ou de compte connecté.
 */
const CLE_DERNIER_ENREGISTREMENT = 'shephr.push.dernierEnregistrement';

/**
 * Invitation d'activation déjà présentée ?
 *
 * <p>Elle ne se montre qu'UNE fois : « Plus tard » vaut réponse, pas report. Sans cette clé
 * persistante, l'invitation reviendrait à chaque démarrage et finirait par obtenir un refus
 * système — que seul un détour par les réglages du téléphone répare.
 */
const CLE_INVITATION_VUE = 'shephr.push.invitationVue';

/**
 * Tout est coupé par défaut.
 *
 * <p>Ces valeurs décrivent un appareil qui n'a RIEN accordé. La permission système n'est
 * demandée qu'à l'activation explicite (invitation du premier lancement, ou bandeau de l'écran
 * de réglages), et c'est cette activation qui allume les trois catégories d'un coup. Des
 * défauts à `true` afficheraient trois interrupteurs déjà verts sur lesquels le seul geste
 * possible serait d'éteindre — la permission ne serait jamais demandée, et aucun appareil
 * enregistré.
 */
const DEFAUTS: PreferencesPush = { INFOS: false, MAJ: false, RAPPELS: false };

/** Toutes catégories allumées — l'état posé par une activation réussie. */
export const TOUT_ACTIVE: PreferencesPush = { INFOS: true, MAJ: true, RAPPELS: true };

/**
 * Réglages courants.
 *
 * <p>Retombe sur les défauts en cas d'absence, de JSON corrompu ou de stockage indisponible :
 * on ne notifie pas quelqu'un sur la foi d'un stockage qu'on n'arrive pas à lire. Chaque champ
 * est relu individuellement, pour qu'une catégorie ajoutée plus tard ne fasse pas basculer les
 * autres à `undefined`.
 */
export async function lirePreferences(): Promise<PreferencesPush> {
  try {
    const brut = await AsyncStorage.getItem(CLE_PREFERENCES);
    if (!brut) return { ...DEFAUTS };
    const stocke = JSON.parse(brut) as Partial<PreferencesPush>;
    return {
      INFOS: stocke.INFOS ?? DEFAUTS.INFOS,
      MAJ: stocke.MAJ ?? DEFAUTS.MAJ,
      RAPPELS: stocke.RAPPELS ?? DEFAUTS.RAPPELS,
    };
  } catch (e) {
    console.log('[push] préférences illisibles, retour aux défauts', e);
    return { ...DEFAUTS };
  }
}

/** Enregistre les réglages. L'échec est tracé, jamais propagé : l'écran reste utilisable. */
export async function ecrirePreferences(preferences: PreferencesPush): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_PREFERENCES, JSON.stringify(preferences));
  } catch (e) {
    console.log('[push] préférences non enregistrées', e);
  }
}

/**
 * L'invitation a-t-elle déjà été présentée ?
 *
 * <p>Stockage illisible → on répond `true`, donc on n'affiche pas : une clé qu'on n'arrive pas
 * à lire est probablement une clé qu'on n'arrivera pas à écrire, et l'invitation se rejouerait
 * à chaque lancement.
 */
export async function invitationDejaVue(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLE_INVITATION_VUE)) !== null;
  } catch (e) {
    console.log('[push] invitation illisible, considérée comme déjà vue', e);
    return true;
  }
}

/**
 * Marque l'invitation comme présentée, définitivement.
 *
 * <p>À appeler pour LES DEUX réponses — « Activer » comme « Plus tard » — et AVANT d'ouvrir la
 * boîte système : si l'application est tuée pendant qu'elle est affichée, l'invitation ne doit
 * pas revenir au lancement suivant.
 */
export async function marquerInvitationVue(): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_INVITATION_VUE, '1');
  } catch (e) {
    console.log('[push] invitation non mémorisée', e);
  }
}

/**
 * Empreinte stable d'un enregistrement.
 *
 * <p>Construite champ par champ plutôt qu'avec un `JSON.stringify` de l'objet entier : l'ordre
 * des clés d'un objet JavaScript n'est pas garanti d'une construction à l'autre, et une
 * comparaison de chaînes le remarquerait alors qu'aucune valeur n'a bougé.
 */
function empreinte(appareil: EnregistrementAppareil): string {
  return [
    appareil.expoToken,
    appareil.targetApp,
    appareil.platform,
    appareil.userId ?? '',
    appareil.countryCode ?? '',
    appareil.locale ?? '',
    appareil.appVersion ?? '',
    appareil.deviceTimezone ?? '',
    appareil.prefInfos,
    appareil.prefMaj,
    appareil.prefRappels,
  ].join('|');
}

/**
 * L'enregistrement diffère-t-il du dernier envoi réussi ?
 *
 * <p>Le backend fait un upsert : réenvoyer à l'identique serait sans dommage, mais ce serait un
 * appel réseau à chaque démarrage pour rien. En cas de doute (stockage illisible) on répond
 * `true` : un enregistrement de trop est bénin, un enregistrement manquant rend l'appareil
 * injoignable.
 */
export async function aChangeDepuisDernierEnvoi(
  appareil: EnregistrementAppareil,
): Promise<boolean> {
  try {
    const precedent = await AsyncStorage.getItem(CLE_DERNIER_ENREGISTREMENT);
    return precedent !== empreinte(appareil);
  } catch (e) {
    console.log('[push] empreinte illisible, réenregistrement forcé', e);
    return true;
  }
}

/**
 * Mémorise l'enregistrement comme envoyé.
 *
 * <p>À n'appeler QU'APRÈS un `enregistrerAppareil` réussi : mémoriser malgré un échec ferait
 * passer un appareil jamais enregistré pour un appareil à jour, et il ne serait plus réessayé.
 */
export async function memoriserEnvoi(appareil: EnregistrementAppareil): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_DERNIER_ENREGISTREMENT, empreinte(appareil));
  } catch (e) {
    console.log('[push] empreinte non mémorisée', e);
  }
}

/**
 * Oublie l'empreinte, sans toucher aux préférences.
 *
 * <p>Après une suppression d'appareil (déconnexion, suppression de compte) : la ligne n'existe
 * plus côté backend, un futur enregistrement doit donc repartir même si la charge utile est
 * identique. Sans cet oubli, la reconnexion serait vue comme « déjà enregistrée, rien n'a
 * changé » et l'appareil ne recevrait plus jamais rien, sans que rien ne l'indique.
 */
export async function oublierEnvoi(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLE_DERNIER_ENREGISTREMENT);
  } catch (e) {
    console.log('[push] empreinte non effacée', e);
  }
}
