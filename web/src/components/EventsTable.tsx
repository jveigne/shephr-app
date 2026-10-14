import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Pagination, Table, type Column } from './ui';
import { Icon } from './Icon';
import type { EventResponse, Page } from '../services/eventsApi';
import { eventTypeLabel, fmtEventDates, isToClose } from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Liste d'évènements — partagée par l'agenda (/events) et « Mes actions » (/my-actions, spec
//  §6.1 : type, date, lieu, participants / âmes si saisis). Pagination serveur (Page Spring, base 0).
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
}: {
  page: Page<EventResponse>;
  /** Page demandée, base 0. */
  onPage: (page: number) => void;
  onOpen: (event: EventResponse) => void;
  empty: ReactNode;
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
          <div style={{ fontWeight: 500 }}>{eventTypeLabel(e, lang)}</div>
          {e.title && <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{e.title}</div>}
        </div>
      ),
    },
    // L'auteur garde ses évènements après un changement d'assemblée : le rattachement reste utile.
    { label: t('events.col.scope'), render: (e) => <span>{e.scopeName ?? '—'}</span> },
    { label: t('events.col.place'), render: (e) => (e.place ? <span>{e.place}</span> : dash) },
    {
      label: t('events.col.counts'),
      style: { whiteSpace: 'nowrap' },
      render: (e) =>
        e.participants == null && e.soulsWon == null ? (
          dash
        ) : (
          <span style={{ whiteSpace: 'nowrap' }}>
            {t('events.countsShort', { participants: e.participants ?? '—', souls: e.soulsWon ?? '—' })}
          </span>
        ),
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
