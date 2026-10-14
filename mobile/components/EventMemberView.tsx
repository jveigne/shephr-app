import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import EventCounters from '@/components/EventCounters';
import EventQueueBlocks from '@/components/EventQueueBlocks';
import { AgendaBlock } from '@/components/EventAgenda';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEventCatalog } from '@/hooks/useEventCatalog';
import { getEventStats, type EventResponse } from '@/services/eventsApi';
import { flushEventQueue, useEventQueue } from '@/services/eventQueue';
import { eventActionMessage } from '@/utils/eventErrors';
import { monthLocal, todayLocal } from '@/utils/events';

interface AssemblyCounts {
  month: string;
  monthCount: number;
  yearCount: number;
}

/**
 * D-EVT-14 (JP 14/10) — VUE DU SIMPLE MEMBRE : « Mes actions (niveau assemblée) » de la spec
 * Recensement §6.1, distincte de celle des dirigeants. Simple membre = `!isLeader` (aucun rôle
 * > MEMBRE dans aucun module, ni superAdmin), miroir de `EventPerimeters.of` côté serveur.
 *
 * <p>C'est son onglet « Évènements » (`app/(tabs)/events`) ; « Mes actions » de la saisie y ramène
 * (`router.dismissTo`, `app/events/declare`). Elle compose les routes existantes (contrat §3.12),
 * rien n'y est recalculé :
 * <ul>
 *   <li>compteur des actions d'évangélisation de SON ASSEMBLÉE ce mois / cette année : un seul
 *       `/stats` sur l'année locale (racine = son assemblée) — année = `total.count`, mois =
 *       `byMonth[mois − 1]` ;</li>
 *   <li>« Déclarer » / « Programmer » selon `canDeclare` / `canPlan` de `/me/scopes` (D-EVT-13) ;</li>
 *   <li>ses déclarations refusées et en attente de synchro (file hors-ligne, RG-ACT-08) ;</li>
 *   <li>les programmés à venir de l'assemblée, en tête (à partir d'aujourd'hui LOCAL, §1.4) ;</li>
 *   <li>les actions d'évangélisation réalisées de l'assemblée, récentes en haut, paginées ;</li>
 *   <li>« Toutes mes actions » (`GET /me`, « reste disponible » §3.12) : ses évènements, tous
 *       statuts et types — ses programmés à clôturer (RG-EVT-05), ses annulés, ses réalisés d'un
 *       type non évangélique, absents des deux listes précédentes, s'y ouvrent encore.</li>
 * </ul>
 * Ses propres actions portent « Mon action » ; le détail (`app/events/[id]`) n'ouvre modifier /
 * supprimer / marquer réalisé / annuler que si le serveur dit `canEdit`. Ni descente statistique,
 * ni sélecteur de nœud, ni évènement d'un autre niveau : `includeAncestors=false` est envoyé
 * quand même, le serveur l'imposant déjà au simple membre.
 */
export default function EventMemberView() {
  const { t } = useLanguage();
  const { me, hasEvents } = useAuth();
  const userId = me?.id ?? null;
  // RG-06 : sans l'abonnement EVENTS, aucune route du module n'est appelée.
  const active = hasEvents && !!userId;
  const catalog = useEventCatalog(active ? userId : null);
  const scopes = catalog.scopes;
  const queue = useEventQueue(userId);

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Un envoi réussi de la file entre dans les listes serveur : il recharge tout, comme un retour.
  const reloadKey = refreshKey + queue.syncedCount;

  const [counts, setCounts] = useState<AssemblyCounts | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [savedClientIds, setSavedClientIds] = useState<ReadonlySet<string>>(() => new Set());

  // Le premier focus coïncide avec le montage, où chaque bloc charge déjà : on ne recharge
  // qu'aux RETOURS sur l'écran (après une clôture dans le détail, par exemple).
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) setRefreshKey((k) => k + 1);
      focusedOnce.current = true;
    }, []),
  );

  // Chaîne de promesse : les mises à jour d'état vivent dans les callbacks de la réponse.
  useEffect(() => {
    if (!active) return;
    let live = true;
    const month = monthLocal();
    const year = month.slice(0, 4);
    getEventStats({ from: `${year}-01-01`, to: `${year}-12-31` }).then(
      (res) => {
        if (!live) return;
        setCounts({
          month,
          monthCount: res.byMonth[Number(month.slice(5, 7)) - 1]?.count ?? 0,
          yearCount: res.total.count,
        });
        setCountsError(null);
      },
      (e) => {
        if (live) setCountsError(eventActionMessage(e, t));
      },
    );
    return () => {
      live = false;
    };
  }, [active, reloadKey, t]);

  // Stable : `AgendaBlock` le compte dans les dépendances de son chargement.
  const onSavedLoaded = useCallback((events: EventResponse[]) => {
    setSavedClientIds((prev) => {
      const next = new Set(prev);
      events.forEach((e) => next.add(e.clientId));
      return next;
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Tirer pour rafraîchir relance aussi la file : c'est le geste naturel « réessayer ».
      void flushEventQueue();
      setRefreshKey((k) => k + 1);
      await catalog.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const noTypes = catalog.types.length === 0;
  const assemblyName = scopes?.defaultScope?.name;

  return (
    <ScreenShell
      refreshControl={
        active ? <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <Text style={styles.kicker}>{t('events.tab.kicker')}</Text>
      <Text style={styles.title}>{t('events.mine.title')}</Text>
      <Text style={styles.subtitle}>{t('events.member.subtitle')}</Text>

      {!hasEvents ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('events.declare.moduleUnavailable')}</Text>
        </Card>
      ) : (
        <>
          {!!assemblyName && (
            <View style={styles.assembly}>
              <Ionicons name="home-outline" size={14} color={colors.moss} />
              <Text style={styles.assemblyName}>{assemblyName}</Text>
            </View>
          )}

          {/* Compteurs (spec §6.1) : ceux de l'assemblée */}
          <EventCounters
            month={counts?.month ?? monthLocal()}
            monthCount={counts?.monthCount ?? null}
            yearCount={counts?.yearCount ?? null}
          />
          {!!countsError && <ErrorBanner message={countsError} onRetry={() => setRefreshKey((k) => k + 1)} />}

          {catalog.error && !scopes ? (
            <ErrorBanner message={t('events.tab.loadFailed')} onRetry={catalog.reload} />
          ) : (
            !!scopes &&
            (scopes.canDeclare || scopes.canPlan) && (
              <>
                <View style={styles.actions}>
                  {scopes.canDeclare && (
                    <Button
                      label={t('events.tab.declare')}
                      onPress={() => router.push('/events/declare')}
                      disabled={noTypes}
                      height={46}
                      style={{ flex: 1 }}
                      iconLeft={<Ionicons name="megaphone-outline" size={17} color={colors.white} />}
                    />
                  )}
                  {scopes.canPlan && (
                    <Button
                      label={t('events.tab.plan')}
                      variant="soft"
                      onPress={() => router.push('/events/plan')}
                      disabled={noTypes}
                      height={46}
                      style={{ flex: 1 }}
                      iconLeft={<Ionicons name="calendar-outline" size={17} color={colors.mossDeep} />}
                    />
                  )}
                </View>
                {noTypes && <Text style={styles.hint}>{t('events.declare.noTypes')}</Text>}
              </>
            )
          )}

          <EventQueueBlocks queue={queue} savedClientIds={savedClientIds} />

          {!!userId && (
            <>
              <AgendaBlock
                title={t('events.agenda.upcoming')}
                sub={t('events.member.plannedSub')}
                tone={colors.earthDeep}
                params={{ status: 'PLANNED', from: todayLocal(), order: 'ASC', includeAncestors: false }}
                empty={scopes?.canPlan ? t('events.agenda.upcomingEmptyPlanner') : t('events.agenda.upcomingEmpty')}
                refreshKey={reloadKey}
                meId={userId}
              />
              <AgendaBlock
                title={t('events.member.doneTitle')}
                sub={t('events.member.doneSub')}
                tone={colors.moss}
                params={{ status: 'DONE', evangelism: true, order: 'DESC', includeAncestors: false }}
                empty={t('events.member.doneEmpty')}
                refreshKey={reloadKey}
                meId={userId}
                onLoaded={onSavedLoaded}
              />
              <AgendaBlock
                title={t('events.member.all')}
                sub={t('events.member.allSub')}
                tone={colors.moss}
                params="mine"
                empty={t('events.member.allEmpty')}
                refreshKey={reloadKey}
                meId={userId}
                onLoaded={onSavedLoaded}
              />
            </>
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  assembly: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  assemblyName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.moss },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  hint: { marginTop: 10, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
