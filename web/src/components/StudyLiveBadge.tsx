import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getStudyMe } from '../services/assemblyApi';

/**
 * Pastille « En cours » à côté de l'entrée « Le Message de Bertoua » (Sidebar, MemberShell) — miroir
 * de la pastille de la tuile mobile. D-WEB-02 (JP 27/10) : affichée si `GET /study/me` porte une
 * assemblée avec une séance non terminée (`currentSession`). Requête lancée seulement si l'accès à
 * l'étude est ouvert (`useStudyAccess`) ; clé `['assembly','study','me']` partagée avec la page
 * Étude. Un échec masque la pastille (jamais d'erreur dans le menu).
 */
export function StudyLiveBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const meQ = useQuery({ queryKey: ['assembly', 'study', 'me'], queryFn: getStudyMe, enabled, retry: false });
  const live = enabled && !meQ.isError && (meQ.data?.assemblies ?? []).some((a) => !!a.currentSession);
  if (!live) return null;
  return (
    <span
      style={{
        marginLeft: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '1px 7px',
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        background: 'var(--earth-500)',
        color: 'var(--green-900)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-900)' }} />
      {t('nav.studyLive')}
    </span>
  );
}
