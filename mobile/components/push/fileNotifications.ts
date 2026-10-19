/**
 * Le fil entre le push et la file in-app — lot N4c (J-3 14/09).
 *
 * <p><b>Le push TRANSPORTE une notification qui existe déjà en base, il ne la remplace pas.</b>
 * `NotificationGate` reste la seule chose qui affiche une relance : quelqu'un qui a refusé les
 * notifications système, dont le jeton est mort ou qui a coupé l'interrupteur « Rappels » la
 * lit quand même à l'ouverture de l'application. Ce module n'ajoute donc AUCUN affichage — il
 * demande seulement à la porte déjà montée de recharger sa file, quand un tap sur une bannière
 * signale qu'il y a du nouveau et que l'application était déjà ouverte en arrière-plan.
 *
 * <p>Deux abonnements, deux besoins distincts, volontairement dans le même petit module :
 * <ul>
 *   <li>{@link abonnerRechargement} — le routeur de tap réveille la file ;</li>
 *   <li>{@link declarerGateOuverte} — la porte dit qu'elle occupe l'écran, pour que
 *       l'invitation d'activation ne vienne pas s'empiler par-dessus au premier lancement.
 *       Deux `Modal` affichées en même temps ne laissent voir que la dernière.</li>
 * </ul>
 *
 * <p>Un module et non un contexte React : le routeur de tap est appelé depuis des écouteurs
 * natifs, hors de l'arbre, et `NotificationGate` vit sous les onglets alors que le push est
 * monté à la racine. Un contexte commun supposerait de remonter l'un des deux.
 */

/** Relecture de la file demandée par un tap ; `notificationId` du cas mono-destinataire. */
type EcouteurRechargement = (notificationId?: string) => void;

const ecouteurs = new Set<EcouteurRechargement>();

/**
 * Rechargement demandé avant que la porte ne soit montée.
 *
 * <p>Au démarrage à froid, le tap est relevé pendant que l'arbre de navigation se monte : la
 * demande arriverait dans le vide. On la garde, et le premier abonné la consomme. Sans cela, la
 * personne qui ouvre l'application DEPUIS la bannière n'aurait rien à l'écran — précisément le
 * cas que le push est censé servir.
 */
let enAttente: { notificationId?: string } | null = null;

/**
 * Abonne `NotificationGate` aux demandes de rechargement.
 *
 * @returns la fonction de désabonnement, à rendre depuis l'effet.
 */
export function abonnerRechargement(ecouteur: EcouteurRechargement): () => void {
  ecouteurs.add(ecouteur);
  if (enAttente) {
    const demande = enAttente;
    enAttente = null;
    ecouteur(demande.notificationId);
  }
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/**
 * Demande le rechargement de la file des non-lues.
 *
 * <p>Ne lève jamais : elle est appelée depuis un écouteur natif, où une exception ne serait
 * rattrapée nulle part.
 */
export function rechargerFileNotifications(notificationId?: string): void {
  if (ecouteurs.size === 0) {
    enAttente = { notificationId };
    return;
  }
  ecouteurs.forEach((ecouteur) => {
    try {
      ecouteur(notificationId);
    } catch (e) {
      console.log('[push] rechargement de la file impossible', e);
    }
  });
}

/** Une modale de `NotificationGate` occupe-t-elle l'écran ? */
let gateOuverte = false;
const ecouteursGate = new Set<(ouverte: boolean) => void>();

/** Déclaré par `NotificationGate` à chaque rendu : `true` tant qu'une modale est affichée. */
export function declarerGateOuverte(ouverte: boolean): void {
  if (gateOuverte === ouverte) return;
  gateOuverte = ouverte;
  ecouteursGate.forEach((ecouteur) => ecouteur(ouverte));
}

/** État courant, pour qui se monte après la porte. */
export function gateEstOuverte(): boolean {
  return gateOuverte;
}

/** Abonne aux ouvertures et fermetures de la porte. Rend la fonction de désabonnement. */
export function abonnerGate(ecouteur: (ouverte: boolean) => void): () => void {
  ecouteursGate.add(ecouteur);
  return () => {
    ecouteursGate.delete(ecouteur);
  };
}
