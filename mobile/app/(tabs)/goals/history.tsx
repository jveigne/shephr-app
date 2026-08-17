import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  RefreshControl,
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
import { goalName } from '../../../utils/goalName';
import { useGoalsData } from '../../../hooks/useGoalsData';
import { goalCategoryMeta } from '../../../constants/goalCategories';
import { currencySymbol, fmtAmount, fmtDate, parseLocalDate } from '../../../utils/format';
import { confirmDialog, notify } from '../../../utils/dialogs';
import {
  deleteProgress,
  updateProgress,
  type GoalCategory,
  type ProgressResponse,
} from '../../../services/goalsApi';

const errMsg = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

interface HistoryEntry {
  progress: ProgressResponse;
  category: GoalCategory;
}

export default function HistoryScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  // RG-BQ-01 (16/08) : historique de MES avancements — plus de `unitId` d'assemblée.
  const { year: yearParam } = useLocalSearchParams<{ year?: string }>();
  const { goal, lines, progressByPledge, loading, reload } = useGoalsData(yearParam ? Number(yearParam) : null);
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<HistoryEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const currency = goal?.defaultCurrency ?? 'EUR';
  // Lot G2 : deadline PAR ANNÉE (repli legacy sur celle du Goal) pour le pied de page dynamique.
  const year = yearParam ? Number(yearParam) : goal?.currentYear ?? null;
  const deadlineIso =
    (year != null ? goal?.yearDeadlines?.[String(year)] : null) ?? goal?.submissionDeadline ?? null;
  const deadlinePast = deadlineIso != null && new Date(deadlineIso).getTime() < Date.now();

  const entries: HistoryEntry[] = lines
    .filter((l) => l.pledge != null)
    .flatMap((l) =>
      (progressByPledge[l.pledge!.id] ?? []).map((progress) => ({
        progress,
        category: l.category,
      })),
    )
    .sort((a, b) => {
      const byDate = b.progress.progressDate.localeCompare(a.progress.progressDate);
      return byDate !== 0 ? byDate : b.progress.createdAt.localeCompare(a.progress.createdAt);
    });

  const visible = filter ? entries.filter((e) => e.category.id === filter) : entries;
  const categoriesWithEntries = lines
    .filter((l) => l.pledge && (progressByPledge[l.pledge.id] ?? []).length > 0)
    .map((l) => l.category);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const onDelete = async (entry: HistoryEntry) => {
    const ok = await confirmDialog(t('historyScreen.deleteTitle'), t('historyScreen.deleteConfirm'), t('common.delete'), true);
    if (!ok) return;
    try {
      await deleteProgress(entry.progress.id);
      await reload();
    } catch (e: any) {
      // ⚠ DEADLINE_PASSED reste levé après la date limite (RG-BQ-07).
      const code = e?.response?.data?.error;
      notify(
        t('common.appName'),
        code === 'DEADLINE_PASSED' ? t('errors.goals.DEADLINE_PASSED') : errMsg(e, t('errors.deleteFailed')),
      );
    }
  };

  return (
    <ScreenShell
      withTabBar={false}
      paddingTop={insets.top ? 4 : 16}
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
      </View>

      <Text style={styles.title}>{t('historyScreen.title')}</Text>
      <Text style={styles.intro}>
        {t('historyScreen.intro')}
      </Text>

      {categoriesWithEntries.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <Chip label={t('common.all')} selected={filter == null} onPress={() => setFilter(null)} />
          {categoriesWithEntries.map((c) => (
            <Chip
              key={c.id}
              label={goalName(c)}
              selected={filter === c.id}
              onPress={() => setFilter(c.id)}
            />
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : visible.length === 0 ? (
        <Text style={styles.emptyText}>{t('historyScreen.empty')}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 16 }}>
          {visible.map((entry) => {
            const meta = goalCategoryMeta(entry.category.code);
            const p = entry.progress;
            // Lot G2 : éditabilité server-driven (deadline de l'année) — plus de règle 24 h locale.
            const editable = p.editable === true;
            const isCurrency = entry.category.unitType === 'CURRENCY';
            const valueText =
              p.amount != null && isCurrency
                ? fmtAmount(p.amount, currency)
                : `+${p.count ?? p.amount ?? 0} ${entry.category.unitLabel ?? ''}`.trim();
            return (
              <Card key={p.id} style={styles.entryCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.entryIcon, { backgroundColor: meta.tone + '1F' }]}>
                    <Ionicons name={meta.icon} size={16} color={meta.tone} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.entryValue}>{valueText}</Text>
                    <Text style={styles.entryMeta}>
                      {goalName(entry.category)} · {fmtDate(parseLocalDate(p.progressDate))}
                      {p.recordedByName ? ` · ${p.recordedByName}` : ''}
                    </Text>
                    {!!p.note && <Text style={styles.entryNote}>« {p.note} »</Text>}
                  </View>
                  {editable && (
                    <>
                      <Pressable onPress={() => setEditing(entry)} hitSlop={8}>
                        <Ionicons name="pencil-outline" size={18} color={colors.ink3} />
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete(entry)}
                        hitSlop={8}
                        style={{ marginLeft: 12 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.clay} />
                      </Pressable>
                    </>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <Text style={styles.footnote}>
        {deadlineIso
          ? deadlinePast
            ? t('historyScreen.deadlinePassed')
            : t('historyScreen.editUntil', { date: fmtDate(new Date(deadlineIso)) })
          : ''}
      </Text>

      <EditProgressModal
        entry={editing}
        currency={currency}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await reload();
        }}
      />
    </ScreenShell>
  );
}

function EditProgressModal({
  entry,
  currency,
  onClose,
  onSaved,
}: {
  entry: HistoryEntry | null;
  currency: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isCurrency = entry?.category.unitType === 'CURRENCY';

  useEffect(() => {
    if (entry) {
      const v = entry.progress.amount ?? entry.progress.count;
      setValue(v != null ? String(v) : '');
      setNote(entry.progress.note ?? '');
    }
  }, [entry]);

  const onSubmit = async () => {
    if (!entry) return;
    const num = Number.parseFloat(value.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) {
      notify(t('common.appName'), t('historyScreen.valuePositive'));
      return;
    }
    setSaving(true);
    try {
      await updateProgress(entry.progress.id, {
        ...(isCurrency ? { amount: num } : { count: Math.round(num) }),
        note: note.trim() || undefined,
      });
      await onSaved();
    } catch (e: any) {
      const code = e?.response?.data?.error;
      notify(
        t('common.appName'),
        code === 'DEADLINE_PASSED' ? t('errors.goals.DEADLINE_PASSED') : errMsg(e, t('errors.updateFailed')),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={entry != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('historyScreen.editTitle')}</Text>

          <Label style={{ marginTop: 14, marginBottom: 6 }}>
            {isCurrency
              ? t('historyScreen.amountLabel', { symbol: currencySymbol(currency) })
              : t('historyScreen.valueLabel', { unit: entry?.category.unitLabel ?? t('historyScreen.unitFallback') })}
          </Label>
          <Field
            value={value}
            onChangeText={(v) => setValue(v.replace(/[^0-9.,]/g, ''))}
            keyboardType={isCurrency ? 'decimal-pad' : 'number-pad'}
          />

          <Label style={{ marginTop: 12, marginBottom: 6 }}>{t('historyScreen.note')}</Label>
          <Field
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
            maxLength={500}
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Button label={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} height={48} />
            <Button
              label={t('common.save')}
              onPress={onSubmit}
              loading={saving}
              style={{ flex: 1 }}
              height={48}
            />
          </View>
        </Card>
      </View>
    </Modal>
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
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink3,
    fontStyle: 'italic',
    marginTop: 32,
  },
  entryCard: { paddingHorizontal: 16, paddingVertical: 13 },
  entryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink },
  entryMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  entryNote: {
    fontFamily: fonts.serif,
    fontSize: 12.5,
    fontStyle: 'italic',
    color: colors.ink2,
    marginTop: 4,
  },
  footnote: {
    textAlign: 'center',
    marginTop: 18,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20 },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
});
