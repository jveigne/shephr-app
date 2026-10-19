import { useEffect, useState, type CSSProperties } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Table, type Column } from './ui';
import { Icon } from './Icon';
import { useToast } from './Toast';
import {
  getEventStats,
  type ChildStats,
  type EventStats,
  type MonthStats,
  type OrgLevel,
  type StatsScope,
  type StatsTotals,
  type TypeStats,
} from '../services/eventsApi';
import {
  EVANGELISM_COUNTERS,
  EVENT_KEYS,
  countKeysFor,
  errCode,
  eventErrorMessage,
  fmtCount,
  fmtMonth,
  levelKey,
  typeLabel,
} from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Statistiques d'évangélisation avec descente Nation → Région → Ville → Assemblée (§6.2 du plan,
//  D-EVT-09 : l'écran du SECRÉTARIAT). Écran des dirigeants (/events) : D-EVT-14 (JP 14/10), le
//  simple membre n'a pas de descente — son compteur d'assemblée est dans /my-actions.
//  Même mécanique que le DrillView des Objectifs (pile d'étapes + fil d'Ariane tenu par le front),
//  en composant neuf : Goals.tsx n'est pas touché.
//  - Racine = `/stats` sans nœud : mon périmètre le plus large (nation, ou ministère entier ; au
//    moins l'assemblée principale, D-EVT-13) ; on ne remonte jamais au-dessus (ce serait hors
//    périmètre, contrat §6).
//  - Descendre = rappeler `/stats` sur l'enfant cliqué, même période.
//  - D-EVT-03 : seuls les évènements DONE d'un type évangélique comptent ; « à vérifier » ne
//    retire rien (RG-ACT-07). D-EVT-04 : un évènement compte une fois, au nœud où il est rattaché
//    (`ownLevelCount`). D-EVT-06 : aucune cible, aucune barre de progression.
//  - D-EVT-15 (JP 14/10) : chaque niveau somme participants, conversions, restaurations et
//    baptêmes (vides = 0) — deux rangées d'indicateurs (activité, puis fruits) et les mêmes
//    colonnes dans les trois tableaux. D-EVT-17 (JP 14/10) : les invités aussi, en indicateur et
//    en colonne juste après les participants (dont ils sont la part extérieure).
// ---------------------------------------------------------------------------------------------

interface DrillStep {
  level: OrgLevel;
  id: string;
  name: string;
}

const crumbStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--green-700)',
  fontSize: 13,
  textDecoration: 'underline',
};

const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontFamily: 'var(--font-serif)',
  color: 'var(--green-800)',
  fontWeight: 500,
};

/** Nom affiché d'une racine de statistiques (le ministère n'a pas de nom de nœud). */
function statsScopeName(s: StatsScope, tr: (key: string) => string): string {
  return s.level === 'MINISTRY' ? tr('events.stats.ministry') : s.name ?? tr(levelKey(s.level));
}

export function EventStatsDrill({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [path, setPath] = useState<DrillStep[]>([]);
  const current = path.length > 0 ? path[path.length - 1] : null;

  // La racine reste chargée pendant la descente : son nom ouvre le fil d'Ariane.
  const rootQ = useQuery({
    queryKey: [...EVENT_KEYS.data, 'stats', 'root', from, to],
    queryFn: () => getEventStats({ from, to }),
    placeholderData: keepPreviousData,
  });
  const nodeQ = useQuery({
    queryKey: [...EVENT_KEYS.data, 'stats', current?.level, current?.id, from, to],
    queryFn: () => getEventStats({ from, to, scopeLevel: current!.level, scopeId: current!.id }),
    enabled: current != null,
    placeholderData: keepPreviousData,
  });
  const q = current ? nodeQ : rootQ;
  const stats = q.data ?? null;

  // Un nœud devenu illisible (périmètre modifié) ou supprimé : on revient à la racine plutôt que
  // de laisser l'écran bloqué sur une erreur.
  const nodeGone = current != null && nodeQ.isError && ['UNAUTHORIZED_ACCESS', 'RESOURCE_NOT_FOUND'].includes(errCode(nodeQ.error) ?? '');
  useEffect(() => {
    if (!nodeGone) return;
    push({ kind: 'error', title: t('events.stats.nodeGone'), msg: eventErrorMessage(nodeQ.error, t) });
    setPath([]);
  }, [nodeGone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Racine illisible : rien à descendre, pas de fil d'Ariane.
  if (!current && rootQ.isLoading) return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  if (!current && !rootQ.data) {
    // Contrat §6 : aucun périmètre de lecture → 403 (compte sans assemblée ni responsabilité dans le module).
    const noPerimeter = errCode(rootQ.error) === 'UNAUTHORIZED_ACCESS';
    return (
      <p role="alert" style={{ color: noPerimeter ? 'var(--ink-500)' : 'var(--err)' }}>
        {noPerimeter ? t('events.stats.noPerimeter') : eventErrorMessage(rootQ.error, t)}
      </p>
    );
  }

  const rootName = rootQ.data ? statsScopeName(rootQ.data.scope, t) : t('events.stats.root');

  return (
    <div style={{ opacity: q.isFetching && q.isPlaceholderData ? 0.6 : 1, transition: 'opacity .15s' }}>
      {/* Fil d'Ariane : la racine puis la pile des nœuds visités (UC-SEC-02, même geste que Goals) —
          toujours affiché, pour pouvoir remonter même si un niveau ne se charge pas. */}
      <nav
        aria-label={t('events.stats.breadcrumb')}
        style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        {path.length === 0 ? (
          <strong style={{ fontSize: 13 }}>{rootName}</strong>
        ) : (
          <button type="button" style={crumbStyle} onClick={() => setPath([])}>
            {rootName}
          </button>
        )}
        {path.map((step, i) => (
          <span key={step.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="chevRight" size={11} />
            {i === path.length - 1 ? (
              <strong style={{ fontSize: 13 }}>{step.name}</strong>
            ) : (
              <button type="button" style={crumbStyle} onClick={() => setPath(path.slice(0, i + 1))}>
                {step.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {stats ? (
        <StatsBody stats={stats} onOpen={(c) => setPath([...path, { level: c.level, id: c.id, name: c.name ?? t(levelKey(c.level)) }])} />
      ) : q.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : (
        <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(q.error, t)}</p>
      )}
    </div>
  );
}

function StatsBody({ stats, onOpen }: { stats: EventStats; onOpen: (c: ChildStats) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const here = statsScopeName(stats.scope, t);
  return (
    <>
      <StatsKpis stats={stats} />

      <p style={{ margin: '12px 0 22px', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('events.stats.countingRule')}</p>

      {stats.children.length > 0 && <ChildrenBlock stats={stats} here={here} onOpen={onOpen} />}

      {/* Sept colonnes par tableau (D-EVT-15, D-EVT-17) : côte à côte seulement s'il y a la place. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: 16, marginTop: 16 }}>
        <TypesBlock rows={stats.byType} lang={lang} />
        <MonthsBlock rows={stats.byMonth} lang={lang} />
      </div>
    </>
  );
}

function StatsKpis({ stats }: { stats: EventStats }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    // Deux rangées : l'activité (actions, participants, invités — D-EVT-17 —, agenda), puis les
    // fruits (D-EVT-15).
    <div className="kpi-grid">
      <div className="kpi">
        <div className="lbl">{t('events.stats.kpiCount')}</div>
        <div className="val">{fmtCount(stats.total.count, lang)}</div>
        <span className="deco" />
      </div>
      <div className="kpi">
        <div className="lbl">{t('events.counters.participants')}</div>
        <div className="val">{fmtCount(stats.total.participants, lang)}</div>
        <span className="deco" />
      </div>
      <div className="kpi">
        <div className="lbl">{t('events.counters.guests')}</div>
        <div className="val">{fmtCount(stats.total.guests, lang)}</div>
        <span className="deco" />
      </div>
      {/* Agenda du sous-arbre : tous types, indépendamment de la période (contrat §6). */}
      <div className="kpi">
        <div className="lbl">{t('events.stats.kpiAgenda')}</div>
        <div className="val">{fmtCount(stats.plannedUpcoming, lang)}</div>
        <div className="delta" style={{ color: stats.toCloseCount > 0 ? 'var(--warn)' : 'var(--ink-500)' }}>
          {t('events.stats.toClose', { count: stats.toCloseCount })}
        </div>
        <span className="deco" />
      </div>
      {EVANGELISM_COUNTERS.map((k) => (
        <div key={k} className="kpi">
          <div className="lbl">{t(`events.counters.${k}`)}</div>
          <div className="val">{fmtCount(stats.total[k], lang)}</div>
          <span className="deco" />
        </div>
      ))}
    </div>
  );
}

type ChildRow = ChildStats & { id: string };

/** Colonnes chiffrées communes aux trois tableaux : actions, participants, invités (D-EVT-17), puis les fruits (D-EVT-15). */
function totalsColumns<T extends StatsTotals & { id: string }>(t: TFunction, lang: string): Column<T>[] {
  return [
    { label: t('events.stats.colCount'), cellClass: 'num', render: (r) => <strong>{fmtCount(r.count, lang)}</strong> },
    ...countKeysFor(true).map(
      (k): Column<T> => ({ label: t(`events.counters.${k}`), cellClass: 'num', render: (r) => fmtCount(r[k], lang) }),
    ),
  ];
}

function ChildrenBlock({ stats, here, onOpen }: { stats: EventStats; here: string; onOpen: (c: ChildStats) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const childLevel = stats.children[0].level;
  const homogeneous = stats.children.every((c) => c.level === childLevel);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 style={cardTitle}>
            {homogeneous ? t(`events.stats.byLevel.${childLevel}`) : t('events.stats.byChild')}
          </h3>
          <div className="sub">{t('events.stats.drillHint')}</div>
        </div>
      </div>
      <Table<ChildRow>
        columns={[
          {
            label: t('events.stats.colNode'),
            render: (c) => (
              <div>
                <div style={{ fontWeight: 500 }}>{c.name ?? '—'}</div>
                {!homogeneous && <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{t(levelKey(c.level))}</div>}
              </div>
            ),
          },
          ...totalsColumns<ChildRow>(t, lang),
          { label: '', style: { width: 40 }, render: () => <Icon name="chevRight" size={14} /> },
        ]}
        rows={stats.children}
        zebra
        onRowClick={onOpen}
      />
      {/* D-EVT-04 : rattachés au nœud lui-même, ils comptent ici et dans aucun sous-niveau. */}
      {stats.ownLevelCount > 0 && stats.scope.level !== 'MINISTRY' && (
        <p style={{ margin: 0, padding: '12px 22px', fontSize: 12.5, color: 'var(--ink-500)', borderTop: '1px solid var(--line-soft)' }}>
          {t('events.stats.ownLevel', { count: stats.ownLevelCount, name: here })}
        </p>
      )}
    </div>
  );
}

function TypesBlock({ rows, lang }: { rows: TypeStats[]; lang: string }) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="card-head">
        <h3 style={cardTitle}>{t('events.stats.byType')}</h3>
      </div>
      <Table<TypeStats & { id: string }>
        columns={[
          { label: t('events.stats.colType'), render: (r) => <span style={{ fontWeight: 500 }}>{typeLabel(r, lang)}</span> },
          ...totalsColumns<TypeStats & { id: string }>(t, lang),
        ]}
        rows={rows.map((r) => ({ ...r, id: r.typeId }))}
        zebra
        empty={<p style={{ margin: 0, padding: '16px 22px', color: 'var(--ink-500)' }}>{t('events.stats.noType')}</p>}
      />
    </div>
  );
}

/** Par mois : un TABLEAU, pas de courbe (hors V1, spec §8). */
function MonthsBlock({ rows, lang }: { rows: MonthStats[]; lang: string }) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="card-head">
        <h3 style={cardTitle}>{t('events.stats.byMonth')}</h3>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <Table<MonthStats & { id: string }>
          columns={[
            { label: t('events.stats.colMonth'), render: (r) => <span style={{ textTransform: 'capitalize' }}>{fmtMonth(r.month, lang)}</span> },
            ...totalsColumns<MonthStats & { id: string }>(t, lang),
          ]}
          rows={rows.map((r) => ({ ...r, id: r.month }))}
          zebra
        />
      </div>
    </div>
  );
}
