import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { goBack } from '../../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Chip from '../../../components/Chip';
import Amount from '../../../components/Amount';
import ErrorBanner from '../../../components/ErrorBanner';
import DeclarationStatusPill from '../../../components/DeclarationStatusPill';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDonationCategories } from '../../../hooks/useDonationCategories';
import {
  listDeclarations,
  type DeclarationResponse,
  type DeclarationStatus,
} from '../../../services/donationApi';
import { fmtAmount, fmtDate, parseLocalDate } from '../../../utils/format';

const PAGE_SIZE = 20;

/** Filtre de statut de la file. `undefined` = les deux — il n'y a que deux statuts (J-1). */
type StatusFilter = DeclarationStatus | 'ALL';

const STATUS_FILTERS: StatusFilter[] = ['DECLARE', 'VERIFIE', 'ALL'];

/**
 * File « À vérifier » du trésorier — Lot T8 (décision J-1, JP 14/09).
 *
 * <p>Le geste réel tient en une phrase : le trésorier ouvre une déclaration, la compare à ce
 * qu'il constate <b>hors application</b> (un versement, une enveloppe, un relevé), et valide.
 * S'il ne valide pas, <b>il ne se passe rien</b> : la déclaration reste `DECLARE`, il contacte la
 * personne, elle corrige. D'où ce qu'on ne trouvera pas ici, et qu'il ne faut pas y ajouter :
 * aucune saisie de « montant constaté », aucun motif d'écart, aucun rejet.
 *
 * <p>Le périmètre n'est pas calculé par le client : le serveur renvoie les déclarations du
 * sous-arbre des nœuds où le trésorier est affecté (`TreasuryAccessService`, lot T2), recalculé à
 * chaque requête. Un non-trésorier n'obtient que les siennes — l'écran le dit plutôt que de
 * laisser une liste vide passer pour « rien à vérifier ».
 *
 * <p>`mine=true` (filtre « Mes dons ») restreint un trésorier à ses PROPRES déclarations : il
 * déclare aussi ses dons, et doit pouvoir s'y retrouver sans connaître son identifiant.
 */
export default function VerifyQueueScreen() {
  const { isTreasurer } = useAuth();
  const { t } = useLanguage();
  const { labelOf, metaOf } = useDonationCategories();

  const [status, setStatus] = useState<StatusFilter>('DECLARE');
  const [mine, setMine] = useState(false);
  const [items, setItems] = useState<DeclarationResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [last, setLast] = useState(true);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const query = useMemo(
    () => ({
      mine: mine || undefined,
      status: status === 'ALL' ? undefined : status,
      // Tri par DATE DE DON croissante : une file de travail se prend par le plus ancien, sinon
      // une déclaration de juillet reste indéfiniment sous celles du mois courant.
      sort: 'donationDate,asc',
      size: PAGE_SIZE,
    }),
    [mine, status],
  );

  const load = useCallback(async (showSpinner = false) => {
    if (!isTreasurer) {
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    setFailed(false);
    try {
      const res = await listDeclarations({ ...query, page: 0 });
      setItems(res.content);
      setTotal(res.totalElements);
      setLast(res.last);
      setPage(0);
    } catch {
      setItems([]);
      setTotal(0);
      setLast(true);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [isTreasurer, query]);

  // Pattern du dépôt (cf. hooks/useGoalsData.ts) : pas de react-query, on relit au focus. C'est
  // ce qui fait qu'une déclaration validée dans l'écran de détail disparaît de la file au retour.
  // Un seul effet, et pas le doublet `useEffect` + `useFocusEffect` : l'écran est focalisé au
  // montage, et le rappel change avec les filtres — deux appels partiraient pour un seul besoin.
  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const loadMore = async () => {
    if (last || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listDeclarations({ ...query, page: page + 1 });
      setItems((prev) => [...prev, ...res.content]);
      setLast(res.last);
      setPage(res.number);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (!isTreasurer) {
    return (
      <ScreenShell>
        <Header title={t('treasury.queueTitle')} />
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
      <Header title={t('treasury.queueTitle')} />

      <Text style={styles.title}>{t('treasury.queueHeading')}</Text>
      <Text style={styles.subtitle}>{t('treasury.queueSubtitle')}</Text>

      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={t(`treasury.filter.${s}`)}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>

      {/* Filtre « Mes dons » : le trésorier déclare aussi ses propres versements (J-1 autorise
          l'auto-validation) et doit pouvoir s'y restreindre. */}
      <View style={styles.chipRow}>
        <Chip label={t('treasury.scopeAll')} selected={!mine} onPress={() => setMine(false)} />
        <Chip label={t('treasury.scopeMine')} selected={mine} onPress={() => setMine(true)} />
      </View>

      {failed && <ErrorBanner message={t('treasury.loadError')} onRetry={() => load(true)} />}

      {loading ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : (
        <>
          <Text style={styles.count}>{t('treasury.resultCount', { count: total })}</Text>

          {items.length === 0 && !failed && (
            <Card style={styles.noticeCard}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.mossSoft} />
              <Text style={styles.noticeText}>
                {status === 'DECLARE' ? t('treasury.emptyQueue') : t('treasury.emptyList')}
              </Text>
            </Card>
          )}

          <View style={{ gap: 8, marginTop: 10 }}>
            {items.map((d) => (
              <Card
                key={d.id}
                style={styles.row}
                onPress={() => router.push(`/(tabs)/leader/declaration/${d.id}`)}
              >
                <View style={styles.rowHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.donor} numberOfLines={1}>
                      {d.userFullName}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {fmtDate(parseLocalDate(d.donationDate))}
                      {d.unitName ? ` · ${d.unitName}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Amount value={d.declaredTotal} currency={d.currency} size={20} />
                    <DeclarationStatusPill status={d.status} size="sm" />
                    {d.selfVerified && (
                      <Text style={styles.selfTag}>{t('treasury.statusSelfVerified')}</Text>
                    )}
                  </View>
                </View>

                {/* Ventilation : le trésorier doit voir À QUOI se rapporte le versement sans
                    ouvrir la fiche — c'est ce qui lui permet de trier sa file d'un coup d'œil. */}
                <View style={styles.linesWrap}>
                  {d.lines.map((l) => {
                    const meta = metaOf(l.category);
                    return (
                      <View key={l.id} style={styles.lineChip}>
                        <View style={[styles.lineDot, { backgroundColor: meta.tone }]} />
                        <Text style={styles.lineLabel} numberOfLines={1}>
                          {labelOf(l.category)}
                        </Text>
                        <Text style={styles.lineAmount}>{fmtAmount(l.amount, d.currency)}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>

          {!last && (
            <Pressable style={styles.moreBtn} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator color={colors.mossSoft} />
              ) : (
                <Text style={styles.moreText}>{t('treasury.loadMore')}</Text>
              )}
            </Pressable>
          )}
        </>
      )}
    </ScreenShell>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={() => goBack()} hitSlop={10}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 22 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink2 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
    marginTop: 6,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  count: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink3, marginTop: 16 },
  noticeCard: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  donor: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 3 },
  linesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  lineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)',
  },
  lineDot: { width: 6, height: 6, borderRadius: 3 },
  lineLabel: { flexShrink: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink2 },
  lineAmount: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink },
  // Mention « auto-validée » : servie par le backend (`selfVerified`), jamais déduite en comparant
  // deux identifiants. J-1 autorise l'auto-validation — à condition qu'elle se VOIE.
  selfTag: {
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.earthDeep,
  },
  moreBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 99,
    alignItems: 'center',
    backgroundColor: 'rgba(42,38,32,0.05)',
  },
  moreText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.mossSoft },
});
