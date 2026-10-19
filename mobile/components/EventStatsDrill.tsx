import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Label from '@/components/Label';
import HandDivider from '@/components/HandDivider';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getEventStats,
  type ChildStats,
  type EventStatsResponse,
  type OrgLevel,
  type StatsLevel,
  type StatsScope,
  type StatsTotals,
} from '@/services/eventsApi';
import { eventActionMessage, eventErrorCode } from '@/utils/eventErrors';
import { counterParts, fmtMonth, isEnglishLang, typeLabel } from '@/utils/events';
import { notify } from '@/utils/dialogs';
import type { Translate } from '@/utils/meetingReport';

/**
 * Lot E7 (plan 14/10, §6.3) — STATISTIQUES D'ÉVANGÉLISATION avec descente Nation → Région →
 * Ville → Assemblée, en cartes par sous-niveau (pattern `GoalAggregates`). D-EVT-09 : c'est
 * l'écran du secrétariat ; il sert aussi chaque dirigeant sur son périmètre (D-EVT-07). Jamais le
 * simple membre (D-EVT-14, JP 14/10 : pas de descente) — sa vue (`EventMemberView`) ne lit que le
 * compteur de son assemblée.
 *
 * <ul>
 *   <li>Racine = `/stats` sans nœud : mon périmètre le plus large (sa nation, sa ville… ou le
 *       ministère entier). On ne remonte jamais au-dessus : ce serait hors périmètre (contrat §6) ;</li>
 *   <li>descendre = rappeler `/stats` sur l'enfant touché, même période ; le fil d'Ariane est la
 *       pile des nœuds visités, tenue ici ;</li>
 *   <li>D-EVT-03 : seuls les évènements RÉALISÉS d'un type évangélique comptent, « à vérifier »
 *       ne retire rien (RG-ACT-07). D-EVT-04 : un évènement compte une fois, au nœud où il est
 *       rattaché — d'où la ligne « dont N rattachées directement à … » (`ownLevelCount`) ;</li>
 *   <li>D-EVT-06 : aucune cible, aucune barre de progression. Par mois : une liste, pas de courbe
 *       (hors V1, spec §8).</li>
 * </ul>
 */

interface DrillStep {
  level: OrgLevel;
  id: string;
  name: string;
}

const LEVEL_ICON: Record<StatsLevel, React.ComponentProps<typeof Ionicons>['name']> = {
  MINISTRY: 'globe-outline',
  COUNTRY: 'flag-outline',
  ZONE: 'map-outline',
  LOCALITY: 'business-outline',
  UNIT: 'home-outline',
};

/** Nom affiché d'une racine (le ministère n'a pas de nom de nœud). */
function scopeName(s: StatsScope, t: Translate): string {
  return s.level === 'MINISTRY' ? t('events.stats.ministry') : s.name ?? t(`events.levels.${s.level}`);
}

/**
 * « 40 participants dont 12 invités · 6 conversions · 3 restaurations · 4 baptêmes » (D-EVT-15,
 * D-EVT-17, JP 14/10) — les zéros se disent aussi : ce sont des totaux.
 */
function figures(x: StatsTotals, t: Translate): string {
  return counterParts(x, t).join(' · ');
}

export default function EventStatsDrill({
  from,
  to,
  refreshKey,
}: {
  from: string;
  to: string;
  /** Change à chaque « tirer pour rafraîchir » ou retour sur l'onglet : recharge le niveau courant. */
  refreshKey: number;
}) {
  const { t } = useLanguage();
  const [path, setPath] = useState<DrillStep[]>([]);
  const current = path.length > 0 ? path[path.length - 1] : null;
  const [stats, setStats] = useState<EventStatsResponse | null>(null);
  /** Racine du périmètre, gardée pendant la descente : elle ouvre le fil d'Ariane. */
  const [root, setRoot] = useState<StatsScope | null>(null);
  const [error, setError] = useState<{ message: string; noPerimeter: boolean } | null>(null);
  const [retrying, setRetrying] = useState(false);
  /** Seule la dernière requête partie a le droit d'écrire : la descente peut aller plus vite que le réseau. */
  const lastRequest = useRef(0);

  const level = current?.level;
  const id = current?.id;
  // « En cours » se DÉDUIT de la requête attendue et de la dernière réponse reçue, plutôt que
  // d'être posé au départ de l'effet (setState synchrone dans un effet, cf. react-hooks).
  const requestKey = `${from}|${to}|${level ?? ''}|${id ?? ''}#${refreshKey}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const loading = settledKey !== requestKey || retrying;

  // Chaîne de promesse plutôt qu'`async` : les mises à jour d'état vivent dans les callbacks de
  // la réponse, jamais dans le corps de l'effet qui lance la requête.
  const load = useCallback(
    (key: string) => {
      const request = ++lastRequest.current;
      const latest = () => request === lastRequest.current;
      return getEventStats(level && id ? { from, to, scopeLevel: level, scopeId: id } : { from, to })
        .then(
          (res) => {
            if (!latest()) return;
            setStats(res);
            setError(null);
            if (!level) setRoot(res.scope);
          },
          (e) => {
            if (!latest()) return;
            const code = eventErrorCode(e);
            // Un nœud devenu illisible (périmètre modifié) ou supprimé : retour à la racine,
            // avec la raison, plutôt qu'un écran bloqué sur une erreur.
            if (level && (code === 'UNAUTHORIZED_ACCESS' || code === 'RESOURCE_NOT_FOUND')) {
              notify(t('events.stats.nodeGone'), eventActionMessage(e, t));
              setPath([]);
              return;
            }
            setError({
              message: eventActionMessage(e, t),
              // Contrat §6 : aucun périmètre de lecture → 403 ; ce n'est pas une panne, c'est un état.
              noPerimeter: !level && code === 'UNAUTHORIZED_ACCESS',
            });
          },
        )
        .finally(() => {
          if (!latest()) return;
          setSettledKey(key);
          setRetrying(false);
        });
    },
    [from, to, level, id, t],
  );

  useEffect(() => {
    void load(requestKey);
  }, [load, requestKey]);

  const retry = () => {
    setRetrying(true);
    void load(requestKey);
  };

  const open = (c: ChildStats) =>
    setPath((p) => [...p, { level: c.level, id: c.id, name: c.name ?? t(`events.levels.${c.level}`) }]);

  // Racine pas encore lue : rien à descendre, pas de fil d'Ariane.
  if (!root) {
    if (loading) {
      return <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />;
    }
    if (error?.noPerimeter) {
      return (
        <Card variant="paper2" style={styles.emptyCard}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('events.stats.noPerimeter')}</Text>
        </Card>
      );
    }
    return <ErrorBanner message={error?.message ?? t('events.errors.generic')} onRetry={retry} />;
  }

  const rootName = scopeName(root, t);
  const here = current ? current.name : rootName;
  // Pendant un chargement, le niveau précédent reste affiché, estompé ; après un échec, on
  // n'affiche plus que des chiffres qui sont bien ceux du niveau demandé.
  const matches =
    stats != null &&
    (current
      ? stats.scope.level === current.level && stats.scope.id === current.id
      : stats.scope.level === root.level && stats.scope.id === root.id);
  const shown = stats != null && (matches || loading) ? stats : null;

  return (
    <View>
      {/* Fil d'Ariane : toujours affiché, pour remonter même si un niveau ne se charge pas. */}
      <View style={styles.crumbs}>
        {path.length === 0 ? (
          <Text style={styles.crumbOn}>{rootName}</Text>
        ) : (
          <Pressable onPress={() => setPath([])} hitSlop={6}>
            <Text style={styles.crumb}>{rootName}</Text>
          </Pressable>
        )}
        {path.map((step, i) => (
          <View key={`${step.level}:${step.id}`} style={styles.crumbItem}>
            <Ionicons name="chevron-forward" size={12} color={colors.ink3} />
            {i === path.length - 1 ? (
              <Text style={styles.crumbOn}>{step.name}</Text>
            ) : (
              <Pressable onPress={() => setPath(path.slice(0, i + 1))} hitSlop={6}>
                <Text style={styles.crumb}>{step.name}</Text>
              </Pressable>
            )}
          </View>
        ))}
        {loading && <ActivityIndicator size="small" color={colors.moss} style={{ marginLeft: 6 }} />}
      </View>

      {!!error && !loading && <ErrorBanner message={error.message} onRetry={retry} />}

      {shown && <StatsBody stats={shown} here={here} dimmed={loading} onOpen={open} />}
    </View>
  );
}

function StatsBody({
  stats,
  here,
  dimmed,
  onOpen,
}: {
  stats: EventStatsResponse;
  /** Nom du niveau affiché (ligne « dont N rattachées directement à … »). */
  here: string;
  dimmed: boolean;
  onOpen: (c: ChildStats) => void;
}) {
  const { t, language } = useLanguage();
  const english = isEnglishLang(language);
  const childLevel = stats.children[0]?.level;
  const homogeneous = stats.children.every((c) => c.level === childLevel);

  return (
    <View style={{ opacity: dimmed ? 0.6 : 1 }}>
      {/* Totaux du sous-arbre visible, racine comprise */}
      <View style={styles.kpiGrid}>
        <Kpi label={t('events.stats.kpiCount')} value={stats.total.count} strong />
        <Kpi label={t('events.stats.kpiParticipants')} value={stats.total.participants} />
        {/* D-EVT-17 (JP 14/10) : somme des invités, déjà comptés dans les participants. */}
        <Kpi label={t('events.stats.kpiGuests')} value={stats.total.guests} />
        {/* D-EVT-15 (JP 14/10) : sommes des compteurs évangéliques, non renseignés = 0. */}
        <Kpi label={t('events.stats.kpiConversions')} value={stats.total.conversions} />
        <Kpi label={t('events.stats.kpiRestorations')} value={stats.total.restorations} />
        <Kpi label={t('events.stats.kpiBaptisms')} value={stats.total.baptisms} />
        {/* Agenda du sous-arbre : tous types, indépendamment de la période (contrat §6). */}
        <Kpi
          label={t('events.stats.kpiAgenda')}
          value={stats.plannedUpcoming}
          hint={t('events.stats.toClose', { count: stats.toCloseCount })}
          hintAlert={stats.toCloseCount > 0}
        />
      </View>
      <Text style={styles.rule}>{t('events.stats.countingRule')}</Text>

      {/* Sous-niveaux : une carte par enfant, touchée = descente */}
      {stats.children.length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>
              {homogeneous && childLevel ? t(`events.stats.byLevel.${childLevel}`) : t('events.stats.byChild')}
            </Text>
          </View>
          <Text style={styles.sectionHint}>{t('events.stats.drillHint')}</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {stats.children.map((c) => (
              <Card key={`${c.level}:${c.id}`} style={styles.childCard} onPress={() => onOpen(c)}>
                <View style={styles.childHead}>
                  <View style={styles.childIcon}>
                    <Ionicons name={LEVEL_ICON[c.level]} size={18} color={colors.mossSoft} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.childName} numberOfLines={2}>
                      {c.name ?? t(`events.levels.${c.level}`)}
                    </Text>
                    {!homogeneous && <Text style={styles.childMeta}>{t(`events.levels.${c.level}`)}</Text>}
                  </View>
                  <Text style={[styles.childCount, c.count === 0 && { color: colors.ink3 }]}>{c.count}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </View>
                <HandDivider style={{ marginVertical: 8 }} />
                <Text style={styles.childMeta}>{figures(c, t)}</Text>
              </Card>
            ))}
          </View>
          {/* D-EVT-04 : rattachées au nœud lui-même, elles comptent ici et dans aucun sous-niveau. */}
          {stats.ownLevelCount > 0 && stats.scope.level !== 'MINISTRY' && (
            <Text style={styles.ownLevel}>{t('events.stats.ownLevel', { count: stats.ownLevelCount, name: here })}</Text>
          )}
        </>
      )}

      {/* Par type (types évangéliques du catalogue, à 0 compris) */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('events.stats.byType')}</Text>
      </View>
      {stats.byType.length === 0 ? (
        <Text style={styles.sectionHint}>{t('events.stats.noType')}</Text>
      ) : (
        <Card variant="paper2" style={styles.listCard}>
          {stats.byType.map((r, i) => (
            <ListLine
              key={r.typeId}
              label={typeLabel(r, english)}
              totals={r}
              first={i === 0}
              t={t}
            />
          ))}
        </Card>
      )}

      {/* Par mois : une liste, pas de courbe (hors V1) */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('events.stats.byMonth')}</Text>
      </View>
      <Card variant="paper2" style={styles.listCard}>
        {stats.byMonth.map((r, i) => (
          <ListLine key={r.month} label={fmtMonth(r.month, t)} totals={r} first={i === 0} t={t} />
        ))}
      </Card>
    </View>
  );
}

function Kpi({
  label,
  value,
  hint,
  hintAlert,
  strong,
}: {
  label: string;
  value: number;
  hint?: string;
  hintAlert?: boolean;
  strong?: boolean;
}) {
  return (
    <Card variant={strong ? 'tinted' : 'paper'} style={styles.kpi}>
      <Label>{label}</Label>
      <Text style={styles.kpiValue}>{value}</Text>
      {!!hint && <Text style={[styles.kpiHint, hintAlert && { color: colors.clay }]}>{hint}</Text>}
    </Card>
  );
}

function ListLine({
  label,
  totals,
  first,
  t,
}: {
  label: string;
  totals: StatsTotals;
  first: boolean;
  t: Translate;
}) {
  return (
    <View style={[styles.listLine, !first && styles.listLineBorder]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listLabel} numberOfLines={2}>
          {label}
        </Text>
        {totals.count > 0 && <Text style={styles.childMeta}>{figures(totals, t)}</Text>}
      </View>
      <Text style={[styles.listCount, totals.count === 0 && { color: colors.ink3 }]}>{totals.count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 16 },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crumb: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss, textDecorationLine: 'underline' },
  crumbOn: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.ink },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  kpi: { flexBasis: '47%', flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  kpiValue: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.5 },
  kpiHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3 },
  rule: { marginTop: 10, fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, lineHeight: 17 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 22 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  sectionHint: { marginTop: 4, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  childCard: { paddingHorizontal: 16, paddingVertical: 12 },
  childHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  childIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  childName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  childMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  childCount: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  ownLevel: { marginTop: 10, fontFamily: fonts.sans, fontSize: 12, color: colors.ink2, lineHeight: 17 },
  listCard: { paddingHorizontal: 16, paddingVertical: 4, marginTop: 10 },
  listLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  listLineBorder: { borderTopWidth: 1, borderTopColor: colors.hair },
  listLabel: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '500', color: colors.ink },
  listCount: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  emptyCard: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
