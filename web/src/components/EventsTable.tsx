import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Pagination, Table, type Column } from './ui';
import { Icon } from './Icon';
import { listEvents, type EventListParams, type EventResponse, type Page } from '../services/eventsApi';
import {
  EVENT_KEYS,
  countKeysFor,
  eventErrorMessage,
  eventTypeLabel,
  fmtCounts,
  fmtEventDates,
  isToClose,
  lastPageIfPast,
} from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Liste d'évènements — partagée par l'agenda des dirigeants (/events), « Mes actions » d'un
//  dirigeant (onglet Déclarer) et la vue du membre (/my-actions, D-EVT-14 — spec §6.1 : type,
//  date, lieu, compteurs si saisis — participants dont invités (D-EVT-17), + conversions / restaurations / baptêmes d'un type
//  évangélique, D-EVT-15 ; prédicateur sous le type s'il est renseigné, D-EVT-16). Pagination
//  serveur (Page Spring, base 0).
// ---------------------------------------------------------------------------------------------

/** Pastilles de statut d'un évènement : programmé / à clôturer / réalisé / annulé, + marqueurs. */
export function EventStatusBadges({ event }: { event: EventResponse }) {
  const { t } = useTranslation();
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {event.status === 'PLANNED' &&
        (isToClose(event) ? (
          <Badge tone="warn" dot>{t('events.status.toClose')}</Badge>
        ) : (
          <Badge tone="earth" dot>{t('events.status.PLANNED')}</Badge>
        ))}
      {event.status === 'DONE' && <Badge tone="ok" dot>{t('events.status.DONE')}</Badge>}
      {event.status === 'CANCELLED' && <Badge tone="gray" dot>{t('events.status.CANCELLED')}</Badge>}
      {/* D-EVT-03 : un DONE d'un type non évangélique est enregistré mais pas compté. */}
      {event.status === 'DONE' && !event.counted && <Badge tone="gray">{t('events.notCounted')}</Badge>}
      {/* RG-ACT-07 : informatif, l'évènement reste dans le total. */}
      {event.toVerify && <Badge tone="warn">{t('events.toVerify')}</Badge>}
    </span>
  );
}

export function EventsTable({
  page,
  onPage,
  onOpen,
  empty,
  mineId,
  withScope = true,
}: {
  page: Page<EventResponse>;
  /** Page demandée, base 0. */
  onPage: (page: number) => void;
  onOpen: (event: EventResponse) => void;
  empty: ReactNode;
  /** Compte courant : ses évènements portent la pastille « Moi » (vue du membre, D-EVT-14). */
  mineId?: string;
  /** Colonne « Rattachement » — inutile quand toute la liste est d'une seule assemblée. */
  withScope?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const dash = <span style={{ color: 'var(--ink-400)' }}>—</span>;

  const cols: Column<EventResponse>[] = [
    {
      label: t('events.col.date'),
      style: { whiteSpace: 'nowrap' },
      render: (e) => <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtEventDates(e, lang)}</span>,
    },
    {
      label: t('events.col.event'),
      render: (e) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {eventTypeLabel(e, lang)}
            {mineId != null && e.createdById === mineId && (
              <span style={{ marginLeft: 6 }}>
                <Badge tone="green">{t('events.member.mine')}</Badge>
              </span>
            )}
          </div>
          {e.title && <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{e.title}</div>}
          {/* D-EVT-16 (JP 14/10) : le prédicateur, quand il est renseigné (type évangélique seulement). */}
          {e.preacher && (
            <div style={{ color: 'var(--green-800)', fontSize: 12, fontWeight: 500 }}>
              {t('events.preacherLine', { name: e.preacher })}
            </div>
          )}
        </div>
      ),
    },
    // L'auteur garde ses évènements après un changement d'assemblée : le rattachement reste utile.
    ...(withScope
      ? [{ label: t('events.col.scope'), render: (e: EventResponse) => <span>{e.scopeName ?? '—'}</span> }]
      : []),
    { label: t('events.col.place'), render: (e) => (e.place ? <span>{e.place}</span> : dash) },
    {
      label: t('events.col.counts'),
      // Seuls les compteurs renseignés : « 40 participants dont 12 invités · 3 conversions » (D-EVT-17).
      render: (e) => fmtCounts(e, countKeysFor(e.evangelism), t, lang) || dash,
    },
    { label: t('events.col.status'), render: (e) => <EventStatusBadges event={e} /> },
    { label: '', style: { width: 40 }, render: () => <Icon name="chevRight" size={14} /> },
  ];

  return (
    <>
      <Table columns={cols} rows={page.content} zebra onRowClick={onOpen} empty={empty} />
      {page.totalPages > 1 && (
        <Pagination
          page={page.number + 1}
          pageCount={page.totalPages}
          total={page.totalElements}
          perPage={page.size}
          onPage={(p) => onPage(p - 1)}
        />
      )}
    </>
  );
}

/**
 * Bloc titré d'une liste `GET /api/church/events` (contrat §3.5), paginé côté serveur : les trois
 * blocs de l'agenda des dirigeants et les deux de la vue du membre (D-EVT-14, contrat §3.12).
 */
export function EventsBlock({
  title,
  sub,
  tone,
  params,
  empty,
  onOpen,
  mineId,
  withScope,
}: {
  title: string;
  sub: string;
  tone: 'warn' | 'earth' | 'ok';
  params: EventListParams;
  empty: string;
  onOpen: (e: EventResponse) => void;
  mineId?: string;
  withScope?: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  // Un autre filtre = une autre liste : on revient à sa première page.
  const filterKey = JSON.stringify(params);
  const [lastFilter, setLastFilter] = useState(filterKey);
  if (filterKey !== lastFilter) {
    setLastFilter(filterKey);
    setPage(0);
  }

  const q = useQuery({
    queryKey: [...EVENT_KEYS.data, 'list', params, page],
    queryFn: () => listEvents({ ...params, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  // Une écriture (clôture, suppression…) peut vider la dernière page : on se replie sur la nouvelle
  // dernière page plutôt que de rester sur un état vide sans pagination.
  const lastPage = lastPageIfPast(q.data, page);
  if (lastPage != null) setPage(lastPage);

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 className="section-title" style={{ fontSize: 18, margin: 0 }}>{title}</h2>
        {q.data && q.data.totalElements > 0 && <Badge tone={tone}>{q.data.totalElements}</Badge>}
        <span className="muted" style={{ fontSize: 12.5 }}>{sub}</span>
      </div>
      {q.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : !q.data ? (
        <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(q.error, t)}</p>
      ) : (
        <div className="card" style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
          <EventsTable
            page={q.data}
            onPage={setPage}
            onOpen={onOpen}
            mineId={mineId}
            withScope={withScope}
            empty={<p style={{ margin: 0, padding: '16px 22px', color: 'var(--ink-500)', fontSize: 13 }}>{empty}</p>}
          />
        </div>
      )}
    </section>
  );
}
