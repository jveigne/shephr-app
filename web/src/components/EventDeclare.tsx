import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { EventForm } from './EventForm';
import { EventsTable } from './EventsTable';
import { EventDetailModal } from './EventDetail';
import { getMyEvents, getMyEventScopes, listEventTypes, type EventResponse } from '../services/eventsApi';
import { EVENT_KEYS, currentMonthLocal, eventErrorMessage, fmtCount, fmtMonth, lastPageIfPast } from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  « Déclarer » + « Mes actions » (spec §4.2 et §6.1) — l'onglet Déclarer de /events (dirigeants).
//  D-EVT-14 (JP 14/10) : le simple membre a sa vue dédiée, /my-actions (pages/MyActions.tsx), qui
//  ne reprend d'ici que l'état vide et la tuile de compteur.
// ---------------------------------------------------------------------------------------------

export function EventEmptyState({ title, text, icon = 'inbox' }: { title: string; text?: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name={icon} size={26} />
      </div>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
    </div>
  );
}

/**
 * Carte de déclaration. RG-ACT-04 : créée directement en DONE, elle compte dès l'enregistrement.
 * Après succès, le formulaire repart à zéro avec un nouveau `clientId` (RG-EVT-07).
 */
export function DeclarePanel() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [formKey, setFormKey] = useState(0);

  const typesQ = useQuery({ queryKey: EVENT_KEYS.types, queryFn: listEventTypes });
  const scopesQ = useQuery({ queryKey: EVENT_KEYS.scopes, queryFn: getMyEventScopes });

  const body = (() => {
    if (typesQ.isLoading || scopesQ.isLoading) {
      return <p style={{ margin: 0, color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!typesQ.data || !scopesQ.data) {
      return (
        <p role="alert" style={{ margin: 0, color: 'var(--err)' }}>
          {eventErrorMessage(typesQ.error ?? scopesQ.error, t)}
        </p>
      );
    }
    // Contrat §3.1 : catalogue vide → aucune déclaration possible (`typeId` requis).
    if (typesQ.data.length === 0) {
      return <EventEmptyState title={t('events.declare.noTypes')} text={t('events.declare.noTypesHint')} />;
    }
    // RG-ACT-01 : il faut au moins un nœud de déclaration (un MEMBRE sans assemblée n'en a pas).
    if (!scopesQ.data.canDeclare) {
      return <EventEmptyState title={t('events.declare.noScope')} text={t('events.declare.noScopeHint')} />;
    }
    return (
      <EventForm
        key={formKey}
        mode="declare"
        types={typesQ.data}
        scopes={scopesQ.data}
        onSaved={() => {
          push({ kind: 'ok', title: t('events.declare.saved') });
          setFormKey((k) => k + 1);
        }}
      />
    );
  })();

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="card-head">
        <div>
          <div className="ttl">{t('events.declare.title')}</div>
          <div className="sub">{t('events.declare.sub')}</div>
        </div>
      </div>
      <div className="card-body">{body}</div>
    </div>
  );
}

/** « Mes actions » (spec §6.1) : compteurs du mois / de l'année en tête, puis la liste, récent en haut. */
export function MyEventsList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<EventResponse | null>(null);
  // Contrat §1.4 : on envoie toujours le mois LOCAL (le serveur compterait sinon le mois UTC).
  const month = currentMonthLocal();

  const mineQ = useQuery({
    queryKey: [...EVENT_KEYS.data, 'mine', month, page],
    queryFn: () => getMyEvents({ month, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  const mine = mineQ.data;
  // Supprimer la seule action de la dernière page la vide : repli sur la nouvelle dernière page.
  const lastPage = lastPageIfPast(mine?.events, page);
  if (lastPage != null) setPage(lastPage);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 className="section-title">{t('events.mine.title')}</h2>
          <div className="section-sub" style={{ margin: 0 }}>{t('events.mine.sub')}</div>
        </div>
        {mine && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <EventCounter label={t('events.mine.thisMonth', { month: fmtMonth(mine.month, lang) })} value={fmtCount(mine.monthCount, lang)} />
            <EventCounter label={t('events.mine.thisYear', { year: mine.month.slice(0, 4) })} value={fmtCount(mine.yearCount, lang)} />
          </div>
        )}
      </div>
      {mineQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : !mine ? (
        <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(mineQ.error, t)}</p>
      ) : (
        <EventsTable
          page={mine.events}
          onPage={setPage}
          onOpen={setOpened}
          empty={<EventEmptyState title={t('events.mine.empty')} text={t('events.mine.emptyHint')} />}
        />
      )}
      {opened && <EventDetailModal eventId={opened.id} initial={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

export function EventCounter({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi" style={{ padding: '10px 16px', minWidth: 150 }}>
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
    </div>
  );
}
