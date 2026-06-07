import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import {
  acceptInvitation,
  hasMinistryAccess,
  previewInvitation,
  type InvitationPreview,
} from '../services/authApi';

function errMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const { establishSession } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await previewInvitation(token);
        if (active) setPreview(p);
      } catch (e) {
        if (active) setLoadError(errMessage(e, 'Cette invitation est invalide ou a expiré.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await acceptInvitation({ token, password });
      const me = await establishSession(res.token);
      if (!hasMinistryAccess(me)) {
        setError("Votre compte n'a pas accès au Web Espace ministère.");
        return;
      }
      push({ kind: 'ok', title: 'Compte activé', msg: 'Bienvenue sur shephr.' });
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(errMessage(err, "Impossible d'activer le compte."));
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

          {loading ? (
            <div className="sub">Chargement de l'invitation…</div>
          ) : loadError ? (
            <>
              <h1>Invitation indisponible</h1>
              <div className="err" style={{ marginTop: 12 }}>{loadError}</div>
              <Button
                variant="secondary"
                onClick={() => navigate('/login', { replace: true })}
                style={{ marginTop: 16, justifyContent: 'center' }}
              >
                Aller à la connexion
              </Button>
            </>
          ) : (
            <>
              <h1>Activez votre compte</h1>
              <div className="sub">
                Bonjour {preview?.fullName}, définissez votre mot de passe pour rejoindre
                {preview?.ministryName ? ` ${preview.ministryName}` : ' votre ministère'} sur shephr.
              </div>

              <form className="form" onSubmit={submit}>
                <Field label="Adresse e-mail">
                  <Input type="email" value={preview?.email ?? ''} readOnly icon={<Icon name="mail" size={15} />} />
                </Field>

                <Field label="Mot de passe" hint="8 caractères minimum">
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

                <Field label="Confirmer le mot de passe">
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
                  {submitting ? 'Activation…' : 'Activer mon compte'}
                </Button>

                {error && <div className="err">{error}</div>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
