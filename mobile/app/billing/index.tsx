import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  billingErrorMessage,
  downloadInvoicePdf,
  listMyInvoices,
  listMySubscriptions,
  type BillingInvoice,
  type BillingSubscription,
  type BillingSubscriptionStatus,
} from '@/services/billingApi';
import { toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';

/** Montant en centimes → texte localisé (plan 23/10 §6.4 : l'API ne formate jamais un montant). */
function fmtCents(cents: number, currency: string, language: string): string {
  const locale = language.startsWith('fr') ? 'fr-FR' : 'en-GB';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const STATUS_TONE: Record<BillingSubscriptionStatus, { fg: string; bg: string }> = {
  ACTIVE: { fg: colors.moss, bg: colors.mossTint2 },
  PENDING: { fg: colors.earthDeep, bg: colors.mossTint },
  PAST_DUE: { fg: colors.clay, bg: colors.mossTint },
  CANCELED: { fg: colors.ink3, bg: colors.mossTint },
  EXPIRED: { fg: colors.ink3, bg: colors.mossTint },
};

/**
 * « Mes factures » — plan 23/10 §6.2 (lot ABO5) : abonnements payants du compte connecté et leurs
 * factures, avec « Télécharger » (PDF dans le cache puis feuille de partage).
 *
 * <p>D-ABO-13 (JP 23/10) — CONSULTATION SEULE, sur iOS ET Android : aucun bouton d'achat, aucun
 * accès à l'espace client Stripe, aucun lien ni texte vers une page de paiement (règles App Store
 * 3.1.1 / Google Play Billing). Ne rien ajouter de tel ici, même « pour aider ».
 * D-ABO-07 : le payeur seul ; l'écran n'est proposé (profil) que si `GET /subscriptions` est non
 * vide. Pas de react-query : useState + useFocusEffect.
 */
export default function BillingScreen() {
  const { t, language } = useLanguage();
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  // Données reçues au moins une fois : sinon un échec du 1er chargement afficherait aussi les
  // états vides (« Aucun abonnement / Aucune facture »), faux pour un payeur.
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    try {
      const [subs, invs] = await Promise.all([listMySubscriptions(), listMyInvoices()]);
      setSubscriptions(subs);
      setInvoices(invs);
      setLoadedOnce(true);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(billingErrorMessage(e, t, t('billing.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

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

  const day = (iso: string | null) => (iso ? fmtIsoDay(toLocalDate(new Date(iso)), t) : '—');

  const onDownload = async (inv: BillingInvoice) => {
    if (downloading) return;
    setDownloading(inv.number);
    try {
      const res = await downloadInvoicePdf(inv.number, t('billing.invoices.shareTitle', { number: inv.number }));
      if (res === 'unavailable') notify(t('billing.title'), t('billing.invoices.sharingUnavailable'));
    } catch (e: any) {
      notify(t('billing.title'), billingErrorMessage(e, t, t('billing.invoices.downloadFailed')));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>{t('billing.kicker')}</Text>
      <Text style={styles.title}>{t('billing.title')}</Text>

      {!!loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : !loadedOnce ? null : (
        <>
          <Label style={styles.section}>{t('billing.subscriptions.title')}</Label>
          {subscriptions.length === 0 ? (
            <Card variant="paper2" style={styles.empty}>
              <Text style={styles.emptyText}>{t('billing.subscriptions.empty')}</Text>
            </Card>
          ) : (
            subscriptions.map((s) => (
              <Card key={s.reference} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.offer} numberOfLines={2}>
                    {s.offerName}
                  </Text>
                  <Text style={[styles.pill, { color: STATUS_TONE[s.status].fg, backgroundColor: STATUS_TONE[s.status].bg }]}>
                    {t(`billing.status.${s.status}`)}
                  </Text>
                </View>
                <Text style={styles.reference}>{s.reference}</Text>
                <Text style={styles.price}>
                  {t(`billing.period.${s.billingPeriod}`, { amount: fmtCents(s.priceCents, s.currency, language) })}
                </Text>
                {s.discountPercent != null && s.discountPercent > 0 && (
                  <Text style={styles.meta}>
                    {t('billing.subscriptions.discount', {
                      percent: s.discountPercent,
                      list: fmtCents(s.listPriceCents, s.currency, language),
                    })}
                    {s.promoCode ? ` · ${s.promoCode}` : ''}
                  </Text>
                )}
                {!!s.ministryName && <Text style={styles.meta}>{s.ministryName}</Text>}
                {(s.status === 'ACTIVE' || s.status === 'PAST_DUE') && !!s.currentPeriodEnd && (
                  <Text style={styles.meta}>
                    {s.cancelAtPeriodEnd
                      ? t('billing.subscriptions.endsOn', { date: day(s.currentPeriodEnd) })
                      : t('billing.subscriptions.nextDue', { date: day(s.currentPeriodEnd) })}
                  </Text>
                )}
                {s.status === 'CANCELED' && !!s.canceledAt && (
                  <Text style={styles.meta}>{t('billing.subscriptions.canceledOn', { date: day(s.canceledAt) })}</Text>
                )}
              </Card>
            ))
          )}

          <Label style={styles.section}>{t('billing.invoices.title')}</Label>
          {invoices.length === 0 ? (
            <Card variant="paper2" style={styles.empty}>
              <Text style={styles.emptyText}>{t('billing.invoices.empty')}</Text>
            </Card>
          ) : (
            invoices.map((inv) => (
              <Card key={inv.number} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.invoiceNumber}>{inv.number}</Text>
                  <Text style={styles.amount}>{fmtCents(inv.totalCents, inv.currency, language)}</Text>
                </View>
                <Text style={styles.meta}>{t('billing.invoices.issuedOn', { date: day(inv.issuedAt) })}</Text>
                {!!inv.periodStart && !!inv.periodEnd && (
                  <Text style={styles.meta}>
                    {t('billing.invoices.period', { from: day(inv.periodStart), to: day(inv.periodEnd) })}
                  </Text>
                )}
                <Text style={styles.meta}>
                  {inv.offerName} · {inv.subscriptionReference}
                </Text>
                {inv.refundedCents > 0 && (
                  <Text style={[styles.meta, { color: colors.clay }]}>
                    {t('billing.invoices.refunded', { amount: fmtCents(inv.refundedCents, inv.currency, language) })}
                  </Text>
                )}
                <Button
                  label={t('billing.invoices.download')}
                  variant="soft"
                  height={42}
                  loading={downloading === inv.number}
                  disabled={!!downloading && downloading !== inv.number}
                  onPress={() => void onDownload(inv)}
                  iconLeft={<Ionicons name="download-outline" size={17} color={colors.mossDeep} />}
                  style={{ marginTop: 12 }}
                />
              </Card>
            ))
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  section: { marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  empty: { paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  card: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  offer: { flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: colors.ink },
  pill: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  reference: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3, marginTop: 2 },
  price: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginTop: 8 },
  meta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  invoiceNumber: { flex: 1, fontFamily: fonts.mono, fontSize: 14, color: colors.ink },
  amount: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
});
