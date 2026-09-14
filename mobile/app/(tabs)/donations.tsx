import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import Label from '../../components/Label';
import Amount from '../../components/Amount';
import ErrorBanner from '../../components/ErrorBanner';
import DeclarationStatusPill from '../../components/DeclarationStatusPill';
import { colors, fonts } from '../../theme';
import { useDonationCategories } from '../../hooks/useDonationCategories';
import {
  listDeclarations,
  type DeclarationResponse,
  type DeclarationStatus,
} from '../../services/donationApi';
import { fmtAmount, fmtDate, monthLabel, parseLocalDate, toLocalDate } from '../../utils/format';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Lot T7 (décision J-1, JP 14/09) — « MES DÉCLARATIONS ».
 *
 * <p>L'écran listait des lignes comptables (`don_donation`) ; il liste désormais les VERSEMENTS
 * déclarés, avec leur pastille de statut (Déclaré / Vérifié) et leur ventilation. C'est ce que la
 * personne a réellement fait : un versement de 300 avec deux rubriques, pas deux dons sans lien.
 *
 * <p>`mine=true` est explicite : sans lui, un trésorier verrait ici tout son périmètre de
 * trésorerie au lieu de ses propres déclarations (sa file de vérification est un autre écran, T8).
 *
 * <p>Défaut E (14/09) : le total additionnait TOUTES les devises et les étiquetait « GBP ». Les
 * totaux sont regroupés PAR DEVISE, ici comme dans les sous-totaux mensuels — ne pas régresser.
 */

type Period = 'month' | '3m' | '6m' | 'year' | 'all';

const PERIODS: Period[] = ['month', '3m', '6m', 'year', 'all'];
const STATUSES: DeclarationStatus[] = ['DECLARE', 'VERIFIE'];

export default function DeclarationsScreen() {
  const { t } = useLanguage();
  const { labelOf, metaOf } = useDonationCategories();
  const [period, setPeriod] = useState<Period>('month');
  const [statusFilter, setStatusFilter] = useState<DeclarationStatus | 'all'>('all');
  const [declarations, setDeclarations] = useState<DeclarationResponse[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const from = useMemo(() => computeFrom(period), [period]);

  const load = useCallback(async () => {
    try {
      const res = await listDeclarations({
        mine: true,
        from: from ?? undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        size: 100,
      });
      setDeclarations(res.content);
      setFailed(false);
    } catch {
      // Un appel qui échoue se DIT : afficher une liste vide ferait croire à l'absence de dons.
      setDeclarations([]);
      setFailed(true);
    }
  }, [from, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const totals = totalsByCurrency(declarations);
  const grouped = groupByMonth(declarations);

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>{t('declarations.title')}</Text>

      {failed && <ErrorBanner message={t('declarations.loadFailed')} onRetry={() => void load()} />}

      <Card style={styles.totalCard}>
        <Label style={{ color: colors.mossSoft }}>{t('history.totalPeriod')}</Label>
        {totals.length === 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.noTotal}>{t('declarations.noTotal')}</Text>
            <Text style={styles.count}>
              {t('declarations.count', { count: declarations.length })}
            </Text>
          </View>
        ) : (
          totals.map((c, i) => (
            <View key={c.currency} style={styles.totalRow}>
              <Amount value={c.total} currency={c.currency} size={i === 0 ? 32 : 22} showDecimals />
              {i === 0 && (
                <Text style={styles.count}>
                  {t('declarations.count', { count: declarations.length })}
                </Text>
              )}
            </View>
          ))
        )}
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
        style={{ marginTop: 16 }}
      >
        {PERIODS.map((p) => (
          <Chip
            key={p}
            label={t('history.periods.' + p)}
            selected={period === p}
            onPress={() => setPeriod(p)}
          />
        ))}
      </ScrollView>

      {/* DEUX statuts, pas davantage (J-1) : ni « écart », ni « rejeté ». */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
        style={{ marginTop: 4 }}
      >
        <Chip
          label={t('declarations.statusAll')}
          accent
          selected={statusFilter === 'all'}
          onPress={() => setStatusFilter('all')}
        />
        {STATUSES.map((s) => (
          <Chip
            key={s}
            accent
            label={t(`declarations.status.${s}`)}
            selected={statusFilter === s}
            onPress={() => setStatusFilter(s)}
          />
        ))}
      </ScrollView>

      {declarations.length === 0 ? (
        !failed && <EmptyState />
      ) : (
        <View style={{ marginTop: 22 }}>
          {grouped.map((g) => (
            <View key={g.key} style={{ marginBottom: 22 }}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>
                  {capitalize(monthLabel(g.month, true))} {g.year}
                </Text>
                <Text style={styles.groupSum}>
                  {g.sums.map((c) => fmtAmount(c.total, c.currency)).join(' · ')}
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                {g.items.map((d) => (
                  <Pressable key={d.id} onPress={() => router.push(`/donation/${d.id}`)}>
                    <Card style={styles.row}>
                      <View style={styles.rowIcons}>
                        {d.lines.slice(0, 3).map((line) => {
                          const meta = metaOf(line.category);
                          return (
                            <View
                              key={line.id}
                              style={[styles.rowIcon, { backgroundColor: meta.tone + '1A' }]}
                            >
                              <Ionicons name={meta.icon} size={15} color={meta.tone} />
                            </View>
                          );
                        })}
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {d.lines.map((l) => labelOf(l.category)).join(' · ')}
                        </Text>
                        <View style={styles.rowSubRow}>
                          <Text style={styles.rowSub}>
                            {fmtDate(parseLocalDate(d.donationDate))} ·{' '}
                            {t('declarations.lines', { count: d.lines.length })}
                          </Text>
                        </View>
                        <View style={{ marginTop: 6 }}>
                          <DeclarationStatusPill status={d.status} size="sm" />
                        </View>
                      </View>
                      <Amount value={d.declaredTotal} currency={d.currency} size={18} />
                    </Card>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <Ionicons name="leaf-outline" size={36} color={colors.mossSoft} />
      <Text style={styles.emptyText}>{t('declarations.emptyState')}</Text>
    </View>
  );
}

function computeFrom(period: Period): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === '3m') d.setMonth(d.getMonth() - 3);
  else if (period === '6m') d.setMonth(d.getMonth() - 6);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  return toLocalDate(d);
}

interface CurrencyTotal {
  currency: string;
  total: number;
}

interface MonthGroup {
  key: string;
  year: number;
  month: number;
  items: DeclarationResponse[];
  /** Un sous-total PAR DEVISE — jamais une somme unique (défaut E, 14/09). */
  sums: CurrencyTotal[];
}

/** Totaux par devise, du plus gros au plus petit — ordre d'affichage stable. */
function totalsByCurrency(items: DeclarationResponse[]): CurrencyTotal[] {
  const map = new Map<string, number>();
  items.forEach((d) => map.set(d.currency, (map.get(d.currency) ?? 0) + d.declaredTotal));
  return Array.from(map, ([currency, total]) => ({ currency, total })).sort(
    (a, b) => b.total - a.total,
  );
}

function groupByMonth(items: DeclarationResponse[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  items.forEach((d) => {
    const date = parseLocalDate(d.donationDate);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: date.getFullYear(),
        month: date.getMonth(),
        items: [],
        sums: [],
      });
    }
    map.get(key)!.items.push(d);
  });
  return Array.from(map.values())
    .map((g) => ({ ...g, sums: totalsByCurrency(g.items) }))
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  totalCard: { paddingHorizontal: 20, paddingVertical: 16, marginTop: 16 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 2,
  },
  count: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  noTotal: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.ink3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcons: { flexDirection: 'row', gap: 4 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 14.5, color: colors.ink },
  rowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  rowSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupLabel: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.mossSoft,
  },
  groupSum: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
  emptyText: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.ink2,
    marginTop: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
