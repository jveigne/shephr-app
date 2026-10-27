import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Table, type Column } from './ui';
import { Icon } from './Icon';
import {
  getEventHierarchyStats,
  type EventHierarchyLeaderStats,
  type EventHierarchyUnitStats,
} from '../services/eventsApi';
import { hierarchyAccessDenied, moduleAccessDenied } from '../services/entitlementsApi';
import { errMsg } from '../pages/Assembly';

// ---------------------------------------------------------------------------------------------
//  Évènements de la chaîne — D-HIE-09 (JP 28/10, lot HIE). Bloc PAYANT de la page 3 « Vie de mon
//  leadership » (offre Caleb, code personnel `HIERARCHIE_SUIVI`).
//  - Périmètre = assemblées de `scopeOf(appelant)` : la CHAÎNE de supervision (supervisor_id
//    récursif), jamais la géographie — les statistiques géographiques (`/events/stats`, D-OFF-12)
//    ne sont pas touchées.
//  - Comptage D-EVT-03 calculé par le serveur (DONE, non supprimés, type évangélique) : rien n'est
//    recalculé ici, on affiche `total`, `byLeader` et `units` tels quels.
//  - Aucun nom de participant (RG-HIE-39) : noms d'assemblées et de DIRIGEANTS seulement.
//  - 403 `HIERARCHIE_SUIVI` → `onLocked` (verrou de la page, jamais un toast) ; 403 `EVENTS`
//    (module coupé pour le ministère) → bloc masqué.
// ---------------------------------------------------------------------------------------------

function locale(lang: string): string {
  return lang.startsWith('en') ? 'en-GB' : 'fr-FR';
}

/** Date « AAAA-MM-JJ » lue en heure LOCALE (jamais minuit UTC). */
function fmtDay(iso: string | null, lang: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi" style={{ padding: '12px 14px' }}>
      <div className="lbl" style={{ fontSize: 11 }}>{label}</div>
      <div className="val" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function EventHierarchyBlock({ from, to, onLocked }: { from: string; to: string; onLocked: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useQuery({
    queryKey: ['events', 'hierarchy', 'stats', from, to],
    queryFn: () => getEventHierarchyStats(from, to),
    retry: false,
  });

  const locked = !!hierarchyAccessDenied(q.error);
  const denied = moduleAccessDenied(q.error);
  const moduleOff = !locked && denied?.moduleCode === 'EVENTS';
  useEffect(() => {
    if (locked) onLocked();
  }, [locked, onLocked]);
  if (locked || moduleOff) return null;

  const people = (n: number, guests: number) =>
    guests > 0 ? t('hierarchy.events.participantsWithGuests', { count: n, guests }) : String(n);

  const leaderCols: Column<EventHierarchyLeaderStats & { id: string }>[] = [
    {
      label: t('hierarchy.events.leader'),
      render: (r) => <span style={{ fontWeight: 500 }}>{r.leaderName ?? t('hierarchy.events.noLeader')}</span>,
    },
    { label: t('hierarchy.events.units'), render: (r) => r.unitCount },
    { label: t('hierarchy.events.count'), render: (r) => <strong>{r.count}</strong> },
    { label: t('hierarchy.events.participants'), render: (r) => people(r.participants, r.guests) },
    { label: t('hierarchy.events.conversions'), render: (r) => r.conversions },
    { label: t('hierarchy.events.restorations'), render: (r) => r.restorations },
    { label: t('hierarchy.events.baptisms'), render: (r) => r.baptisms },
  ];

  const unitCols: Column<EventHierarchyUnitStats & { id: string }>[] = [
    {
      label: t('hierarchy.events.assembly'),
      style: { minWidth: 200 },
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {r.unitName}
            {r.cityName && <span style={{ color: 'var(--ink-500)', fontSize: 12, fontWeight: 400 }}> · {r.cityName}</span>}
          </div>
          {/* Chaîne de DIRIGEANTS jusqu'à l'assemblée, puis son dirigeant — jamais un membre. */}
          {(r.supervisorChain.length > 0 || r.leaderName) && (
            <div style={{ color: 'var(--ink-500)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Icon name="hierarchy" size={11} />
              <span>
                {[
                  ...r.supervisorChain,
                  ...(r.leaderName && r.supervisorChain[r.supervisorChain.length - 1] !== r.leaderName ? [r.leaderName] : []),
                ].join(' › ')}
              </span>
            </div>
          )}
        </div>
      ),
    },
    { label: t('hierarchy.events.count'), render: (r) => <strong>{r.count}</strong> },
    { label: t('hierarchy.events.participants'), render: (r) => people(r.participants, r.guests) },
    { label: t('hierarchy.events.conversions'), render: (r) => r.conversions },
    {
      label: t('hierarchy.events.lastEvent'),
      render: (r) => <span style={{ color: 'var(--ink-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDay(r.lastEventDate, lang)}</span>,
    },
  ];

  let body: ReactNode;
  if (q.isLoading) {
    body = <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>;
  } else if (q.isError || !q.data) {
    body = <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{errMsg(q.error, t('hierarchy.events.loadError'))}</p>;
  } else {
    const s = q.data;
    body = (
      <>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 14 }}>
          <Kpi label={t('hierarchy.events.count')} value={s.total.count} />
          <Kpi
            label={t('hierarchy.events.participants')}
            value={s.total.participants}
            sub={s.total.guests > 0 ? t('hierarchy.events.guestsSub', { count: s.total.guests }) : undefined}
          />
          <Kpi label={t('hierarchy.events.conversions')} value={s.total.conversions} />
          <Kpi label={t('hierarchy.events.baptisms')} value={s.total.baptisms} />
        </div>
        {s.units.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('hierarchy.events.empty')}</p>
        ) : (
          <>
            {s.byLeader.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('hierarchy.events.byLeader')}</div>
                <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                  <Table
                    columns={leaderCols}
                    rows={s.byLeader.map((r, i) => ({ ...r, id: r.leaderId ?? `none-${i}` }))}
                    zebra
                  />
                </div>
              </>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('hierarchy.events.byUnit')}</div>
            <div style={{ overflowX: 'auto' }}>
              <Table columns={unitCols} rows={s.units.map((r) => ({ ...r, id: r.unitId }))} zebra />
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <strong style={{ fontSize: 14 }}>{t('hierarchy.events.title')}</strong>
      <div style={{ marginTop: 12 }}>{body}</div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>{t('hierarchy.events.hint')}</p>
    </div>
  );
}
