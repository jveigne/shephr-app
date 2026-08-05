import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LangSwitch } from '../components/LangSwitch';
import { contactMailto, contactWhatsapp, useContactSettings } from '../services/contactApi';

// Page publique exigée par Google Play : règles de confidentialité (User Data policy).
// Doit rester accessible SANS connexion — elle est référencée depuis la fiche Play Store.

/** Bloc de section, calé sur la mise en forme de la page de suppression de compte. */
function Section({ title, children, tone = 'card' }: { title: string; children: ReactNode; tone?: 'card' | 'deep' }) {
  const style = tone === 'deep'
    ? { background: 'var(--parchment-deep)' }
    : { background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', boxShadow: 'var(--shadow-sm)' };
  return (
    <section style={{ ...style, borderRadius: 'var(--radius-lg)', padding: 'clamp(18px, 4vw, 26px)', marginBottom: 22 }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 14px' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Para({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 10px' }}>{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <li key={item} style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-700)' }}>{item}</li>
      ))}
    </ul>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();

  const contact = useContactSettings();
  const mailto = contactMailto(t('privacy.mailSubject'));
  const whatsapp = contactWhatsapp(t('privacy.whatsappText'));

  const tr = (prefix: string, keys: string[]) => keys.map((k) => t(`privacy.${prefix}.${k}`));

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
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(26px, 7vw, 38px)', lineHeight: 1.15, letterSpacing: '-.02em', color: 'var(--green-900)', margin: '0 0 10px' }}>
          {t('privacy.title')}
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14, margin: '0 0 20px' }}>{t('privacy.updated')}</p>
        <p style={{ fontSize: 'clamp(15px, 4vw, 17px)', lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 32px' }}>
          {t('privacy.intro')}
        </p>

        <Section title={t('privacy.controllerTitle')}>
          <Para>{t('privacy.controllerText')}</Para>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>
            {t('privacy.controllerContact')}{' '}
            <a href={mailto} style={{ color: 'var(--green-700)', fontWeight: 600, wordBreak: 'break-all' }}>{contact.email}</a>
          </p>
        </Section>

        <Section title={t('privacy.collectedTitle')}>
          <Para>{t('privacy.collectedIntro')}</Para>
          <List items={tr('collected', ['account', 'org', 'goals', 'donations', 'memberCare', 'technical'])} />
        </Section>

        {/* Point le plus scruté par Google : l'absence de pistage et de revente. */}
        <Section title={t('privacy.noTrackingTitle')}>
          <List items={tr('noTracking', ['sale', 'ads', 'analytics', 'sensors'])} />
        </Section>

        <Section title={t('privacy.purposeTitle')}>
          <List items={tr('purpose', ['service', 'org', 'support', 'security', 'legal'])} />
        </Section>

        {/* Le suivi pastoral touche à la vie religieuse : on le dit au lieu de le noyer. */}
        <Section title={t('privacy.sensitiveTitle')}>
          <Para>{t('privacy.sensitiveText')}</Para>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('privacy.sensitiveBasis')}</p>
        </Section>

        <Section title={t('privacy.visibilityTitle')}>
          <Para>{t('privacy.visibilityText')}</Para>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('privacy.visibilityScope')}</p>
        </Section>

        <Section title={t('privacy.sharingTitle')}>
          <Para>{t('privacy.sharingText')}</Para>
          <List items={tr('sharing', ['hosting', 'region', 'transfer'])} />
        </Section>

        <Section title={t('privacy.retentionTitle')}>
          <Para>{t('privacy.retentionText')}</Para>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('privacy.retentionLegal')}</p>
        </Section>

        <Section title={t('privacy.rightsTitle')}>
          <Para>{t('privacy.rightsIntro')}</Para>
          <List items={tr('rights', ['access', 'rectify', 'delete', 'portability', 'object', 'complaint'])} />
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: '16px 0 0' }}>
            {t('privacy.rightsHow')}{' '}
            <Link to="/delete-account" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('privacy.deleteLink')}</Link>
          </p>
        </Section>

        <Section title={t('privacy.securityTitle')}>
          <Para>{t('privacy.securityText')}</Para>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('privacy.securityBreach')}</p>
        </Section>

        <Section title={t('privacy.childrenTitle')}>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('privacy.childrenText')}</p>
        </Section>

        <Section title={t('privacy.changesTitle')}>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>{t('privacy.changesText')}</p>
        </Section>

        {/* Deux canaux, comme partout ailleurs : un visiteur sans client mail reste joignable. */}
        <Section title={t('privacy.contactTitle')} tone="deep">
          <Para>{t('privacy.contactText')}</Para>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              style={{ padding: '12px 24px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}
            >
              {t('join.contactWhatsapp')}
            </a>
            <a
              href={mailto}
              style={{ padding: '12px 24px', borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: 'transparent', color: 'var(--ink-700)', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}
            >
              {t('join.contactMail')}
            </a>
          </div>
        </Section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--line-soft)', background: 'var(--ivory)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--green-800)', fontWeight: 600 }}>shephr</span>
          <Link to="/delete-account" style={{ color: 'var(--ink-400)', fontSize: 13, textDecoration: 'none' }}>
            {t('landing.footer.deleteAccount')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
