import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DIAL_COUNTRIES } from '../constants/dialCodes';
import { CountryDialPicker } from '../components/CountryDialPicker';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess, type MeResponse } from '../services/authApi';

/**
 * Inscription libre côté Web (miroir de `mobile/app/(auth)/signup.tsx`) : identité, email,
 * téléphone (RG-ID-04/05), mot de passe confirmé. Le compte créé n'a aucun rattachement →
 * on enchaîne sur `/join`, qui fait partie intégrante de l'inscription.
 *
 * Identifiant déjà pris : on NE quitte PAS l'écran. Le mot de passe saisi est probablement celui
 * du compte existant → tentative de connexion silencieuse ; si elle échoue, on le redemande sur
 * place. Aucune session n'est jamais émise sur la seule existence de l'identifiant.
 *
 * Le champ s'affiche « Email » mais part dans `identifier` : depuis la séparation des identités
 * par application (JP 30/07), Shephr a son propre espace de noms — s'inscrire ici n'entre jamais
 * en collision avec un compte d'une autre application.
 */

const errData = (err: unknown) =>
  (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;

export function SignupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register, login } = useAuth();

  const [mode, setMode] = useState<'form' | 'existing'>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Un compte déjà rattaché va à son espace ; sinon il finit son inscription. */
  const routeAfterAuth = (me: MeResponse) => {
    if (hasMinistryAccess(me)) return navigate('/dashboard', { replace: true });
    if (hasMemberSpace(me)) return navigate('/my-goals', { replace: true });
    return navigate('/join', { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (
      firstName.trim().length === 0 ||
      lastName.trim().length === 0 ||
      !email.includes('@') ||
      password.length < 6
    ) {
      setError(t('signup.validationError'));
      return;
    }
    if (!countryIso) {
      setError(t('invitation.countryRequired'));
      return;
    }
    if (phone.trim().replace(/\D/g, '').length < 6) {
      setError(t('invitation.phoneRequired'));
      return;
    }
    if (password !== confirm) {
      setError(t('invitation.mismatch'));
      return;
    }
    setLoading(true);
    try {
      await register({
        identifier: email.trim(),
        password,
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        phoneNumber: phone.trim(),
        countryCode: DIAL_COUNTRIES.find((c) => c.iso === countryIso)?.dial,
      });
      // Compte neuf : aucun rattachement possible → rattachement à une assemblée.
      navigate('/join', { replace: true });
    } catch (err: unknown) {
      const data = errData(err);
      if (data?.error === 'USERNAME_ALREADY_EXISTS') {
        try {
          routeAfterAuth(await login({ identifier: email.trim(), password }));
          return;
        } catch {
          // Mot de passe différent de celui du compte existant : on le redemande, en place.
          setMode('existing');
          setPassword('');
          setConfirm('');
        }
      } else if (data?.error === 'PHONE_ALREADY_EXISTS') {
        setError(t('signup.phoneTaken'));
      } else {
        setError(data?.message ?? t('signup.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const submitExisting = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return;
    setLoading(true);
    try {
      routeAfterAuth(await login({ identifier: email.trim(), password }));
    } catch (err: unknown) {
      setError(errData(err)?.message ?? t('login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-main" style={{ margin: '0 auto', position: 'relative' }}>
        <button
          type="button"
          onClick={() => (mode === 'existing' ? setMode('form') : navigate('/login'))}
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

          {mode === 'existing' ? (
            <>
              <h1>{t('signup.existingTitle')}</h1>
              <div className="sub">{t('signup.existingHint')}</div>

              <form className="form" onSubmit={submitExisting}>
                <Field label={t('login.emailLabel')}>
                  <Input type="email" value={email} readOnly icon={<Icon name="mail" size={15} />} />
                </Field>

                <Field label={t('login.passwordLabel')}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Icon name="lock" size={15} />}
                    autoComplete="current-password"
                    autoFocus
                    required
                  />
                </Field>

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

              <div style={{ marginTop: 14, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setMode('form')}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                    color: 'var(--ink-600)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
                  }}
                >
                  {t('signup.useAnotherEmail')}
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

                <Field label={t('invitation.phoneLabel')} hint={t('invitation.phoneHint')}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <CountryDialPicker value={countryIso} onChange={setCountryIso} />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('invitation.phonePlaceholder')}
                      autoComplete="tel-national"
                      required
                    />
                  </div>
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
