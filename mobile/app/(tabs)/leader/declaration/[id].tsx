import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '../../../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../../components/ScreenShell';
import Card from '../../../../components/Card';
import Label from '../../../../components/Label';
import Amount from '../../../../components/Amount';
import Button from '../../../../components/Button';
import HandDivider from '../../../../components/HandDivider';
import ErrorBanner from '../../../../components/ErrorBanner';
import DeclarationStatusPill from '../../../../components/DeclarationStatusPill';
import { colors, fonts, radii } from '../../../../theme';
import { useAuth } from '../../../../contexts/AuthContext';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useDonationCategories } from '../../../../hooks/useDonationCategories';
import {
  getDeclaration,
  unverifyDeclaration,
  verifyDeclaration,
  type DeclarationResponse,
} from '../../../../services/donationApi';
import { confirmDialog, notify } from '../../../../utils/dialogs';
import { fmtAmount, fmtDateLong, parseLocalDate } from '../../../../utils/format';

/**
 * Détail d'une déclaration, côté TRÉSORIER — Lot T8 (décision J-1, JP 14/09).
 *
 * <p><b>Un seul geste.</b> Le trésorier lit la ventilation, la compare à ce qu'il constate hors
 * application, et valide. S'il ne valide pas, il ne se passe rien : la déclaration reste
 * `DECLARE`, il contacte la personne, elle corrige elle-même. C'est pourquoi cet écran ne porte
 * <b>ni champ « montant constaté », ni motif d'écart, ni rejet</b> — la décision J-1 a écarté ce
 * troisième état, et l'ajouter ici le recréerait par l'interface.
 *
 * <p>Le trésorier <b>lit</b> : il ne corrige jamais la déclaration d'un membre (lot T2,
 * `isDonationAdmin` ne conserve que `superAdmin`). La seule écriture offerte est la transition de
 * statut, et sa réciproque — dévalider — réservée au rattrapage d'une erreur du trésorier.
 */
export default function TreasuryDeclarationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const { me } = useAuth();
  const { labelOf, metaOf } = useDonationCategories();

  const [declaration, setDeclaration] = useState<DeclarationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFailed(false);
    try {
      setDeclaration(await getDeclaration(id));
    } catch {
      setDeclaration(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onVerify = async () => {
    if (!declaration) return;
    const ok = await confirmDialog(
      t('treasury.verifyConfirmTitle'),
      t('treasury.verifyConfirmBody'),
      t('treasury.verify'),
    );
    if (!ok) return;
    setSaving(true);
    try {
      // La réponse porte le nouvel état complet (`verifiedByName`, `verifiedAt`, `selfVerified`,
      // `editable`) : on l'affiche telle quelle plutôt que de deviner le résultat côté client.
      setDeclaration(await verifyDeclaration(declaration.id));
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('treasury.verifyFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onUnverify = async () => {
    if (!declaration) return;
    const ok = await confirmDialog(
      t('treasury.unverifyConfirmTitle'),
      t('treasury.unverifyConfirmBody'),
      t('treasury.unverify'),
      true,
    );
    if (!ok) return;
    setSaving(true);
    try {
      setDeclaration(await unverifyDeclaration(declaration.id));
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('treasury.verifyFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (!declaration) {
    return (
      <ScreenShell>
        <Head />
        <ErrorBanner message={t('treasury.notFound')} onRetry={load} />
      </ScreenShell>
    );
  }

  const verified = declaration.status === 'VERIFIE';
  const isOwnDeclaration = !!me && me.id === declaration.userId;

  return (
    <ScreenShell>
      <Head />

      {failed && <ErrorBanner message={t('treasury.loadError')} onRetry={load} />}

      <View style={{ marginTop: 8 }}>
        <DeclarationStatusPill status={declaration.status} />
      </View>

      <Text style={styles.title}>{declaration.userFullName}</Text>
      <Text style={styles.subtitle}>
        {fmtDateLong(parseLocalDate(declaration.donationDate))}
        {declaration.unitName ? ` · ${declaration.unitName}` : ''}
      </Text>

      <Card style={styles.totalCard}>
        <Label style={{ color: colors.mossSoft }}>{t('treasury.declaredTotal')}</Label>
        <Amount value={declaration.declaredTotal} currency={declaration.currency} size={36} />
        <Text style={styles.totalHint}>
          {t('treasury.linesCount', { count: declaration.lines.length })}
        </Text>
      </Card>

      {/* Ventilation : c'est l'objet même de la comparaison. Le total seul ne permet pas de
          rapprocher un versement de 300 constaté d'une dîme de 200 et d'une mission de 100. */}
      <Card style={styles.linesCard}>
        <Label style={{ color: colors.mossSoft }}>{t('treasury.breakdown')}</Label>
        <View style={{ marginTop: 12, gap: 12 }}>
          {declaration.lines.map((l) => {
            const meta = metaOf(l.category);
            return (
              <View key={l.id} style={styles.lineRow}>
                <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1F' }]}>
                  <Ionicons name={meta.icon} size={14} color={meta.tone} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lineLabel}>{labelOf(l.category)}</Text>
                  {!!l.note && (
                    <Text style={styles.lineNote} numberOfLines={3}>
                      {l.note}
                    </Text>
                  )}
                </View>
                <Text style={styles.lineAmount}>{fmtAmount(l.amount, declaration.currency)}</Text>
              </View>
            );
          })}
        </View>
        <HandDivider style={{ marginVertical: 14 }} />
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>{t('treasury.declaredTotal')}</Text>
          <Text style={styles.sumValue}>
            {fmtAmount(declaration.declaredTotal, declaration.currency)}
          </Text>
        </View>
      </Card>

      {/* Bandeau « auto-validée » : `selfVerified` est servi par le backend, jamais déduit en
          comparant deux identifiants. J-1 autorise l'auto-validation — à condition qu'elle se
          VOIE, ici comme dans les exports du lot T9. */}
      {verified && declaration.selfVerified && (
        <View style={styles.selfBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.earthDeep} />
          <View style={{ flex: 1 }}>
            <Text style={styles.selfTitle}>{t('treasury.selfVerifiedTitle')}</Text>
            <Text style={styles.selfText}>{t('treasury.selfVerifiedHint')}</Text>
          </View>
        </View>
      )}

      {verified && (
        <Card style={styles.verifiedCard}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.mossSoft} />
          <Text style={styles.verifiedText}>
            {t('treasury.verifiedBy', {
              name: declaration.verifiedByName ?? '—',
              date: declaration.verifiedAt
                ? fmtDateLong(new Date(declaration.verifiedAt))
                : '—',
            })}
          </Text>
        </Card>
      )}

      {!verified && (
        <>
          <View style={styles.hintBox}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.mossSoft} />
            <Text style={styles.hintText}>{t('treasury.mismatchHint')}</Text>
          </View>
          {isOwnDeclaration && (
            <Text style={styles.selfAhead}>{t('treasury.selfVerifyAhead')}</Text>
          )}
          <Button
            label={t('treasury.verify')}
            onPress={onVerify}
            loading={saving}
            fullWidth
            style={{ marginTop: 14 }}
            iconLeft={<Ionicons name="checkmark" size={18} color={colors.white} />}
          />
        </>
      )}

      {verified && (
        <Button
          label={t('treasury.unverify')}
          variant="ghost"
          onPress={onUnverify}
          loading={saving}
          fullWidth
          style={{ marginTop: 16 }}
        />
      )}
    </ScreenShell>
  );
}

function Head() {
  const { t } = useLanguage();
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={() => goBack()} hitSlop={10}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
      <Text style={styles.headerTitle}>{t('treasury.detailTitle')}</Text>
      <View style={{ width: 22 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink2 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -0.4,
    marginTop: 8,
    lineHeight: 30,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  totalCard: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 16 },
  totalHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 6 },
  linesCard: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lineIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineLabel: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  lineNote: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 17 },
  lineAmount: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sumLabel: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.ink2 },
  sumValue: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700', color: colors.ink },
  selfBanner: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(201,149,107,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(167,117,75,0.30)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  selfTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.earthDeep },
  selfText: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink2, marginTop: 2, lineHeight: 17 },
  verifiedCard: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifiedText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  hintBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.mossTint,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  hintText: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.mossDeep, lineHeight: 18 },
  selfAhead: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.earthDeep,
    marginTop: 10,
    lineHeight: 17,
  },
});
