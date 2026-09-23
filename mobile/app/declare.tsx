import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Label from '../components/Label';
import Button from '../components/Button';
import HandDivider from '../components/HandDivider';
import DeclarationForm, {
  draftLinesToRequest,
  draftTotal,
  firstDraftError,
  round2,
  type DraftLine,
} from '../components/DeclarationForm';
import { colors, fonts } from '../theme';
import { useDonationCategories } from '../hooks/useDonationCategories';
import { createDeclaration, type DeclarationResponse } from '../services/donationApi';
import { fmtAmount, fmtDateLong, parseLocalDate, toLocalDate } from '../utils/format';
import { notify } from '../utils/dialogs';
import { declarationErrorMessage } from '../utils/donationErrors';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Lot T7 (décision J-1, JP 14/09) — DÉCLARER UN VERSEMENT, PAS UN DON ISOLÉ.
 *
 * <p>L'écran saisissait un montant, une rubrique, une date. Il saisit désormais l'acte réel :
 * une date, une devise, et N lignes « rubrique + montant » dont le total se calcule en direct.
 * Sans ce regroupement, le trésorier voit deux lignes de 200 et 100 là où il a constaté UN
 * versement de 300, et ne peut pas les rapprocher (§9 de docs/donations-etat-des-lieux.md).
 *
 * <p>Rien de bancaire, aucun moyen de versement, aucune référence (D0-10) : le module est 100 %
 * déclaratif. La « référence CMCI-xxxx » fabriquée côté client a disparu au lot T1 (défaut G) —
 * ne pas la réintroduire sous une autre forme.
 */
/**
 * Fermeture de la modale de déclaration — la garde contre la croix morte vit dans
 * `utils/navigation.goBack`.
 *
 * Au niveau module, et pas dans `DeclareScreen` : `SuccessScreen` est un composant séparé qui
 * ferme lui aussi (bouton « Terminer »).
 */
const dismiss = () => goBack();

export default function DeclareScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [currency, setCurrency] = useState('GBP');
  // Défaut F (14/09) : la date était figée — on ne pouvait déclarer qu'aujourd'hui. Elle est
  // saisissable, dans le PASSÉ uniquement (`@PastOrPresent` côté serveur).
  const [date, setDate] = useState(new Date());
  // Vide au départ : depuis le 15/09 la ventilation est une GRILLE FIXE, `DeclarationForm` la
  // remplit avec une ligne par rubrique dès que le référentiel arrive (`syncLinesToCategories`).
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<DeclarationResponse | null>(null);

  const onSubmit = async () => {
    const problem = firstDraftError(lines);
    if (problem === 'INVALID_AMOUNT') {
      notify(t('common.appName'), t('declare.invalidAmount'));
      return;
    }
    // Plus de 'NO_CATEGORY' : chaque ligne EST une rubrique du référentiel (grille fixe, 15/09).
    if (problem === 'NO_AMOUNT') {
      notify(t('common.appName'), t('declare.needsOneLine'));
      return;
    }
    setLoading(true);
    try {
      // Le total est CALCULÉ, jamais saisi : le serveur exige `declaredTotal = Σ des lignes`
      // (422 DECLARED_TOTAL_MISMATCH), l'envoyer calculé rend l'écart impossible côté mobile.
      const declaration = await createDeclaration({
        donationDate: toLocalDate(date),
        currency,
        declaredTotal: round2(draftTotal(lines)),
        lines: draftLinesToRequest(lines),
      });
      setDone(declaration);
    } catch (e: any) {
      notify(t('common.appName'), declarationErrorMessage(e, t, t('errors.saveFailed')));
    } finally {
      setLoading(false);
    }
  };

  if (done) return <SuccessScreen declaration={done} />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={dismiss} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
        </View>
        <Text style={styles.title}>{t('declare.title')}</Text>
        <Text style={styles.intro}>{t('declare.intro')}</Text>

        <DeclarationForm
          date={date}
          onDateChange={setDate}
          currency={currency}
          onCurrencyChange={setCurrency}
          lines={lines}
          onLinesChange={setLines}
        />

        <Button
          label={t('declare.submit')}
          onPress={onSubmit}
          loading={loading}
          fullWidth
          height={58}
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
        />

        <Text style={styles.footnote}>{t('declare.footnote')}</Text>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function SuccessScreen({ declaration }: { declaration: DeclarationResponse }) {
  const { t } = useLanguage();
  const { labelOf, metaOf } = useDonationCategories();

  return (
    <ScreenShell withTabBar={false} paddingTop={40}>
      <View style={{ alignItems: 'center' }}>
        <View style={styles.checkBubble}>
          <Ionicons name="checkmark" size={38} color={colors.white} />
        </View>
        <Text style={styles.successTitle}>{t('declare.successTitle')}</Text>
        <Text style={styles.successHint}>{t('declare.successHint')}</Text>
      </View>

      <Card variant="paper2" style={styles.receipt}>
        <View style={styles.receiptHeader}>
          <Text style={styles.receiptMono}>{t('declare.receipt')}</Text>
        </View>
        <HandDivider style={{ marginVertical: 12 }} />
        <View style={styles.rec1}>
          <Text style={styles.recLabel}>{t('declare.totalDeclared')}</Text>
          <Text style={styles.recAmount}>
            {fmtAmount(declaration.declaredTotal, declaration.currency)}
          </Text>
        </View>
        <View style={styles.recRow}>
          <Text style={styles.recLabel}>{t('detail.date')}</Text>
          <Text style={styles.recValue}>
            {fmtDateLong(parseLocalDate(declaration.donationDate))}
          </Text>
        </View>

        <HandDivider style={{ marginVertical: 14 }} />
        <Label style={{ marginBottom: 8 }}>{t('declare.breakdown')}</Label>
        {declaration.lines.map((line) => {
          const meta = metaOf(line.category);
          return (
            <View key={line.id} style={styles.recRow}>
              <View style={styles.recLineLabel}>
                <Ionicons name={meta.icon} size={14} color={meta.tone} />
                <Text style={[styles.recValue, { color: meta.tone, fontWeight: '700' }]}>
                  {labelOf(line.category)}
                </Text>
              </View>
              <Text style={styles.recValue}>
                {fmtAmount(line.amount, declaration.currency)}
              </Text>
            </View>
          );
        })}

        <HandDivider style={{ marginVertical: 14 }} />
        <Text style={styles.verse}>{t('declare.verseQuote')}</Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
        <Button
          label={t('declare.viewDonations')}
          variant="ghost"
          onPress={() => router.replace('/(tabs)/donations')}
          style={{ flex: 1 }}
        />
        <Button label={t('declare.finish')} onPress={dismiss} style={{ flex: 1 }} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 320,
  },
  footnote: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
    lineHeight: 18,
    paddingHorizontal: 24,
  },
  checkBubble: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    marginTop: 18,
    textAlign: 'center',
  },
  successHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 280,
  },
  receipt: {
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderStyle: 'dashed',
    borderColor: 'rgba(42,38,32,0.22)',
  },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  receiptMono: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  rec1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  recAmount: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink },
  recRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
  recLineLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  recLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  recValue: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink, textAlign: 'right' },
  verse: {
    fontFamily: fonts.serif,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.mossSoft,
    textAlign: 'center',
  },
});
