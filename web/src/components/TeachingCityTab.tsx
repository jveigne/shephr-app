import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field, Picker, Table, type Column } from './ui';
import { LockedFeature } from './LockedFeature';
import { MemberProgressCell, fmtActivity } from './TeachingHierarchyBlock';
import { getTeachingLocality, type TeachingLocalityMember } from '../services/assemblyApi';
import { cityTeachingAccessDenied } from '../services/entitlementsApi';
import { useTeachingAccess } from '../utils/teachingAccess';
import { errMsg } from '../pages/Assembly';

// ---------------------------------------------------------------------------------------------
//  Onglet « Enseignement » du Suivi de la ville — D-FIN-08 (JP 06/11, contrat §5.11, §11.2). OFFRE
//  NÉHÉMIE, axe GÉOGRAPHIQUE (assemblées de la ville), droit DE VILLE `ENSEIGNEMENT_SUIVI` : membres
//  NOMMÉS, chapitres terminés, dernière activité. Jamais la chaîne de supervision (Caleb). Ville sans
//  droit : verrou d'avance dans la page, sans appel ; un 403 (droit fermé entre-temps) donne le même
//  `LockedFeature`, jamais un toast.
// ---------------------------------------------------------------------------------------------

export function TeachingCityTab({ localityId }: { localityId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { courses } = useTeachingAccess();
  const [courseId, setCourseId] = useState('');
  const current = courses.find((c) => c.id === courseId) ?? courses[0] ?? null;
  const q = useQuery({
    queryKey: ['teaching', 'locality', current?.id, localityId],
    queryFn: () => getTeachingLocality(current!.id, localityId),
    enabled: !!current,
    retry: false,
  });

  const denied = cityTeachingAccessDenied(q.error);
  if (denied) return <LockedFeature denied={denied} />;
  if (!current) return <p style={{ color: 'var(--ink-500)' }}>{t('teaching.city.none')}</p>;

  type Row = TeachingLocalityMember & { id: string };
  const cols: Column<Row>[] = [
    { label: t('teaching.hierarchy.member'), render: (m) => <span style={{ fontWeight: 500 }}>{m.fullName}</span> },
    { label: t('teaching.city.assembly'), render: (m) => <span style={{ fontSize: 13 }}>{m.unitName ?? '—'}</span> },
    { label: t('teaching.city.chapters'), render: (m) => <MemberProgressCell completed={m.completedCount} total={m.totalCount} /> },
    { label: t('teaching.city.lastActivity'), render: (m) => <span style={{ color: 'var(--ink-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtActivity(m.lastActivityAt, lang)}</span> },
  ];

  let body;
  if (q.isLoading) {
    body = <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  } else if (q.isError || !q.data) {
    body = <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(q.error, t('common.error'))}</p>;
  } else if (q.data.members.length === 0) {
    body = <p style={{ color: 'var(--ink-500)' }}>{t('teaching.city.none')}</p>;
  } else {
    const started = q.data.members.filter((m) => m.lastActivityAt != null).length;
    body = (
      <>
        <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--ink-700)' }}>
          {t('teaching.leader.summary', { started, members: q.data.members.length, count: started })}
        </p>
        <div className="card" style={{ overflowX: 'auto' }}>
          <Table columns={cols} rows={q.data.members.map((m) => ({ ...m, id: m.userId }))} zebra />
        </div>
      </>
    );
  }

  return (
    <>
      <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 17, color: 'var(--green-800)' }}>{t('teaching.city.title')}</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('teaching.hierarchy.cumulative')}</p>
      {courses.length > 1 && (
        <Field label={t('teaching.hierarchy.course')} style={{ maxWidth: 360, marginBottom: 14 }}>
          <Picker
            value={current.id}
            onChange={setCourseId}
            placeholder={t('teaching.hierarchy.course')}
            options={courses.map((c) => ({ id: c.id, label: c.name }))}
          />
        </Field>
      )}
      {body}
    </>
  );
}
