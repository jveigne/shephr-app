import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Button, Modal, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { EventForm } from '../components/EventForm';
import { EventsBlock, EventsTable } from '../components/EventsTable';
import { EventDetailModal } from '../components/EventDetail';
import { EventCounter, EventEmptyState } from '../components/EventDeclare';
import { FEATURES } from '../config/features';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules } from '../services/authApi';
import {
  getEventStats,
  getMyEvents,
  getMyEventScopes,
  listEventTypes,
  type EventListParams,
  type EventResponse,
} from '../services/eventsApi';
import {
  EVANGELISM_COUNTERS,
  EVENT_KEYS,
  currentMonthLocal,
  eventErrorMessage,
  fmtCount,
  fmtCounts,
  fmtMonth,
  lastPageIfPast,
  todayLocal,
} from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  « Mes actions » de l'espace membre (MemberShell, lot E8) — D-EVT-14 (JP 14/10, précise
//  D-EVT-13) : « un membre n'aura pas la même vue que les dirigeants ; un membre voit uniquement les
//  actions de son assemblée ». Vue DÉDIÉE, spec §6.1 « Mes actions (niveau assemblée) », composée
//  des routes existantes (contrat §3.12) :
//   - en tête, le compteur ce mois / cette année des actions d'évangélisation de SON ASSEMBLÉE :
//     UN `/stats` sur l'année locale (année = `total.count`, mois = `byMonth` du mois local), et
//     sous le titre les conversions / restaurations / baptêmes de l'année (D-EVT-15, JP 14/10) ;
//   - les évènements à venir de son assemblée, séparés en tête (tous types, à partir d'aujourd'hui
//     local, le plus proche en haut) ;
//   - les actions d'évangélisation réalisées de son assemblée, récent en haut ;
//   - ses propres actions repérées (`createdById`) ; modifier / supprimer / marquer comme réalisé /
//     annuler dans le détail, pilotés par `canEdit` du serveur — jamais « à vérifier » (`canFlag`) ;
//   - « Toutes mes actions » (`GET /me`, tous statuts et types) : les deux blocs de l'assemblée ne
//     montrent ni ses programmés dont la date est passée (à clôturer), ni ses annulés, ni ses
//     réalisés d'un type non évangélique — sans ce bloc, il ne pourrait plus les ouvrir pour les
//     corriger, les clôturer ou les supprimer (spec §6.1, RG-ACT-06).
//   - « Déclarer » / « Programmer » selon `canDeclare` / `canPlan` de `/me/scopes` (D-EVT-13 :
//     programmer = déclarer). RG-EVT-02 : un MEMBRE n'a qu'une assemblée — pas de sélecteur.
//  Ni agenda multi-niveaux, ni sélecteur de nœud, ni descente statistique, ni filtre de dirigeant
//  (ceux-là restent sur /events, AppShell). Les listes et le compteur visent explicitement
//  l'assemblée principale (`goalUnitId`, garantie par la garde de MemberShell) sans ancêtres : le
//  serveur l'impose déjà au simple membre, et un compte dirigeant dans l'autre module qui ouvrirait
//  /my-actions ne verrait pas non plus sa ville ou sa région ici.
//  D-EVT-05 / RG-06 : sans abonnement EVENTS, l'entrée de menu est masquée ; une URL tapée à la
//  main tombe sur un message.
// ---------------------------------------------------------------------------------------------

type Creating = 'declare' | 'plan' | null;

export function MyActionsPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();
  const [creating, setCreating] = useState<Creating>(null);
  const [opened, setOpened] = useState<EventResponse | null>(null);

  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasEvents = FEATURES.events && (modulesQ.data ?? []).includes('EVENTS');
  const scopesQ = useQuery({ queryKey: EVENT_KEYS.scopes, queryFn: getMyEventScopes, enabled: hasEvents });
  const typesQ = useQuery({ queryKey: EVENT_KEYS.types, queryFn: listEventTypes, enabled: hasEvents });
  const scopes = scopesQ.data ?? null;
  const types = typesQ.data ?? null;
  const unitId = me?.goalUnitId ?? null;
  // Contrat §3.1 : catalogue vide → ni déclaration ni programmation possible (`typeId` requis).
  const noTypes = types?.length === 0;

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
    if (!unitId) {
      return <EventEmptyState title={t('events.declare.noScope')} text={t('events.declare.noScopeHint')} />;
    }
    const unitParams: EventListParams = { scopeLevel: 'UNIT', scopeId: unitId, includeAncestors: false };
    return (
      <>
        <AssemblyCounter unitId={unitId} />
        {noTypes && (scopes.canDeclare || scopes.canPlan) && (
          <p style={{ color: 'var(--ink-500)', fontSize: 13, marginTop: 16 }}>{t('events.declare.noTypesHint')}</p>
        )}
        {/* Contrat §3.12 : à venir = programmés à partir d'aujourd'hui LOCAL (§1.4), le plus proche en
            haut. Ses propres programmés à clôturer restent accessibles dans « Toutes mes actions ». */}
        <EventsBlock
          title={t('events.member.planned')}
          sub={t('events.member.plannedSub')}
          tone="earth"
          params={{ ...unitParams, status: 'PLANNED', from: todayLocal(), order: 'ASC' }}
          empty={scopes.canPlan ? t('events.member.plannedEmptyPlanner') : t('events.member.plannedEmpty')}
          onOpen={setOpened}
          mineId={me?.id}
          withScope={false}
        />
        <EventsBlock
          title={t('events.member.done')}
          sub={t('events.member.doneSub')}
          tone="ok"
          params={{ ...unitParams, status: 'DONE', evangelism: true, order: 'DESC' }}
          empty={scopes.canDeclare ? t('events.member.doneEmptyDeclarer') : t('events.member.doneEmpty')}
          onOpen={setOpened}
          mineId={me?.id}
          withScope={false}
        />
        <MyOwnEvents onOpen={setOpened} />
      </>
    );
  })();

  const canCreate = types != null && !noTypes;

  return (
    <>
      <TopBar
        title={t('events.member.title')}
        crumbs={[t('common.brand'), t('events.member.title')]}
        actions={
          hasEvents && scopes && unitId ? (
            <>
              {scopes.canPlan && (
                <Button
                  variant="secondary"
                  iconL={<Icon name="calendar" size={14} />}
                  onClick={() => setCreating('plan')}
                  disabled={!canCreate}
                  title={noTypes ? t('events.declare.noTypes') : undefined}
                >
                  {t('events.agenda.plan')}
                </Button>
              )}
              {scopes.canDeclare && (
                <Button
                  variant="primary"
                  iconL={<Icon name="plus" size={14} />}
                  onClick={() => setCreating('declare')}
                  disabled={!canCreate}
                  title={noTypes ? t('events.declare.noTypes') : undefined}
                >
                  {t('events.tabDeclare')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <div className="content">{body}</div>

      {creating && scopes && types && (
        <Modal
          open
          size="lg"
          onClose={() => setCreating(null)}
          title={creating === 'plan' ? t('events.agenda.planTitle') : t('events.declare.title')}
          sub={creating === 'plan' ? t('events.agenda.planSub') : t('events.declare.sub')}
        >
          {/* EventForm invalide toutes les DONNÉES du module à l'enregistrement (listes + compteur). */}
          <EventForm
            mode={creating}
            types={types}
            scopes={scopes}
            onCancel={() => setCreating(null)}
            onSaved={() => {
              push({ kind: 'ok', title: creating === 'plan' ? t('events.agenda.planned') : t('events.declare.saved') });
              setCreating(null);
            }}
          />
        </Modal>
      )}
      {/* Clôturer / annuler / modifier / supprimer : EventDetailModal invalide les DONNÉES du module. */}
      {opened && <EventDetailModal eventId={opened.id} initial={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

/**
 * Compteur de l'assemblée (spec §6.1, contrat §3.12) : UN `/stats` sur l'année LOCALE en cours —
 * `total.count` pour l'année, l'élément `byMonth` du mois local pour le mois ; D-EVT-15 (JP 14/10) :
 * une ligne discrète reprend les conversions / restaurations / baptêmes de l'année. Comptage D-EVT-03
 * (DONE, type évangélique, non supprimé ; « à vérifier » ne retire rien, RG-ACT-07). D-EVT-06 :
 * aucun objectif affiché.
 */
function AssemblyCounter({ unitId }: { unitId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const month = currentMonthLocal();
  const year = month.slice(0, 4);

  const statsQ = useQuery({
    queryKey: [...EVENT_KEYS.data, 'stats', 'member', unitId, year],
    queryFn: () => getEventStats({ from: `${year}-01-01`, to: `${year}-12-31`, scopeLevel: 'UNIT', scopeId: unitId }),
  });
  const stats = statsQ.data;
  const monthCount = stats?.byMonth.find((m) => m.month === month)?.count ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h2 className="section-title">{stats?.scope.name ?? t('events.member.assembly')}</h2>
        <div className="section-sub" style={{ margin: 0 }}>{t('events.member.counterSub')}</div>
        {stats && (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--green-800)' }}>
            {t('events.member.yearCounters', { year, counts: fmtCounts(stats.total, EVANGELISM_COUNTERS, t, lang) })}
          </div>
        )}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {statsQ.isLoading ? (
          <p style={{ color: 'var(--ink-500)', margin: 0 }}>{t('common.loading')}</p>
        ) : !stats ? (
          <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>{eventErrorMessage(statsQ.error, t)}</p>
        ) : (
          <>
            <EventCounter label={t('events.member.thisMonth', { month: fmtMonth(month, lang) })} value={fmtCount(monthCount, lang)} />
            <EventCounter label={t('events.member.thisYear', { year })} value={fmtCount(stats.total.count, lang)} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * « Toutes mes actions » : `GET /me` (contrat §3.4, « GET /me reste disponible » §3.12) — ses
 * évènements non supprimés, tous statuts et types, récent en haut, paginés par le serveur. Ses
 * compteurs personnels (`monthCount` / `yearCount`) ne sont pas affichés : le compteur de la page
 * est celui de l'assemblée (D-EVT-14). `month` ne sert qu'à ces compteurs ; on envoie le mois local
 * (§1.4). Rattachement affiché : l'auteur garde ses évènements après un changement d'assemblée.
 */
function MyOwnEvents({ onOpen }: { onOpen: (e: EventResponse) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
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
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 className="section-title" style={{ fontSize: 18, margin: 0 }}>{t('events.member.all')}</h2>
        {mine && mine.events.totalElements > 0 && <Badge tone="green">{mine.events.totalElements}</Badge>}
        <span className="muted" style={{ fontSize: 12.5 }}>{t('events.member.allSub')}</span>
      </div>
      {mineQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : !mine ? (
        <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(mineQ.error, t)}</p>
      ) : (
        <div className="card" style={{ opacity: mineQ.isPlaceholderData ? 0.6 : 1 }}>
          <EventsTable
            page={mine.events}
            onPage={setPage}
            onOpen={onOpen}
            empty={<p style={{ margin: 0, padding: '16px 22px', color: 'var(--ink-500)', fontSize: 13 }}>{t('events.member.allEmpty')}</p>}
          />
        </div>
      )}
    </section>
  );
}
