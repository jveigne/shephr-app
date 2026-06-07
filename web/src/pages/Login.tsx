import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, Checkbox, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { hasMinistryAccess } from '../services/authApi';

export function LoginPage() {
  const { login } = useAuth();
  const { push } = useToast();
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
      setError('Vérifiez votre adresse e-mail et votre mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const me = await login({ email: email.trim(), password });
      if (!hasMinistryAccess(me)) {
        setError("Accès réservé aux dirigeants. Les membres utilisent l'application mobile shephr.");
        return;
      }
      push({ kind: 'ok', title: 'Bienvenue', msg: 'Vous êtes connecté à shephr.' });
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Identifiants invalides.';
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
        <div className="top">
          <div className="brand-mark">S</div>
          <span className="word">shephr</span>
        </div>

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

        <div className="quote">
          « Donner avec joie, <span className="ital">recevoir avec gratitude.</span> »
          <div className="quote-sub">
            shephr accompagne votre ministère à travers la collecte, la lecture et le récit de la
            générosité.
          </div>
        </div>
      </div>

      <div className="login-main">
        <div className="login-card">
          <h1>Bienvenue</h1>
          <div className="sub">Connectez-vous à votre espace d'administration shephr.</div>

          <form className="form" onSubmit={submit}>
            <Field label="Adresse e-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Icon name="mail" size={15} />}
                placeholder="votre@email.com"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Mot de passe">
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
                Se souvenir de moi
              </label>
              <a href="#">Mot de passe oublié ?</a>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              style={{ justifyContent: 'center', marginTop: 6, padding: '12px 14px' }}
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>

            {error && <div className="err">{error}</div>}
          </form>

          <div className="reserved">
            <Icon name="shield" size={16} />
            <span>
              Accès réservé aux dirigeants. Les membres utilisent l'application mobile shephr.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
