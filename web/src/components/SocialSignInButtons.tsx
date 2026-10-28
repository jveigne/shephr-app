import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthResponse } from '../services/authApi';
import { loginWithAppleToken, loginWithGoogleToken } from '../services/socialAuthApi';
import { APPLE_WEB, GOOGLE_WEB_CLIENT_ID } from '../config/oauth';
import { loadScript } from '../utils/loadScript';
import { socialAuthErrorMessage } from '../utils/socialAuthErrors';

// ---------------------------------------------------------------------------------------------
//  Boutons « Continuer avec Google / Apple » du web — D-PAY-06, JP 28/10 (lève l'exception D-WEB-01
//  sur ce point ; RG-PAY-43 à 45). Mêmes routes backend que le mobile (`/api/auth/oauth/google|apple`,
//  `app: 'SHEPHR'`), ouvertes à tous les comptes (D-ABO-14). Chaque bouton est MASQUÉ tant que son
//  identifiant n'est pas configuré (`config/oauth.ts`) ; le SDK du fournisseur n'est chargé que si son
//  bouton est affiché. Le composant rend l'`AuthResponse` à l'appelant (`/login`), qui ouvre la session
//  et garde le `next` (RG-PAY-44). Fermer la popup → aucun message.
// ---------------------------------------------------------------------------------------------

const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_JS_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

interface GoogleCredentialResponse {
  credential?: string;
}
interface GoogleIdApi {
  initialize: (cfg: { client_id: string; callback: (r: GoogleCredentialResponse) => void; ux_mode?: 'popup' }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}
interface AppleSignInResponse {
  authorization?: { code?: string; id_token?: string; state?: string };
  user?: { email?: string; name?: { firstName?: string; lastName?: string } };
}
interface AppleIdApi {
  auth: {
    init: (cfg: { clientId: string; scope: string; redirectURI: string; usePopup: boolean; nonce: string; state?: string }) => void;
    signIn: () => Promise<AppleSignInResponse>;
  };
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
    AppleID?: AppleIdApi;
  }
}

/** 32 octets aléatoires en hexadécimal — le nonce en clair envoyé au backend. */
function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hexadécimal minuscule — ce qu'Apple reçoit comme `nonce` (RG-PAY-41). */
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Codes d'annulation de Sign in with Apple JS : l'utilisateur a fermé la popup — aucun message. */
const APPLE_CANCEL = new Set(['popup_closed_by_user', 'user_cancelled_authorize', 'user_trigger_new_signin_flow']);

export function SocialSignInButtons({
  onSession,
  onError,
  disabled,
}: {
  /** Réponse du backend (= login Shephr) ; l'appelant ouvre la session et route. */
  onSession: (res: AuthResponse) => Promise<void>;
  /** Message traduit, ou `null` pour effacer l'erreur précédente. */
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (!GOOGLE_WEB_CLIENT_ID && !APPLE_WEB) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div
        aria-hidden
        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-400)', fontSize: 13, margin: '0 0 14px' }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--line, #e5e1d8)' }} />
        {t('login.social.or')}
        <span style={{ flex: 1, height: 1, background: 'var(--line, #e5e1d8)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
        {GOOGLE_WEB_CLIENT_ID && <GoogleButton clientId={GOOGLE_WEB_CLIENT_ID} onSession={onSession} onError={onError} />}
        {APPLE_WEB && <AppleButton cfg={APPLE_WEB} onSession={onSession} onError={onError} disabled={disabled} />}
      </div>
    </div>
  );
}

function GoogleButton({
  clientId,
  onSession,
  onError,
}: {
  clientId: string;
  onSession: (res: AuthResponse) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Les rappels changent à chaque rendu : on lit toujours la dernière version (le SDK garde le premier).
  const cbRef = useRef({ onSession, onError, t });
  cbRef.current = { onSession, onError, t };

  useEffect(() => {
    let cancelled = false;
    loadScript(GOOGLE_GSI_SRC)
      .then(() => {
        const api = window.google?.accounts?.id;
        if (cancelled || !api || !hostRef.current) return;
        api.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (r) => {
            const { onSession: done, onError: fail, t: tr } = cbRef.current;
            if (!r.credential) return; // annulation : aucun message
            fail(null);
            loginWithGoogleToken(r.credential)
              .then(done)
              .catch((e) => fail(socialAuthErrorMessage(e, tr)));
          },
        });
        hostRef.current.innerHTML = '';
        api.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, hostRef.current.offsetWidth || 320),
          locale: i18n.language.startsWith('en') ? 'en' : 'fr',
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, i18n.language]);

  if (failed) return null; // SDK injoignable (bloqueur, réseau) : le mot de passe reste disponible
  return <div ref={hostRef} aria-label={t('login.social.google')} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />;
}

function AppleButton({
  cfg,
  onSession,
  onError,
  disabled,
}: {
  cfg: { servicesId: string; redirectUri: string };
  onSession: (res: AuthResponse) => Promise<void>;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Paire (nonce en clair, SHA-256) calculée À L'AVANCE (au montage, puis après chaque tentative) :
  // `crypto.subtle.digest` est asynchrone, et un `await` avant `AppleID.auth.signIn()` ferait sortir
  // l'ouverture de la popup du geste de l'utilisateur — Safari (macOS / iOS) la bloquerait.
  // D-PAY-06 (JP 28/10, RG-PAY-43..45 ; constat de vérification « popup Apple après await »).
  const [nonce, setNonce] = useState<{ raw: string; hashed: string } | null>(null);

  const prepareNonce = () => {
    const raw = randomHex();
    setNonce(null);
    sha256Hex(raw)
      .then((hashed) => setNonce({ raw, hashed }))
      .catch(() => setFailed(true)); // contexte non sécurisé (pas de crypto.subtle) : bouton masqué
  };

  useEffect(() => {
    let cancelled = false;
    loadScript(APPLE_JS_SRC)
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setFailed(true));
    prepareNonce();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    const api = window.AppleID;
    if (!api || !nonce) return;
    // Un nonce neuf par tentative : Apple reçoit son SHA-256, le backend le refait depuis le clair.
    const rawNonce = nonce.raw;
    onError(null);
    setBusy(true);
    try {
      // init + signIn SYNCHRONES dans le clic (aucun await avant) : la popup reste dans le geste.
      api.auth.init({
        clientId: cfg.servicesId,
        scope: 'name email',
        redirectURI: cfg.redirectUri,
        usePopup: true,
        nonce: nonce.hashed,
      });
      const signIn = api.auth.signIn();
      let resp: AppleSignInResponse;
      try {
        resp = await signIn;
      } catch (e) {
        const code = (e as { error?: string })?.error;
        if (!code || !APPLE_CANCEL.has(code)) onError(t('login.social.errors.generic'));
        return;
      }
      const identityToken = resp.authorization?.id_token;
      const authorizationCode = resp.authorization?.code;
      if (!identityToken || !authorizationCode) {
        onError(t('login.social.errors.generic'));
        return;
      }
      try {
        const res = await loginWithAppleToken({
          identityToken,
          authorizationCode,
          rawNonce,
          // Nom et email : fournis par Apple à la PREMIÈRE autorisation seulement.
          ...(resp.user?.name?.firstName ? { givenName: resp.user.name.firstName } : {}),
          ...(resp.user?.name?.lastName ? { familyName: resp.user.name.lastName } : {}),
          ...(resp.user?.email ? { email: resp.user.email } : {}),
        });
        await onSession(res);
      } catch (e) {
        onError(socialAuthErrorMessage(e, t));
      }
    } finally {
      setBusy(false);
      prepareNonce(); // nonce consommé : la tentative suivante en reçoit un neuf
    }
  };

  if (failed) return null;
  return (
    <button
      type="button"
      onClick={start}
      disabled={!ready || !nonce || busy || disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 44,
        borderRadius: 4,
        border: '1px solid #000',
        background: '#000',
        color: '#fff',
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        fontWeight: 500,
        cursor: !ready || !nonce || busy ? 'default' : 'pointer',
        opacity: !ready || !nonce || busy || disabled ? 0.7 : 1,
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
      }}
    >
      <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden fill="currentColor">
        <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-58-156-128C44 790 0 666 0 549c0-189 123-289 244-289 64 0 118 42 158 42 38 0 98-45 171-45 28 0 128 3 194 84zM555 165c30-36 52-86 52-136 0-7-1-14-2-19-49 2-108 33-143 74-28 32-54 82-54 133 0 8 1 15 2 18 3 1 9 1 14 1 45 0 101-30 131-71z" />
      </svg>
      {t('login.social.apple')}
    </button>
  );
}
