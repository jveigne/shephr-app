import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
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
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { currencySymbol, fmtAmount } from '../utils/format';
import { confirmDialog, notify } from '../utils/dialogs';
import {
  createFaithPledge,
  deleteFaithPledge,
  getActiveGoal,
  getAggregate,
  getMyUnits,
  getRegionsSummary,
  getUnitDetail,
  listFaithPledges,
  updateFaithPledge,
  type ActiveGoal,
  type AggregateLevelPath,
  type AggregateLine,
  type FaithPledgeResponse,
  type GoalCategory,
  type UnitPledgeDetail,
  type ZoneUnitStatus,
} from '../services/goalsApi';
import { listCountries, listLocalities, listZones } from '../services/orgApi';

const errMsg = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

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

interface Perimeter {
  level: AggregateLevelPath;
  entityId: string;
  title: string;
}

/**
 * Vue agrégée du périmètre Goals d'un leader (UC-LDR-04/05, UC-COO-04/05) :
 * zone du DIRIGEANT_LEADER et/ou pays du COORDINATEUR. Effectif = MAX (RG-08).
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
  countryIds: string[];
}) {
  const { t } = useLanguage();
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
      // Multi-rattachements : une section par région / ville portée — chaque foi se déclare sur
      // SON nœud et remonte vers SA branche dans l'arbre.
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
          key={`${p.level}-${p.entityId}-${year}-${refreshKey}`}
          perimeter={p}
          goal={goal}
          year={year}
        />
      ))}

      {/* Lot 3.5 — mon sous-arbre d'assemblées (indépendant du niveau de mes nœuds de périmètre) :
          villes → assemblées si plusieurs villes, sinon liste directe. */}
      {year != null && <MyUnitsBlock key={`my-units-${year}-${refreshKey}`} year={year} goal={goal} />}

      {/* Lot V1 — vue Coordinateur : cumuls PAR RÉGION + somme totale (borné à la Région). */}
      {year != null && countryIds.map((id) => (
        <RegionsSummaryBlock key={`regions-${id}-${year}-${refreshKey}`} nationId={id} year={year} goal={goal} />
      ))}
    </ScreenShell>
  );
}

function AggregateSection({ perimeter, goal, year }: { perimeter: Perimeter; goal: ActiveGoal; year: number }) {
  const { me } = useAuth();
  const { t } = useLanguage();
  const [lines, setLines] = useState<AggregateLine[]>([]);
  const [faiths, setFaiths] = useState<FaithPledgeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [faithCategory, setFaithCategory] = useState<GoalCategory | null>(null);

  const currency = goal.defaultCurrency;
  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);

  const load = useCallback(async () => {
    try {
      const [agg, fp] = await Promise.all([
        getAggregate(perimeter.level, perimeter.entityId, year),
        listFaithPledges(perimeter.level, perimeter.entityId, year).catch(
          () => [] as FaithPledgeResponse[],
        ),
      ]);
      setLines(agg);
      setFaiths(fp);
    } finally {
      setLoading(false);
    }
  }, [perimeter.level, perimeter.entityId, year]);

  useEffect(() => {
    load();
  }, [load]);

  const lineFor = (categoryId: string) => lines.find((l) => l.categoryId === categoryId) ?? null;
  const myFaithFor = (categoryId: string) =>
    faiths.find((f) => f.categoryId === categoryId && f.createdById === me?.id) ?? null;

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
      ) : (
        <View style={{ gap: 8, marginTop: 10 }}>
          {categories.map((category) => {
            const meta = goalCategoryMeta(category.code);
            const line = lineFor(category.id);
            const agg = line?.aggregateOfChildren ?? 0;
            const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
            const mine = myFaithFor(category.id);
            const faithValue = mine ? mine.targetAmount ?? mine.targetCount ?? 0 : null;
            return (
              <Card key={category.id} style={styles.lineCard}>
                <View style={styles.lineHead}>
                  <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1F' }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.tone} />
                  </View>
                  <Text style={styles.lineName}>{category.name}</Text>
                  {line?.source === 'FAITH' && (
                    <View style={styles.faithBadge}>
                      <Text style={styles.faithBadgeText}>{t('goalsAgg.faithBadge')}</Text>
                    </View>
                  )}
                </View>
                <HandDivider style={{ marginVertical: 10 }} />
                <View style={styles.lineFooter}>
                  <View>
                    <Label>{t('goalsAgg.aggregate')}</Label>
                    <Text style={styles.lineValue}>{fmtValue(category, agg)}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Label>{t('goalsAgg.myFaith')}</Label>
                    <Text style={[styles.lineValue, faithValue == null && { color: colors.ink3 }]}>
                      {faithValue != null ? fmtValue(category, faithValue) : '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Label>{t('goalsAgg.effective')}</Label>
                    <Text style={[styles.lineValue, { fontWeight: '600' }]}>
                      {fmtValue(category, eff)}
                    </Text>
                  </View>
                </View>
                <Button
                  label={mine ? t('goalsAgg.editFaith') : t('goalsAgg.declareFaith')}
                  variant="soft"
                  height={42}
                  onPress={() => setFaithCategory(category)}
                  style={{ marginTop: 12 }}
                />
              </Card>
            );
          })}

          {faiths.length > 0 && (
            <Card variant="paper2" style={styles.faithListCard}>
              <Label style={{ marginBottom: 8 }}>{t('goalsAgg.declaredFaith')}</Label>
              {faiths.map((f) => {
                const category = goal.categories.find((c) => c.id === f.categoryId);
                return (
                  <Text key={f.id} style={styles.faithListItem}>
                    {category?.name ?? f.categoryCode} ·{' '}
                    {category ? fmtValue(category, f.targetAmount ?? f.targetCount ?? 0) : ''} —{' '}
                    {f.createdByName ?? '—'}
                    {f.createdById === me?.id ? t('goalsAgg.me') : ''}
                  </Text>
                );
              })}
            </Card>
          )}

        </View>
      )}

      <FaithFormModal
        perimeter={perimeter}
        category={faithCategory}
        year={year}
        aggregate={faithCategory ? lineFor(faithCategory.id)?.aggregateOfChildren ?? 0 : 0}
        existing={faithCategory ? myFaithFor(faithCategory.id) : null}
        currency={currency}
        onClose={() => setFaithCategory(null)}
        onSaved={async () => {
          setFaithCategory(null);
          await load();
        }}
      />
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
      <Card variant="paper2" style={styles.faithListCard}>
        <Label style={{ marginBottom: 8 }}>
          {showingCityList ? t('goalsAgg.myCitiesSubmission') : t('goalsAgg.myUnitsSubmission')}
        </Label>
        {showCityStep && selectedCity != null && (
          <Pressable onPress={() => setSelectedCity(null)} hitSlop={6} style={{ marginBottom: 8 }}>
            <Text style={styles.backLink}>{t('goalsAgg.backToCities')}</Text>
          </Pressable>
        )}
        {!showingCityList && activeUnits.every((u) => u.submitted) && (
          <Text style={[styles.faithListItem, { color: colors.mossSoft, fontWeight: '600' }]}>
            {t('goalsAgg.allUnitsSubmitted')}
          </Text>
        )}
        {showingCityList
          ? cityGroups.map((g) => {
              const submitted = g.units.filter((u) => u.submitted).length;
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
                      <CityStatusBadge submitted={submitted} total={g.units.length} />
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
                          <Text key={category.id} style={styles.faithListItem}>
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
                  <Text style={styles.unitMeta}>
                    {t('goalsAgg.pledgeCount', { name: u.localityName ?? '', count: u.pledgeCount })}
                  </Text>
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
                <Text style={styles.faithListItem}>{t('goalsAgg.noPledgeInUnit')}</Text>
              )}
            </View>
          )}

          <Button label={t('common.ok')} variant="ghost" onPress={onClose} style={{ marginTop: 18 }} fullWidth height={46} />
        </Card>
      </View>
    </Modal>
  );
}

/** Badge de ratio de soumission d'une ville (Lot 3.5 mobile) — pendant de UnitStatusBadge au niveau ville. */
function CityStatusBadge({ submitted, total }: { submitted: number; total: number }) {
  const { t } = useLanguage();
  const tone = submitted === total ? colors.moss : submitted > 0 ? colors.earthDeep : colors.ink3;
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
    <Card variant="paper2" style={styles.faithListCard}>
      <Label style={{ marginBottom: 8 }}>
        {heading}{data.nationName ? ` — ${data.nationName}` : ''}
      </Label>
      {data.regions.map((r) => (
        <View key={r.regionId} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.unitName}>{r.regionName}</Text>
            <Text style={styles.unitMeta}>
              {t('views.submittedRatio', {
                submitted: r.submittedUnits, total: r.totalUnits,
                percent: Math.round(r.submissionRate * 100),
              })}
            </Text>
          </View>
          {r.lines.map((l) => (
            <Text key={l.categoryId} style={styles.faithListItem}>{fmtLine(l)}</Text>
          ))}
        </View>
      ))}
      <HandDivider style={{ marginVertical: 8 }} />
      <Text style={[styles.unitName, { marginBottom: 4 }]}>{t('views.nationTotal')}</Text>
      {data.totals.map((l) => (
        <Text key={l.categoryId} style={styles.faithListItem}>{fmtLine(l)}</Text>
      ))}
    </Card>
  );
}

/**
 * Badge de statut de soumission (UC-LDR-06) : Soumis / En retard / Brouillon / Non démarré.
 * Exporté depuis le palier A3 : l'écran « Mes assemblées » affiche le même statut, et deux
 * implémentations divergeraient sur la règle « en retard ».
 */
export function UnitStatusBadge({ unit }: { unit: ZoneUnitStatus }) {
  const { t } = useLanguage();
  const [label, tone] = unit.submitted
    ? [t('goalsAgg.statusSubmitted'), colors.moss]
    : unit.late
    ? [t('goalsAgg.statusLate'), colors.clay]
    : unit.pledgeCount > 0
    ? [t('goalsAgg.statusDraft'), colors.earthDeep]
    : [t('goalsAgg.statusNotStarted'), colors.ink3];
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone + '22' }]}>
      <Text style={[styles.statusBadgeText, { color: tone }]}>{label}</Text>
    </View>
  );
}

/** Déclaration / modification / retrait d'un engagement de foi (UC-LDR-05, COO-05). */
function FaithFormModal({
  perimeter,
  category,
  year,
  aggregate,
  existing,
  currency,
  onClose,
  onSaved,
}: {
  perimeter: Perimeter;
  category: GoalCategory | null;
  year: number;
  aggregate: number;
  existing: FaithPledgeResponse | null;
  currency: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const isCurrency = category?.unitType === 'CURRENCY';

  useEffect(() => {
    if (category) {
      const v = existing ? existing.targetAmount ?? existing.targetCount : null;
      setValue(v != null ? String(v) : '');
    }
  }, [category, existing]);

  const num = Number.parseFloat(value.replace(',', '.'));
  const valid = Number.isFinite(num) && num > 0;

  const fmtValue = (v: number) =>
    isCurrency ? fmtAmount(v, currency) : `${v} ${category?.unitLabel ?? ''}`.trim();

  const onSubmit = async () => {
    if (!category || !valid) return;
    setSaving(true);
    try {
      const payload = isCurrency ? { targetAmount: num } : { targetCount: Math.round(num) };
      if (existing) {
        await updateFaithPledge(existing.id, payload);
      } else {
        await createFaithPledge(perimeter.level, perimeter.entityId, {
          categoryId: category.id,
          year,
          ...payload,
        });
      }
      await onSaved();
    } catch (e: any) {
      notify(t('common.appName'), errMsg(e, t('errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!existing) return;
    const ok = await confirmDialog(
      t('goalsAgg.removeTitle'),
      t('goalsAgg.removeConfirm'),
      t('goalsAgg.remove'),
      true,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await deleteFaithPledge(existing.id);
      await onSaved();
    } catch (e: any) {
      notify(t('common.appName'), errMsg(e, t('errors.deleteFailed')));
    } finally {
      setSaving(false);
    }
  };

  if (!category) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('goalsAgg.faithModalTitle', { name: category.name })}</Text>
          <Text style={styles.modalSub}>
            {t('goalsAgg.faithModalSub', { value: fmtValue(aggregate) })}
          </Text>

          <View style={styles.amountRow}>
            {isCurrency && <Text style={styles.cur}>{currencySymbol(currency)}</Text>}
            <TextInput
              value={value}
              onChangeText={(v) => setValue(v.replace(/[^0-9.,]/g, ''))}
              keyboardType={isCurrency ? 'decimal-pad' : 'number-pad'}
              style={styles.amountInput}
              maxLength={10}
              placeholder="0"
              placeholderTextColor={colors.ink3}
            />
          </View>

          {valid && (
            <Text style={[styles.hint, num <= aggregate && { color: colors.clay }]}>
              {num > aggregate
                ? t('goalsAgg.faithAbove', { value: fmtValue(num - aggregate) })
                : t('goalsAgg.faithBelow')}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Button label={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} height={48} />
            <Button
              label={existing ? t('common.edit') : t('goalsAgg.declare')}
              onPress={onSubmit}
              disabled={!valid}
              loading={saving}
              style={{ flex: 1 }}
              height={48}
            />
          </View>
          {existing && (
            <Button
              label={t('goalsAgg.removeFaith')}
              variant="danger"
              onPress={onRemove}
              fullWidth
              height={44}
              style={{ marginTop: 10 }}
            />
          )}
        </Card>
      </View>
    </Modal>
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
  faithBadge: {
    backgroundColor: 'rgba(201,149,107,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  faithBadgeText: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.earthDeep,
  },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  lineValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink, marginTop: 2 },
  faithListCard: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 4 },
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
  faithListItem: {
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: 14,
  },
  cur: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink3, marginRight: 4 },
  amountInput: {
    fontFamily: fonts.serif,
    fontSize: 44,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'center',
    minWidth: 110,
    letterSpacing: -0.8,
    paddingVertical: 0,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.mossSoft,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
});
