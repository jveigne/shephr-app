import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { exchangeHandoff } from '../services/authApi';

/**
 * Jeton de passage app → web — D-PAY-05, JP 28/10 (RG-PAY-13 / 14, contrat 28_10_2026/03 §3.1).
 *
 * « En savoir plus » de l'app, pour un compte connecté, ouvre `/offres?offer=…#handoff={jeton}` : jeton à
 * usage UNIQUE, 2 min, lié au compte. Le FRAGMENT n'est jamais envoyé au serveur ni journalisé ; on
 * l'efface quand même de la barre d'adresse (`history.replaceState`, query `?offer=` conservée) AVANT tout
 * appel réseau, pour qu'un copier-coller ou un rechargement ne le rejoue pas.
 * - Session web déjà ouverte (`useAuth().token`) → jeton ignoré (effacé, pas échangé).
 * - Sinon `POST /api/church/auth/handoff/exchange` → `establishSession` (même session que le login).
 * - Tout échec (410 `HANDOFF_INVALID`, 429, réseau) → page publique inchangée, AUCUN message.
 * Le jeton ne transporte aucune URL (RG-PAY-11) : la page de destination reste celle-ci.
 *
 * Rend `true` après un échange réussi : la page affiche alors « Connecté en tant que … — Ce n'est pas
 * vous ? Se déconnecter » (RG-PAY-14, garde-fou contre un lien de connexion forgé).
 */
const HANDOFF_RE = /(?:^|&)handoff=([^&]*)/;

function takeHandoffFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const m = HANDOFF_RE.exec(hash);
  if (!m) return null;
  // Effacé tout de suite, avant l'appel réseau ; on garde l'état de l'historique (clé du routeur).
  const rest = hash.replace(HANDOFF_RE, '').replace(/^&/, '');
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search + (rest ? `#${rest}` : ''),
  );
  let token: string | null = null;
  try {
    token = decodeURIComponent(m[1]);
  } catch {
    token = null;
  }
  return token && token.length <= 128 ? token : null;
}

export function useHandoffExchange(): boolean {
  const { ready, token, establishSession } = useAuth();
  // Garde contre le double montage de StrictMode : les refs survivent au second passage.
  const pendingRef = useRef<string | null | undefined>(undefined);
  const doneRef = useRef(false);
  const [exchanged, setExchanged] = useState(false);

  // Lecture + effacement du fragment au montage, sans attendre la restauration de session.
  useEffect(() => {
    if (pendingRef.current === undefined) pendingRef.current = takeHandoffFromHash();
  }, []);

  useEffect(() => {
    if (!ready || doneRef.current) return;
    const handoff = pendingRef.current;
    if (!handoff) return;
    doneRef.current = true;
    pendingRef.current = null;
    if (token) return; // RG-PAY-13 : une session web existe déjà — jeton ignoré.
    exchangeHandoff(handoff)
      .then((res) => establishSession(res.token))
      .then(() => setExchanged(true))
      .catch(() => {
        /* RG-PAY-13 : jeton expiré / déjà utilisé / invalide → page publique, sans erreur affichée. */
      });
  }, [ready, token, establishSession]);

  return exchanged;
}
