import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { setLanguage } from '../i18n';

const CONTACT_EMAIL = 'jexcellence2065@gmail.com';

function LangSwitch() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLanguage(l)}
          style={{
            padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: lang === l ? 'var(--green-600)' : 'transparent',
            color: lang === l ? '#fff' : 'var(--ink-500)',
          }}
        >{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)',
      padding: 22, boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 'var(--radius)', background: 'var(--green-50)',
        display: 'grid', placeItems: 'center', color: 'var(--green-700)', marginBottom: 14,
      }}>
        <Icon name={icon} size={20} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 18, color: 'var(--green-800)', margin: '0 0 6px' }}>{title}</h3>
      <p style={{ color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>{desc}</p>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, canAccessWeb } = useAuth();
  const loggedIn = isAuthenticated && canAccessWeb;

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('landing.contact.mailSubject'))}`;

  const features = [
    { icon: 'sparkle', key: 'goals' },
    { icon: 'donation', key: 'donations' },
    { icon: 'users', key: 'memberCare' },
    { icon: 'building', key: 'songbooks' },
    { icon: 'hierarchy', key: 'hierarchy' },
    { icon: 'export', key: 'reports' },
  ];

  const factors = ['size', 'zone', 'cmci', 'bundle'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)', fontFamily: 'var(--font-sans)' }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--parchment)',
        borderBottom: '1px solid var(--line-soft)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px clamp(14px, 3vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--green-600)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--green-800)' }}>shephr</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <LangSwitch />
            <button
              onClick={() => navigate(loggedIn ? '/dashboard' : '/login')}
              style={{
                padding: '8px 18px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
                background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 14,
              }}
            >{loggedIn ? t('landing.nav.account') : t('landing.nav.login')}</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(36px, 9vw, 72px) 20px clamp(32px, 7vw, 56px)', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '5px 14px', borderRadius: 999, background: 'var(--green-50)',
          color: 'var(--green-700)', fontSize: 12, fontWeight: 600, letterSpacing: '.02em', marginBottom: 22,
        }}>{t('landing.hero.badge')}</span>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(29px, 8vw, 46px)', lineHeight: 1.1, letterSpacing: '-.02em', color: 'var(--green-900)', margin: '0 0 20px' }}>
          {t('landing.hero.title')}
        </h1>
        <p style={{ fontSize: 'clamp(16px, 4.5vw, 19px)', lineHeight: 1.55, color: 'var(--ink-700)', maxWidth: 640, margin: '0 auto 32px' }}>
          {t('landing.hero.subtitle')}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(loggedIn ? '/dashboard' : '/login')}
            style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 15 }}
          >{loggedIn ? t('landing.nav.account') : t('landing.hero.ctaPrimary')}</button>
          <a href={mailto} style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: '1px solid var(--green-600)', background: 'transparent', color: 'var(--green-700)', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            {t('landing.hero.ctaSecondary')}
          </a>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 18 }}>{t('landing.hero.note')}</p>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px clamp(40px, 8vw, 64px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(24px, 6vw, 32px)', color: 'var(--green-800)', margin: '0 0 10px' }}>{t('landing.features.title')}</h2>
          <p style={{ color: 'var(--ink-500)', fontSize: 16, maxWidth: 560, margin: '0 auto' }}>{t('landing.features.subtitle')}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 18 }}>
          {features.map((f) => (
            <Feature key={f.key} icon={f.icon} title={t(`landing.features.${f.key}.title`)} desc={t(`landing.features.${f.key}.desc`)} />
          ))}
        </div>
      </section>

      {/*/!* Pricing *!/*/}
      {/*<section style={{ background: 'var(--ivory)', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)' }}>*/}
      {/*  <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>*/}
      {/*    <div style={{ textAlign: 'center', marginBottom: 40 }}>*/}
      {/*      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, color: 'var(--green-800)', margin: '0 0 10px' }}>{t('landing.pricing.title')}</h2>*/}
      {/*      <p style={{ color: 'var(--ink-500)', fontSize: 16, maxWidth: 620, margin: '0 auto' }}>{t('landing.pricing.subtitle')}</p>*/}
      {/*    </div>*/}

      {/*    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginBottom: 28 }}>*/}
      {/*      /!* Gratuit *!/*/}
      {/*      <div style={{ background: 'var(--ivory-card)', border: '1px solid var(--green-100)', borderRadius: 'var(--radius-lg)', padding: 26 }}>*/}
      {/*        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: 'var(--green-50)', color: 'var(--green-700)', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{t('landing.pricing.freeBadge')}</span>*/}
      {/*        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 8px' }}>{t('landing.pricing.freeTitle')}</h3>*/}
      {/*        <p style={{ color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{t('landing.pricing.freeDesc')}</p>*/}
      {/*      </div>*/}
      {/*      /!* Donations *!/*/}
      {/*      <div style={{ background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 26 }}>*/}
      {/*        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 4px' }}>{t('landing.pricing.donations.name')}</h3>*/}
      {/*        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--green-700)', margin: '6px 0' }}>*/}
      {/*          {t('landing.pricing.donations.price')} <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>{t('landing.pricing.donations.unit')}</span>*/}
      {/*        </div>*/}
      {/*        <p style={{ color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{t('landing.pricing.donations.desc')}</p>*/}
      {/*      </div>*/}
      {/*      /!* Member Care *!/*/}
      {/*      <div style={{ background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 26 }}>*/}
      {/*        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 4px' }}>{t('landing.pricing.memberCare.name')}</h3>*/}
      {/*        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--green-700)', margin: '6px 0' }}>*/}
      {/*          {t('landing.pricing.memberCare.price')} <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>{t('landing.pricing.memberCare.unit')}</span>*/}
      {/*        </div>*/}
      {/*        <p style={{ color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{t('landing.pricing.memberCare.desc')}</p>*/}
      {/*      </div>*/}
      {/*    </div>*/}

      {/*    <div style={{ background: 'var(--parchment-deep)', borderRadius: 'var(--radius-lg)', padding: '22px 26px' }}>*/}
      {/*      <h4 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 16, color: 'var(--green-800)', margin: '0 0 12px' }}>{t('landing.pricing.factorsTitle')}</h4>*/}
      {/*      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>*/}
      {/*        {factors.map((f) => (*/}
      {/*          <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-700)' }}>*/}
      {/*            <Icon name="sparkle" size={14} /> <span>{t(`landing.pricing.factors.${f}`)}</span>*/}
      {/*          </li>*/}
      {/*        ))}*/}
      {/*      </ul>*/}
      {/*    </div>*/}

      {/*    <div style={{ textAlign: 'center', marginTop: 30 }}>*/}
      {/*      <p style={{ color: 'var(--ink-500)', fontSize: 14, marginBottom: 14 }}>{t('landing.pricing.quoteNote')}</p>*/}
      {/*      <a href={mailto} style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none', display: 'inline-block' }}>*/}
      {/*        {t('landing.pricing.cta')}*/}
      {/*      </a>*/}
      {/*    </div>*/}
      {/*  </div>*/}
      {/*</section>*/}

      {/* Activation / contact */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 64px) 20px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(23px, 6vw, 30px)', color: 'var(--green-900)', margin: '0 0 14px' }}>{t('landing.contact.title')}</h2>
        <p style={{ color: 'var(--ink-700)', fontSize: 'clamp(15px, 4vw, 17px)', lineHeight: 1.6, margin: '0 auto 26px', maxWidth: 580 }}>{t('landing.contact.desc')}</p>
        <a href={mailto} style={{ padding: '14px 30px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 16, textDecoration: 'none', display: 'inline-block' }}>
          {t('landing.contact.cta')}
        </a>
        <p style={{ color: 'var(--ink-400)', fontSize: 14, marginTop: 16 }}>
          {t('landing.contact.or')} <a href={mailto} style={{ color: 'var(--green-700)', fontWeight: 600, wordBreak: 'break-all' }}>{CONTACT_EMAIL}</a>
        </p>
      </section>

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
