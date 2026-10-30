import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { Button, Checkbox, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { safeDocumentNext } from '../utils/documents';
import { isBillingPath, routeAfterLogin, safeNext } from '../utils/authRouting';
import { SocialSignInButtons } from '../components/SocialSignInButtons';
import type { AuthResponse, MeResponse } from '../services/authApi';

export function LoginPage() {
  const { login, establishSession } = useAuth();
  const { push } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNext(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D-WEB-05 (JP 27/10) : routage extrait dans `utils/authRouting` (partagé avec /reset-password).
  // D-PAY-06 / RG-PAY-44 (JP 28/10) : même routage — `next` compris — après Google / Apple.
  const afterSession = (me: MeResponse) => {
    const outcome = routeAfterLogin(me, nextPath, navigate);
    if (outcome === 'welcome') {
      push({ kind: 'ok', title: t('login.welcomeToast'), msg: t('login.welcomeToastMsg') });
    } else if (outcome === 'denied') {
      setError(t('login.memberDenied'));
    }
  };

  const onSocialSession = async (res: AuthResponse) => {
    setLoading(true);
    try {
      afterSession(await establishSession(res.token));
    } catch {
      setError(t('login.social.errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@') || password.length < 6) {
      setError(t('login.validationError'));
      return;
    }
    setLoading(true);
    try {
      const me = await login({ identifier: email.trim(), password });
      afterSession(me);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('login.invalidCredentials');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-side">
        <div className="deco-1" />
        <div className="deco-2" />
        <button
          type="button"
          className="top"
          onClick={() => navigate('/')}
          title={t('login.backToHome')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div className="brand-mark">S</div>
          <span className="word">shephr</span>
        </button>

        <svg
          viewBox="0 0 360 220"
          width="360"
          height="220"
          style={{ position: 'relative', zIndex: 1, marginTop: 30 }}
        >
          <defs>
            <linearGradient id="hill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#C9956B" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#C9956B" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="hill2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#F5ECD4" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#F5ECD4" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <line x1="0" x2="360" y1="160" y2="160" stroke="rgba(245,236,212,0.18)" strokeWidth="1" />
          <circle cx="270" cy="100" r="38" fill="#C9956B" opacity="0.35" />
          <circle cx="270" cy="100" r="22" fill="#D9AE89" opacity="0.55" />
          <path d="M 0 160 Q 60 130 130 145 T 280 130 T 360 150 L 360 220 L 0 220 Z" fill="url(#hill2)" />
          <path d="M 0 175 Q 80 145 170 165 T 360 160 L 360 220 L 0 220 Z" fill="url(#hill)" />
          <path
            d="M 180 220 Q 178 200 185 185 Q 195 168 200 155"
            stroke="#F5ECD4"
            strokeOpacity="0.35"
            strokeWidth="2"
            fill="none"
            strokeDasharray="2 5"
          />
        </svg>
      </div>

      <div className="login-main" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            position: 'absolute', top: 24, left: 24, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-500)',
            fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, padding: 6,
          }}
        >
          <Icon name="chevRight" size={14} style={{ transform: 'rotate(180deg)' }} />
          {t('login.backToHome')}
        </button>
        <div style={{ position: 'absolute', top: 24, right: 24 }}>
          <LangSwitch />
        </div>
        <div className="login-card">
          <h1>{t('login.welcome')}</h1>
          <div className="sub">{t('login.subtitle')}</div>

          <form className="form" onSubmit={submit}>
            <Field label={t('login.emailLabel')}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Icon name="mail" size={15} />}
                placeholder={t('login.emailPlaceholder')}
                autoComplete="email"
                required
              />
            </Field>

            <Field label={t('login.passwordLabel')}>
              <div className="input-wrap">
                <span className="ico-left">
                  <Icon name="lock" size={15} />
                </span>
                <input
                  className="input with-icon"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 38 }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ink-400)',
                    padding: 6,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
            </Field>

            <div className="row-between">
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  color: 'var(--ink-700)',
                  cursor: 'pointer',
                }}
              >
                <Checkbox checked={remember} onChange={setRemember} />
                {t('login.rememberMe')}
              </label>
              {/* D-WEB-05 (JP 27/10) : « Mot de passe oublié » sur le web, prérempli avec la saisie. */}
              <Link
                to={
                  email.trim()
                    ? `/forgot-password?identifier=${encodeURIComponent(email.trim())}`
                    : '/forgot-password'
                }
              >
                {t('login.forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
            >
              {loading ? t('login.connecting') : t('login.signIn')}
            </Button>

            {error && <div className="err">{error}</div>}
          </form>

          {/* D-PAY-06 (JP 28/10) : Google / Apple sur le web, chaque bouton masqué sans identifiant configuré. */}
          <SocialSignInButtons onSession={onSocialSession} onError={setError} disabled={loading} />

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 14, color: 'var(--ink-600)' }}>
            {t('login.invitedQuestion')}{' '}
            <button
              type="button"
              onClick={() => navigate('/activate')}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--accent, #1E3A2F)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
              }}
            >
              {t('login.activateCta')}
            </button>
          </div>

          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 14, color: 'var(--ink-600)' }}>
            {t('login.noAccountQuestion')}{' '}
            <button
              type="button"
              // D-WEB-04 (JP 27/10) : le retour vers un document survit au détour par l'inscription ;
              // D-FIX-3A (JP 29/10) : le retour vers /offres aussi.
              onClick={() => {
                const keep = safeDocumentNext(nextPath) ?? (nextPath && isBillingPath(nextPath) ? nextPath : null);
                navigate(keep ? `/signup?next=${encodeURIComponent(keep)}` : '/signup');
              }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--accent, #1E3A2F)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
              }}
            >
              {t('login.signupCta')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
