import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../../components/ScreenShell';
import Button from '../../../components/Button';
import ErrorBanner from '../../../components/ErrorBanner';
import DeclarationForm, {
  draftLinesToRequest,
  draftTotal,
  firstDraftError,
  newDraftLine,
  round2,
  type DraftLine,
} from '../../../components/DeclarationForm';
import { colors, fonts } from '../../../theme';
import {
  getDeclaration,
  updateDeclaration,
  type DeclarationResponse,
} from '../../../services/donationApi';
import { parseLocalDate, toLocalDate } from '../../../utils/format';
import { notify } from '../../../utils/dialogs';
import { declarationErrorMessage } from '../../../utils/donationErrors';
import { useLanguage } from '../../../contexts/LanguageContext';

/**
 * Lot T7 (décision J-1, JP 14/09) — CORRIGER SA DÉCLARATION, TANT QU'ELLE EST « DÉCLARÉ ».
 *
 * <p>Cette règle REMPLACE la fenêtre de 24 h (UC-MBR-05) : on corrige tant que personne n'a
 * regardé, on ne touche plus après validation. Plus aucun calcul d'ancienneté côté client — le
 * serveur dit `editable`, l'écran l'affiche.
 *
 * <p>Une correction offre exactement ce que la déclaration initiale offrait, date comprise : elle
 * passe par le même formulaire. Le corps envoyé décrit la ventilation COMPLÈTE (une ligne absente
 * est supprimée côté serveur), d'où les `id` conservés sur les lignes déjà enregistrées — sans
 * eux, chaque correction renumérote l'historique comptable.
 */
export default function EditDeclarationScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [declaration, setDeclaration] = useState<DeclarationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(new Date());
  const [currency, setCurrency] = useState('GBP');
  const [lines, setLines] = useState<DraftLine[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await getDeclaration(id);
        setDeclaration(d);
        setDate(parseLocalDate(d.donationDate));
        setCurrency(d.currency);
        setLines(
          d.lines.map((line) =>
            newDraftLine({
              id: line.id,
              // La rubrique d'origine est conservée telle quelle, même si elle a depuis été
              // désactivée : corriger un montant ne doit pas forcer à changer de rubrique.
              category: line.category,
              amount: String(line.amount),
              note: line.note ?? '',
            }),
          ),
        );
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onSave = async () => {
    if (!declaration) return;
    const problem = firstDraftError(lines);
    if (problem === 'INVALID_AMOUNT') {
      notify(t('common.appName'), t('declare.invalidAmount'));
      return;
    }
    if (problem === 'NO_CATEGORY') {
      notify(t('common.appName'), t('declare.lineNeedsCategory'));
      return;
    }
    if (problem === 'NO_LINES') {
      notify(t('common.appName'), t('declare.needsOneLine'));
      return;
    }
    setSaving(true);
    try {
      await updateDeclaration(declaration.id, {
        donationDate: toLocalDate(date),
        currency,
        declaredTotal: round2(draftTotal(lines)),
        lines: draftLinesToRequest(lines),
      });
      router.back();
    } catch (e: any) {
      notify(t('common.appName'), declarationErrorMessage(e, t, t('errors.updateFailed')));
    } finally {
      setSaving(false);
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
        <Header title={t('declarations.editTitle')} />
        <ErrorBanner message={failed ? t('declarations.loadFailed') : t('declarations.notFound')} />
      </ScreenShell>
    );
  }

  // Une déclaration vérifiée ne s'ouvre pas en correction : l'écran le DIT, au lieu de laisser
  // saisir puis d'échouer à l'appel (422 DECLARATION_VERIFIED) — §8b.9 de docs/donations-recette.md.
  if (!declaration.editable) {
    return (
      <ScreenShell withTabBar={false}>
        <Header title={t('declarations.editTitle')} />
        <View style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.mossSoft} />
          <Text style={styles.lockedText}>{t('declarations.lockedHint')}</Text>
        </View>
        <Button
          label={t('common.back')}
          variant="ghost"
          fullWidth
          style={{ marginTop: 18 }}
          onPress={() => router.back()}
        />
      </ScreenShell>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('declarations.editTitle')}</Text>
          <View style={{ width: 26 }} />
        </View>

        <DeclarationForm
          date={date}
          onDateChange={setDate}
          currency={currency}
          onCurrencyChange={setCurrency}
          lines={lines}
          onLinesChange={setLines}
        />

        <Button
          label={t('common.save')}
          onPress={() => void onSave()}
          loading={saving}
          fullWidth
          height={58}
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
        />

        <Text style={styles.footnote}>{t('declarations.editableHint')}</Text>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 22 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink2 },
  footnote: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
    lineHeight: 18,
    paddingHorizontal: 24,
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
