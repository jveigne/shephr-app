import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import HandDivider from '../../../components/HandDivider';
import { colors, fonts } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useGoalsData } from '../../../hooks/useGoalsData';
import { goalCategoryMeta } from '../../../constants/goalCategories';
import { fmtAmount, fmtDate } from '../../../utils/format';
import { confirmDialog, notify } from '../../../utils/dialogs';
import { submitMyPledges, type SubmitResponse } from '../../../services/goalsApi';

const errMsg = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export default function SubmitScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  // Palier A3 — `unitId` : l'assemblée que le dirigeant soumet (absente = son assemblée « home »).
  const { year: yearParam, unitId } = useLocalSearchParams<{ year?: string; unitId?: string }>();
  const year = yearParam ? Number(yearParam) : null;
  const { goal, lines, pledges, submitted, loading, reload } = useGoalsData(year, false, unitId);
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
      const res = await submitMyPledges(year ?? undefined, unitId);
      setDone(res);
      await reload();
    } catch (e: any) {
      const message = errMsg(e, t('submit.failed'));
      notify(t('common.appName'), /already/i.test(message) ? t('submit.alreadySubmitted') : message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <ScreenShell withTabBar={false} paddingTop={40}>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.checkBubble}>
            <Ionicons name="lock-closed" size={34} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>{t('submit.successTitle')}</Text>
          <Text style={styles.successHint}>
            {t('submit.successHint', { count: done.lockedPledges, date: fmtDate(new Date(done.submittedAt)) })}
          </Text>
        </View>
        <Button
          label={t('submit.backToGoals')}
          onPress={() => router.back()}
          fullWidth
          style={{ marginTop: 32 }}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
      </View>

      <Text style={styles.title}>{t('submit.title')}</Text>
      <Text style={styles.intro}>
        {t('submit.intro')}
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Card variant="paper2" style={styles.recap}>
            <Text style={styles.recapHeader}>{goal?.name}</Text>
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
                  <Text style={styles.recapLabel}>{line.category.name}</Text>
                  <Text style={[styles.recapValue, line.target == null && { color: colors.ink3 }]}>
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
            <Ionicons name="alert-circle-outline" size={18} color={colors.moss} />
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
              iconLeft={<Ionicons name="lock-closed-outline" size={19} color={colors.white} />}
            />
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
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
  recap: { marginTop: 22, paddingHorizontal: 20, paddingVertical: 20 },
  recapHeader: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  recapLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2 },
  recapValue: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  verse: {
    fontFamily: fonts.serif,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.mossSoft,
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
  warnText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  alreadyText: {
    textAlign: 'center',
    marginTop: 22,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink3,
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
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 19,
  },
});
