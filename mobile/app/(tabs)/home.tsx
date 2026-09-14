import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, Modal, Linking, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Label from '../../components/Label';
import Amount from '../../components/Amount';
import HandDivider from '../../components/HandDivider';
import DonationRow from '../../components/DonationRow';
import { colors, fonts, radii } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { hasMemberGoals } from '../../services/authApi';
import { getSummary, type CurrencyTotal, type DonationSummary } from '../../services/statsApi';
import { listDonations, type DonationResponse } from '../../services/donationApi';
import { fmtAmount, monthLabel } from '../../utils/format';
import { useLanguage } from '../../contexts/LanguageContext';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type ComingKind = 'cantique' | 'priere' | 'compte-rendu';

export default function HomeScreen() {
  const { me, isLeader, isTreasurer, hasGoals, hasDonations } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [recent, setRecent] = useState<DonationResponse[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [coming, setComing] = useState<ComingKind | null>(null);

  // `hasDonations` arrive après coup (les modules accessibles sont chargés en asynchrone après le
  // token) : il DOIT être en dépendance, sinon `load` reste figé sur la valeur `false` du 1er rendu
  // et les données de dons ne se chargent jamais.
  const load = useCallback(async () => {
    if (!hasDonations) return; // module Dons non couvert par un abonnement : rien à charger
    const [s, list] = await Promise.allSettled([
      getSummary(),
      listDonations({ size: 5 }),
    ]);
    // Défaut B (14/09) : `/donations/stats/summary` était réservé aux dirigeants ; le 403 était
    // avalé ici et le bloc affichait « 0 » à un fidèle qui avait pourtant déclaré. Depuis le lot
    // T2 l'endpoint est ouvert à tout membre abonné, SCOPÉ SUR SES PROPRES DONS (périmètre de
    // trésorerie s'il est trésorier). Un échec résiduel se dit désormais à l'écran.
    if (s.status === 'fulfilled') setSummary(s.value);
    setSummaryFailed(s.status === 'rejected');
    if (list.status === 'fulfilled') setRecent(list.value.content);
  }, [hasDonations]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
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

  const firstName = (me?.fullName ?? '').split(' ')[0] || '';
  const initials = (me?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  // Défaut D (14/09) : l'accueil ne suppose plus une devise unique. La déclaration accepte
  // GBP/EUR/USD : un total « toutes devises confondues » n'a aucun sens comptable, on affiche
  // donc UNE LIGNE PAR DEVISE. L'objectif annuel en dur (3 000 £) est retiré : il n'est
  // paramétrable nulle part, il ne doit donc pas être montré.
  const monthLines = buildMonthLines(summary);
  const yearLines = sortedTotals(summary?.yearToDate);

  const today = new Date();

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>
            {monthLabel(today.getMonth(), true).charAt(0).toUpperCase() +
              monthLabel(today.getMonth(), true).slice(1)}{' '}
            {today.getDate()}, {today.getFullYear()}
          </Text>
          <Text style={styles.greeting}>
            {t('dashboard.welcomeBack')}{'\n'}
            <Text style={styles.greetingItalic}>{firstName || '…'}</Text>.
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '·'}</Text>
        </Pressable>
      </View>

     {/* <View style={styles.verseCard}>
        <Text style={styles.verseText}>
          {t('dashboard.verse')}
        </Text>
        <Text style={styles.verseRef}>{t('dashboard.verseRef')}</Text>
      </View>*/}

      {/* Feature A — le simple membre accède aussi à SES objectifs depuis l'accueil.
          Défaut A (14/09) : cette tuile était conditionnée par `!hasDonations` et disparaissait
          dès l'activation du module Dons. Le but quinquennal est CENTRAL : elle reste affichée
          quoi qu'il arrive. Ne jamais la re-conditionner sur un abonnement Dons. */}
      {(hasGoals || hasMemberGoals(me)) && (
        <Card onPress={() => router.push('/(tabs)/goals')} style={styles.scopeCta}>
          <Ionicons name="flag" size={26} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scopeTitle}>{t('dashboard.myGoals')}</Text>
            <Text style={styles.scopeSub}>{t('dashboard.myGoalsSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Card>
      )}

      {hasDonations && (
      <Card style={styles.hero}>
        <Label style={{ color: colors.mossSoft }}>{t('dashboard.thisMonth')}</Label>
        {summaryFailed ? (
          <Text style={styles.heroEmpty}>{t('dashboard.summaryUnavailable')}</Text>
        ) : monthLines.length === 0 ? (
          <Text style={styles.heroEmpty}>{t('dashboard.noneThisMonth')}</Text>
        ) : (
          monthLines.map((line, i) => (
            <View key={line.currency} style={i > 0 ? styles.extraCurrency : undefined}>
              <Amount
                value={line.total}
                currency={line.currency}
                size={i === 0 ? 46 : 28}
                showDecimals
              />
              <View style={styles.diffRow}>
                <Ionicons
                  name={line.diff >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={line.diff >= 0 ? colors.mossSoft : colors.clay}
                />
                <Text
                  style={[
                    styles.diffPct,
                    { color: line.diff >= 0 ? colors.mossSoft : colors.clay },
                  ]}
                >
                  {line.diff >= 0 ? '+' : '\u2212'}
                  {Math.abs(line.diffPct)}%
                </Text>
                <Text style={styles.diffNote}>
                  {t('dashboard.vsLastMonth', { amount: fmtAmount(line.lastTotal, line.currency) })}
                </Text>
              </View>
            </View>
          ))
        )}

        {yearLines.length > 0 && (
          <>
            <HandDivider style={{ marginVertical: 16 }} />
            <Label style={{ color: colors.mossSoft }}>{t('dashboard.yearTotal')}</Label>
            {yearLines.map((y) => (
              <View key={y.currency} style={styles.yearRow}>
                <Amount value={y.total} currency={y.currency} size={24} showDecimals />
              </View>
            ))}
          </>
        )}
      </Card>
      )}

      <View style={styles.tileGrid}>
        {hasDonations && (
        <Tile
          label={t('dashboard.tiles.declare')}
          hint={t('dashboard.tiles.declareHint')}
          icon="add"
          tone={colors.moss}
          primary
          onPress={() => router.push('/declare')}
        />
        )}
{/* Lot S1 (21/07) : briques visibles de TOUS — le contenu des écrans s'adapte au rôle
    (listes scopées côté backend ; lecture seule pour un membre simple).
    RDG 25/07 : le simple fidèle ne voit QUE Structure et Cantiques (+ ses objectifs en haut) —
    Membres et Hiérarchie sont des outils de dirigeant, sans objet pour lui. */}
        <Tile
          label={t('dashboard.tiles.structure')}
          hint={t('dashboard.tiles.structureHint')}
          icon="business-outline"
          tone={colors.moss}
          onPress={() => router.push('/structure')}
        />
        {isLeader && (
        <Tile
          label={t('dashboard.tiles.membres')}
          hint={t('dashboard.tiles.membresHint')}
          icon="people-outline"
          tone={colors.earthDeep}
          onPress={() => router.push('/membres')}
        />
        )}
        {isLeader && (
        <Tile
          label={t('dashboard.tiles.hierarchie')}
          hint={t('dashboard.tiles.hierarchieHint')}
          icon="git-network-outline"
          tone="#7A8B6F"
          onPress={() => router.push('/hierarchie')}
        />
        )}
{        <Tile
          label={t('dashboard.tiles.cantique')}
          hint={t('dashboard.tiles.cantiqueHint')}
          icon="musical-notes-outline"
          tone={colors.earth}
          onPress={() => setComing('cantique')}
        />
        /*
        <Tile
          label={t('dashboard.tiles.priere')}
          hint={t('dashboard.tiles.priereHint')}
          icon="hand-left-outline"
          tone="#7A8B6F"
          comingSoon
          onPress={() => setComing('priere')}
        />
        <Tile
          label={t('dashboard.tiles.compteRendu')}
          hint={t('dashboard.tiles.compteRenduHint')}
          icon="reader-outline"
          tone={colors.earthDeep}
          comingSoon
          onPress={() => setComing('compte-rendu')}
        />*/}
      </View>

      {hasDonations && (
      <>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('dashboard.recent')}</Text>
        <Pressable onPress={() => router.push('/(tabs)/donations')}>
          <Text style={styles.sectionLink}>{t('dashboard.seeAll')}</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 10, gap: 8 }}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>{t('dashboard.empty')}</Text>
        ) : (
          recent.map((d) => (
            <DonationRow
              key={d.id}
              donation={d}
              onPress={() => router.push(`/donation/${d.id}`)}
            />
          ))
        )}
      </View>
      </>
      )}

      {/* Lot T4, défaut C (14/09) : le raccourci suit l'onglet « Trésorerie » — gaté sur
          `isTreasurer`, jamais sur `isLeader`, sinon il pointait vers un onglet masqué. */}
      {hasDonations && isTreasurer && (
        <Card
          onPress={() => router.push('/(tabs)/leader')}
          style={styles.scopeCta}
        >
          <Ionicons name="people" size={26} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scopeTitle}>{t('dashboard.scope')}</Text>
            <Text style={styles.scopeSub}>{t('dashboard.scopeSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Card>
      )}

      <ComingSoonModal kind={coming} onClose={() => setComing(null)} />
    </ScreenShell>
  );
}

function Tile({
  label,
  hint,
  icon,
  tone,
  primary,
  comingSoon,
  onPress,
}: {
  label: string;
  hint: string;
  icon: IoniconName;
  tone: string;
  primary?: boolean;
  comingSoon?: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        primary ? styles.tilePrimary : styles.tileSurface,
        { opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View
        style={[
          styles.tileIcon,
          primary
            ? {
                backgroundColor: 'rgba(232,220,196,0.14)',
                borderColor: 'rgba(232,220,196,0.22)',
                borderWidth: 1,
              }
            : { backgroundColor: tone + '1A' },
        ]}
      >
        <Ionicons name={icon} size={22} color={primary ? colors.white : tone} />
      </View>
      <View>
        <Text style={[styles.tileLabel, primary && { color: colors.white }]}>{label}</Text>
        <Text
          style={[
            styles.tileHint,
            primary && { color: 'rgba(242,233,210,0.65)' },
          ]}
        >
          {hint}
        </Text>
      </View>
      {comingSoon && (
        <Text style={styles.comingPill}>{t('common.comingSoon')}</Text>
      )}
    </Pressable>
  );
}

const COMING_META: Record<ComingKind, { titleKey: string; bodyKey: string; icon: IoniconName; tone: string }> = {
  cantique: { titleKey: 'dashboard.coming.cantiqueTitle', bodyKey: 'dashboard.coming.cantiqueBody', icon: 'musical-notes-outline', tone: colors.earth },
  priere: { titleKey: 'dashboard.coming.priereTitle', bodyKey: 'dashboard.coming.priereBody', icon: 'hand-left-outline', tone: '#7A8B6F' },
  'compte-rendu': { titleKey: 'dashboard.coming.compteRenduTitle', bodyKey: 'dashboard.coming.compteRenduBody', icon: 'reader-outline', tone: colors.earthDeep },
};

// Cantiques (23/07) : la brique renvoie vers l'app CMFIPraise — liens stores officiels.
const CMFIPRAISE_IOS = 'https://apps.apple.com/fr/app/cmfipraise/id6744709222';
const CMFIPRAISE_ANDROID = 'https://play.google.com/store/apps/details?id=org.cmfi.cmfipraise';

function ComingSoonModal({
  kind,
  onClose,
}: {
  kind: ComingKind | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  if (!kind) return null;
  const c = COMING_META[kind];
  const isCantique = kind === 'cantique';

  const openStore = () => {
    const url = Platform.OS === 'ios' ? CMFIPRAISE_IOS : CMFIPRAISE_ANDROID;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal transparent animationType="fade" visible={!!kind} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={[styles.modalIcon, { backgroundColor: c.tone + '1A' }]}>
            <Ionicons name={c.icon} size={28} color={c.tone} />
          </View>
          <Text style={styles.modalTitle}>{t(c.titleKey)}</Text>
          <Text style={[styles.modalKicker, { color: c.tone }]}>
            {isCantique ? t('dashboard.coming.cantiqueKicker') : t('dashboard.comingSoonBadge')}
          </Text>
          <HandDivider style={{ marginVertical: 14, alignSelf: 'center', width: '80%' }} />
          <Text style={styles.modalBody}>{t(c.bodyKey)}</Text>
          {isCantique ? (
            <>
              <Button
                label={t('dashboard.coming.cantiqueDownload')}
                onPress={openStore}
                fullWidth
                height={50}
                style={{ marginTop: 18 }}
                iconLeft={<Ionicons name="download-outline" size={18} color={colors.white} />}
              />
              <Button
                label={t('dashboard.comingAck')}
                variant="ghost"
                onPress={onClose}
                fullWidth
                height={44}
                style={{ marginTop: 8 }}
              />
            </>
          ) : (
            <Button
              label={t('dashboard.comingAck')}
              variant="soft"
              onPress={onClose}
              fullWidth
              height={46}
              style={{ marginTop: 18 }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface MonthLine {
  currency: string;
  total: number;
  lastTotal: number;
  diff: number;
  diffPct: number;
}

/** Totaux d'une devise, du plus gros au plus petit — ordre d'affichage stable. */
function sortedTotals(totals: CurrencyTotal[] | undefined): CurrencyTotal[] {
  return [...(totals ?? [])].sort((a, b) => b.total - a.total);
}

/**
 * Une ligne par devise présente ce mois-ci OU le mois dernier : une devise qui a disparu doit
 * rester visible (elle affiche 0 et une variation négative), sinon le total « recule » sans
 * explication. Rien n'est additionné entre devises (défaut D, 14/09).
 */
function buildMonthLines(summary: DonationSummary | null): MonthLine[] {
  const current = summary?.currentMonth ?? [];
  const last = summary?.lastMonth ?? [];
  const currencies = Array.from(
    new Set([...current, ...last].map((c) => c.currency)),
  );
  return currencies
    .map((currency) => {
      const total = current.find((c) => c.currency === currency)?.total ?? 0;
      const lastTotal = last.find((c) => c.currency === currency)?.total ?? 0;
      const diff = total - lastTotal;
      return {
        currency,
        total,
        lastTotal,
        diff,
        diffPct: lastTotal > 0 ? Math.round((diff / lastTotal) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  date: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  greeting: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 32,
    marginTop: 4,
    color: colors.ink,
    letterSpacing: -0.45,
  },
  greetingItalic: { fontStyle: 'italic' },
  verseCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: colors.parchmentDeep,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.06)',
  },
  verseText: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
    color: colors.mossDeep,
  },
  verseRef: {
    marginTop: 4,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
    letterSpacing: 0.5,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontFamily: fonts.serif,
    fontSize: 18,
  },
  hero: { paddingHorizontal: 22, paddingVertical: 22 },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  diffPct: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 13 },
  diffNote: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  extraCurrency: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
  },
  heroEmpty: {
    marginTop: 8,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.ink3,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 26,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, letterSpacing: -0.2 },
  sectionLink: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: colors.earthDeep,
  },
  empty: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.ink3,
    textAlign: 'center',
    paddingVertical: 20,
  },
  scopeCta: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.moss,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  scopeTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.white },
  scopeSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.parchment, opacity: 0.85 },

  tileGrid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '48%',
    minHeight: 138,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: radii.lg,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  tileSurface: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
  },
  tilePrimary: {
    backgroundColor: colors.mossSoft,
    borderWidth: 0,
    shadowColor: colors.mossDeep,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 20,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  tileHint: {
    marginTop: 3,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
  },
  comingPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.ink3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },

  footerMark: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,18,14,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    textAlign: 'center',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  modalKicker: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink2,
    lineHeight: 22,
    textAlign: 'center',
  },
});
