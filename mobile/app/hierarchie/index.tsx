import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isSubCoordinatorLeader, MODULE_ROLE_LABELS } from '@/services/authApi';
import {
  getActiveGoal,
  getMyPerimeterAggregate,
  type ActiveGoal,
  type AggregateLine,
} from '@/services/goalsApi';
import { goalName } from '@/utils/goalName';
import { fmtAmount } from '@/utils/format';
import {
  fetchLeaderHierarchy,
  fetchSupervisionOverview,
  type HierarchyUnitView,
  type LeaderHierarchyNode,
  type LeaderHierarchyResponse,
  type SupervisionOverview,
} from '@/services/leadersApi';
import { ENTITLEMENT_HIERARCHIE_SUIVI, getPersonalEntitlements } from '@/services/entitlementsApi';

/**
 * Hiérarchie des dirigeants (Lot H3 — 21/07) : arbre du leadership renvoyé par le backend,
 * déjà scopé par rôle — sous-arbre pour un dirigeant, chaîne de dirigeants pour un membre,
 * arbres du ministère pour LEADER/SECRETARIAT/SUPER_ADMIN.
 *
 * J-4 (14/09) — CET ÉCRAN N'AFFICHE QUE LA CHAÎNE DE SUPERVISION, jamais le leadership
 * géographique : les assemblées du périmètre sans dirigeant (`unassignedUnits`) en sont parties
 * pour l'écran Structure, où le label « dirigeant requis » (RG-DS-10) est à sa place. Ne pas les
 * réintroduire ici : les deux notions doivent rester séparées.
 * J-5 (14/09) — la chaîne est une chaîne de DIRIGEANTS : un simple fidèle n'y est pas un nœud,
 * et sa propre vue part de son assemblée (côté serveur).
 *
 * Lot HIE (D-HIE-01, JP 28/10) — la Hiérarchie devient TROIS SOUS-PAGES (pas des onglets) :
 *   1. CET ÉCRAN, « But quinquennal », page d'arrivée de la tuile, GRATUIT : « Je rends compte à … »,
 *      « Ce que porte mon leadership · année », deux cartes d'accès, puis l'arbre Dirigeants |
 *      Assemblées avec SEULEMENT les pastilles d'objectifs — les résumés de CR des lignes
 *      d'assemblée ont quitté l'arbre : ils sont payants (page 3) ;
 *   2. `app/hierarchie/leadership.tsx` « Mon leadership », GRATUIT (remplace `/superviseur`) ;
 *      pastille = demandes reçues en attente (`pendingIncomingCount`, RG-HIE-29, masquée à 0) ;
 *   3. `app/hierarchie/vie.tsx` « Vie de mon leadership », offre Caleb (HIERARCHIE_SUIVI) :
 *      cadenas sur la carte sans le droit (droit PERSONNEL, D-ABO-36 — aucun prix, D-ABO-13).
 * Axe : la CHAÎNE de supervision (supervisor_id récursif), jamais la géographie (D-ABO-31).
 */
type HierarchyStatsAccess = 'unknown' | 'open' | 'locked';

/** Carte d'accès à une sous-page (D-HIE-01). */
function AccessCard({
  icon,
  title,
  hint,
  onPress,
  badge,
  locked,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint: string;
  onPress: () => void;
  badge?: number;
  locked?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Card variant="paper2" style={styles.accessCard} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.mossDeep} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={styles.unitName} numberOfLines={1}>{title}</Text>
          {!!badge && badge > 0 && (
            <Text
              style={styles.badge}
              accessibilityLabel={t('hierarchy.home.pendingBadge', { count: badge })}
            >
              {badge}
            </Text>
          )}
        </View>
        <Text style={styles.nodeMeta} numberOfLines={2}>{hint}</Text>
      </View>
      {locked ? (
        <Ionicons name="lock-closed" size={16} color={colors.ink3} accessibilityLabel={t('hierarchy.home.lockedA11y')} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      )}
    </Card>
  );
}

type ViewMode = 'leaders' | 'units';

type UnitEntry = { unit: HierarchyUnitView; leaderName?: string };

/**
 * Aplatis l'arbre en liste d'assemblées, chacune avec SON DIRIGEANT.
 *
 * <p>J-4 (14/09) : uniquement les assemblées portées par l'arbre de supervision. Les assemblées
 * du périmètre sans dirigeant ne sont plus ajoutées ici — elles sont sur l'écran Structure.
 */
function flattenUnits(nodes: LeaderHierarchyNode[]): UnitEntry[] {
  // Une assemblée dirigée à plusieurs (ex. « Segoulin & Ishimwe ») apparaît sous chacun de ses
  // dirigeants dans l'arbre : une seule ligne ici, les noms réunis (clé React = id d'assemblée).
  const byId = new Map<string, UnitEntry>();
  const walk = (node: LeaderHierarchyNode) => {
    node.units.forEach((unit) => {
      const prev = byId.get(unit.id);
      if (!prev) byId.set(unit.id, { unit, leaderName: node.fullName });
      else if (node.fullName && !prev.leaderName?.split(' & ').includes(node.fullName)) {
        prev.leaderName = prev.leaderName ? `${prev.leaderName} & ${node.fullName}` : node.fullName;
      }
    });
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  const out = Array.from(byId.values());
  // Regroupement pays → région → ville (22/07) : le tri porte l'ordre des sections.
  return out.sort((a, b) =>
    (a.unit.countryName ?? '').localeCompare(b.unit.countryName ?? '')
    || (a.unit.zoneName ?? '').localeCompare(b.unit.zoneName ?? '')
    || (a.unit.localityName ?? '').localeCompare(b.unit.localityName ?? '')
    || (a.unit.name ?? '').localeCompare(b.unit.name ?? ''));
}

export default function HierarchieScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<LeaderHierarchyResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('leaders');
  // D-HIE-01 (JP 28/10) : aperçu de supervision (pastille de « Mon leadership », RG-HIE-29) et droit
  // Caleb (cadenas de « Vie de mon leadership ») — relus au focus : on revient des sous-pages.
  const [overview, setOverview] = useState<SupervisionOverview | null>(null);
  const [access, setAccess] = useState<HierarchyStatsAccess>('unknown');
  const loadCards = useCallback(async () => {
    const [o, personal] = await Promise.allSettled([fetchSupervisionOverview(), getPersonalEntitlements()]);
    if (o.status === 'fulfilled') setOverview(o.value);
    if (personal.status === 'fulfilled') {
      setAccess(personal.value.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI) ? 'open' : 'locked');
    }
    // Panne : on garde l'état connu ; la page 3 reste juge (un 403 y affiche le verrou).
  }, []);
  const load = useCallback(async () => {
    try {
      setData(await fetchLeaderHierarchy());
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  // R6 (RG-HIE-22, JP 29/10) : l'arbre (« Je rends compte à … », dirigeants suivis) est relu au focus
  // comme les cartes — au retour de « Mon leadership » une désignation / un retrait est déjà visible
  // (parité avec le web, qui invalide `['leaders','hierarchy']`). Le focus couvre aussi le montage.
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCards();
    }, [load, loadCards]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([load(), loadCards()]); } finally { setRefreshing(false); }
  };

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  const roots = data?.roots ?? [];
  // Portée de MON leadership, comptée sur l'arbre déjà chargé : les assemblées que je supervise
  // (directement ou via mes dirigeants) et les personnes qui y sont rattachées. Dédoublonné —
  // une même assemblée peut apparaître sous deux nœuds.
  const scope = (() => {
    const units = new Set<string>();
    const members = new Set<string>();
    const walk = (node: LeaderHierarchyNode) => {
      node.units.forEach((u) => {
        units.add(u.id);
        u.members.forEach((m) => members.add(m.id));
      });
      node.children.forEach(walk);
    };
    roots.forEach(walk);
    return { units: units.size, members: members.size };
  })();
  const intro =
    data?.mode === 'CHAIN'
      ? t('hierarchy.introChain')
      : data?.mode === 'MINISTRY'
        ? t('hierarchy.introMinistry')
        : t('hierarchy.introSubtree');

  return (
    <ScreenShell
      withTabBar={false}
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
        <Text style={styles.title}>{t('hierarchy.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{intro}</Text>

      {/* « À qui je rends compte » : une mention AU-DESSUS de la vue — l'arbre, lui, ne contient
          que ce qui est en dessous du dirigeant (JP 30/07). */}
      {data?.supervisor && (
        <View style={styles.reportsToRow}>
          <Ionicons name="arrow-up" size={14} color={colors.earthDeep} />
          <Text style={styles.reportsToText} numberOfLines={2}>
            {t('hierarchy.reportsTo')} <Text style={styles.reportsToName}>{data.supervisor.fullName}</Text>
          </Text>
        </View>
      )}

      {/* Ce que porte mon leadership (JP 17/08) : la Σ des engagements des membres des assemblées
          de mon sous-arbre. Même source que « Mon périmètre » (`GET /goals/me/aggregate`, scopé
          par le serveur au sous-arbre de personnes) — ici on la met en face de l'arbre qui la
          produit, ce que la demande visait : « ce que mon leadership porte ». */}
      {isSubCoordinatorLeader(me) && (
        <LeadershipTotals unitCount={scope.units} memberCount={scope.members} />
      )}

      {/* D-HIE-01 (JP 28/10) : deux cartes d'accès aux sous-pages.
          « Mon leadership » (gratuit) : réservée aux dirigeants (P-HIE-a, `canDesignate`) — elle
          remplace l'ancien raccourci « Mon superviseur » ; pastille = demandes reçues en attente.
          « Vie de mon leadership » (offre Caleb) : hors vue CHAIN (simple membre) ; cadenas sans le
          droit personnel HIERARCHIE_SUIVI — la page affiche alors le verrou unique, sans prix. */}
      {/* Écart M3 (§12) : aussi pour un ancien dirigeant encore suivi par désignation (B4), qui
          doit pouvoir « Retirer » ce lien. */}
      {(overview?.canDesignate || overview?.followedBy) && (
        <AccessCard
          icon="people-circle-outline"
          title={t('hierarchy.home.leadershipCard')}
          hint={t('hierarchy.home.leadershipCardHint')}
          badge={overview?.pendingIncomingCount}
          onPress={() => router.push('/hierarchie/leadership')}
        />
      )}
      {data?.mode !== 'CHAIN' && (
        <AccessCard
          icon="pulse-outline"
          title={t('hierarchy.home.lifeCard')}
          hint={t('hierarchy.home.lifeCardHint')}
          locked={access === 'locked'}
          onPress={() => router.push('/hierarchie/vie')}
        />
      )}

      <Text style={styles.sectionKicker}>{t('hierarchy.home.goalSection')}</Text>

      <View style={styles.segmentRow}>
        {(['leaders', 'units'] as ViewMode[]).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.segment, view === v && styles.segmentActive]}>
            <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
              {v === 'leaders' ? t('hierarchy.viewLeaders') : t('hierarchy.viewUnits')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ gap: 8, marginTop: 14 }}>
        {error && <Text style={styles.empty}>{t('hierarchy.loadError')}</Text>}
        {!error && roots.length === 0 && <Text style={styles.empty}>{t('hierarchy.empty')}</Text>}
        {view === 'leaders'
          ? roots.map((root) => (
              <LeaderNodeRow key={root.id} node={root} depth={0} meId={me?.id ?? null} />
            ))
          : (() => {
              const units = flattenUnits(roots);
              if (!error && roots.length > 0 && units.length === 0) {
                return <Text style={styles.empty}>{t('hierarchy.noUnits')}</Text>;
              }
              // Sections pays → région → ville (la liste est déjà triée dans cet ordre).
              const rows: React.ReactNode[] = [];
              let prevCountry: string | null = null;
              let prevZone: string | null = null;
              let prevCity: string | null = null;
              units.forEach(({ unit, leaderName }) => {
                const country = unit.countryName ?? t('hierarchy.ungrouped');
                const zone = unit.zoneName ?? t('hierarchy.ungrouped');
                const city = unit.localityName ?? t('hierarchy.ungrouped');
                if (country !== prevCountry) {
                  rows.push(<Text key={`c-${country}-${unit.id}`} style={styles.groupCountry}>{country}</Text>);
                  prevCountry = country; prevZone = null; prevCity = null;
                }
                if (zone !== prevZone) {
                  rows.push(<Text key={`z-${zone}-${unit.id}`} style={styles.groupZone}>{zone}</Text>);
                  prevZone = zone; prevCity = null;
                }
                if (city !== prevCity) {
                  rows.push(<Text key={`v-${city}-${unit.id}`} style={styles.groupCity}>{city}</Text>);
                  prevCity = city;
                }
                rows.push(
                  <UnitRow key={unit.id} unit={unit} depth={1} leaderName={leaderName} hideLocality />,
                );
              });
              return rows;
            })()}
      </View>
    </ScreenShell>
  );
}

/**
 * « Ce que porte mon leadership » — Σ des engagements des membres de mon sous-arbre, par catégorie.
 *
 * <p>Aucune addition côté client : le total vient de `GET /goals/me/aggregate`, que le backend
 * calcule sur `getVisibleUnitIds(user, GOAL)` — exactement les assemblées dont je suis le
 * superviseur (directement ou par la chaîne de dirigeants). Sommer les pastilles de l'arbre aurait
 * donné un autre chiffre : l'arbre porte des personnes, pas des montants.
 *
 * <p>En cas de refus ou de panne, le bloc ne s'affiche PAS : un total à zéro se lirait comme
 * « mon leadership n'a rien engagé », ce qui serait faux.
 */
function LeadershipTotals({ unitCount, memberCount }: { unitCount: number; memberCount: number }) {
  const { t } = useLanguage();
  const [goal, setGoal] = useState<ActiveGoal | null>(null);
  const [lines, setLines] = useState<AggregateLine[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveGoal()
      .then(async (g) => {
        const l = await getMyPerimeterAggregate(g.currentYear);
        if (!cancelled) { setGoal(g); setLines(l); }
      })
      .catch(() => { if (!cancelled) { setGoal(null); setLines(null); } });
    return () => { cancelled = true; };
  }, []);

  if (!goal || !lines) return null;

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const valueOf = (categoryId: string) => {
    const line = lines.find((l) => l.categoryId === categoryId);
    return line?.effectiveAmount ?? line?.effectiveCount ?? 0;
  };
  const nothing = categories.every((c) => valueOf(c.id) === 0);

  return (
    <Card variant="tinted" style={styles.totalsCard}>
      <View style={styles.totalsHeader}>
        <Ionicons name="trending-up-outline" size={18} color={colors.mossDeep} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.totalsTitle}>{t('hierarchy.leadershipTitle', { year: goal.currentYear })}</Text>
          <Text style={styles.nodeMeta}>
            {t('hierarchy.unitsCount', { count: unitCount })} · {t('hierarchy.membersCount', { count: memberCount })}
          </Text>
        </View>
      </View>

      {nothing ? (
        <Text style={styles.totalsEmpty}>{t('hierarchy.leadershipEmpty')}</Text>
      ) : (
        categories.map((category) => {
          const value = valueOf(category.id);
          return (
            <View key={category.id} style={styles.totalsLine}>
              <Text style={styles.totalsCat} numberOfLines={1}>{goalName(category)}</Text>
              <Text style={styles.totalsValue}>
                {category.unitType === 'CURRENCY'
                  ? fmtAmount(value, goal.defaultCurrency)
                  : `${value} ${category.unitLabel ?? ''}`.trim()}
              </Text>
            </View>
          );
        })
      )}
      <Text style={styles.totalsHint}>{t('hierarchy.leadershipHint')}</Text>
    </Card>
  );
}

/**
 * Pastille de soumission du But Quinquennal (RG-BQ-06/11, 16/08).
 *
 * <p>Un dirigeant voit d'un coup d'œil qui, dans son arbre, n'a pas déclaré. `null` = pas de Goal
 * actif ou personne non rattachée → AUCUNE pastille (ne pas confondre avec « pas encore soumis »).
 */
function GoalPill({
  hasPledges,
  submitted,
  late,
}: {
  hasPledges: boolean | null;
  submitted: boolean | null;
  late: boolean | null;
}) {
  const { t } = useLanguage();
  if (submitted == null) return null;
  if (submitted) {
    return <Text style={[styles.goalPill, styles.goalPillDone]}>{t('hierarchy.goalSubmitted')}</Text>;
  }
  if (late) {
    return <Text style={[styles.goalPill, styles.goalPillLate]}>{t('hierarchy.goalLate')}</Text>;
  }
  return (
    <Text style={[styles.goalPill, styles.goalPillPending]}>
      {hasPledges ? t('hierarchy.goalDraft') : t('hierarchy.goalNothing')}
    </Text>
  );
}

function LeaderNodeRow({ node, depth, meId }: {
  node: LeaderHierarchyNode; depth: number; meId: string | null;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(depth < 2);
  const hasContent = node.children.length > 0 || node.units.length > 0;
  const role = node.goalRole ?? node.donationRole;

  return (
    <View>
      <Card
        style={[styles.nodeCard, { marginLeft: depth * 14 }]}
        onPress={hasContent ? () => setOpen(!open) : undefined}
      >
        <Ionicons
          name={hasContent ? (open ? 'chevron-down' : 'chevron-forward') : 'person-outline'}
          size={15}
          color={colors.ink3}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.nodeName} numberOfLines={1}>{node.fullName}</Text>
            {meId === node.id && <Text style={styles.youPill}>{t('hierarchy.you')}</Text>}
            <GoalPill
              hasPledges={node.goalHasPledges}
              submitted={node.goalSubmitted}
              late={node.goalLate}
            />
          </View>
          <Text style={styles.nodeMeta} numberOfLines={1}>
            {role ? MODULE_ROLE_LABELS[role] : '—'}
            {node.units.length > 0 ? ` · ${t('hierarchy.unitsCount', { count: node.units.length })}` : ''}
          </Text>
        </View>
      </Card>

      {open && (
        <View style={{ gap: 8, marginTop: 8 }}>
          {node.units.map((unit) => (
            <UnitRow key={unit.id} unit={unit} depth={depth + 1} />
          ))}
          {node.children.map((child) => (
            <LeaderNodeRow key={child.id} node={child} depth={depth + 1} meId={meId} />
          ))}
        </View>
      )}
    </View>
  );
}

function UnitRow({ unit, depth, leaderName, hideLocality }: {
  unit: HierarchyUnitView; depth: number; leaderName?: string; hideLocality?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const hasMembers = unit.members.length > 0;

  return (
    <View>
      <Card
        variant="paper2"
        style={[styles.unitCard, { marginLeft: depth * 14 }]}
        onPress={hasMembers ? () => setOpen(!open) : undefined}
      >
        <Ionicons name="home-outline" size={14} color={colors.earthDeep} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.unitName} numberOfLines={1}>
              {unit.name ?? t('hierarchy.unnamedUnit')}
              {!hideLocality && unit.localityName ? `  ·  ${unit.localityName}` : ''}
            </Text>
            {unit.needsLeader && <Text style={styles.needsLeaderPill}>{t('hierarchy.needsLeader')}</Text>}
          </View>
          <Text style={styles.nodeMeta} numberOfLines={1}>
            {leaderName ? `${t('hierarchy.leaderPrefix', { name: leaderName })} · ` : ''}
            {hasMembers
              ? t('hierarchy.membersCount', { count: unit.members.length })
              : t('hierarchy.unitNoMembers')}
          </Text>
        </View>
        {hasMembers && (
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.ink3} />
        )}
      </Card>

      {open && (
        <View style={{ gap: 4, marginTop: 6, marginLeft: (depth + 1) * 14 + 6 }}>
          {unit.members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Text style={styles.memberName} numberOfLines={1}>{m.fullName}</Text>
              {!m.active && <Text style={styles.inactivePill}>{t('membres.inactive')}</Text>}
              <GoalPill
                hasPledges={m.goalHasPledges}
                submitted={m.goalSubmitted}
                late={m.goalLate}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  totalsCard: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  totalsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  totalsTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '700', color: colors.ink },
  totalsLine: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(42,38,32,0.07)',
  },
  totalsCat: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  totalsValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink },
  totalsEmpty: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, fontStyle: 'italic', marginTop: 10 },
  totalsHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, lineHeight: 16, marginTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  reportsToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(201,149,107,0.14)',
  },
  reportsToText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  reportsToName: { fontWeight: '700', color: colors.ink },
  accessCard: {
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  badge: {
    fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', color: colors.white,
    minWidth: 20, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    backgroundColor: colors.clay, overflow: 'hidden',
  },
  sectionKicker: {
    fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink3, letterSpacing: 1.1,
    textTransform: 'uppercase', marginTop: 22,
  },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 99, backgroundColor: 'rgba(42,38,32,0.06)', alignItems: 'center' },
  segmentActive: { backgroundColor: colors.moss },
  segmentText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segmentTextActive: { color: colors.white },
  groupCountry: {
    fontFamily: fonts.serif, fontSize: 19, color: colors.ink, letterSpacing: -0.2,
    marginTop: 12, marginBottom: 2,
  },
  groupZone: {
    fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink3, letterSpacing: 1.1,
    textTransform: 'uppercase', marginTop: 6, marginLeft: 2,
  },
  groupCity: {
    fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.earthDeep,
    marginTop: 6, marginLeft: 8, marginBottom: 2,
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  nodeCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nodeName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  nodeMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  unitCard: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.earthDeep },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  memberName: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, flexShrink: 1 },
  youPill: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.white, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    backgroundColor: colors.moss, overflow: 'hidden',
  },
  needsLeaderPill: {
    fontFamily: fonts.mono, fontSize: 9, color: '#A9812C', letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    backgroundColor: 'rgba(169,129,44,0.14)', overflow: 'hidden',
  },
  goalPill: {
    fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    overflow: 'hidden',
  },
  goalPillDone: { color: colors.mossDeep, backgroundColor: colors.mossTint2 },
  goalPillPending: { color: colors.earthDeep, backgroundColor: 'rgba(201,149,107,0.22)' },
  goalPillLate: { color: colors.clay, backgroundColor: 'rgba(176,90,62,0.13)' },
  inactivePill: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.ink3, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)', borderWidth: 1, borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 20 },
});
