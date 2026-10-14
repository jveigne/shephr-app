import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Button, Field, Modal, Picker, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { EventForm } from '../components/EventForm';
import { EventsTable } from '../components/EventsTable';
import { EventDetailModal } from '../components/EventDetail';
import { DeclarePanel, EventEmptyState, MyEventsList } from '../components/EventDeclare';
import { EventPeriodFilter } from '../components/EventPeriodFilter';
import { EventStatsDrill } from '../components/EventStatsDrill';
import { FEATURES } from '../config/features';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules, isSecretariat } from '../services/authApi';
import {
  getMyEventScopes,
  listEventTypes,
  listEvents,
  type EventListParams,
  type EventResponse,
  type EventScopes,
} from '../services/eventsApi';
import {
  EVENT_KEYS,
  addDaysLocal,
  defaultPeriod,
  eventErrorMessage,
  lastPageIfPast,
  periodBounds,
  scopeOptions,
  todayLocal,
  type Period,
} from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Évènements (plan du 14/10, lot E8 — §6.2) : Agenda / Déclarer / Statistiques.
//  D-EVT-05 (JP 14/10) : module d'abonnement EVENTS — sans lui, menu masqué (RG-06) et une URL
//  tapée à la main tombe sur un message plutôt que sur une cascade de 403.
//  D-EVT-07 : chacun voit la géographie de son périmètre (LEADER / SECRETARIAT : tout le
//  ministère). D-EVT-08 / RG-EVT-03 : « Programmer » seulement si `canPlan` (serveur).
//  D-EVT-09 : « Statistiques » est l'écran du secrétariat — onglet ouvert par défaut pour lui.
// ---------------------------------------------------------------------------------------------

type Tab = 'agenda' | 'declare' | 'stats';

export function EventsPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>(() => (isSecretariat(me) ? 'stats' : 'agenda'));
  const [planning, setPlanning] = useState(false);

  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasEvents = FEATURES.events && (modulesQ.data ?? []).includes('EVENTS');

  const scopesQ = useQuery({ queryKey: EVENT_KEYS.scopes, queryFn: getMyEventScopes, enabled: hasEvents });
  const typesQ = useQuery({ queryKey: EVENT_KEYS.types, queryFn: listEventTypes, enabled: hasEvents });
  const scopes = scopesQ.data ?? null;
  const canPlan = scopes?.canPlan ?? false;

  const body = (() => {
    if (modulesQ.isLoading || (hasEvents && scopesQ.isLoading)) {
      return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!hasEvents) {
      return <EventEmptyState title={t('events.moduleOff')} text={t('events.moduleOffHint')} />;
    }
    if (!scopes) {
      return <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(scopesQ.error, t)}</p>;
    }
    return (
      <>
        <div className="tabs" role="tablist">
          <TabButton active={tab === 'agenda'} onClick={() => setTab('agenda')} icon="calendar">
            {t('events.tabAgenda')}
          </TabButton>
          {scopes.canDeclare && (
            <TabButton active={tab === 'declare'} onClick={() => setTab('declare')} icon="plus">
              {t('events.tabDeclare')}
            </TabButton>
          )}
          <TabButton active={tab === 'stats'} onClick={() => setTab('stats')} icon="dashboard">
            {t('events.tabStats')}
          </TabButton>
        </div>
        {tab === 'agenda' && <AgendaTab scopes={scopes} />}
        {tab === 'declare' && scopes.canDeclare && (
          <>
            <DeclarePanel />
            <MyEventsList />
          </>
        )}
        {tab === 'stats' && <StatsTab />}
      </>
    );
  })();

  return (
    <>
      <TopBar
        title={t('events.title')}
        crumbs={[t('common.brand'), t('events.title')]}
        actions={
          hasEvents && canPlan && tab === 'agenda' ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={14} />}
              onClick={() => setPlanning(true)}
              disabled={!typesQ.data || typesQ.data.length === 0}
              title={typesQ.data?.length === 0 ? t('events.declare.noTypes') : undefined}
            >
              {t('events.agenda.plan')}
            </Button>
          ) : undefined
        }
      />
      <div className="content">{body}</div>
      {planning && scopes && typesQ.data && (
        <Modal
          open
          size="lg"
          onClose={() => setPlanning(false)}
          title={t('events.agenda.planTitle')}
          sub={t('events.agenda.planSub')}
        >
          <EventForm
            mode="plan"
            types={typesQ.data}
            scopes={scopes}
            onCancel={() => setPlanning(false)}
            onSaved={() => {
              push({ kind: 'ok', title: t('events.agenda.planned') });
              setPlanning(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: ReactNode;
}) {
  return (
    <button type="button" role="tab" aria-selected={active} className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon name={icon} size={15} />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
//  Agenda — trois blocs (contrat §3.5, « recettes d'agenda ») sur le nœud choisi et son sous-arbre,
//  + les évènements de ses ancêtres en lecture (une conférence de ville est visible depuis ses
//  assemblées, recette §9.3 n°4) :
//   - « À clôturer » : programmés dont la date est passée — à marquer réalisés ou à annuler ;
//   - « À venir »    : programmés à partir d'aujourd'hui (local) ;
//   - « Réalisés »   : DONE de la période choisie (D-EVT-06).
//  La période ne filtre que les réalisés : à venir et à clôturer sont des listes d'action,
//  comme `plannedUpcoming` / `toCloseCount` des statistiques (indépendants de la période).
// ---------------------------------------------------------------------------------------------

const ALL = 'all';

function AgendaTab({ scopes }: { scopes: EventScopes }) {
  const { t } = useTranslation();
  const [nodeId, setNodeId] = useState(ALL);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('year'));
  const [opened, setOpened] = useState<EventResponse | null>(null);

  const node = scopes.scopes.find((s) => s.id === nodeId) ?? null;
  const nodeParams: EventListParams = node ? { scopeLevel: node.level, scopeId: node.id } : {};
  const today = todayLocal();
  const bounds = periodBounds(period);

  return (
    <>
      <div className="filters">
        {/* Nœud : absent = tout mon périmètre de lecture (contrat §3.5). */}
        {scopes.scopes.length > 1 && (
          <Field label={t('events.agenda.node')} style={{ minWidth: 260 }}>
            <Picker
              value={nodeId}
              onChange={setNodeId}
              options={[{ id: ALL, label: t('events.agenda.allPerimeter') }, ...scopeOptions(scopes.scopes, t)]}
              placeholder={t('events.agenda.allPerimeter')}
            />
          </Field>
        )}
        <EventPeriodFilter value={period} onChange={setPeriod} />
      </div>

      <AgendaBlock
        title={t('events.agenda.toClose')}
        sub={t('events.agenda.toCloseSub')}
        tone="warn"
        params={{ ...nodeParams, status: 'PLANNED', to: addDaysLocal(today, -1), order: 'ASC' }}
        empty={t('events.agenda.toCloseEmpty')}
        onOpen={setOpened}
      />
      <AgendaBlock
        title={t('events.agenda.upcoming')}
        sub={t('events.agenda.upcomingSub')}
        tone="earth"
        params={{ ...nodeParams, status: 'PLANNED', from: today, order: 'ASC' }}
        empty={scopes.canPlan ? t('events.agenda.upcomingEmptyPlanner') : t('events.agenda.upcomingEmpty')}
        onOpen={setOpened}
      />
      {bounds ? (
        <AgendaBlock
          title={t('events.agenda.done')}
          sub={t('events.agenda.doneSub')}
          tone="ok"
          params={{ ...nodeParams, status: 'DONE', from: bounds.from, to: bounds.to, order: 'DESC' }}
          empty={t('events.agenda.doneEmpty')}
          onOpen={setOpened}
        />
      ) : (
        <p style={{ color: 'var(--ink-500)', marginTop: 28 }}>{t('events.period.chooseValid')}</p>
      )}

      {opened && <EventDetailModal eventId={opened.id} initial={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

function AgendaBlock({
  title,
  sub,
  tone,
  params,
  empty,
  onOpen,
}: {
  title: string;
  sub: string;
  tone: 'warn' | 'earth' | 'ok';
  params: EventListParams;
  empty: string;
  onOpen: (e: EventResponse) => void;
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
            empty={<p style={{ margin: 0, padding: '16px 22px', color: 'var(--ink-500)', fontSize: 13 }}>{empty}</p>}
          />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
//  Statistiques (§5.3, D-EVT-09) — période + descente dans l'arbre (EventStatsDrill).
// ---------------------------------------------------------------------------------------------

function StatsTab() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('year'));
  const bounds = periodBounds(period);
  return (
    <>
      <div className="filters">
        <EventPeriodFilter value={period} onChange={setPeriod} />
      </div>
      {bounds ? (
        <EventStatsDrill from={bounds.from} to={bounds.to} />
      ) : (
        <p style={{ color: 'var(--ink-500)' }}>{t('events.period.chooseValid')}</p>
      )}
    </>
  );
}
