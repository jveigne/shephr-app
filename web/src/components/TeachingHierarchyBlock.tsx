import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Picker, Table, type Column } from './ui';
import { getTeachingHierarchy, type TeachingMemberProgress } from '../services/assemblyApi';
import { hierarchyAccessDenied } from '../services/entitlementsApi';
import { useTeachingAccess } from '../utils/teachingAccess';
import { ProgressBar, errMsg } from '../pages/Assembly';

// ---------------------------------------------------------------------------------------------
//  Avancement des enseignements dans la Hiérarchie — D-FIN-03 (JP 06/11, contrat §5.9, §11.2). OFFRE
//  CALEB, axe de la CHAÎNE de supervision (`scopeOf`, `HIERARCHIE_SUIVI`, droit PERSONNEL), jamais la
//  géographie : membres NOMMÉS par assemblée, y compris sa propre assemblée (pas d'« assemblée
//  gratuite » pour ce suivi). Avancement CUMULÉ : le sélecteur de période de la page ne s'y applique
//  pas (§5.4 du plan). Un 403 `HIERARCHIE_SUIVI` remonte par `onLocked` : verrou unique de la page,
//  jamais un toast. Bloc absent si le ministère n'a aucun enseignement.
// ---------------------------------------------------------------------------------------------

/** Date d'une dernière activité, ou « — » : compte qui n'a pas commencé. */
export function fmtActivity(iso: string | null, lang: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Barre + « 3 / 27 » : chiffres du serveur, jamais recalculés. */
export function MemberProgressCell({ completed, total }: { completed: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1 }}>
        <ProgressBar percent={total > 0 ? (100 * completed) / total : 0} height={6} />
      </div>
      <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{t('teaching.course.progress', { completed, total })}</span>
    </div>
  );
}

export function TeachingHierarchyBlock({ onLocked }: { onLocked: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { courses } = useTeachingAccess();
  const [courseId, setCourseId] = useState('');
  const current = courses.find((c) => c.id === courseId) ?? courses[0] ?? null;
  const q = useQuery({
    queryKey: ['teaching', 'hierarchy', current?.id],
    queryFn: () => getTeachingHierarchy(current!.id),
    enabled: !!current,
    retry: false,
  });
  const locked = !!hierarchyAccessDenied(q.error);
  useEffect(() => {
    if (locked) onLocked();
  }, [locked, onLocked]);

  if (!current || locked) return null;

  type Row = TeachingMemberProgress & { id: string };
  const cols: Column<Row>[] = [
    { label: t('teaching.hierarchy.member'), render: (m) => <span style={{ fontWeight: 500 }}>{m.fullName}</span> },
    { label: t('teaching.hierarchy.chapters'), render: (m) => <MemberProgressCell completed={m.completedCount} total={m.totalCount} /> },
    { label: t('teaching.hierarchy.lastActivity'), render: (m) => <span style={{ color: 'var(--ink-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtActivity(m.lastActivityAt, lang)}</span> },
  ];

  let body;
  if (q.isLoading) {
    body = <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>;
  } else if (q.isError || !q.data) {
    body = <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{errMsg(q.error, t('common.error'))}</p>;
  } else if (q.data.units.length === 0) {
    body = <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('teaching.hierarchy.none')}</p>;
  } else {
    const units = q.data.units;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {units.map((u) => {
          const started = u.members.filter((m) => m.lastActivityAt != null).length;
          return (
            // Beaucoup de membres possibles (mode MINISTRY) : assemblées repliées au-delà de trois.
            <details key={u.unitId} open={units.length <= 3} style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13.5 }}>
                <span style={{ fontWeight: 600, color: 'var(--green-800)' }}>{u.unitName}</span>
                <span style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>
                  {[u.cityName, u.leaderName, u.members.length > 0 ? t('teaching.leader.summary', { started, members: u.members.length, count: started }) : null].filter(Boolean).map((s) => ` · ${s}`).join('')}
                </span>
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                {u.members.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('teaching.hierarchy.noMembers')}</p>
                ) : (
                  <Table columns={cols} rows={u.members.map((m) => ({ ...m, id: m.userId }))} zebra />
                )}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <strong style={{ fontSize: 14 }}>{t('teaching.hierarchy.title')}</strong>
      <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('teaching.hierarchy.cumulative')}</p>
      {courses.length > 1 && (
        <div style={{ maxWidth: 360, marginBottom: 12 }}>
          <Picker
            value={current.id}
            onChange={setCourseId}
            placeholder={t('teaching.hierarchy.course')}
            options={courses.map((c) => ({ id: c.id, label: c.name }))}
          />
        </div>
      )}
      {body}
    </div>
  );
}
