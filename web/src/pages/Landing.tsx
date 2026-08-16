import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { LangSwitch } from '../components/LangSwitch';
import { contactMailto, contactWhatsapp, useContactSettings } from '../services/contactApi';


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

/** Chiffre clé du But Quinquennal (14 axes, 40 actions, 5 ans, échéance). */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)',
      padding: '20px 18px', textAlign: 'center', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(26px, 7vw, 34px)', lineHeight: 1.1, color: 'var(--green-700)' }}>{value}</div>
      <div style={{ color: 'var(--ink-500)', fontSize: 13, lineHeight: 1.4, marginTop: 6 }}>{label}</div>
    </div>
  );
}

/** Un des quatre principes du module Objectifs (foi, cumul, état, niveaux). */
function Principle({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--radius)', background: 'var(--green-50)',
        display: 'grid', placeItems: 'center', color: 'var(--green-700)',
      }}>
        <Icon name={icon} size={18} />
      </div>
      <div>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 18, color: 'var(--green-800)', margin: '0 0 6px' }}>{title}</h3>
        <p style={{ color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ready, isAuthenticated, canAccessWeb } = useAuth();
  // `ready` est indispensable : tant que le /me n'a pas répondu, l'état est « déconnecté »
  // par défaut. Sans ce garde, les CTA s'affichent en version visiteur puis changent de
  // destination sous le curseur une fois la session résolue.
  const loggedIn = ready && isAuthenticated && canAccessWeb;

  const contact = useContactSettings();
  const mailto = contactMailto(t('landing.contact.mailSubject'));
  const whatsapp = contactWhatsapp(t('landing.contact.whatsappText'));

  // Le module Objectifs a sa propre section en vedette : il ne réapparaît pas dans
  // la grille, qui regroupe ce qui gravite autour du But Quinquennal.
  const features = [
    { icon: 'donation', key: 'donations' },
    { icon: 'users', key: 'memberCare' },
    { icon: 'building', key: 'songbooks' },
    { icon: 'hierarchy', key: 'hierarchy' },
    { icon: 'export', key: 'reports' },
  ];

  // Chantier « objectifs individuels » (RG-BQ-01/02, JP 16/08) : cette page est PUBLIQUE, elle ne
  // doit décrire que le modèle en vigueur. L'« engagement de foi du dirigeant » et le MAX qui
  // l'arbitrait contre le cumul des sous-niveaux sont ABOLIS — d'où `personal` / `sum` en place
  // des anciennes clés `faith` / `aggregate`.
  const principles = [
    { icon: 'sparkle', key: 'personal' },
    { icon: 'tree', key: 'sum' },
    { icon: 'history', key: 'progress' },
    { icon: 'globe', key: 'levels' },
  ];

  // Chantier B : l'arbre est Assemblée › Ville › Région › Nation (la ville manquait à cette chaîne).
  const chain = ['member', 'unit', 'city', 'zone', 'country', 'continent'];

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
            {/* Même garde que le hero : la barre passe de « Créer un compte + Se connecter »
                à « Mon espace » une fois la session résolue, ce qui déplace les boutons sous
                le curseur en plus d'en changer la destination. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, visibility: ready ? 'visible' : 'hidden' }}>
            {!loggedIn && (
              <button
                onClick={() => navigate('/signup')}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--green-600)',
                  cursor: 'pointer', background: 'transparent', color: 'var(--green-700)', fontWeight: 600, fontSize: 14,
                }}
              >{t('landing.nav.signup')}</button>
            )}
            <button
              onClick={() => navigate(loggedIn ? '/dashboard' : '/login')}
              style={{
                padding: '8px 18px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
                background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 14,
              }}
            >{loggedIn ? t('landing.nav.account') : t('landing.nav.login')}</button>
            </span>
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
        {/* Neutralisé tant que la session n'est pas résolue : ce bouton change de destination
            avec `loggedIn`, un clic dans l'intervalle partait sur /dashboard → /goals alors que
            l'écran affichait encore « Créer un compte ». `visibility` conserve la hauteur. */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', visibility: ready ? 'visible' : 'hidden' }}>
          {/* Non connecté : l'inscription libre est l'action principale, la connexion vient ensuite. */}
          <button
            onClick={() => navigate(loggedIn ? '/dashboard' : '/signup')}
            style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 15 }}
          >{loggedIn ? t('landing.nav.account') : t('landing.hero.ctaSignup')}</button>
          {!loggedIn && (
            <button
              onClick={() => navigate('/login')}
              style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: '1px solid var(--green-600)', cursor: 'pointer', background: 'transparent', color: 'var(--green-700)', fontWeight: 600, fontSize: 15 }}
            >{t('landing.hero.ctaPrimary')}</button>
          )}
          {/* Ne part plus directement sur le client mail : on renvoie au bloc de contact, qui
              laisse choisir entre WhatsApp et e-mail (même traitement que la page Contact). */}
          <a href="#contact" style={{ padding: '13px 26px', borderRadius: 'var(--radius)', border: '1px solid var(--green-600)', background: 'transparent', color: 'var(--green-700)', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            {t('landing.hero.ctaSecondary')}
          </a>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 18 }}>{t('landing.hero.note')}</p>
      </section>

      {/* Parole reçue à la RAM 2025 — c'est le fondement du But Quinquennal, il passe
          avant la présentation de l'outil. Fond vert profond pour le détacher du reste. */}
      <section style={{ background: 'var(--green-900)', color: 'var(--ivory)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(40px, 8vw, 64px) 20px' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 56, lineHeight: 0.6, color: 'var(--earth-400)', marginBottom: 6 }} aria-hidden>“</div>
          <blockquote style={{ margin: 0 }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'clamp(18px, 4.6vw, 23px)', lineHeight: 1.5, margin: '0 0 18px' }}>
              {t('landing.quinquennat.quote1')}
            </p>
            <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'clamp(18px, 4.6vw, 23px)', lineHeight: 1.5, margin: 0 }}>
              {t('landing.quinquennat.quote2')}
            </p>
          </blockquote>
          <p style={{ fontSize: 13, color: 'var(--green-100)', marginTop: 24, lineHeight: 1.5 }}>
            <span style={{ display: 'block', fontWeight: 600, letterSpacing: '.02em', marginBottom: 3 }}>{t('landing.quinquennat.kicker')}</span>
            {t('landing.quinquennat.source')}
          </p>
        </div>
      </section>

      {/* Chiffres clés + genèse du document */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(40px, 8vw, 64px) 20px clamp(24px, 5vw, 40px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 14, marginBottom: 28 }}>
          <Figure value="14" label={t('landing.quinquennat.figures.axes')} />
          <Figure value="40" label={t('landing.quinquennat.figures.actions')} />
          <Figure value="5" label={t('landing.quinquennat.figures.years')} />
          <Figure value={t('landing.quinquennat.figures.deadlineValue')} label={t('landing.quinquennat.figures.deadline')} />
        </div>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(21px, 5.5vw, 27px)', color: 'var(--green-800)', margin: '0 0 12px' }}>
            {t('landing.quinquennat.contextTitle')}
          </h2>
          <p style={{ color: 'var(--ink-700)', fontSize: 'clamp(15px, 4vw, 16px)', lineHeight: 1.6, margin: 0 }}>
            {t('landing.quinquennat.context')}
          </p>
        </div>
      </section>

      {/* Module Objectifs — la vedette de la page */}
      <section style={{ background: 'var(--ivory)', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(44px, 9vw, 72px) 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <span style={{
              display: 'inline-block', padding: '5px 14px', borderRadius: 999, background: 'var(--green-600)',
              color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '.02em', marginBottom: 18,
            }}>{t('landing.goals.kicker')}</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(25px, 6.5vw, 34px)', lineHeight: 1.15, color: 'var(--green-900)', margin: '0 0 12px' }}>
              {t('landing.goals.title')}
            </h2>
            <p style={{ color: 'var(--ink-700)', fontSize: 'clamp(15px, 4vw, 17px)', lineHeight: 1.6, maxWidth: 640, margin: '0 auto' }}>
              {t('landing.goals.subtitle')}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 'clamp(22px, 4vw, 34px)', marginBottom: 40 }}>
            {principles.map((p) => (
              <Principle key={p.key} icon={p.icon} title={t(`landing.goals.${p.key}.title`)} desc={t(`landing.goals.${p.key}.desc`)} />
            ))}
          </div>

          {/* Chaîne des totaux : rend concret le « du membre au continent ». */}
          <div style={{ background: 'var(--parchment-deep)', borderRadius: 'var(--radius-lg)', padding: 'clamp(18px, 4vw, 26px)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 15, color: 'var(--green-800)', margin: '0 0 14px', textAlign: 'center' }}>
              {t('landing.goals.chainTitle')}
            </h3>
            <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', listStyle: 'none', margin: 0, padding: 0 }}>
              {chain.map((level, i) => (
                <li key={level} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block', padding: '7px 15px', borderRadius: 999, background: 'var(--ivory-raised)',
                    border: '1px solid var(--line)', color: 'var(--green-800)', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{t(`landing.goals.chain.${level}`)}</span>
                  {i < chain.length - 1 && (
                    <span style={{ color: 'var(--green-600)', display: 'grid', placeItems: 'center' }} aria-hidden>
                      <Icon name="arrowRight" size={14} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Même garde que le hero : la destination dépend de la session résolue. */}
          <div style={{ textAlign: 'center', marginTop: 34, visibility: ready ? 'visible' : 'hidden' }}>
            <button
              onClick={() => navigate(loggedIn ? '/goals' : '/signup')}
              style={{ padding: '13px 28px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 15 }}
            >{loggedIn ? t('landing.goals.cta') : t('landing.goals.ctaVisitor')}</button>
          </div>
        </div>
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
      <section id="contact" style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 64px) 20px', textAlign: 'center', scrollMarginTop: 80 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(23px, 6vw, 30px)', color: 'var(--green-900)', margin: '0 0 14px' }}>{t('landing.contact.title')}</h2>
        <p style={{ color: 'var(--ink-700)', fontSize: 'clamp(15px, 4vw, 17px)', lineHeight: 1.6, margin: '0 auto 26px', maxWidth: 580 }}>{t('landing.contact.desc')}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* Deux canaux comme pour un utilisateur connecté : un visiteur sans client mail
              configuré restait sinon sans issue. WhatsApp en avant, e-mail en second. */}
          <a href={whatsapp} target="_blank" rel="noreferrer" style={{ padding: '14px 30px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--green-600)', color: '#fff', fontWeight: 600, fontSize: 16, textDecoration: 'none', display: 'inline-block' }}>
            {t('join.contactWhatsapp')}
          </a>
          <a href={mailto} style={{ padding: '14px 30px', borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: 'transparent', color: 'var(--ink-700)', fontWeight: 600, fontSize: 16, textDecoration: 'none', display: 'inline-block' }}>
            {t('join.contactMail')}
          </a>
          {!loggedIn && (
            <button
              onClick={() => navigate('/signup')}
              style={{ padding: '14px 30px', borderRadius: 'var(--radius)', border: '1px solid var(--green-600)', cursor: 'pointer', background: 'transparent', color: 'var(--green-700)', fontWeight: 600, fontSize: 16 }}
            >{t('landing.nav.signup')}</button>
          )}
        </div>
        <p style={{ color: 'var(--ink-400)', fontSize: 14, marginTop: 16 }}>
          {t('landing.contact.or')} <a href={mailto} style={{ color: 'var(--green-700)', fontWeight: 600, wordBreak: 'break-all' }}>{contact.email}</a>
        </p>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--line-soft)', background: 'var(--ivory)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--green-800)', fontWeight: 600 }}>shephr</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {/* Lien exigé par Google Play : la demande de suppression de compte doit être
                atteignable publiquement depuis le site, sans connexion. */}
            <Link to="/privacy" style={{ color: 'var(--ink-400)', fontSize: 13, textDecoration: 'none' }}>
              {t('landing.footer.privacy')}
            </Link>
            <Link to="/delete-account" style={{ color: 'var(--ink-400)', fontSize: 13, textDecoration: 'none' }}>
              {t('landing.footer.deleteAccount')}
            </Link>
            <span style={{ color: 'var(--ink-400)', fontSize: 13 }}>{t('landing.footer.tagline')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
