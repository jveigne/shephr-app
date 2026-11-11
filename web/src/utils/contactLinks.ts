/**
 * Q7 (JP 11/11, contrat 11_11_2026/02 §9.1) — relance d'une personne : boutons Appeler / WhatsApp / E-mail composés
 * par le front, masqués si la donnée manque. AUCUN envoi groupé. Même logique que `mobile/utils/contactLinks.ts`.
 *
 * `phoneCountryCode` = indicatif (t_user.country_code, « 33 », « +33 » ou « 0033 ») ; `phoneNumber` = numéro saisi.
 */

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D+/g, '');

/**
 * Numéro international en chiffres seuls (indicatif + numéro sans 0 national), null si absent ou trop court
 * (< 6 chiffres). Sans indicatif connu et hors numéro « + » / « 00 » : les chiffres tels que saisis — ce n'est
 * PAS un numéro international (`telHref` n'y met pas de « + », `whatsappHref` renvoie null). Règles identiques à
 * `mobile/utils/contactLinks.ts` (contrat §9.1 — même sortie des deux côtés).
 */
export function internationalDigits(phoneNumber: string | null | undefined, phoneCountryCode: string | null | undefined): string | null {
  const raw = (phoneNumber ?? '').trim();
  if (!raw) return null;
  // Numéro déjà international (« +33… » / « 0033… ») : pris tel quel.
  if (raw.startsWith('+') || raw.startsWith('00')) {
    const d = digits(raw.replace(/^00/, ''));
    return d.length >= 6 ? d : null;
  }
  const national = digits(raw).replace(/^0+/, '');
  const cc = digits(phoneCountryCode).replace(/^00/, '');
  const d = cc ? `${cc}${national}` : digits(raw);
  return d.length >= 6 ? d : null;
}

const isInternational = (raw: string, phoneCountryCode: string | null | undefined) =>
  !!(phoneCountryCode ?? '').trim() || raw.startsWith('+') || raw.startsWith('00');

/** `tel:+{indicatif}{numéro}` ; sans indicatif connu : le numéro tel que saisi (aucun « + », 0 de tête gardé). */
export function telHref(phoneNumber: string | null | undefined, phoneCountryCode: string | null | undefined): string | null {
  const raw = (phoneNumber ?? '').trim();
  if (!raw) return null;
  const intl = internationalDigits(phoneNumber, phoneCountryCode);
  if (intl && isInternational(raw, phoneCountryCode)) return `tel:+${intl}`;
  const local = raw.replace(/[^\d+]/g, '');
  return local ? `tel:${local}` : null;
}

/** `https://wa.me/{chiffres}` — exige un numéro international (indicatif connu ou numéro en « + » / « 00 »). */
export function whatsappHref(phoneNumber: string | null | undefined, phoneCountryCode: string | null | undefined): string | null {
  const raw = (phoneNumber ?? '').trim();
  if (!raw || !isInternational(raw, phoneCountryCode)) return null;
  const intl = internationalDigits(phoneNumber, phoneCountryCode);
  return intl ? `https://wa.me/${intl}` : null;
}

export function mailtoHref(email: string | null | undefined): string | null {
  const e = (email ?? '').trim();
  return e && e.includes('@') ? `mailto:${e}` : null;
}

/** Affichage lisible : « +33 6 12 34 56 78 » n'est pas reformaté, on montre « +{indicatif} {numéro} ». */
export function phoneDisplay(phoneNumber: string | null | undefined, phoneCountryCode: string | null | undefined): string | null {
  const raw = (phoneNumber ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('+')) return raw;
  const cc = digits(phoneCountryCode).replace(/^00/, '');
  return cc ? `+${cc} ${raw}` : raw;
}
