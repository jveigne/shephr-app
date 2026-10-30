import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Modal } from './ui';
import type { AuthResponse } from '../services/authApi';
import {
  confirmFederatedLink,
  resendFederatedLinkCode,
  type LinkConfirmationRequired,
} from '../services/socialAuthApi';
import { linkConfirmErrorMessage } from '../utils/socialAuthErrors';

// ---------------------------------------------------------------------------------------------
//  Confirmation de la liaison Google / Apple trouvée par IDENTIFIANT — D-MKT-05, JP 28/10
//  (plan 28_10_2026/05 §2.3, RG-MKT-55 / 56 ; lève le risque §12 n°14 du plan 03).
//  Ouverte SEULEMENT sur une réponse 202 `LINK_CONFIRMATION_REQUIRED` de `/api/auth/oauth/google|apple` :
//  un compte Shephr porte déjà cette adresse comme identifiant, jamais prouvée — le serveur n'a rien
//  lié ni ouvert de session, et a envoyé un code à 6 chiffres à cette adresse.
//  - `challengeId` reste EN MÉMOIRE (props de ce composant), jamais dans l'URL ni le stockage.
//  - Succès → `onSession(authResponse)` : même chemin qu'un Google / Apple réussi (`establishSession`
//    puis `routeAfterLogin` avec le `next` conservé par /login).
//  - 410 (défi mort, 5ᵉ code faux) / 409 / 403 → message sous le formulaire et fermeture ;
//    422 → « Code incorrect. », champ vidé ; 429 → « patientez ».
//  - « Renvoyer le code » inactif pendant `resendInSeconds` (compte à rebours, valeur du serveur).
// ---------------------------------------------------------------------------------------------

/** Attente du renvoi après un 429 sans `Retry-After` lisible : l'espacement minimal du serveur (60 s). */
const RESEND_FALLBACK_SECONDS = 60;

export function LinkConfirmModal({
  challenge,
  provider,
  onSession,
  onClose,
}: {
  challenge: LinkConfirmationRequired;
  /** « Google » ou « Apple » (nom de marque, non traduit). */
  provider: string;
  onSession: (res: AuthResponse) => Promise<void>;
  /** Fermeture ; `message` = refus définitif à afficher sous le formulaire de /login. */
  onClose: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState(challenge.maskedEmail);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() => Date.now() + Math.max(0, challenge.resendInSeconds) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Compte à rebours du renvoi (une seconde) — s'arrête de lui-même une fois le délai passé.
  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const id = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(id);
  }, [waitSeconds, now]);

  const valid = /^\d{6}$/.test(code);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    let res: AuthResponse;
    try {
      res = await confirmFederatedLink(challenge.challengeId, code);
    } catch (err) {
      const r = linkConfirmErrorMessage(err, t, provider);
      setBusy(false);
      if (r.close) {
        onClose(r.message);
        return;
      }
      if (r.clearCode) setCode('');
      setError(r.message);
      inputRef.current?.focus();
      return;
    }
    // Session ouverte par l'appelant (/login garde le `next`) ; la modale disparaît avec la navigation.
    try {
      await onSession(res);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (waitSeconds > 0 || resending) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const r = await resendFederatedLinkCode(challenge.challengeId);
      setMaskedEmail(r.maskedEmail || maskedEmail);
      setResendAt(Date.now() + Math.max(0, r.resendInSeconds) * 1000);
      setNow(Date.now());
      setCode('');
      setInfo(t('login.social.linkConfirm.resent'));
    } catch (err) {
      const r = linkConfirmErrorMessage(err, t, provider);
      if (r.close) {
        onClose(r.message);
        return;
      }
      // Constat MKT n°4 (plan 28_10_2026/05 §10.6, JP 29/10) : un 429 relance le compte à rebours —
      // `Retry-After` s'il est lisible (exposition CORS non garantie), sinon 60 s (espacement serveur).
      const res = (err as { response?: { status?: number; headers?: Record<string, unknown> } })?.response;
      if (res?.status === 429) {
        const retryAfter = Number(res.headers?.['retry-after']);
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : RESEND_FALLBACK_SECONDS;
        setResendAt(Date.now() + wait * 1000);
        setNow(Date.now());
      }
      setError(r.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose(null)}
      title={t('login.social.linkConfirm.title')}
      sub={t('login.social.linkConfirm.intro', { provider, email: maskedEmail })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)} disabled={busy}>
            {t('login.social.linkConfirm.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="link-confirm-form" disabled={!valid || busy}>
            {busy ? t('login.social.linkConfirm.checking') : t('login.social.linkConfirm.submit')}
          </Button>
        </>
      }
    >
      <form id="link-confirm-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={t('login.social.linkConfirm.code')} hint={t('login.social.linkConfirm.codeHint')} style={{ margin: 0 }}>
          {/* <input> natif : `Input` de ui.tsx ne transmet pas de ref (focus après une erreur). */}
          {/* Constat MKT n°4 (JP 29/10) : nom accessible du champ (le `label` de `Field` n'est pas lié). */}
          <input
            ref={inputRef}
            id="link-confirm-code"
            aria-label={t('login.social.linkConfirm.code')}
            className="input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            aria-invalid={!!error}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: '.3em', textAlign: 'center' }}
          />
        </Field>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: 13.5 }}>
            {error}
          </p>
        )}
        {info && (
          <p role="status" style={{ margin: 0, color: 'var(--ok)', fontSize: 13.5 }}>
            {info}
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={resend}
            disabled={waitSeconds > 0 || resending}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5,
              fontWeight: 600,
              color: waitSeconds > 0 || resending ? 'var(--ink-400)' : 'var(--green-700)',
              cursor: waitSeconds > 0 || resending ? 'default' : 'pointer',
            }}
          >
            {waitSeconds > 0 ? t('login.social.linkConfirm.resendIn', { seconds: waitSeconds }) : t('login.social.linkConfirm.resend')}
          </button>
        </div>
        <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 12.5, lineHeight: 1.5 }}>{t('login.social.linkConfirm.notMine')}</p>
      </form>
    </Modal>
  );
}
