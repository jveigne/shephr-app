import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { canManageUsers, MODULE_ROLE_LABELS, type ModuleRole } from '../services/authApi';
import {
  fetchGoalSubmissionSummary, listUsers, listUnits,
  type AdminUserResponse, type GoalSubmissionSummary, type UnitResponse,
} from '../services/adminApi';
import SelectField from '../components/SelectField';
import {
  fetchMemberGoals,
  getActiveGoal,
  type ActiveGoal,
  type MemberGoalsResponse,
  type PledgeResponse,
} from '../services/goalsApi';
import {
  fetchRequestContext,
  type RequestNodeOption,
  type StructureRequestContext,
} from '../services/structureRequestsApi';

/**
 * Membres (Lot S1 — 21/07) : annuaire du périmètre de la personne connectée. La liste est SCOPÉE
 * côté backend (sous-arbre superviseur + unités visibles) — un membre simple ne voit que lui-même,
 * un dirigeant voit son périmètre. Invitation réservée aux managers (canManageUsers).
 */
export default function MembresScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // JP 31/07 — tout est filtré et paginé CÔTÉ SERVEUR : la liste peut compter des milliers de
  // personnes, on ne la charge plus d'un bloc pour filtrer en mémoire.
  const [searchInput, setSearchInput] = useState('');   // ce qui est tapé
  const [search, setSearch] = useState('');             // ce qui a été SOUMIS (bouton Rechercher)
  const [context, setContext] = useState<StructureRequestContext | null>(null);
  const [nation, setNation] = useState<RequestNodeOption | null>(null);
  const [region, setRegion] = useState<RequestNodeOption | null>(null);
  const [city, setCity] = useState<RequestNodeOption | null>(null);
  const [page, setPage] = useState(0);
  const [last, setLast] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pickingUnit, setPickingUnit] = useState(false);
  // JP 31/07 — cliquer sur une personne ouvre SES engagements du But Quinquennal.
  const [openedMember, setOpenedMember] = useState<AdminUserResponse | null>(null);
  // JP 14/08 — « X / Y ont soumis », sur tout le périmètre filtré (pas sur les lignes chargées).
  const [submission, setSubmission] = useState<GoalSubmissionSummary | null>(null);

  // La recherche par noms approchés ignore le filtre géographique (décision JP).
  const placeNodeId = search ? undefined : (city ?? region ?? nation)?.id;

  const canInvite = canManageUsers(me);

  const PAGE_SIZE = 30;

  const load = useCallback(async () => {
    const [u, un, ctx, sub] = await Promise.allSettled([
      listUsers({ size: PAGE_SIZE, page: 0, placeNodeId, search: search || undefined }),
      listUnits(),
      fetchRequestContext(),
      fetchGoalSubmissionSummary({ placeNodeId, search: search || undefined }),
    ]);
    if (u.status === 'fulfilled') {
      setUsers(u.value.content);
      setLast(u.value.last ?? u.value.content.length < PAGE_SIZE);
    }
    if (un.status === 'fulfilled') setUnits(un.value);
    if (ctx.status === 'fulfilled') setContext(ctx.value);
    setSubmission(sub.status === 'fulfilled' ? sub.value : null);
    setPage(0);
    setLoading(false);
  }, [placeNodeId, search]);

  useEffect(() => { load(); }, [load]);

  /** Page suivante — le serveur pagine, on empile. */
  const loadMore = async () => {
    if (last || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await listUsers({ size: PAGE_SIZE, page: next, placeNodeId, search: search || undefined });
      setUsers((prev) => [...prev, ...res.content]);
      setLast(res.last ?? res.content.length < PAGE_SIZE);
      setPage(next);
    } catch {
      setLast(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const unitName = useMemo(() => {
    const map = new Map(units.map((u) => [u.id, u.name]));
    return (u: AdminUserResponse) => {
      const id = u.goalUnitId ?? u.donationUnitId;
      return id ? map.get(id) ?? null : null;
    };
  }, [units]);

  // Le serveur filtre, trie et pagine : on affiche ce qu'il renvoie, dans son ordre (la
  // pertinence prime sur l'alphabétique quand une recherche approchée est active).
  const rows = users;

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      withTabBar={false}
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
        <Text style={styles.title}>{t('membres.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{t('membres.subtitle')}</Text>

      {/* Filtre géographique — nation → région → ville. Il est IGNORÉ pendant une recherche
          par nom : on cherche une personne où qu'elle soit (décision JP 31/07). */}
      {context && (
        <View style={{ opacity: search ? 0.45 : 1 }} pointerEvents={search ? 'none' : 'auto'}>
          <SelectField
            label={t('join.pickNation')}
            options={context.nations}
            pick={nation}
            onChange={(n) => { setNation(n); setRegion(null); setCity(null); }}
          />
          <SelectField
            label={t('join.pickRegion')}
            options={nation ? context.regions.filter((r) => r.parentId === nation.id) : []}
            pick={region}
            onChange={(r) => { setRegion(r); setCity(null); }}
            disabled={!nation}
          />
          <SelectField
            label={t('join.pickCity')}
            options={region ? context.cities.filter((c) => c.parentId === region.id) : []}
            pick={city}
            onChange={setCity}
            disabled={!region}
          />
        </View>
      )}

      {/* Recherche par noms approchés : déclenchée par le bouton, pas à la frappe. */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          style={styles.searchInput}
          placeholder={t('membres.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => setSearch(searchInput.trim())}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Button
          label={t('membres.searchAction')}
          onPress={() => setSearch(searchInput.trim())}
          style={{ flex: 1 }}
          height={44}
        />
        {search.length > 0 && (
          <Button
            label={t('membres.clearSearch')}
            variant="soft"
            height={44}
            onPress={() => { setSearchInput(''); setSearch(''); }}
          />
        )}
      </View>

      {/* JP 31/07 — invitation MASQUÉE : tout se joue désormais à la création du compte
          (inscription libre + rattachement immédiat). Le flux reste en place derrière
          (`app/invite.tsx`, endpoints `admin/users/invite`) pour être rouvert sans travail. */}
      {false && canInvite && (
        <Button
          label={t('membres.invite')}
          variant="soft"
          onPress={() => setPickingUnit(true)}
          style={{ marginTop: 12 }}
          iconLeft={<Ionicons name="person-add-outline" size={17} color={colors.mossDeep} />}
        />
      )}

      <View style={styles.countRow}>
        <Text style={styles.count}>{t('membres.count', { count: rows.length })}</Text>
        {submission != null && submission.total > 0 && (
          <Text style={styles.submittedCounter}>
            {t('membres.submittedCounter', {
              submitted: submission.submitted,
              total: submission.total,
            })}
          </Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        {rows.map((u) => {
          const role: ModuleRole | null = u.goalRole ?? u.donationRole;
          const unit = unitName(u);
          return (
            <Card key={u.id} style={styles.itemCard} onPress={() => setOpenedMember(u)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {u.fullName.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName} numberOfLines={1}>{u.fullName}</Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {u.superAdmin ? 'Super Admin' : role ? MODULE_ROLE_LABELS[role] : t('membres.roleMember')}
                  {unit ? ` · ${unit}` : ''}
                </Text>
              </View>
              {/* JP 14/08 — un dirigeant d'assemblée porte l'engagement de SON assemblée, un
                  membre ses objectifs personnels. `null` = non concerné → aucun badge. */}
              {u.goalSubmitted != null && (
                <Text style={[styles.submittedPill, !u.goalSubmitted && styles.submittedPillPending]}>
                  {u.goalSubmitted ? t('membres.submittedYes') : t('membres.submittedNo')}
                </Text>
              )}
              {!u.active && <Text style={styles.inactivePill}>{t('membres.inactive')}</Text>}
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </Card>
          );
        })}
        {rows.length === 0 && <Text style={styles.empty}>{t('membres.empty')}</Text>}
        {!last && (
          <Button
            label={t('membres.loadMore')}
            variant="soft"
            height={46}
            loading={loadingMore}
            onPress={loadMore}
            style={{ marginTop: 12 }}
          />
        )}
      </View>

      <MemberGoalsModal member={openedMember} onClose={() => setOpenedMember(null)} />

      <UnitPickerModal
        open={pickingUnit}
        units={units}
        onClose={() => setPickingUnit(false)}
        onPick={(u) => {
          setPickingUnit(false);
          router.push({ pathname: '/invite', params: { unitId: u.id, unitName: u.name } });
        }}
      />
    </ScreenShell>
  );
}

/**
 * Engagements d'une personne (JP 31/07) — ouverts en cliquant sur son nom dans la liste.
 *
 * <p>Deux volets quand ils existent : ses engagements PERSONNELS, et l'engagement de l'assemblée
 * qu'elle dirige. Si les deux sont vides, on le DIT explicitement plutôt que d'afficher une carte
 * vide — c'est la demande de JP.
 */
function MemberGoalsModal({ member, onClose }: { member: AdminUserResponse | null; onClose: () => void }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  // On stocke la NATURE de l'erreur, pas son libellé : la traduction se fait au rendu, ce qui
  // garde l'effet indépendant de `t` (une dépendance instable relancerait le chargement).
  const [error, setError] = useState<'forbidden' | 'other' | null>(null);
  const [data, setData] = useState<MemberGoalsResponse | null>(null);
  const [goal, setGoal] = useState<ActiveGoal | null>(null);

  useEffect(() => {
    if (!member) { setData(null); setError(null); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [g, a] = await Promise.all([fetchMemberGoals(member.id), getActiveGoal()]);
        if (!alive) return;
        setData(g);
        setGoal(a);
      } catch (e) {
        if (!alive) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        setError(status === 403 ? 'forbidden' : 'other');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [member]);

  const catByCode = useMemo(
    () => new Map((goal?.categories ?? []).map((c) => [c.code, c])),
    [goal],
  );

  const line = (p: PledgeResponse) => {
    const cat = catByCode.get(p.categoryCode);
    const value = p.targetAmount != null
      ? `${p.targetAmount.toLocaleString('fr-FR')} ${goal?.defaultCurrency ?? ''}`.trim()
      : `${p.targetCount ?? 0}${cat?.unitLabel ? ` ${cat.unitLabel}` : ''}`;
    return (
      <View key={p.id} style={styles.pledgeRow}>
        <Text style={styles.pledgeLabel} numberOfLines={2}>{cat?.name ?? p.categoryCode}</Text>
        <Text style={styles.pledgeValue}>{value}</Text>
      </View>
    );
  };

  const empty = !!data && data.memberPledges.length === 0 && data.assemblyPledges.length === 0;

  return (
    <Modal visible={!!member} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('membres.goalsTitle', { name: member?.fullName ?? '' })}</Text>

          {loading && <ActivityIndicator color={colors.moss} style={{ marginTop: 20 }} />}
          {!loading && error && (
            <Text style={styles.empty}>
              {error === 'forbidden' ? t('membres.goalsNoAccess') : t('membres.goalsError')}
            </Text>
          )}
          {!loading && !error && empty && <Text style={styles.empty}>{t('membres.goalsEmpty')}</Text>}

          {!loading && !error && !empty && data && (
            <View style={{ marginTop: 14, gap: 16 }}>
              {data.memberPledges.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>{t('membres.goalsPersonal')}</Text>
                  {data.memberPledges.map(line)}
                </View>
              )}
              {data.assemblyPledges.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>
                    {t('membres.goalsAssembly', { name: data.assemblyName ?? '' })}
                  </Text>
                  {data.assemblyPledges.map(line)}
                </View>
              )}
            </View>
          )}

          <Pressable onPress={onClose} style={{ marginTop: 18, alignItems: 'center' }}>
            <Text style={styles.cancelLink}>{t('common.ok')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

/** L'invitation rattache le membre à une assemblée : on la choisit avant d'ouvrir le formulaire. */
function UnitPickerModal({
  open, units, onClose, onPick,
}: {
  open: boolean;
  units: UnitResponse[];
  onClose: () => void;
  onPick: (u: UnitResponse) => void;
}) {
  const { t } = useLanguage();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('membres.pickUnitTitle')}</Text>
          <Text style={styles.subtitle}>{t('membres.pickUnitSub')}</Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            {units.map((u) => (
              <Card key={u.id} style={styles.itemCard} onPress={() => onPick(u)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemName}>{u.name}</Text>
                  {u.localityName != null && <Text style={styles.itemMeta}>{u.localityName}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
            ))}
            {units.length === 0 && <Text style={styles.empty}>{t('membres.pickUnitEmpty')}</Text>}
          </View>
          <Pressable onPress={onClose} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  count: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 14, marginBottom: 8 },
  itemCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.moss,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontFamily: fonts.serif, fontSize: 15 },
  itemName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  itemMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  submittedCounter: {
    fontFamily: fonts.sans, fontSize: 12, fontWeight: '700', color: colors.mossDeep,
    backgroundColor: colors.mossTint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99,
  },
  submittedPill: {
    fontFamily: fonts.sans, fontSize: 10.5, fontWeight: '700', color: colors.mossDeep,
    backgroundColor: colors.mossTint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
  },
  submittedPillPending: { color: colors.earthDeep, backgroundColor: 'rgba(201,149,107,0.22)' },
  inactivePill: {
    fontFamily: fonts.mono, fontSize: 9.5, color: colors.ink3, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)', borderWidth: 1, borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,41,31,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20, maxHeight: '80%' },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  cancelLink: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink3 },
  sectionLabel: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.ink3, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 6,
  },
  pledgeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.07)',
  },
  pledgeLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2 },
  pledgeValue: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
});
