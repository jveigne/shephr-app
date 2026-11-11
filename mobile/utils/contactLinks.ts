import { Linking } from 'react-native';

// ---------------------------------------------------------------------------------------------
//  Relance d'une personne — Q7 (décision par défaut, JP 11/11, contrat 11/11 §9.1) : boutons Appeler /
//  WhatsApp / E-mail sur la fiche et dans la liste des inscrits, AUCUN envoi groupé. Liens composés ici
//  (même logique que `web/src/utils/contactLinks.ts`) ; chaque bouton est masqué si la donnée manque.
// ---------------------------------------------------------------------------------------------

/** Chiffres de l'indicatif + du numéro (« +33 », « 33 », « 0033 » → « 33 » ; le 0 national est retiré). */
export function internationalDigits(phone: string | null | undefined, dial: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  // Numéro déjà international : on le garde tel quel.
  if (raw.startsWith('+') || raw.startsWith('00')) {
    const digits = raw.replace(/^00/, '').replace(/\D/g, '');
    return digits.length >= 6 ? digits : null;
  }
  const national = raw.replace(/\D/g, '').replace(/^0+/, '');
  const code = (dial ?? '').replace(/^00/, '').replace(/\D/g, '');
  const digits = code ? `${code}${national}` : raw.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

/** `tel:+{indicatif}{numéro}` (sans indicatif connu : le numéro tel que saisi). */
export function telUrl(phone: string | null | undefined, dial: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  const intl = internationalDigits(phone, dial);
  if (intl && (dial || raw.startsWith('+') || raw.startsWith('00'))) return `tel:+${intl}`;
  const local = raw.replace(/[^\d+]/g, '');
  return local ? `tel:${local}` : null;
}

/** `https://wa.me/{chiffres}` — exige un numéro international (indicatif connu ou numéro en +). */
export function whatsappUrl(phone: string | null | undefined, dial: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw || (!dial && !raw.startsWith('+') && !raw.startsWith('00'))) return null;
  const intl = internationalDigits(phone, dial);
  return intl ? `https://wa.me/${intl}` : null;
}

/** `mailto:` — adresse seulement (aucun objet ni corps imposé). */
export function mailtoUrl(email: string | null | undefined): string | null {
  const e = (email ?? '').trim();
  return e && e.includes('@') ? `mailto:${e}` : null;
}

/** Ouvre un lien de contact ; un échec (aucune app pour ce schéma) est silencieux. */
export function openContactLink(url: string | null): void {
  if (url) Linking.openURL(url).catch(() => undefined);
}
