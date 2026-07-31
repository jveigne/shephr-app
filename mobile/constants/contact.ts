/**
 * Coordonnées de repli de l'équipe Shephr.
 *
 * <p>Depuis le 31/07, les coordonnées RÉELLES viennent du back-office (`services/contactApi`) —
 * ces valeurs ne servent que tant que le serveur n'a pas répondu, ou s'il est injoignable
 * (l'app mobile peut très bien s'ouvrir hors réseau). Un écran d'aide ne doit jamais se
 * retrouver sans canal de contact.
 *
 * <p>Pour changer les coordonnées, passe par le back-office, PAS par ce fichier.
 */
export const DEFAULT_CONTACT_EMAIL = 'jexcellence2065@gmail.com';

/** Format international sans « + » ni séparateur — c'est ce qu'attend `wa.me`. */
export const DEFAULT_CONTACT_WHATSAPP_NUMBER = '33754596796';
