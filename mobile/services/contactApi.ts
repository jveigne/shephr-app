import { useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_WHATSAPP_NUMBER } from '../constants/contact';

/**
 * Coordonnées de support de la plateforme (JP 31/07) — pilotées depuis le back-office.
 *
 * <p>Le serveur calcule lui-même `whatsappUrl` : le format `wa.me` peut changer sans qu'on ait à
 * republier l'application sur les stores.
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

let current: ContactSettings = FALLBACK;
const listeners = new Set<(s: ContactSettings) => void>();

export const getContactSettings = (): ContactSettings => current;

/**
 * Recharge les coordonnées depuis le serveur. Endpoint PUBLIC : appelable avant connexion, ce qui
 * compte pour l'écran de rattachement à une assemblée.
 *
 * <p>Ne lève jamais : hors réseau, on garde la dernière valeur connue (ou le repli).
 */
export async function loadContactSettings(): Promise<ContactSettings> {
  try {
    const { data } = await apiClient.get<ContactSettings>('/api/app/contact');
    if (data?.email && data?.whatsappUrl) {
      current = data;
      listeners.forEach((l) => l(current));
    }
  } catch {
    // silencieux : le repli est déjà en place, inutile d'alarmer l'utilisateur
  }
  return current;
}

/** S'abonne aux coordonnées ; rerend l'écran si elles changent en cours de session. */
export function useContactSettings(): ContactSettings {
  const [settings, setSettings] = useState(current);
  useEffect(() => {
    listeners.add(setSettings);
    return () => { listeners.delete(setSettings); };
  }, []);
  return settings;
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
