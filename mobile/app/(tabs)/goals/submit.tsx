import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Button from '@/components/Button';
import HandDivider from '@/components/HandDivider';
import { fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { goalName } from '@/utils/goalName';
import { useGoalsData } from '@/hooks/useGoalsData';
import { goalCategoryMeta } from '@/constants/goalCategories';
import { fmtAmount, fmtDate } from '@/utils/format';
import { confirmDialog, notify } from '@/utils/dialogs';
import { submitMyMemberPledges, type SubmitResponse } from '@/services/goalsApi';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
/**
 * Soumission INDIVIDUELLE (RG-BQ-06, JP 16/08) — chacun verrouille SES engagements. Il n'y a plus
 * de soumission « au nom de l'assemblée » : le paramètre `unitId` a disparu avec la route qui le
 * servait. Le suivi d'assemblée est devenu un compteur de personnes (« 7/12 »).
 */
export default function SubmitScreen() {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { year: yearParam } = useLocalSearchParams<{ year?: string }>();
  const year = yearParam ? Number(yearParam) : null;
  const { goal, lines, pledges, submitted, loading, reload } = useGoalsData(year);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<SubmitResponse | null>(null);

  const declaredLines = lines.filter((l) => l.pledge != null);
  const currency = goal?.defaultCurrency ?? 'EUR';

  const confirmSubmit = async () => {
    // UC-DIR-11 : confirmation à 2 étapes — le verrouillage est irréversible.
    const ok = await confirmDialog(
      t('submit.confirmTitle'),
      t('submit.confirmBody'),
      t('submit.confirmCta'),
      true,
    );
    if (ok) await doSubmit();
  };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitMyMemberPledges(year ?? undefined);
      setDone(res);
      await reload();
    } catch (e: any) {
      // Les 422 métier portent leur code dans `error` : on les traite explicitement plutôt que de
      // deviner sur le message (⚠ DEADLINE_PASSED reste levé — la date limite bloque toujours).
      const code = e?.response?.data?.error;
      const known: Record<string, string> = {
        NO_PLEDGE_TO_SUBMIT: t('errors.goals.NO_PLEDGE_TO_SUBMIT'),
        ALREADY_SUBMITTED: t('errors.goals.ALREADY_SUBMITTED'),
        DEADLINE_PASSED: t('errors.goals.DEADLINE_PASSED'),
        NO_ASSEMBLY_ATTACHMENT: t('errors.goals.NO_ASSEMBLY_ATTACHMENT'),
        YEAR_NOT_OPEN: t('errors.goals.YEAR_NOT_OPEN'),
      };
      notify(t('common.appName'), known[code] ?? e?.response?.data?.message ?? t('submit.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <ScreenShell withTabBar={false} paddingTop={40}>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.checkBubble}>
            <Ionicons name="lock-closed" size={34} color={c.surAccent} />
          </View>
          <Text style={styles.successTitle}>{t('submit.successTitle')}</Text>
          <Text style={styles.successHint}>
            {t('submit.successHint', { count: done.lockedPledges, date: fmtDate(new Date(done.submittedAt)) })}
          </Text>
        </View>
        <Button
          label={t('submit.backToGoals')}
          onPress={() => goBack()}
          fullWidth
          style={{ marginTop: 32 }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={c.texte2} />
        </Pressable>
      </View>

      <Text style={styles.title}>{t('submit.title')}</Text>
      <Text style={styles.intro}>
        {t('submit.intro')}
      </Text>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Card variant="paper2" style={styles.recap}>
            <Text style={styles.recapHeader}>{goalName(goal)}</Text>
            <HandDivider style={{ marginVertical: 12 }} />
            {lines.map((line) => {
              const meta = goalCategoryMeta(line.category.code);
              const isCurrency = line.category.unitType === 'CURRENCY';
              const value =
                line.target == null
                  ? '—'
                  : isCurrency
                  ? fmtAmount(line.target, currency)
                  : `${line.target} ${line.category.unitLabel ?? ''}`.trim();
              return (
                <View key={line.category.id} style={styles.recapRow}>
                  <Ionicons name={meta.icon} size={15} color={meta.tone} />
                  <Text style={styles.recapLabel}>{goalName(line.category)}</Text>
                  <Text style={[styles.recapValue, line.target == null && { color: c.texte3 }]}>
                    {value}
                  </Text>
                </View>
              );
            })}
            <HandDivider style={{ marginVertical: 12 }} />
            <Text style={styles.verse}>
              {t('submit.verse')}
            </Text>
          </Card>

          <Card variant="tinted" style={styles.warnCard}>
            <Ionicons name="alert-circle-outline" size={18} color={c.accent} />
            <Text style={styles.warnText}>
              {t('submit.warning')}
            </Text>
          </Card>

          {submitted ? (
            <Text style={styles.alreadyText}>{t('submit.alreadySubmitted')}</Text>
          ) : (
            <Button
              label={t('submit.confirmBtn')}
              onPress={confirmSubmit}
              loading={submitting}
              disabled={pledges.length === 0 || declaredLines.length === 0}
              fullWidth
              height={58}
              style={{ marginTop: 20 }}
              iconLeft={<Ionicons name="lock-closed-outline" size={19} color={c.surAccent} />}
            />
          )}
        </>
      )}
    </ScreenShell>
  );
}

const useStyles = creerStyles((c) => ({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: c.texte,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.texte3,
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 320,
  },
  recap: { marginTop: 22, paddingHorizontal: 20, paddingVertical: 20 },
  recapHeader: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: c.texte3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  recapLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: c.texte2 },
  recapValue: { fontFamily: fonts.serif, fontSize: 16, color: c.texte },
  verse: {
    fontFamily: fonts.serif,
    fontSize: 13,
    fontStyle: 'italic',
    color: c.accentDoux,
    textAlign: 'center',
  },
  warnCard: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warnText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: c.texte2, lineHeight: 18 },
  alreadyText: {
    textAlign: 'center',
    marginTop: 22,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: c.texte3,
  },
  checkBubble: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: c.texte,
    marginTop: 18,
    textAlign: 'center',
  },
  successHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.texte3,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 19,
  },
}));
