import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Amount from '../../../components/Amount';
import HandDivider from '../../../components/HandDivider';
import ErrorBanner from '../../../components/ErrorBanner';
import RelanceNonDeclarants from '../../../components/RelanceNonDeclarants';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { canManageStructure } from '../../../services/authApi';
import { listMyUnits, type LeaderUnitView } from '../../../services/leaderApi';
import {
  getByCategory,
  getByUnit,
  type DonationByCategoryStat,
  type DonationByUnitStat,
} from '../../../services/statsApi';
import { listDeclarations } from '../../../services/donationApi';
import { useDonationCategories } from '../../../hooks/useDonationCategories';
import { fmtAmount, monthLabel, toLocalDate } from '../../../utils/format';
import { sumByCurrency, type CurrencyLine } from '../../../utils/currencyTotals';

/**
 * Écran « Trésorerie » (ex-« Mon périmètre ») — Lot T4, 14/09.
 *
 * Il n'est plus servi par le rang pastoral mais par la FONCTION DE TRÉSORIER : les trois appels
 * ci-dessous (`/leader/units`, `/donations/stats/by-unit`, `/donations/stats/by-category`) exigent
 * désormais une affectation active (`TreasuryAccessService`), et leur périmètre est le sous-arbre
 * du nœud d'affectation, recalculé à chaque requête.
 *
 * Deux défauts corrigés ici en même temps (§8 de docs/donations-etat-des-lieux.md) :
 *  - le `Promise.allSettled` AVALAIT les 403 et affichait 0 : un échec est maintenant dit à
 *    l'écran (bandeau + « Réessayer »), jamais maquillé en « aucun don » ;
 *  - la devise GBP était en dur : les totaux sont affichés PAR DEVISE, jamais additionnés.
 */
export default function TreasuryHomeScreen() {
  const { me, isTreasurer } = useAuth();
  const { t } = useLanguage();
  // Lot T5 — « Top rubriques » nommé et coloré d'après le référentiel du ministère.
  const { labelOf, metaOf } = useDonationCategories();
  const [units, setUnits] = useState<LeaderUnitView[]>([]);
  const [unitStats, setUnitStats] = useState<DonationByUnitStat[]>([]);
  const [catStats, setCatStats] = useState<DonationByCategoryStat[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Lot T8 — nombre de déclarations DECLARE du périmètre. On ne charge qu'UNE page d'un élément :
  // seul `totalElements` nous intéresse ici, la file elle-même vit dans son propre écran.
  const [pending, setPending] = useState<number | null>(null);

  // Période affichée = mois en cours. L'ancien code interrogeait les stats SANS `from` tout en
  // titrant « Reçu ce mois » : le chiffre montré était le cumul depuis toujours.
  const monthStart = useMemo(() => {
    const d = new Date();
    return toLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);

  const load = useCallback(async () => {
    if (!isTreasurer) return;
    const [u, us, cs, pd] = await Promise.allSettled([
      listMyUnits(),
      getByUnit({ from: monthStart }),
      getByCategory({ from: monthStart }),
      listDeclarations({ status: 'DECLARE', size: 1 }),
    ]);
    if (u.status === 'fulfilled') setUnits(u.value);
    if (us.status === 'fulfilled') setUnitStats(us.value);
    if (cs.status === 'fulfilled') setCatStats(cs.value);
    if (pd.status === 'fulfilled') setPending(pd.value.totalElements);
    setFailed([u, us, cs, pd].some((r) => r.status === 'rejected'));
  }, [isTreasurer, monthStart]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const scopeLines = sumByCurrency(unitStats);
  const catTotalByCurrency = new Map(
    sumByCurrency(catStats).map((l) => [l.currency, l.total]),
  );
  const topCats = [...catStats]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const today = new Date();

  // Accès direct (deep link) alors que l'affectation a été retirée : on le dit, on ne laisse pas
  // un écran vide laisser croire à « aucun don ».
  if (!isTreasurer) {
    return (
      <ScreenShell>
        <View style={styles.titleRow}>
          <Ionicons name="wallet-outline" size={22} color={colors.mossSoft} />
          <Text style={styles.title}>{t('leader.treasuryTitle')}</Text>
        </View>
        <Card style={styles.noticeCard}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.ink3} />
          <Text style={styles.noticeText}>{t('leader.notTreasurer')}</Text>
        </Card>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }} />
        {canManageStructure(me) && (
          <Pressable onPress={() => router.push('/structure')} style={styles.statsBtn}>
            <Ionicons name="git-branch-outline" size={15} color={colors.mossSoft} />
            <Text style={styles.statsBtnText}>{t('leader.structure')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push('/(tabs)/leader/stats')}
          style={styles.statsBtn}
        >
          <Ionicons name="stats-chart-outline" size={15} color={colors.mossSoft} />
          <Text style={styles.statsBtnText}>{t('leader.stats')}</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Ionicons name="wallet-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{t('leader.treasuryTitle')}</Text>
      </View>
      <Text style={styles.subtitle}>
        {t('leader.overview', { month: monthLabel(today.getMonth(), true), count: units.length })}
      </Text>

      {failed && <ErrorBanner message={t('leader.loadError')} onRetry={load} />}

      {/* Lot T8 — porte d'entrée de la file « À vérifier ». Le compteur porte sur TOUT le
          périmètre de trésorerie, pas sur la seule assemblée de rattachement : c'est la promesse
          « un trésorier plus haut voit plus large ». */}
      <Card onPress={() => router.push('/(tabs)/leader/verify')} style={styles.pendingCard}>
        <View style={styles.pendingIcon}>
          <Ionicons name="checkmark-done-outline" size={20} color={colors.earthDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.personalTitle}>{t('treasury.queueTitle')}</Text>
          <Text style={styles.personalHint}>
            {pending === null
              ? t('treasury.pendingUnknown')
              : t('treasury.pendingCount', { count: pending })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </Card>

      {/* Lot T4 : cette carte ne porte PLUS de montant. `/stats/summary` renvoie au trésorier le
          total de son PÉRIMÈTRE : l'afficher sous l'étiquette « Vos dons » donnait un chiffre
          faux. Les déclarations personnelles se lisent dans l'onglet « Mes dons ». */}
      <Card onPress={() => router.push('/(tabs)/donations')} style={styles.personalCard}>
        <View style={styles.userIcon}>
          <Ionicons name="person-outline" size={20} color={colors.mossSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.personalTitle}>{t('leader.myDonations')}</Text>
          <Text style={styles.personalHint}>{t('leader.myDonationsHint')}</Text>
        </View>
        <Text style={styles.detailLink}>{t('leader.detail')}</Text>
      </Card>

      <View style={styles.statsTwo}>
        <Card style={styles.statBig}>
          <Label style={{ color: colors.mossSoft }}>{t('leader.receivedMonth')}</Label>
          {scopeLines.length === 0 ? (
            <Text style={styles.emptyLine}>{t('leader.noneThisMonth')}</Text>
          ) : (
            scopeLines.map((line, i) => (
              <View key={line.currency} style={i > 0 ? styles.extraCurrency : undefined}>
                <Amount value={line.total} currency={line.currency} size={i === 0 ? 34 : 22} />
              </View>
            ))
          )}
        </Card>
        <Card style={styles.statSmall}>
          <Label style={{ color: colors.mossSoft }}>{t('leader.activeMembers')}</Label>
          <Text style={styles.bigNumber}>—</Text>
          <Text style={styles.bigNumberSub}>{t('leader.last3Months')}</Text>
        </Card>
      </View>

      <Card style={styles.topCatsCard}>
        <View style={styles.topCatHeader}>
          <Label style={{ color: colors.mossSoft }}>{t('leader.topCategories')}</Label>
          <Text style={styles.monoTiny}>{t('leader.thisMonthShort')}</Text>
        </View>
        <View style={{ gap: 12 }}>
          {topCats.map((c) => {
            const meta = metaOf(c.category);
            // Le pourcentage se calcule DANS la devise de la ligne : mélanger £ et € dans un même
            // dénominateur produirait une répartition sans aucun sens comptable.
            const base = catTotalByCurrency.get(c.currency) ?? 0;
            const pct = base > 0 ? Math.round((c.total / base) * 100) : 0;
            return (
              <View key={c.category + c.currency}>
                <View style={styles.catLineHead}>
                  <View style={[styles.catSquare, { backgroundColor: meta.tone + '1F' }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.tone} />
                  </View>
                  <Text style={styles.catLineLabel}>{labelOf(c.category)}</Text>
                  <Text style={styles.catLineAmt}>{fmtAmount(c.total, c.currency)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: meta.tone }]} />
                </View>
              </View>
            );
          })}
          {topCats.length === 0 && (
            <Text style={styles.emptyItalic}>{t('leader.noDataPeriod')}</Text>
          )}
        </View>
      </Card>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('leader.myUnits')}</Text>
        <Text style={styles.sectionCount}>{t('leader.unitsCount', { count: units.length })}</Text>
      </View>

      <View style={{ marginTop: 10, gap: 8 }}>
        {units.map((u) => {
          const lines: CurrencyLine[] = sumByCurrency(
            unitStats.filter((s) => s.unitId === u.unitId),
          );
          const count = lines.reduce((s, l) => s + l.count, 0);
          return (
            <Card
              key={u.unitId}
              onPress={() => router.push(`/(tabs)/leader/unit/${u.unitId}`)}
              style={styles.unitCard}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.unitIcon}>
                  <Ionicons name="people-outline" size={18} color={colors.earthDeep} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.unitName}>{u.unitName}</Text>
                  <Text style={styles.unitMeta}>
                    {t('leader.assembly')} · {u.localityName}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </View>
              <HandDivider style={{ marginVertical: 12 }} />
              <View style={styles.unitFooter}>
                <View style={{ flex: 1 }}>
                  <Label>{t('leader.receivedMonth')}</Label>
                  {lines.length === 0 ? (
                    <Text style={styles.emptyLine}>{t('leader.noneThisMonth')}</Text>
                  ) : (
                    lines.map((l, i) => (
                      <View key={l.currency} style={i > 0 ? styles.extraCurrency : undefined}>
                        <Amount value={l.total} currency={l.currency} size={i === 0 ? 22 : 16} />
                      </View>
                    ))
                  )}
                </View>
                <Text style={styles.unitCount}>
                  {t('leader.donations', { count })}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>

      {/* Lot T11 (docs/notifications.md §2.3) — « Relancer les non-déclarants ». Le composant est
          autonome : il charge lui-même les périmètres relançables de l'appelant et se masque seul
          si l'appelant n'est trésorier de rien. Branché ici au lot de consolidation, comme prévu
          par T10/T11 — sans ce rendu, la fonction existait côté serveur mais n'était atteignable
          par aucun geste. */}
      <RelanceNonDeclarants />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(42,38,32,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  statsBtnText: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.mossSoft,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  noticeCard: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  personalCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pendingCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pendingIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(201,149,107,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalTitle: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  personalHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  userIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,47,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLink: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 13, color: colors.earthDeep },
  statsTwo: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statBig: { paddingHorizontal: 18, paddingVertical: 18, flex: 1.4 },
  statSmall: { paddingHorizontal: 18, paddingVertical: 18, flex: 1 },
  extraCurrency: { marginTop: 6 },
  emptyLine: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 6 },
  emptyItalic: { fontFamily: fonts.sans, color: colors.ink3, fontStyle: 'italic' },
  bigNumber: { fontFamily: fonts.serif, fontSize: 34, color: colors.ink, marginTop: 6 },
  bigNumberSub: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 4 },
  topCatsCard: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 14 },
  topCatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  monoTiny: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3 },
  catLineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  catSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLineLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  catLineAmt: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink2 },
  barTrack: { height: 6, backgroundColor: 'rgba(42,38,32,0.05)', borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 24,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  sectionCount: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  unitCard: { paddingHorizontal: 18, paddingVertical: 16 },
  unitIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(201,149,107,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  unitMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, letterSpacing: 0.2 },
  unitFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 10,
  },
  unitCount: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
});
