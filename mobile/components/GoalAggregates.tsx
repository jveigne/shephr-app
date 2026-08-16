import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import ScreenShell from './ScreenShell';
import Card from './Card';
import Label from './Label';
import Button from './Button';
import HandDivider from './HandDivider';
import { colors, fonts } from '../theme';
import { goalCategoryMeta } from '../constants/goalCategories';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { isSubCoordinatorLeader } from '../services/authApi';
import { fmtAmount } from '../utils/format';
import {
  getActiveGoal,
  getAggregate,
  getMyPerimeterAggregate,
  getMyUnits,
  getRegionsSummary,
  getUnitDetail,
  type ActiveGoal,
  type AggregateLevelPath,
  type AggregateLine,
  type GoalCategory,
  type UnitPledgeDetail,
  type ZoneUnitStatus,
} from '../services/goalsApi';
import { listCountries, listLocalities, listZones } from '../services/orgApi';

/** Regroupement d'assemblées par ville (localityName) — clé stable même sans localityId. */
interface CityUnitsGroup {
  key: string;
  name: string | null;
  units: ZoneUnitStatus[];
}

function groupUnitsByCity(units: ZoneUnitStatus[]): CityUnitsGroup[] {
  const map = new Map<string, CityUnitsGroup>();
  for (const u of units) {
    const key = u.localityName ?? '__none__';
    let group = map.get(key);
    if (!group) {
      group = { key, name: u.localityName, units: [] };
      map.set(key, group);
    }
    group.units.push(u);
  }
  return [...map.values()];
}

/**
 * Un nœud de périmètre porté par le compte. `level`/`entityId` à `null` = pas de nœud du tout :
 * l'agrégat est alors la somme à plat du SOUS-ARBRE (`GET /goals/me/aggregate`), seul agrégat
 * disponible pour un DIRIGEANT_UNITE.
 */
interface Perimeter {
  level: AggregateLevelPath | null;
  entityId: string | null;
  title: string;
}

/**
 * Vue agrégée du périmètre Goals d'un dirigeant — région(s) d'un DIRIGEANT_SENIOR, ville(s) d'un
 * DIRIGEANT, nation(s) d'un COORDINATEUR.
 *
 * <p>Chantier « objectifs individuels » (JP 16/08) — RG-BQ-02 : l'engagement d'un niveau est la
 * SOMME des engagements de ses membres, une seule valeur par catégorie. Le bloc de comparaison
 * « Cumul / Mon engagement / Objectif retenu », le badge de foi et le formulaire de foi ont été
 * supprimés : il n'y a plus de valeur concurrente à départager, donc plus de MAX (l'ancienne
 * RG-08 est annulée).
 *
 * <p>RG-BQ-04 : ces vues sont désormais de la LECTURE seule et s'atteignent depuis « Mes
 * objectifs » — un dirigeant déclare, lui aussi, dans son assemblée de rattachement.
 *
 * <p>Les trois listes peuvent être VIDES : c'est le cas d'un DIRIGEANT_UNITE (aucun nœud
 * géographique porté) et, depuis le Lot 3.5, de tout dirigeant dont la visibilité ne vient que de
 * son sous-arbre de personnes. On retombe alors sur `GET /goals/me/aggregate`, comme le web
 * (`Goals.tsx`, `PerimeterBlock node={null}`).
 */
export default function GoalAggregatesScreen({
  zoneIds,
  cityIds,
  countryIds,
}: {
  /** Régions portées (multi-rattachements), principale en tête ; vide sinon. */
  zoneIds: string[];
  /** Villes portées (dirigeant de ville, multi inclus) ; vide sinon. */
  cityIds: string[];
  /** Nations portées (coordinateur) ; vide sinon. */
  countryIds: string[];
}) {
  const { t } = useLanguage();
  const { me } = useAuth();
  // `GET /goals/me/units` est réservé aux sous-coordinateurs côté backend
  // (`requireSubCoordinatorLeader`, superAdmin exclu) : ne pas l'appeler pour un COORDINATEUR,
  // dont le périmètre passe par les agrégats de ses nations.
  const canDrillMyUnits = isSubCoordinatorLeader(me);
  const [goal, setGoal] = useState<ActiveGoal | null>(null);
  const [perimeters, setPerimeters] = useState<Perimeter[]>([]);
  const [loading, setLoading] = useState(true);
  const [noGoal, setNoGoal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? goal?.currentYear ?? null;

  const load = useCallback(async () => {
    try {
      const g = await getActiveGoal();
      setGoal(g);
      setNoGoal(false);
      const [zonesR, localitiesR, countriesR] = await Promise.allSettled([
        zoneIds.length > 0 ? listZones() : Promise.resolve([]),
        cityIds.length > 0 ? listLocalities() : Promise.resolve([]),
        countryIds.length > 0 ? listCountries() : Promise.resolve([]),
      ]);
      const zones = zonesR.status === 'fulfilled' ? zonesR.value : [];
      const localities = localitiesR.status === 'fulfilled' ? localitiesR.value : [];
      const countries = countriesR.status === 'fulfilled' ? countriesR.value : [];
      const list: Perimeter[] = [];
      // Multi-rattachements : une section par région / ville / nation portée, chacune agrégée sur
      // SA branche de l'arbre (RG-BQ-02 — une somme, plus rien à départager).
      for (const id of zoneIds) {
        const name = zones.find((z) => z.id === id)?.name;
        list.push({ level: 'zones', entityId: id, title: name ? t('goalsAgg.myZoneNamed', { name }) : t('goalsAgg.myZone') });
      }
      for (const id of cityIds) {
        const name = localities.find((l) => l.id === id)?.name;
        list.push({ level: 'cities', entityId: id, title: name ? t('goalsAgg.myCityNamed', { name }) : t('goalsAgg.myCity') });
      }
      for (const id of countryIds) {
        const name = countries.find((c) => c.id === id)?.name;
        list.push({ level: 'countries', entityId: id, title: name ? t('goalsAgg.myCountryNamed', { name }) : t('goalsAgg.myCountry') });
      }
      // Aucun nœud porté (DIRIGEANT_UNITE, ou dirigeant dont la visibilité ne vient que de son
      // sous-arbre de personnes depuis le Lot 3.5) : une seule section, la somme à plat.
      if (list.length === 0) {
        list.push({ level: null, entityId: null, title: t('goalsAgg.myPerimeter') });
      }
      setPerimeters(list);
    } catch (e: any) {
      if (e?.response?.status === 404) setNoGoal(true);
    } finally {
      setLoading(false);
    }
  }, [zoneIds.join(','), cityIds.join(','), countryIds.join(','), t]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
      setRefreshKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (noGoal || !goal) {
    return (
      <ScreenShell>
        <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 }}>
          <Text style={styles.emptyTitle}>{t('goalsAgg.noGoalTitle')}</Text>
          <Text style={styles.emptyHint}>
            {t('goalsAgg.noGoalHint')}
          </Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.titleRow}>
        <Ionicons name="flag-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{t('goals.title')}</Text>
      </View>
      <View style={styles.viewChip}>
        <Text style={styles.viewChipText}>
          {t('views.badge')} : {countryIds.length > 0 ? t('views.coordinator') : t('views.leader')}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {t('goalsAgg.subtitle', { name: goal.name })}
      </Text>

      {((goal.visibleYears ?? goal.openYears)?.length ?? 0) > 0 && year != null && (
        <View style={styles.yearRow}>
          {/* Lot G1.c : années visibles uniquement (JP 16/07 : le jalon final s'affiche « 2030 »). */}
          {(goal.visibleYears ?? goal.openYears).map((y) => {
            const active = y === year;
            return (
              <Pressable
                key={y}
                onPress={() => setSelectedYear(y)}
                style={[styles.yearChip, active && styles.yearChipActive]}
              >
                <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>
                  {y}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {year != null && perimeters.map((p) => (
        <AggregateSection
          key={`${p.level ?? 'me'}-${p.entityId ?? 'subtree'}-${year}-${refreshKey}`}
          perimeter={p}
          goal={goal}
          year={year}
        />
      ))}

      {/* Lot 3.5 — mon sous-arbre d'assemblées (indépendant du niveau de mes nœuds de périmètre) :
          villes → assemblées si plusieurs villes, sinon liste directe. */}
      {year != null && canDrillMyUnits && (
        <MyUnitsBlock key={`my-units-${year}-${refreshKey}`} year={year} goal={goal} />
      )}

      {/* Lot V1 — vue Coordinateur : cumuls PAR RÉGION + somme totale (borné à la Région). */}
      {year != null && countryIds.map((id) => (
        <RegionsSummaryBlock key={`regions-${id}-${year}-${refreshKey}`} nationId={id} year={year} goal={goal} />
      ))}
    </ScreenShell>
  );
}

/**
 * Une section n'a pas pu être lue. `denied` = le serveur a REFUSÉ (403, niveau hors périmètre),
 * `failed` = réseau ou erreur inattendue. Les deux se disent, aucun ne se tait.
 */
type SectionError = 'denied' | 'failed';

function AggregateSection({ perimeter, goal, year }: { perimeter: Perimeter; goal: ActiveGoal; year: number }) {
  const { t } = useLanguage();
  const [lines, setLines] = useState<AggregateLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SectionError | null>(null);

  const currency = goal.defaultCurrency;
  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);

  const load = useCallback(async () => {
    try {
      // Nœud porté → agrégat de CE nœud ; sinon somme à plat de mon sous-arbre (DIRIGEANT_UNITE).
      setLines(
        perimeter.level != null && perimeter.entityId != null
          ? await getAggregate(perimeter.level, perimeter.entityId, year)
          : await getMyPerimeterAggregate(year),
      );
      setError(null);
    } catch (e: any) {
      // ⚠ Un REFUS n'est pas un zéro (chantier 16/08). L'ancien `setLines([])` affichait la
      // section avec le nom de la région en titre et des zéros partout, indiscernables d'un vrai
      // zéro : l'utilisateur croyait l'information vraie. On dit explicitement qu'on n'a pas pu
      // lire ; les autres sections restent lisibles, l'écran n'est pas mis en erreur globale.
      setLines([]);
      setError(e?.response?.status === 403 ? 'denied' : 'failed');
    } finally {
      setLoading(false);
    }
  }, [perimeter.level, perimeter.entityId, year]);

  useEffect(() => {
    load();
  }, [load]);

  const lineFor = (categoryId: string) => lines.find((l) => l.categoryId === categoryId) ?? null;

  const fmtValue = (category: GoalCategory, v: number) =>
    category.unitType === 'CURRENCY'
      ? fmtAmount(v, currency)
      : `${v} ${category.unitLabel ?? ''}`.trim();

  return (
    <>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{perimeter.title}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 18 }} />
      ) : error != null ? (
        <Card variant="paper2" style={styles.errorCard}>
          <View style={styles.errorHead}>
            <Ionicons
              name={error === 'denied' ? 'lock-closed-outline' : 'cloud-offline-outline'}
              size={18}
              color={colors.clay}
            />
            <Text style={styles.errorTitle}>
              {t(error === 'denied' ? 'goalsAgg.deniedTitle' : 'goalsAgg.loadErrorTitle')}
            </Text>
          </View>
          <Text style={styles.errorHint}>
            {t(error === 'denied' ? 'goalsAgg.deniedHint' : 'goalsAgg.loadErrorHint')}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 8, marginTop: 10 }}>
          {categories.map((category) => {
            const meta = goalCategoryMeta(category.code);
            const line = lineFor(category.id);
            // RG-BQ-02 : UNE valeur — la somme des engagements des membres du sous-arbre.
            const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
            return (
              <Card key={category.id} style={styles.lineCard}>
                <View style={styles.lineHead}>
                  <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1F' }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.tone} />
                  </View>
                  <Text style={styles.lineName}>{category.name}</Text>
                </View>
                <HandDivider style={{ marginVertical: 10 }} />
                <View style={[styles.lineFooter, { alignItems: 'baseline' }]}>
                  <Label>{t('goalsAgg.pledgedTotal')}</Label>
                  <Text style={[styles.lineValue, { fontWeight: '600' }]}>
                    {fmtValue(category, eff)}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </>
  );
}

/**
 * Lot 3.5 (mobile) — mes assemblées (sous-arbre), indépendamment du niveau de mes nœuds de
 * périmètre (zone ou ville) : régions → villes → assemblées pour un dirigeant senior sur zone,
 * assemblées directes pour un dirigeant déjà scopé à une seule ville.
 */
function MyUnitsBlock({ year, goal }: { year: number; goal: ActiveGoal }) {
  const { t } = useLanguage();
  const [units, setUnits] = useState<ZoneUnitStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [cityAggregates, setCityAggregates] = useState<Record<string, AggregateLine[]>>({});
  const [detailUnit, setDetailUnit] = useState<ZoneUnitStatus | null>(null);
  const [detail, setDetail] = useState<UnitPledgeDetail[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const currency = goal.defaultCurrency;
  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const fmtValue = (category: GoalCategory, v: number) =>
    category.unitType === 'CURRENCY' ? fmtAmount(v, currency) : `${v} ${category.unitLabel ?? ''}`.trim();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyUnits(year)
      .then((us) => { if (!cancelled) setUnits(us); })
      .catch(() => { if (!cancelled) setUnits([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  useEffect(() => {
    setSelectedCity(null);
  }, [year]);

  const cityGroups = useMemo(() => groupUnitsByCity(units), [units]);
  const showCityStep = cityGroups.length > 1;
  const showingCityList = showCityStep && selectedCity == null;
  const cityKeysSignature = cityGroups.map((g) => g.key).join('|');

  // Résumé « comme un coordinateur » (UC-LDR-06 ter) : cumul + engagement effectif par catégorie,
  // par ville — sans le versé (pas d'endpoint bulk équivalent à getRegionsSummary pour les villes).
  useEffect(() => {
    if (!showingCityList) return;
    let cancelled = false;
    (async () => {
      const localities = await listLocalities().catch(() => []);
      const idByName = new Map(localities.map((l) => [l.name, l.id]));
      const entries = await Promise.all(
        cityGroups.map(async (g) => {
          const localityId = g.name ? idByName.get(g.name) : undefined;
          if (!localityId) return [g.key, [] as AggregateLine[]] as const;
          const lines = await getAggregate('cities', localityId, year).catch(() => [] as AggregateLine[]);
          return [g.key, lines] as const;
        }),
      );
      if (!cancelled) setCityAggregates(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingCityList, cityKeysSignature, year]);

  const openDetail = (u: ZoneUnitStatus) => {
    setDetailUnit(u);
    setDetail(null);
    setDetailLoading(true);
    getUnitDetail(u.unitId, year)
      .then(setDetail)
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  };

  if (loading || units.length === 0) return null;

  const activeUnits = showCityStep
    ? cityGroups.find((g) => g.key === selectedCity)?.units ?? []
    : units;

  return (
    <>
      <Card variant="paper2" style={styles.listCard}>
        <Label style={{ marginBottom: 8 }}>
          {showingCityList ? t('goalsAgg.myCitiesSubmission') : t('goalsAgg.myUnitsSubmission')}
        </Label>
        {showCityStep && selectedCity != null && (
          <Pressable onPress={() => setSelectedCity(null)} hitSlop={6} style={{ marginBottom: 8 }}>
            <Text style={styles.backLink}>{t('goalsAgg.backToCities')}</Text>
          </Pressable>
        )}
        {/* RG-BQ-06 — maille PERSONNE : « tout le monde a soumis » se lit sur les membres. */}
        {!showingCityList
          && activeUnits.length > 0
          && activeUnits.every((u) => u.totalMembers > 0 && u.submittedMembers === u.totalMembers) && (
          <Text style={[styles.listItem, { color: colors.mossSoft, fontWeight: '600' }]}>
            {t('goalsAgg.allMembersSubmitted')}
          </Text>
        )}
        {showingCityList
          ? cityGroups.map((g) => {
              const submitted = g.units.reduce((n, u) => n + u.submittedMembers, 0);
              const total = g.units.reduce((n, u) => n + u.totalMembers, 0);
              const lines = cityAggregates[g.key];
              return (
                <Pressable key={g.key} onPress={() => setSelectedCity(g.key)} style={styles.cityCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.unitName}>{g.name ?? t('goalsAgg.noCityLabel')}</Text>
                      <Text style={styles.unitMeta}>
                        {t('goalsAgg.assembliesCount', { count: g.units.length })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <CityStatusBadge submitted={submitted} total={total} />
                      <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                    </View>
                  </View>
                  {lines == null ? (
                    <ActivityIndicator color={colors.moss} size="small" style={{ marginTop: 8 }} />
                  ) : lines.length > 0 ? (
                    <View style={{ marginTop: 8, gap: 2 }}>
                      {categories.map((category) => {
                        const line = lines.find((l) => l.categoryId === category.id);
                        const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
                        return (
                          <Text key={category.id} style={styles.listItem}>
                            {category.name} : {fmtValue(category, eff)}
                          </Text>
                        );
                      })}
                    </View>
                  ) : null}
                </Pressable>
              );
            })
          : activeUnits.map((u) => (
              <Pressable key={u.unitId} onPress={() => openDetail(u)} style={styles.unitRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.unitName}>{u.unitName}</Text>
                  {/* RG-BQ-06 — « X/Y membres ont soumis », plus « n/5 engagements ». */}
                  <Text style={styles.unitMeta}>
                    {u.localityName ? `${u.localityName} · ` : ''}
                    {t('goals.members.submittedRatioLong', {
                      submitted: u.submittedMembers,
                      total: u.totalMembers,
                    })}
                  </Text>
                  {u.lateMembers > 0 && (
                    <Text style={[styles.unitMeta, { color: colors.clay }]}>
                      {t('goals.members.lateCount', { count: u.lateMembers })}
                    </Text>
                  )}
                  {u.leaderName != null && (
                    <Text style={styles.unitMeta}>
                      {t('goalsAgg.unitLeader', { name: u.leaderName })}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <UnitStatusBadge unit={u} />
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </View>
              </Pressable>
            ))}
      </Card>

      <UnitDetailModal
        unit={detailUnit}
        detail={detail}
        loading={detailLoading}
        goal={goal}
        year={year}
        onClose={() => setDetailUnit(null)}
      />
    </>
  );
}

/** Détail (lecture seule) des engagements d'une assemblée du sous-arbre (Lot 4.7 mobile). */
function UnitDetailModal({
  unit,
  detail,
  loading,
  goal,
  year,
  onClose,
}: {
  unit: ZoneUnitStatus | null;
  detail: UnitPledgeDetail[] | null;
  loading: boolean;
  goal: ActiveGoal;
  year: number;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const currency = goal.defaultCurrency;
  const catByCode = new Map(goal.categories.map((c) => [c.code, c]));

  if (unit == null) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('goalsAgg.unitPledgesTitle', { name: unit.unitName })}</Text>
          <Text style={styles.modalSub}>{t('goalsAgg.unitPledgesSub', { year })}</Text>

          {loading ? (
            <ActivityIndicator color={colors.moss} style={{ marginTop: 14 }} />
          ) : (
            <View style={{ marginTop: 10, gap: 8 }}>
              {(detail ?? []).map((d) => {
                const cat = catByCode.get(d.categoryCode);
                const pledged = d.unitType === 'CURRENCY'
                  ? d.targetAmount != null ? fmtAmount(d.targetAmount, currency) : '—'
                  : d.targetCount != null ? `${d.targetCount} ${cat?.unitLabel ?? ''}`.trim() : '—';
                const paid = d.unitType === 'CURRENCY'
                  ? fmtAmount(d.achievedAmount ?? 0, currency)
                  : `${d.achievedCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
                return (
                  <View key={d.categoryId} style={styles.detailRow}>
                    <Text style={styles.unitName}>{cat?.name ?? d.categoryCode}</Text>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Text style={styles.unitMeta}>{t('goalsAgg.colPledged')} : {pledged}</Text>
                      <Text style={styles.unitMeta}>{t('goalsAgg.colPaid')} : {paid}</Text>
                    </View>
                  </View>
                );
              })}
              {(detail ?? []).length === 0 && (
                <Text style={styles.listItem}>{t('goalsAgg.noPledgeInUnit')}</Text>
              )}
            </View>
          )}

          <Button label={t('common.ok')} variant="ghost" onPress={onClose} style={{ marginTop: 18 }} fullWidth height={46} />
        </Card>
      </View>
    </Modal>
  );
}

/**
 * Ratio de soumission d'une ville — maille PERSONNE depuis le 16/08 (RG-BQ-06) : ce sont les
 * MEMBRES de ses assemblées qui sont comptés, pas les assemblées.
 */
function CityStatusBadge({ submitted, total }: { submitted: number; total: number }) {
  const { t } = useLanguage();
  const tone = total > 0 && submitted === total ? colors.moss : submitted > 0 ? colors.earthDeep : colors.ink3;
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone + '22' }]}>
      <Text style={[styles.statusBadgeText, { color: tone }]}>
        {t('goalsAgg.citySubmittedRatio', { submitted, total })}
      </Text>
    </View>
  );
}

/** Lot V1 — cumuls d'une Nation détaillés PAR RÉGION (la vue Coordinateur s'arrête à la Région). */
function RegionsSummaryBlock({ nationId, year, goal }: { nationId: string; year: number; goal: ActiveGoal }) {
  const { t } = useLanguage();
  const [data, setData] = useState<Awaited<ReturnType<typeof getRegionsSummary>> | null>(null);
  const currency = goal.defaultCurrency;
  const catByCode = new Map(goal.categories.map((c) => [c.code, c]));

  useEffect(() => {
    getRegionsSummary(nationId, year).then(setData).catch(() => setData(null));
  }, [nationId, year]);

  if (!data || data.regions.length === 0) return null;
  const heading = data.regionLabel === 'STATE' ? t('views.statesHeading') : t('views.regionsHeading');
  const fmtLine = (l: { unitType: string; effectiveAmount: number | null; effectiveCount: number | null; achieved: number; categoryCode: string }) => {
    const cat = catByCode.get(l.categoryCode);
    const effective = l.unitType === 'CURRENCY'
      ? fmtAmount(l.effectiveAmount ?? 0, currency)
      : `${l.effectiveCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
    const achieved = l.unitType === 'CURRENCY'
      ? fmtAmount(l.achieved ?? 0, currency)
      : `${l.achieved ?? 0} ${cat?.unitLabel ?? ''}`.trim();
    return `${cat?.name ?? l.categoryCode} : ${effective} · ${t('views.achievedInline', { value: achieved })}`;
  };

  return (
    <Card variant="paper2" style={styles.listCard}>
      <Label style={{ marginBottom: 8 }}>
        {heading}{data.nationName ? ` — ${data.nationName}` : ''}
      </Label>
      {data.regions.map((r) => (
        <View key={r.regionId} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.unitName}>{r.regionName}</Text>
            {/* RG-BQ-06 — le taux de soumission se compte en PERSONNES. */}
            <Text style={styles.unitMeta}>
              {t('views.submittedRatio', {
                submitted: r.submittedMembers, total: r.totalMembers,
                percent: Math.round(r.submissionRate * 100),
              })}
            </Text>
          </View>
          {r.lines.map((l) => (
            <Text key={l.categoryId} style={styles.listItem}>{fmtLine(l)}</Text>
          ))}
        </View>
      ))}
      <HandDivider style={{ marginVertical: 8 }} />
      <Text style={[styles.unitName, { marginBottom: 4 }]}>{t('views.nationTotal')}</Text>
      {data.totals.map((l) => (
        <Text key={l.categoryId} style={styles.listItem}>{fmtLine(l)}</Text>
      ))}
    </Card>
  );
}

/**
 * Badge de statut de soumission d'une assemblée — maille PERSONNE depuis le 16/08 (RG-BQ-06).
 *
 * <p>Une assemblée ne « soumet » plus : ses membres soumettent. Statut défini par le backend
 * (javadoc de `ZoneUnitStatusResponse`) : aucun engagement → Non démarré ; tous les membres ont
 * soumis → Soumis ; sinon En cours — et « En retard » l'emporte dès qu'une personne est en retard.
 *
 * <p>Exporté : l'écran « Mes assemblées » affiche le même statut, et deux implémentations
 * divergeraient sur la règle « en retard ».
 */
export function UnitStatusBadge({ unit }: { unit: ZoneUnitStatus }) {
  const { t } = useLanguage();
  const allSubmitted = unit.totalMembers > 0 && unit.submittedMembers === unit.totalMembers;
  const [label, tone] = unit.lateMembers > 0
    ? [t('goalsAgg.statusLate'), colors.clay]
    : allSubmitted
    ? [t('goalsAgg.statusSubmitted'), colors.moss]
    : unit.membersWithPledges > 0
    ? [t('goalsAgg.statusInProgress'), colors.earthDeep]
    : [t('goalsAgg.statusNotStarted'), colors.ink3];
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone + '22' }]}>
      <Text style={[styles.statusBadgeText, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  viewChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.earthDeep + '1F',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  viewChipText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: colors.earthDeep },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  yearChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.06)',
  },
  yearChipActive: { backgroundColor: colors.moss },
  yearChipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  yearChipTextActive: { color: colors.white },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 22,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  lineCard: { paddingHorizontal: 16, paddingVertical: 14 },
  errorCard: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 10 },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '700', color: colors.clay, flex: 1 },
  errorHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.ink,
  },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  lineValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink, marginTop: 2 },
  listCard: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 4 },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  cityCard: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  detailRow: {
    gap: 3,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  unitMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  statusBadgeText: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '700' },
  backLink: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.moss },
  listItem: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink2,
    marginTop: 4,
    lineHeight: 18,
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20 },
  modalTitle: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink },
  modalSub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
});
