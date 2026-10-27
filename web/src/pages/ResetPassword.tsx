import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Button, Field, Input } from '../components/ui';
import { AuthPageLayout } from '../components/AuthPageLayout';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { requestPasswordReset, resetPassword } from '../services/passwordResetApi';
import {
  classifyPasswordResetError,
  passwordResetErrorMessage,
  type PasswordResetError,
} from '../utils/passwordResetErrors';
import { routeAfterLogin } from '../utils/authRouting';
import { uiLanguage, type ResetPasswordLocationState } from './ForgotPassword';

/** Valeurs du backend (`ResetCodeRules`), si l'état de navigation manque (rechargement, lien direct). */
const DEFAULT_RESEND_AFTER_SECONDS = 60;
const DEFAULT_VALIDITY_MINUTES = 15;

const positiveInt = (raw: unknown, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/**
 * Mot de passe oublié, écran 2 — D-WEB-05 (JP 27/10), Parité mobile → web (décision n°3) : port de
 * `mobile/app/(auth)/reset-password.tsx`. Code à 6 chiffres + nouveau mot de passe confirmé →
 * `POST /api/auth/password/reset`.
 *
 * - L'identifiant (`?identifier=`) est celui envoyé à `/forgot`, renvoyé TEL QUEL : le code est lié
 *   à la demande, sinon le serveur répond `INVALID_CODE`.
 * - « Renvoyer le code » n'est actif qu'après `resendAfterSeconds` (compté depuis le `/forgot`
 *   réussi). Tout nouveau code rend les précédents invalides.
 * - Code expiré ou trop d'essais : la saisie est fermée jusqu'à un nouveau code. Trop de demandes
 *   (429) : le bouton reste bloqué pendant `Retry-After` (60 s si l'en-tête n'est pas lisible).
 * - Succès : la réponse est celle du login Shephr ; `establishSession` puis le même routage qu'après
 *   une connexion (`utils/authRouting`).
 */
export function ResetPasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { ready, isAuthenticated, me, establishSession, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const identifier = searchParams.get('identifier') ?? '';
  const navState = (location.state ?? {}) as ResetPasswordLocationState;

  const [validityMinutes, setValidityMinutes] = useState(() =>
    positiveInt(navState.codeValidityMinutes, DEFAULT_VALIDITY_MINUTES),
  );
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<PasswordResetError | null>(null);
  /** Compte sans espace web après la réinitialisation (mot de passe changé, session ouverte). */
  const [denied, setDenied] = useState(false);
  /** Code expiré ou trop d'essais : seul un nouveau code rouvre la saisie. */
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState(
    () => Date.now() + positiveInt(navState.resendAfterSeconds, DEFAULT_RESEND_AFTER_SECONDS) * 1000,
  );
  /** 429 `TOO_MANY_REQUESTS` : pas de nouvel essai avant cette date (`Retry-After`). */
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /**
   * Posé AVANT l'appel : dès que la session s'ouvre, `isAuthenticated` passe à vrai et la garde
   * ci-dessous renverrait vers l'accueil — alors que le routage de la réinitialisation doit gagner.
   */
  const [signingIn, setSigningIn] = useState(false);

  // Compte à rebours (renvoi, blocage 429) : une horloge à la seconde tant qu'il en reste un.
  const ticking = resendAt > now || blockedUntil > now;
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  // Session déjà ouverte en arrivant : renvoi vers son accueil.
  useEffect(() => {
    if (signingIn || !ready || !isAuthenticated || !me) return;
    if (routeAfterLogin(me, null, navigate) === 'denied') navigate('/', { replace: true });
  }, [signingIn, ready, isAuthenticated, me, navigate]);

  // Atteint sans passer par l'écran 1 (lien direct sans identifiant) : rien à vérifier.
  if (!identifier) return <Navigate to="/forgot-password" replace />;

  const blocked = blockedUntil > now;
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const blockedFor = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  const passwordTooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && confirm !== password;
  const formValid =
    code.length === 6 && password.length >= 6 && confirm === password && !needsNewCode && !blocked;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    setSigningIn(true);
    let token: string;
    try {
      const res = await resetPassword({
        identifier,
        // Le serveur ne retire que les espaces de bord : seuls les chiffres partent.
        code: code.replace(/\D/g, ''),
        newPassword: password,
      });
      token = res.token;
    } catch (err) {
      setSigningIn(false);
      setSubmitting(false);
      const classified = classifyPasswordResetError(err);
      setError(classified);
      if (classified.kind === 'CODE_EXPIRED' || classified.kind === 'TOO_MANY_ATTEMPTS') setNeedsNewCode(true);
      if (classified.kind === 'INVALID_CODE') setCode('');
      if (classified.kind === 'TOO_MANY_REQUESTS') {
        setBlockedUntil(Date.now() + (classified.retryAfterSeconds ?? 60) * 1000);
        setNow(Date.now());
      }
      return;
    }
    // Hors du try du reset : le mot de passe est changé ; un incident à l'ouverture de la session
    // n'est pas une erreur de code — on renvoie alors vers /login, où le nouveau mot de passe marche.
    try {
      const sessionMe = await establishSession(token);
      const outcome = routeAfterLogin(sessionMe, null, navigate);
      if (outcome === 'welcome') {
        push({ kind: 'ok', title: t('forgotPassword.successToast'), msg: t('forgotPassword.successToastMsg') });
      } else if (outcome === 'denied') {
        setDenied(true);
      }
    } catch {
      // Jeton posé mais profil illisible : on ne laisse pas une demi-session derrière soi.
      await logout();
      push({ kind: 'ok', title: t('forgotPassword.successToast'), msg: t('forgotPassword.signInAgain') });
      navigate(`/login`, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || resending) return;
    setResending(true);
    try {
      const res = await requestPasswordReset(identifier, uiLanguage(i18n.language));
      const sentAt = Date.now();
      setResendAt(sentAt + res.resendAfterSeconds * 1000);
      setNow(sentAt);
      setValidityMinutes(res.codeValidityMinutes);
      setResent(true);
      setNeedsNewCode(false);
      setCode('');
      // Un éventuel blocage 429 vient de `/reset` et ne dépend pas du code : il demeure.
      setError((prev) => (prev?.kind === 'TOO_MANY_REQUESTS' ? prev : null));
    } catch (err) {
      setError(classifyPasswordResetError(err));
    } finally {
      setResending(false);
    }
  };

  // Fin du blocage 429 : le message « Réessayez dans N min » n'a plus lieu d'être.
  const showError = !!error && !(error.kind === 'TOO_MANY_REQUESTS' && !blocked);
  const errorMessage = showError
    ? passwordResetErrorMessage(error, t, error.kind === 'TOO_MANY_REQUESTS' ? blockedFor : undefined)
    : null;

  const changeEmail = () => navigate(`/forgot-password?identifier=${encodeURIComponent(identifier)}`);

  return (
    <AuthPageLayout backTo="/login" backLabel={t('forgotPassword.backToLogin')}>
      <h1>{t('forgotPassword.resetTitle')}</h1>
      {/* Message neutre : la réponse de `/forgot` est la même qu'un compte existe ou non. */}
      <div className="sub">
        {t(resent ? 'forgotPassword.resentNotice' : 'forgotPassword.sentNotice')}{' '}
        {t('forgotPassword.validity', { minutes: validityMinutes })}
      </div>

      <form className="form" onSubmit={submit}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            border: '1px solid var(--green-100)', borderRadius: 'var(--radius)', background: 'var(--green-50)',
            fontSize: 14, color: 'var(--ink-700)',
          }}
        >
          <Icon name="mail" size={15} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {identifier}
          </span>
          <button
            type="button"
            onClick={changeEmail}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--green-700)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
            }}
          >
            {t('forgotPassword.changeEmail')}
          </button>
        </div>

        <Field label={t('forgotPassword.codeLabel')}>
          <Input
            value={code}
            // Pas de `maxLength` : un code collé « 123 456 » serait tronqué AVANT le nettoyage.
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              if (error?.kind === 'INVALID_CODE' || error?.kind === 'INVALID_REQUEST') setError(null);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            disabled={needsNewCode}
            placeholder={t('forgotPassword.codePlaceholder')}
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: 4 }}
          />
        </Field>

        <Field label={t('forgotPassword.newPassword')}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Icon name="lock" size={15} />}
            autoComplete="new-password"
          />
          {passwordTooShort && <div className="err">{t('forgotPassword.passwordTooShort')}</div>}
        </Field>

        <Field label={t('forgotPassword.confirmPassword')}>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            icon={<Icon name="lock" size={15} />}
            autoComplete="new-password"
            placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
          />
          {mismatch && <div className="err">{t('forgotPassword.passwordsMismatch')}</div>}
        </Field>

        {errorMessage && <div className="err">{errorMessage}</div>}
        {denied && <div className="err">{t('login.memberDenied')}</div>}

        <Button
          type="submit"
          variant="primary"
          disabled={!formValid || submitting || denied}
          style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
        >
          {submitting ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
        </Button>

        <Button
          variant={needsNewCode ? 'primary' : 'ghost'}
          onClick={resend}
          disabled={resendIn > 0 || resending || denied}
          style={{ justifyContent: 'center', padding: '10px 14px' }}
        >
          {resending
            ? t('forgotPassword.sending')
            : resendIn > 0
              ? t('forgotPassword.resendIn', { seconds: resendIn })
              : t(needsNewCode ? 'forgotPassword.newCode' : 'forgotPassword.resend')}
        </Button>
      </form>
    </AuthPageLayout>
  );
}
