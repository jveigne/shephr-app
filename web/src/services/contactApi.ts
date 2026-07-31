import { useQuery } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_WHATSAPP_NUMBER } from '../constants/contact';

/**
 * Coordonnées de support de la plateforme (JP 31/07) — pilotées depuis le back-office.
 *
 * <p>Le serveur calcule lui-même `whatsappUrl` : le format `wa.me` peut changer sans qu'on ait à
 * redéployer les fronts.
 */
export interface ContactSettings {
  email: string;
  whatsappNumber: string;
  whatsappUrl: string;
}

const FALLBACK: ContactSettings = {
  email: DEFAULT_CONTACT_EMAIL,
  whatsappNumber: DEFAULT_CONTACT_WHATSAPP_NUMBER,
  whatsappUrl: `https://wa.me/${DEFAULT_CONTACT_WHATSAPP_NUMBER}`,
};

/**
 * Dernière valeur connue, tenue à jour par {@link useContactSettings}.
 *
 * <p>Elle existe parce que les constructeurs de liens ci-dessous sont appelés hors composant
 * (handlers, helpers) : ils ont besoin d'une valeur SYNCHRONE. Avant la première réponse du
 * serveur, c'est le repli qui sert.
 */
let current: ContactSettings = FALLBACK;

export const getContactSettings = (): ContactSettings => current;

/** Endpoint PUBLIC : consultable avant connexion (landing, suppression de compte). */
export async function fetchContactSettings(): Promise<ContactSettings> {
  const { data } = await apiClient.get<ContactSettings>('/api/app/contact');
  return data;
}

/**
 * Lit les coordonnées et fait re-rendre le composant quand elles arrivent.
 *
 * <p>Ne renvoie jamais `undefined` : en cas d'erreur réseau on rend le repli, ce qui garde la page
 * fonctionnelle au lieu d'afficher un bloc de contact vide.
 */
export function useContactSettings(): ContactSettings {
  const { data } = useQuery({
    queryKey: ['app', 'contact'],
    queryFn: fetchContactSettings,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  if (data) current = data;
  return data ?? current;
}

/** Lien `mailto:` avec objet et corps pré-remplis (déjà encodés) — les deux facultatifs. */
export const contactMailto = (subject?: string, body?: string) => {
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : null,
    body ? `body=${encodeURIComponent(body)}` : null,
  ].filter(Boolean);
  return params.length ? `mailto:${current.email}?${params.join('&')}` : `mailto:${current.email}`;
};

/** Lien WhatsApp avec un message pré-rempli (déjà encodé). */
export const contactWhatsapp = (text?: string) =>
  text ? `${current.whatsappUrl}?text=${encodeURIComponent(text)}` : current.whatsappUrl;
