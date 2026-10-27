import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Button, Field, Input } from '../components/ui';
import { AuthPageLayout } from '../components/AuthPageLayout';
import { useAuth } from '../hooks/useAuth';
import { requestPasswordReset } from '../services/passwordResetApi';
import { classifyPasswordResetError, passwordResetErrorMessage } from '../utils/passwordResetErrors';
import { routeAfterLogin } from '../utils/authRouting';

/** État de navigation passé à `/reset-password` (perdu au rechargement : valeurs par défaut alors). */
export interface ResetPasswordLocationState {
  resendAfterSeconds?: number;
  codeValidityMinutes?: number;
}

export const uiLanguage = (lng: string | undefined): 'fr' | 'en' => (lng?.startsWith('en') ? 'en' : 'fr');

/**
 * Mot de passe oublié, écran 1 — D-WEB-05 (JP 27/10), Parité mobile → web (décision n°3) : port de
 * `mobile/app/(auth)/forgot-password.tsx`. Page publique, hors shell, comme `/login`.
 *
 * L'adresse e-mail → `POST /api/auth/password/forgot` (`fromApp = SHEPHR`, langue de l'interface).
 * Le champ s'affiche « Adresse e-mail » mais part dans `identifier` : c'est le username Shephr,
 * en pratique une adresse (JP 30/07). Il arrive prérempli avec ce qui a été saisi sur `/login`
 * (`?identifier=`).
 *
 * La réponse est TOUJOURS 202, compte existant ou non : on passe donc à l'écran 2 sans rien en
 * conclure. Jamais de « compte introuvable ».
 */
export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { ready, isAuthenticated, me } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('identifier') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identifier = email.trim();
  const valid = identifier.length > 0 && identifier.includes('@');

  // Parcours réservé aux personnes non connectées : une session ouverte repart vers son accueil.
  useEffect(() => {
    if (!ready || !isAuthenticated || !me) return;
    if (routeAfterLogin(me, null, navigate) === 'denied') navigate('/', { replace: true });
  }, [ready, isAuthenticated, me, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestPasswordReset(identifier, uiLanguage(i18n.language));
      const state: ResetPasswordLocationState = {
        resendAfterSeconds: res.resendAfterSeconds,
        codeValidityMinutes: res.codeValidityMinutes,
      };
      navigate(`/reset-password?identifier=${encodeURIComponent(identifier)}`, { state });
    } catch (err) {
      setError(passwordResetErrorMessage(classifyPasswordResetError(err), t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout backTo="/login" backLabel={t('forgotPassword.backToLogin')}>
      <h1>{t('forgotPassword.forgotTitle')}</h1>
      <div className="sub">{t('forgotPassword.forgotHint')}</div>

      <form className="form" onSubmit={submit}>
        <Field label={t('forgotPassword.emailLabel')}>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            icon={<Icon name="mail" size={15} />}
            placeholder={t('login.emailPlaceholder')}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          disabled={!valid || loading}
          style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
        >
          {loading ? t('forgotPassword.sending') : t('forgotPassword.sendCode')}
        </Button>

        {error && <div className="err">{error}</div>}
      </form>

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 14, color: 'var(--ink-500)' }}>
        {t('forgotPassword.rememberPassword')}{' '}
        <Link to="/login" style={{ color: 'var(--green-700)', fontWeight: 600, textDecoration: 'none' }}>
          {t('login.signIn')}
        </Link>
      </div>
    </AuthPageLayout>
  );
}
