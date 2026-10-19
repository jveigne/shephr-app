import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import SelectField from '@/components/SelectField';
import EventPeriodPicker from '@/components/EventPeriodPicker';
import { EventRow } from '@/components/EventRow';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getMyEvents,
  listEvents,
  type EventListParams,
  type EventResponse,
  type EventScopesResponse,
  type Page,
} from '@/services/eventsApi';
import { eventActionMessage } from '@/utils/eventErrors';
import { addDaysLocal, defaultPeriod, monthLocal, periodBounds, todayLocal, type Period } from '@/utils/events';

/**
 * Lot E7 (plan 14/10, §6.3) — AGENDA de l'onglet « Évènements » : trois blocs sur le nœud choisi
 * et son sous-arbre (contrat §3.5, « recettes d'agenda »), plus les évènements de ses ANCÊTRES en
 * lecture — une conférence de ville est visible depuis ses assemblées (recette §9.3 n°4) :
 * <ul>
 *   <li>« À clôturer » : programmés dont la date (locale) est passée — à marquer réalisés ou à
 *       annuler (RG-EVT-05, RG-EVT-06) ;</li>
 *   <li>« À venir » : programmés à partir d'aujourd'hui ;</li>
 *   <li>« Réalisés » : DONE de la période choisie (D-EVT-06 : mois / année / plage).</li>
 * </ul>
 * La période ne filtre que les réalisés : à venir et à clôturer sont des listes d'ACTION, comme
 * `plannedUpcoming` / `toCloseCount` des statistiques. Lecture = géographie du périmètre (D-EVT-07)
 * plus l'assemblée principale du compte (D-EVT-13) ; une ligne ouvre le détail, où le serveur dit
 * ce qu'on peut y faire (`canEdit`, `canFlag`). Vue des dirigeants, LEADER et SECRETARIAT
 * seulement : D-EVT-14 (JP 14/10), le simple membre a sa propre vue (`EventMemberView`), qui
 * reprend `AgendaBlock`.
 */

const ALL = 'all';
const PAGE_SIZE = 20;

export default function EventAgenda({
  scopes,
  refreshKey,
}: {
  scopes: EventScopesResponse;
  /** Change à chaque « tirer pour rafraîchir » ou retour sur l'onglet : recharge les trois blocs. */
  refreshKey: number;
}) {
  const { t } = useLanguage();
  const [nodeKey, setNodeKey] = useState(ALL);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('year'));

  // Nœud : absent = tout mon périmètre de lecture (contrat §3.5).
  const options = useMemo(
    () => [
      { id: ALL, name: t('events.agenda.allPerimeter') },
      ...scopes.scopes.map((s) => ({
        id: `${s.level}:${s.id}`,
        name: `${t(`events.levels.${s.level}`)} · ${s.name}`,
      })),
    ],
    [scopes.scopes, t],
  );
  const node = scopes.scopes.find((s) => `${s.level}:${s.id}` === nodeKey) ?? null;
  const nodeParams: EventListParams = node ? { scopeLevel: node.level, scopeId: node.id } : {};
  const today = todayLocal();
  const bounds = periodBounds(period);

  return (
    <>
      {scopes.scopes.length > 1 && (
        <SelectField
          label={t('events.agenda.node')}
          options={options}
          pick={options.find((o) => o.id === nodeKey) ?? options[0]}
          onChange={(o) => setNodeKey(o.id)}
        />
      )}

      <AgendaBlock
        title={t('events.agenda.toClose')}
        sub={t('events.agenda.toCloseSub')}
        tone={colors.clay}
        params={{ ...nodeParams, status: 'PLANNED', to: addDaysLocal(today, -1), order: 'ASC' }}
        empty={t('events.agenda.toCloseEmpty')}
        refreshKey={refreshKey}
      />
      <AgendaBlock
        title={t('events.agenda.upcoming')}
        sub={t('events.agenda.upcomingSub')}
        tone={colors.earthDeep}
        params={{ ...nodeParams, status: 'PLANNED', from: today, order: 'ASC' }}
        empty={scopes.canPlan ? t('events.agenda.upcomingEmptyPlanner') : t('events.agenda.upcomingEmpty')}
        refreshKey={refreshKey}
      />

      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>{t('events.agenda.done')}</Text>
      </View>
      <Text style={styles.blockSub}>{t('events.agenda.doneSub')}</Text>
      <EventPeriodPicker value={period} onChange={setPeriod} />
      {bounds ? (
        <AgendaBlock
          params={{ ...nodeParams, status: 'DONE', from: bounds.from, to: bounds.to, order: 'DESC' }}
          tone={colors.moss}
          empty={t('events.agenda.doneEmpty')}
          refreshKey={refreshKey}
        />
      ) : (
        <Text style={styles.blockSub}>{t('events.period.chooseValid')}</Text>
      )}
    </>
  );
}

/**
 * Source d'un bloc : la liste d'un nœud (`GET /`, contrat §3.5) ou, avec `'mine'`, MES évènements
 * (`GET /me`, §3.4 — tous statuts et types, récent en haut ; ses compteurs ne servent pas ici, d'où
 * le seul mois LOCAL envoyé, §1.4).
 */
type AgendaSource = EventListParams | 'mine';

function fetchAgendaPage(source: AgendaSource, page: number): Promise<Page<EventResponse>> {
  return source === 'mine'
    ? getMyEvents(monthLocal(), page, PAGE_SIZE).then((res) => res.events)
    : listEvents({ ...source, page, size: PAGE_SIZE });
}

/**
 * Un bloc paginé (« Voir plus »). Sans `title`, l'en-tête est porté par l'appelant (bloc
 * « Réalisés », dont le sélecteur de période s'intercale entre le titre et la liste). Partagé avec
 * la vue du simple membre (`EventMemberView`, D-EVT-14), qui marque ses propres lignes (`meId`),
 * liste « Toutes mes actions » (`params="mine"`) et relève les `clientId` reçus (`onLoaded`) pour
 * ne pas doubler une déclaration encore en file.
 */
export function AgendaBlock({
  title,
  sub,
  tone,
  params,
  empty,
  refreshKey,
  meId,
  onLoaded,
}: {
  title?: string;
  sub?: string;
  tone: string;
  params: AgendaSource;
  empty: string;
  refreshKey: number;
  /** Compte connecté : ses évènements (`createdById`) portent la pastille « Mon action ». */
  meId?: string;
  /** Doit être STABLE (`useCallback`) : il entre dans les dépendances du chargement. */
  onLoaded?: (events: EventResponse[]) => void;
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState<Page<EventResponse> | null>(null);
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** Un autre filtre peut partir avant que le précédent ne réponde : seule la dernière requête écrit. */
  const lastRequest = useRef(0);
  /** Filtre de la liste affichée : après un échec sur un AUTRE filtre, elle ne doit plus se montrer. */
  const shownParams = useRef<string | null>(null);

  // Les paramètres arrivent en objet neuf à chaque rendu : on s'abonne à leur valeur.
  const paramsKey = JSON.stringify(params);
  // « En cours » se DÉDUIT de la requête attendue et de la dernière réponse reçue, plutôt que
  // d'être posé au départ de l'effet (setState synchrone dans un effet, cf. react-hooks).
  const requestKey = `${paramsKey}#${refreshKey}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const loading = settledKey !== requestKey || retrying;

  // Chaîne de promesse plutôt qu'`async` : les mises à jour d'état vivent dans les callbacks de
  // la réponse, jamais dans le corps de l'effet qui lance la requête.
  const load = useCallback(
    (key: string) => {
      const request = ++lastRequest.current;
      const current = () => request === lastRequest.current;
      return fetchAgendaPage(JSON.parse(paramsKey) as AgendaSource, 0)
        .then(
          (res) => {
            if (!current()) return;
            shownParams.current = paramsKey;
            setPage(res);
            setEvents(res.content);
            setError(null);
            setMoreError(null);
            onLoaded?.(res.content);
          },
          (e) => {
            if (!current()) return;
            setError(eventActionMessage(e, t));
            if (shownParams.current !== paramsKey) {
              setPage(null);
              setEvents([]);
            }
          },
        )
        .finally(() => {
          if (!current()) return;
          setSettledKey(key);
          setRetrying(false);
        });
    },
    [paramsKey, t, onLoaded],
  );

  useEffect(() => {
    void load(requestKey);
  }, [load, requestKey]);

  const retry = () => {
    setRetrying(true);
    void load(requestKey);
  };

  const loadMore = async () => {
    if (!page || page.last || loadingMore) return;
    const request = lastRequest.current;
    setLoadingMore(true);
    try {
      const res = await fetchAgendaPage(params, page.number + 1);
      if (request !== lastRequest.current) return;
      setPage(res);
      // Dédoublonnage par id : un évènement programmé entre deux pages décale le découpage.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.content.filter((e) => !seen.has(e.id))];
      });
      setMoreError(null);
      onLoaded?.(res.content);
    } catch (e) {
      if (request === lastRequest.current) setMoreError(eventActionMessage(e, t));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={styles.block}>
      {!!title && (
        <>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>{title}</Text>
            {!!page && page.totalElements > 0 && (
              <Text style={[styles.badge, { backgroundColor: tone }]}>{page.totalElements}</Text>
            )}
          </View>
          {!!sub && <Text style={styles.blockSub}>{sub}</Text>}
        </>
      )}

      {loading && !page ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 14 }} />
      ) : error && !page ? (
        <ErrorBanner message={error} onRetry={retry} />
      ) : (
        <View style={{ opacity: loading ? 0.6 : 1, gap: 8, marginTop: 10 }}>
          {!!error && <ErrorBanner message={error} onRetry={retry} />}
          {events.length === 0 ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={20} color={colors.ink3} />
              <Text style={styles.emptyText}>{empty}</Text>
            </Card>
          ) : (
            events.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                mine={!!meId && e.createdById === meId}
                onPress={() => router.push(`/events/${e.id}`)}
              />
            ))
          )}
          {!!page && !page.last && (
            <Button
              label={t('events.mine.loadMore')}
              variant="ghost"
              onPress={loadMore}
              loading={loadingMore}
              fullWidth
              height={46}
            />
          )}
          {!!moreError && <ErrorBanner message={moreError} onRetry={loadMore} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 6 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  blockTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  blockSub: { marginTop: 4, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  badge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
    color: colors.white,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  empty: { paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
});
