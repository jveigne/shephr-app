import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LangSwitch } from '../components/LangSwitch';
import { contactMailto, useContactSettings } from '../services/contactApi';

// Page publique exigée par Google Play : URL de demande de suppression de compte
// et des données associées (Data safety > Account deletion). Accessible sans connexion.

export function DeleteAccountPage() {
  const { t } = useTranslation();

  const contact = useContactSettings();
  const mailto = contactMailto(t('deleteAccount.mailSubject'), t('deleteAccount.mailBody'));

  const steps = ['step1', 'step2', 'step3'];
  const deleted = ['profile', 'assignments', 'activity'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)', fontFamily: 'var(--font-sans)' }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--parchment)',
        borderBottom: '1px solid var(--line-soft)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px clamp(14px, 3vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--green-600)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--green-800)' }}>shephr</span>
          </Link>
          <LangSwitch />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(32px, 7vw, 56px) 20px clamp(40px, 8vw, 64px)' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(26px, 7vw, 38px)', lineHeight: 1.15, letterSpacing: '-.02em', color: 'var(--green-900)', margin: '0 0 14px' }}>
          {t('deleteAccount.title')}
        </h1>
        <p style={{ fontSize: 'clamp(15px, 4vw, 17px)', lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 32px' }}>
          {t('deleteAccount.intro')}
        </p>

        {/* Feature C — la suppression est désormais possible directement dans l'app (Réglages). */}
        <section style={{ background: 'var(--ivory-card)', border: '1px solid var(--green-600)', borderRadius: 'var(--radius-lg)', padding: 'clamp(18px, 4vw, 26px)', boxShadow: 'var(--shadow-sm)', marginBottom: 22 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 10px' }}>
            {t('deleteAccount.inAppTitle')}
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>
            {t('deleteAccount.inAppText')}
          </p>
        </section>

        {/* Comment demander la suppression (processus e-mail conservé comme alternative) */}
        <section style={{ background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 'clamp(18px, 4vw, 26px)', boxShadow: 'var(--shadow-sm)', marginBottom: 22 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 14px' }}>
            {t('deleteAccount.howTitle')}
          </h2>
          <ol style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s) => (
              <li key={s} style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-700)' }}>{t(`deleteAccount.${s}`)}</li>
            ))}
          </ol>
          <a href={mailto} style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none', display: 'inline-block' }}>
            {t('deleteAccount.cta')}
          </a>
          <p style={{ color: 'var(--ink-400)', fontSize: 14, marginTop: 14, marginBottom: 0 }}>
            {t('deleteAccount.or')}{' '}
            <a href={mailto} style={{ color: 'var(--green-700)', fontWeight: 600, wordBreak: 'break-all' }}>{contact.email}</a>
          </p>
        </section>

        {/* Données supprimées */}
        <section style={{ background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 'clamp(18px, 4vw, 26px)', boxShadow: 'var(--shadow-sm)', marginBottom: 22 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 14px' }}>
            {t('deleteAccount.deletedTitle')}
          </h2>
          <ul style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deleted.map((d) => (
              <li key={d} style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-700)' }}>{t(`deleteAccount.deleted.${d}`)}</li>
            ))}
          </ul>
        </section>

        {/* Conservation & délais */}
        <section style={{ background: 'var(--parchment-deep)', borderRadius: 'var(--radius-lg)', padding: 'clamp(18px, 4vw, 26px)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 14px' }}>
            {t('deleteAccount.retentionTitle')}
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 10px' }}>{t('deleteAccount.retentionDelay')}</p>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('deleteAccount.retentionLegal')}</p>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--line-soft)', background: 'var(--ivory)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--green-800)', fontWeight: 600 }}>shephr</span>
          <span style={{ color: 'var(--ink-400)', fontSize: 13 }}>{t('landing.footer.tagline')}</span>
        </div>
      </footer>
    </div>
  );
}
