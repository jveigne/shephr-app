import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { Button, Checkbox, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';

export function LoginPage() {
  const { login } = useAuth();
  const { push } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@') || password.length < 6) {
      setError(t('login.validationError'));
      return;
    }
    setLoading(true);
    try {
      const me = await login({ email: email.trim(), password });
      if (hasMinistryAccess(me)) {
        // Comportement actuel : accès Web Espace ministère.
        push({ kind: 'ok', title: t('login.welcomeToast'), msg: t('login.welcomeToastMsg') });
        navigate('/dashboard', { replace: true });
        return;
      }
      if (hasMemberSpace(me)) {
        // Feature A — MEMBRE Goals rattaché : espace minimal « Mes objectifs ».
        push({ kind: 'ok', title: t('login.welcomeToast'), msg: t('login.welcomeToastMsg') });
        navigate('/my-goals', { replace: true });
        return;
      }
      const noAttachmentAtAll =
        !me.superAdmin &&
        me.goalRole == null &&
        me.donationRole == null &&
        me.goalUnitId == null &&
        me.donationUnitId == null;
      if (noAttachmentAtAll) {
        // Feature B — aucun rattachement ni rôle : onboarding /join.
        navigate('/join', { replace: true });
        return;
      }
      setError(t('login.memberDenied'));
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
              <a href="#">{t('login.forgotPassword')}</a>
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
              onClick={() => navigate('/signup')}
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
