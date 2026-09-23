import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { goBack } from '../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Label from '../../components/Label';
import Amount from '../../components/Amount';
import Button from '../../components/Button';
import HandDivider from '../../components/HandDivider';
import ErrorBanner from '../../components/ErrorBanner';
import DeclarationStatusPill from '../../components/DeclarationStatusPill';
import { colors, fonts } from '../../theme';
import { useDonationCategories } from '../../hooks/useDonationCategories';
import {
  deleteDeclaration,
  getDeclaration,
  getDonation,
  type DeclarationResponse,
} from '../../services/donationApi';
import { fmtAmount, fmtDateLong, parseLocalDate } from '../../utils/format';
import { confirmDialog, notify } from '../../utils/dialogs';
import { declarationErrorMessage } from '../../utils/donationErrors';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Lot T7 (décision J-1, JP 14/09) — DÉTAIL D'UNE DÉCLARATION, avec sa ventilation par rubrique.
 *
 * <p>L'écran montrait un don isolé et calculait lui-même une fenêtre d'édition de 24 h
 * (`hoursOld < 24`). Cette fenêtre N'EXISTE PLUS : une déclaration se corrige tant qu'elle est
 * `DECLARE` et se fige une fois vérifiée. Le droit d'écrire est SERVER-DRIVEN (`editable`) — on
 * l'affiche, on ne le recalcule pas, comme pour `editable` côté Goals.
 *
 * <p>Ni « Référence », ni « Moyen » : le module est 100 % déclaratif (D0-10), et la référence
 * « CMCI-xxxx » était fabriquée côté client à partir de l'id, nom de client en dur compris.
 */
export default function DeclarationDetailScreen() {
  const { t } = useLanguage();
  // Lot T5 — libellé et apparence des rubriques, depuis le référentiel du ministère. Une rubrique
  // désactivée depuis reste lisible (repli i18n) : pas de trou dans l'historique.
  const { labelOf, metaOf } = useDonationCategories();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [declaration, setDeclaration] = useState<DeclarationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDeclaration(await resolveDeclaration(id));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Rechargement au retour de l'écran de correction : le statut et la ventilation viennent
  // peut-être de changer.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onDelete = async () => {
    if (!declaration) return;
    const confirmed = await confirmDialog(
      t('common.appName'),
      t('declarations.deleteConfirm'),
      t('common.delete'),
      true,
    );
    if (!confirmed) return;
    try {
      await deleteDeclaration(declaration.id);
      goBack();
    } catch (e: any) {
      notify(t('common.appName'), declarationErrorMessage(e, t, t('errors.deleteFailed')));
    }
  };

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (!declaration) {
    return (
      <ScreenShell withTabBar={false}>
        <Header title={t('declarations.detailTitle')} />
        <ErrorBanner
          message={failed ? t('declarations.loadFailed') : t('declarations.notFound')}
          onRetry={() => void load()}
        />
      </ScreenShell>
    );
  }

  const date = parseLocalDate(declaration.donationDate);

  return (
    <ScreenShell withTabBar={false}>
      <Header title={t('declarations.detailTitle')} />

      <Card variant="paper2" style={styles.certificate}>
        <Text style={styles.certLabel}>{t('declarations.certificate')}</Text>
        <HandDivider style={{ marginVertical: 10, width: '60%', alignSelf: 'center' }} />

        <View style={{ alignItems: 'center', marginTop: 14 }}>
          <Amount
            value={declaration.declaredTotal}
            currency={declaration.currency}
            size={52}
            showDecimals
          />
          <Text style={styles.dateLine}>{fmtDateLong(date)}</Text>
          <View style={{ marginTop: 10 }}>
            <DeclarationStatusPill status={declaration.status} />
          </View>
        </View>

        <HandDivider style={{ marginVertical: 20, width: '85%', alignSelf: 'center' }} />

        <Label style={{ marginBottom: 10 }}>{t('declarations.breakdown')}</Label>
        {declaration.lines.map((line) => {
          const meta = metaOf(line.category);
          return (
            <View key={line.id} style={styles.lineRow}>
              <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1A' }]}>
                <Ionicons name={meta.icon} size={16} color={meta.tone} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lineLabel} numberOfLines={1}>
                  {labelOf(line.category)}
                </Text>
                {!!line.note && (
                  <Text style={styles.lineNote} numberOfLines={2}>
                    « {line.note} »
                  </Text>
                )}
              </View>
              <Text style={styles.lineAmount}>
                {fmtAmount(line.amount, declaration.currency)}
              </Text>
            </View>
          );
        })}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('declare.totalDeclared')}</Text>
          <Text style={styles.totalValue}>
            {fmtAmount(declaration.declaredTotal, declaration.currency)}
          </Text>
        </View>

        <HandDivider style={{ marginVertical: 18, width: '85%', alignSelf: 'center' }} />

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Label>{t('detail.unit')}</Label>
            <Text style={styles.metaValue}>{declaration.unitName ?? '—'}</Text>
          </View>
          {declaration.status === 'VERIFIE' && (
            <View style={[styles.metaItem, { alignItems: 'flex-end' }]}>
              <Label>{t('declarations.verifiedBy')}</Label>
              <Text style={styles.metaValue}>{declaration.verifiedByName ?? '—'}</Text>
              {!!declaration.verifiedAt && (
                <Text style={styles.metaSub}>
                  {fmtDateLong(new Date(declaration.verifiedAt))}
                </Text>
              )}
              {declaration.selfVerified && (
                <Text style={styles.metaSub}>{t('declarations.selfVerified')}</Text>
              )}
            </View>
          )}
        </View>

        <HandDivider style={{ marginTop: 20, marginBottom: 12, width: '85%', alignSelf: 'center' }} />
        <Text style={styles.certFooter}>{t('detail.footer')}</Text>
      </Card>

      {/* Le droit d'écrire vient du serveur (`editable`). L'UI le MONTRE : quand la déclaration est
          vérifiée, les boutons ne sont pas seulement inopérants, ils disparaissent au profit de
          l'explication — §8b.9 de docs/donations-recette.md. */}
      {declaration.editable ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
            <Button
              label={t('common.edit')}
              variant="ghost"
              iconLeft={<Ionicons name="pencil" size={16} color={colors.moss} />}
              style={{ flex: 1 }}
              onPress={() => router.push(`/donation/edit/${declaration.id}`)}
            />
            <Button
              label={t('common.delete')}
              variant="danger"
              iconLeft={<Ionicons name="trash-outline" size={16} color={colors.clay} />}
              style={{ flex: 1 }}
              onPress={() => void onDelete()}
            />
          </View>
          <Text style={styles.editableHint}>{t('declarations.editableHint')}</Text>
        </>
      ) : (
        <View style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.mossSoft} />
          <Text style={styles.lockedText}>{t('declarations.lockedHint')}</Text>
        </View>
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

/**
 * L'écran est atteint avec un id de DÉCLARATION (« Mes déclarations ») mais aussi, depuis
 * l'accueil, avec un id de LIGNE COMPTABLE : `home.tsx` liste encore des `don_donation`. On
 * retente donc par le don, dont le serveur expose la déclaration d'origine (`declarationId`).
 * Les dons repris par la migration portent l'id de leur déclaration — ce détour ne concerne que
 * les lignes nées d'une déclaration multi-rubriques.
 */
async function resolveDeclaration(id: string): Promise<DeclarationResponse> {
  try {
    return await getDeclaration(id);
  } catch (e: any) {
    if (e?.response?.status !== 404) throw e;
    const donation = await getDonation(id);
    if (!donation.declarationId) throw e;
    return await getDeclaration(donation.declarationId);
  }
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink2,
  },
  certificate: {
    marginTop: 24,
    paddingHorizontal: 26,
    paddingVertical: 28,
    borderColor: 'rgba(42,38,32,0.10)',
  },
  certLabel: {
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink3,
    letterSpacing: 1.8,
  },
  dateLine: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.mossSoft,
    marginTop: 8,
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  lineIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineLabel: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.ink },
  lineNote: {
    fontFamily: fonts.serif,
    fontSize: 12.5,
    fontStyle: 'italic',
    color: colors.ink3,
    marginTop: 2,
  },
  lineAmount: { fontFamily: fonts.mono, fontSize: 13.5, color: colors.ink },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
  },
  totalLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    color: colors.ink3,
    fontWeight: '600',
  },
  totalValue: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  metaItem: { width: '50%' },
  metaValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, marginTop: 3 },
  metaSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  certFooter: {
    textAlign: 'center',
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.4,
  },
  editableHint: {
    marginTop: 10,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink3,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  locked: {
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(42,38,32,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockedText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
});
