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
import { getSummary, type DonationSummary } from '../../services/statsApi';
import { listDonations, type DonationResponse } from '../../services/donationApi';
import { fmtAmount, monthLabel } from '../../utils/format';
import { useLanguage } from '../../contexts/LanguageContext';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type ComingKind = 'cantique' | 'priere' | 'compte-rendu';

const PRIMARY_CURRENCY = 'GBP';
const YEAR_GOAL = 3000;

export default function HomeScreen() {
  const { me, isLeader, hasGoals, hasDonations } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DonationSummary | null>(null);
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
    if (s.status === 'fulfilled') setSummary(s.value);
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

  const thisMonth = pickAmount(summary?.currentMonth, PRIMARY_CURRENCY);
  const lastMonth = pickAmount(summary?.lastMonth, PRIMARY_CURRENCY);
  const yearTotal = pickAmount(summary?.yearToDate, PRIMARY_CURRENCY);
  const diff = thisMonth - lastMonth;
  const diffPct = lastMonth > 0 ? Math.round((diff / lastMonth) * 100) : 0;
  const pct = Math.min(100, Math.round((yearTotal / YEAR_GOAL) * 100));

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

      {/* Feature A — le simple membre accède aussi à SES objectifs depuis l'accueil. */}
      {!hasDonations && (hasGoals || hasMemberGoals(me)) && (
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
        <Amount value={thisMonth} currency={PRIMARY_CURRENCY} size={54} showDecimals />
        <View style={styles.diffRow}>
          <Ionicons
            name={diff >= 0 ? 'arrow-up' : 'arrow-down'}
            size={14}
            color={diff >= 0 ? colors.mossSoft : colors.clay}
          />
          <Text
            style={[
              styles.diffPct,
              { color: diff >= 0 ? colors.mossSoft : colors.clay },
            ]}
          >
            {diff >= 0 ? '+' : '−'}
            {Math.abs(diffPct)}%
          </Text>
          <Text style={styles.diffNote}>
            {t('dashboard.vsLastMonth', { amount: fmtAmount(lastMonth, PRIMARY_CURRENCY) })}
          </Text>
        </View>

        <HandDivider style={{ marginVertical: 16 }} />

        <Label style={{ color: colors.mossSoft }}>{t('dashboard.yearTotal')}</Label>
        <View style={styles.yearRow}>
          <Amount value={yearTotal} currency={PRIMARY_CURRENCY} size={24} showDecimals />
          <Text style={styles.goalLabel}>{t('dashboard.yearGoal', { amount: fmtAmount(YEAR_GOAL, PRIMARY_CURRENCY) })}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
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

      {hasDonations && isLeader && (
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

function pickAmount(totals: { currency: string; total: number }[] | undefined, cur: string): number {
  if (!totals) return 0;
  return totals.find((t) => t.currency === cur)?.total ?? 0;
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
  goalLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  progressTrack: {
    height: 6,
    marginTop: 8,
    backgroundColor: 'rgba(42,38,32,0.07)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.moss, borderRadius: 99 },
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
