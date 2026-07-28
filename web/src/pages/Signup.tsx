import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';

/**
 * Feature B — inscription libre côté Web (miroir de `mobile/app/(auth)/signup.tsx`).
 * Étape « ask » : on demande d'abord si la personne a déjà un compte CMFIPraise (un seul compte
 * pour les deux applications), puis le formulaire. Le compte créé n'a aucun rattachement :
 * on enchaîne sur `/join` (recherche d'assemblée + demande de rattachement).
 */

const errData = (err: unknown) =>
  (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;

export function SignupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register } = useAuth();

  const [step, setStep] = useState<'ask' | 'form'>('ask');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Contrat 422 : le compte existe déjà sur CMFIPraise → on propose la connexion. */
  const [existing, setExisting] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExisting(null);
    if (
      firstName.trim().length === 0 ||
      lastName.trim().length === 0 ||
      !email.includes('@') ||
      password.length < 6
    ) {
      setError(t('signup.validationError'));
      return;
    }
    if (password !== confirm) {
      setError(t('invitation.mismatch'));
      return;
    }
    setLoading(true);
    try {
      const me = await register({
        email: email.trim(),
        password,
        fullName: `${firstName.trim()} ${lastName.trim()}`,
      });
      // Un compte fraîchement créé n'est rattaché à rien ; on garde néanmoins l'aiguillage
      // complet du login au cas où le backend rattacherait déjà (invitation pré-existante).
      if (hasMinistryAccess(me)) {
        navigate('/dashboard', { replace: true });
        return;
      }
      if (hasMemberSpace(me)) {
        navigate('/my-goals', { replace: true });
        return;
      }
      navigate('/join', { replace: true });
    } catch (err: unknown) {
      const data = errData(err);
      if (data?.error === 'EMAIL_ALREADY_EXISTS' || data?.error === 'PHONE_ALREADY_EXISTS') {
        setExisting(data.message ?? t('signup.exists'));
        return;
      }
      setError(data?.message ?? t('signup.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-main" style={{ margin: '0 auto', position: 'relative' }}>
        <button
          type="button"
          onClick={() => (step === 'form' ? setStep('ask') : navigate('/login'))}
          style={{
            position: 'absolute', top: 24, left: 24, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-500)',
            fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, padding: 6,
          }}
        >
          <Icon name="chevRight" size={14} style={{ transform: 'rotate(180deg)' }} />
          {t('signup.back')}
        </button>
        <div style={{ position: 'absolute', top: 24, right: 24 }}>
          <LangSwitch />
        </div>

        <div className="login-card">
          <div className="top" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div className="brand-mark">S</div>
            <span className="word">shephr</span>
          </div>

          {step === 'ask' ? (
            <>
              <h1>{t('signup.askTitle')}</h1>
              <div className="sub">{t('signup.askHint')}</div>

              <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/login')}
                  iconL={<Icon name="user" size={15} />}
                  style={{ justifyContent: 'center', padding: '12px 14px' }}
                >
                  {t('signup.loginInstead')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setStep('form')}
                  iconR={<Icon name="arrowRight" size={15} />}
                  style={{ justifyContent: 'center', padding: '12px 14px' }}
                >
                  {t('signup.createAccount')}
                </Button>
              </div>

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
            </>
          ) : (
            <>
              <h1>{t('signup.title')}</h1>
              <div className="sub">{t('signup.subtitle')}</div>

              <form className="form" onSubmit={submit}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field label={t('signup.firstName')} style={{ flex: 1 }}>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('signup.firstNamePlaceholder')}
                      autoComplete="given-name"
                      autoFocus
                      required
                    />
                  </Field>
                  <Field label={t('signup.lastName')} style={{ flex: 1 }}>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t('signup.lastNamePlaceholder')}
                      autoComplete="family-name"
                      required
                    />
                  </Field>
                </div>

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

                <Field label={t('login.passwordLabel')} hint={t('signup.passwordHint')}>
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
                      autoComplete="new-password"
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

                {/* Double saisie : le mot de passe n'est pas récupérable, on vérifie la frappe. */}
                <Field label={t('invitation.confirmPasswordLabel')}>
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    icon={<Icon name="lock" size={15} />}
                    autoComplete="new-password"
                    required
                  />
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
                >
                  {loading ? t('signup.submitting') : t('signup.submit')}
                </Button>

                {error && <div className="err">{error}</div>}

                {existing && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: 12,
                      borderRadius: 'var(--radius-md, 10px)',
                      border: '1px solid var(--line-soft, rgba(42,38,32,0.12))',
                      background: 'var(--sand-50, rgba(201,149,107,0.08))',
                      fontSize: 14,
                      color: 'var(--ink-700)',
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: 4 }}>{t('signup.existsTitle')}</strong>
                    {existing}
                    <Button
                      variant="secondary"
                      onClick={() => navigate('/login')}
                      style={{ marginTop: 10, justifyContent: 'center', width: '100%' }}
                    >
                      {t('signup.goLogin')}
                    </Button>
                  </div>
                )}
              </form>

              <div className="reserved">
                <Icon name="info" size={16} />
                <span>{t('signup.nextStep')}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
