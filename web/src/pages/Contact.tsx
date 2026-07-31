import { useTranslation } from 'react-i18next';
import { TopBar } from '../components/ui';
import { contactMailto, contactWhatsapp, useContactSettings } from '../services/contactApi';

/**
 * Contactez-nous (JP 31/07).
 *
 * <p>Avant, le lien du menu ouvrait DIRECTEMENT le client mail — sans issue pour qui n'en a pas
 * de configuré. On propose désormais les deux canaux, avec exactement la mise en forme du bloc
 * de contact du rattachement à une assemblée (« mon pays / ma région n'existe pas ») : un
 * WhatsApp mis en avant, un e-mail en second.
 */
export function ContactPage() {
  const { t } = useTranslation();
  // Les coordonnées viennent du back-office : on s'abonne pour rerendre quand elles arrivent.
  useContactSettings();

  return (
    <>
      <TopBar title={t('nav.contact')} crumbs={[t('common.brand'), t('nav.contact')]} />

      <div className="content">
        <div className="card" style={{ maxWidth: 560 }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>
            {t('contact.intro')}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
            <a
              href={contactWhatsapp(t('contact.whatsappText'))}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '10px 18px', borderRadius: 'var(--radius, 10px)',
                border: '1px solid var(--green-600)', color: 'var(--green-700)',
                fontWeight: 600, fontSize: 14, textDecoration: 'none',
              }}
            >
              {t('join.contactWhatsapp')}
            </a>
            <a
              href={contactMailto(t('nav.contactSubject'))}
              style={{
                padding: '10px 18px', borderRadius: 'var(--radius, 10px)',
                border: '1px solid var(--line-soft)', color: 'var(--ink-700)',
                fontWeight: 600, fontSize: 14, textDecoration: 'none',
              }}
            >
              {t('join.contactMail')}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
