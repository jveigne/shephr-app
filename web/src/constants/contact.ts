/** Adresse de contact unique de Shephr (landing, page de suppression de compte, menu de l'app). */
export const CONTACT_EMAIL = 'jexcellence2065@gmail.com';

/** Lien `mailto:` avec un objet pré-rempli (déjà encodé). */
export const contactMailto = (subject?: string) =>
  subject ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}` : `mailto:${CONTACT_EMAIL}`;
