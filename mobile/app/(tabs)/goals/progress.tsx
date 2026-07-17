import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Field from '../../../components/Field';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import { colors, fonts } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useGoalsData } from '../../../hooks/useGoalsData';
import { goalCategoryMeta } from '../../../constants/goalCategories';
import { currencySymbol, fmtAmount, fmtDateLong, toLocalDate } from '../../../utils/format';
import { confirmDialog, notify } from '../../../utils/dialogs';
import { addProgress } from '../../../services/goalsApi';

const errMsg = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export default function AddProgressScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { year: yearParam } = useLocalSearchParams<{ year?: string }>();
  const { goal, lines, loading, reload } = useGoalsData(yearParam ? Number(yearParam) : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [date] = useState(new Date());

  const declared = lines.filter((l) => l.pledge != null);
  const selected = declared.find((l) => l.category.id === selectedId) ?? declared[0] ?? null;
  const currency = goal?.defaultCurrency ?? 'EUR';
  // Lot G2 : deadline PAR ANNÉE (repli legacy sur celle du Goal) pour le pied de page dynamique.
  const year = yearParam ? Number(yearParam) : goal?.currentYear ?? null;
  const deadlineIso =
    (year != null ? goal?.yearDeadlines?.[String(year)] : null) ?? goal?.submissionDeadline ?? null;
  const deadlinePast = deadlineIso != null && new Date(deadlineIso).getTime() < Date.now();
  const isCurrency = selected?.category.unitType === 'CURRENCY';

  const fmtValue = (v: number) =>
    isCurrency ? fmtAmount(v, currency) : `${v} ${selected?.category.unitLabel ?? ''}`.trim();

  const doSave = async (num: number) => {
    if (!selected?.pledge) return;
    setSaving(true);
    try {
      await addProgress(selected.pledge.id, {
        ...(isCurrency ? { amount: num } : { count: Math.round(num) }),
        progressDate: toLocalDate(date),
        note: note.trim() || undefined,
      });
      await reload();
      notify(t('common.appName'), t('progress.saved'));
      router.back();
    } catch (e: any) {
      notify(t('common.appName'), errMsg(e, t('errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    if (!selected?.pledge) return;
    const num = Number.parseFloat(value.replace(',', '.'));
    // UC-DIR-12 A2 : montant 0 ou négatif refusé.
    if (!Number.isFinite(num) || num <= 0) {
      notify(t('common.appName'), t('progress.valuePositive'));
      return;
    }
    // UC-DIR-12 A1 : dépassement permis, mais confirmé. Lot P1 : la valeur saisie est un ÉTAT
    // (« où nous en sommes ») — on la compare donc directement à l'engagement.
    if (selected.target != null && num > selected.target) {
      const ok = await confirmDialog(
        t('progress.overTitle'),
        t('progress.overConfirm', { value: fmtValue(num - selected.target) }),
      );
      if (!ok) return;
    }
    await doSave(num);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.ink2} />
          </Pressable>
        </View>

        <Text style={styles.title}>{t('progress.title')}</Text>
        <Text style={styles.intro}>
          {t('progress.intro')}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
        ) : declared.length === 0 ? (
          <Text style={styles.emptyText}>
            {t('progress.noPledge')}
          </Text>
        ) : (
          <>
            <Label style={{ marginTop: 22, marginBottom: 8 }}>{t('progress.category')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {declared.map((l) => {
                const meta = goalCategoryMeta(l.category.code);
                const on = selected?.category.id === l.category.id;
                return (
                  <Chip
                    key={l.category.id}
                    label={l.category.name}
                    selected={on}
                    onPress={() => {
                      setSelectedId(l.category.id);
                      setValue('');
                    }}
                    iconLeft={
                      <Ionicons name={meta.icon} size={13} color={on ? colors.white : meta.tone} />
                    }
                  />
                );
              })}
            </View>

            {selected && (
              <Card variant="paper2" style={styles.ctxCard}>
                <View style={styles.ctxCol}>
                  <Label>{t('progress.pledged')}</Label>
                  <Text style={styles.ctxValue}>
                    {selected.target != null ? fmtValue(selected.target) : '—'}
                  </Text>
                </View>
                <View style={styles.ctxCol}>
                  <Label>{t('progress.given')}</Label>
                  <Text style={styles.ctxValue}>{fmtValue(selected.achieved)}</Text>
                </View>
                <View style={styles.ctxCol}>
                  <Label>{t('progress.remaining')}</Label>
                  <Text style={styles.ctxValue}>
                    {selected.target != null
                      ? fmtValue(Math.max(0, selected.target - selected.achieved))
                      : '—'}
                  </Text>
                </View>
              </Card>
            )}

            <Card style={styles.amountCard}>
              <Label style={{ color: colors.mossSoft, textAlign: 'center' }}>
                {isCurrency
                  ? t('progress.amountGiven')
                  : t('progress.progressLabel', { unit: selected?.category.unitLabel ?? t('progress.unitFallback') })}
              </Label>
              <View style={styles.amountRow}>
                {isCurrency && <Text style={styles.cur}>{currencySymbol(currency)}</Text>}
                <TextInput
                  value={value}
                  onChangeText={(v) => setValue(v.replace(/[^0-9.,]/g, ''))}
                  keyboardType={isCurrency ? 'decimal-pad' : 'number-pad'}
                  style={styles.amountInput}
                  maxLength={10}
                  placeholder={selected ? String(selected.achieved) : '0'}
                  placeholderTextColor={colors.ink3}
                />
              </View>
            </Card>

            <View style={{ marginTop: 16 }}>
              <Label style={{ marginBottom: 8 }}>{t('progress.date')}</Label>
              <Card style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={20} color={colors.mossSoft} />
                <Text style={styles.dateText}>{fmtDateLong(date)}</Text>
                <Text style={styles.dateChip}>{t('common.today')}</Text>
              </Card>
            </View>

            <View style={{ marginTop: 16 }}>
              <Label style={{ marginBottom: 8 }}>{t('progress.note')}</Label>
              <Field
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
                maxLength={500}
                placeholder={t('progress.notePlaceholder')}
                style={{ minHeight: 70, textAlignVertical: 'top' }}
              />
            </View>

            <Button
              label={t('progress.submit')}
              onPress={onSubmit}
              loading={saving}
              fullWidth
              height={56}
              style={{ marginTop: 20 }}
              iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
            />
            <Text style={styles.footnote}>
              {deadlineIso
                ? deadlinePast
                  ? t('progress.deadlinePassed')
                  : t('progress.editUntil', { date: fmtDateLong(new Date(deadlineIso)) })
                : ''}
            </Text>
          </>
        )}
      </ScreenShell>
    </KeyboardAvoidingView>
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
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink3,
    fontStyle: 'italic',
    marginTop: 32,
    lineHeight: 20,
  },
  ctxCard: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ctxCol: { gap: 2 },
  ctxValue: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  amountCard: { paddingVertical: 20, paddingHorizontal: 22, marginTop: 16, alignItems: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  cur: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink3, marginRight: 4 },
  amountInput: {
    fontFamily: fonts.serif,
    fontSize: 52,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'center',
    minWidth: 120,
    letterSpacing: -1,
    paddingVertical: 0,
  },
  dateRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.ink },
  dateChip: { fontFamily: fonts.sans, fontSize: 12, color: colors.earthDeep, fontWeight: '700' },
  footnote: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
  },
});
