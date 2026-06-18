import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';

interface PlaceholderProps {
  /** i18n key for the page title. */
  titleKey: string;
  /** i18n keys for the breadcrumb items. */
  crumbKeys: string[];
  /** i18n key for the description. */
  descriptionKey: string;
  endpointHint?: string;
}

export function Placeholder({ titleKey, crumbKeys, descriptionKey, endpointHint }: PlaceholderProps) {
  const { t } = useTranslation();
  return (
    <>
      <TopBar title={t(titleKey)} crumbs={crumbKeys.map((k) => t(k))} />
      <div className="content">
        <div className="card" style={{ padding: 0 }}>
          <div className="empty">
            <div className="icon-wrap">
              <Icon name="inbox" size={26} />
            </div>
            <h4>{t('placeholder.inPreparation')}</h4>
            <p>{t(descriptionKey)}</p>
            {endpointHint && (
              <p
                className="mono"
                style={{
                  marginTop: 8,
                  color: 'var(--ink-500)',
                  fontSize: 11.5,
                }}
              >
                {endpointHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
