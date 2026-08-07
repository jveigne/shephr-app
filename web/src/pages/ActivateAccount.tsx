import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DIAL_COUNTRIES } from '../constants/dialCodes';
import { CountryDialPicker } from '../components/CountryDialPicker';
import { Icon } from '../components/Icon';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import {
  acceptInvitationByCode,
  hasMinistryAccess,
  previewInvitationByCode,
  type InvitationPreview,
} from '../services/authApi';

function errMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

/**
 * Activation d'un compte par CODE COURT (alternative au lien `/invitation/:token`). L'invité saisit
 * le code transmis par son dirigeant/admin, voit son contexte, puis définit son mot de passe.
 * Accepte un pré-remplissage via `?code=XXXX`.
 */
export function ActivateAccountPage() {
  const [params] = useSearchParams();
  const { establishSession } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // A1 (RG-ID-04) : téléphone OBLIGATOIRE — le PAYS choisi porte l'indicatif (JP 23/07).
  const [countryIso, setCountryIso] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (c.length < 6) {
      setCodeError(t('activate.codeTooShort'));
      return;
    }
    setChecking(true);
    setCodeError(null);
    try {
      const p = await previewInvitationByCode(c);
      setPreview(p);
    } catch (e) {
      setPreview(null);
      setCodeError(errMessage(e, t('activate.invalidCode')));
    } finally {
      setChecking(false);
    }
  };

  // Pré-remplissage par lien `?code=` : on lance la vérification automatiquement.
  useEffect(() => {
    const c = (params.get('code') ?? '').trim();
    if (c.length >= 6) void lookup(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCheck = (e: FormEvent) => {
    e.preventDefault();
    void lookup(code);
  };

  const onActivate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!countryIso) {
      setError(t('invitation.countryRequired'));
      return;
    }
    if (phone.trim().replace(/\D/g, '').length < 6) {
      setError(t('invitation.phoneRequired'));
      return;
    }
    if (password.length < 8) {
      setError(t('invitation.tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('invitation.mismatch'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await acceptInvitationByCode({
        shortCode: code.trim().toUpperCase(),
        password,
        phoneNumber: phone.trim(),
        countryCode: DIAL_COUNTRIES.find((c) => c.iso === countryIso)?.dial,
        email: email.trim() || undefined,
      });
      const me = await establishSession(res.token);
      if (!hasMinistryAccess(me)) {
        setError(t('invitation.noAccess'));
        return;
      }
      push({ kind: 'ok', title: t('invitation.activatedToast'), msg: t('invitation.activatedMsg') });
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(errMessage(err, t('invitation.activateFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-main" style={{ margin: '0 auto' }}>
        <div className="login-card">
          <div className="top" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div className="brand-mark">S</div>
            <span className="word">shephr</span>
          </div>

          {!preview ? (
            <>
              <h1>{t('activate.title')}</h1>
              <div className="sub">{t('activate.subtitle')}</div>

              <form className="form" onSubmit={onCheck}>
                <Field label={t('activate.codeLabel')} hint={t('activate.codeHint')}>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={t('activate.codePlaceholder')}
                    icon={<Icon name="hash" size={15} />}
                    autoFocus
                    style={{ letterSpacing: 4, fontFamily: 'var(--font-mono)' }}
                  />
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={checking}
                  style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
                >
                  {checking ? t('activate.checking') : t('activate.continue')}
                </Button>

                {codeError && <div className="err">{codeError}</div>}
              </form>

              <Button
                variant="secondary"
                onClick={() => navigate('/login')}
                style={{ marginTop: 16, justifyContent: 'center' }}
              >
                {t('invitation.goToLogin')}
              </Button>
            </>
          ) : (
            <>
              <h1>{t('invitation.activateAccount')}</h1>
              <div className="sub">
                {t('invitation.greeting', {
                  name: preview.fullName ?? '',
                  ministry: preview.ministryName ?? t('invitation.yourMinistry'),
                })}
              </div>

              <form className="form" onSubmit={onActivate}>
                {/* A1 — les comptes invités n'ont pas toujours d'email : on retombe sur l'identifiant. */}
                <Field label={preview.email ? t('invitation.emailLabel') : t('invitation.usernameLabel')}>
                  <Input
                    type="text"
                    value={preview.email ?? preview.username ?? ''}
                    readOnly
                    icon={<Icon name={preview.email ? 'mail' : 'user'} size={15} />}
                  />
                </Field>

                <Field label={t('invitation.phoneLabel')} hint={t('invitation.phoneHint')}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <CountryDialPicker value={countryIso} onChange={setCountryIso} />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('invitation.phonePlaceholder')}
                      required
                    />
                  </div>
                </Field>

                <Field label={t('invitation.contactEmailLabel')}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('invitation.contactEmailPlaceholder')}
                    icon={<Icon name="mail" size={15} />}
                  />
                </Field>

                <Field label={t('invitation.passwordLabel')} hint={t('invitation.passwordHint')}>
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
                  disabled={submitting}
                  style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
                >
                  {submitting ? t('invitation.activating') : t('invitation.activate')}
                </Button>

                {error && <div className="err">{error}</div>}
              </form>

              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                  setPassword('');
                  setConfirm('');
                  setCountryIso('');
                  setPhone('');
                  setEmail('');
                }}
                style={{
                  marginTop: 14, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--ink-500)', fontFamily: 'var(--font-sans)', fontSize: 14, padding: 6,
                }}
              >
                {t('activate.changeCode')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
