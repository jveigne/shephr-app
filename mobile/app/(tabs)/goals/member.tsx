import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Button from '../../../components/Button';
import { YearSelector } from './index';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { goalCategoryMeta } from '../../../constants/goalCategories';
import { currencySymbol, fmtDate } from '../../../utils/format';
import { notify } from '../../../utils/dialogs';
import {
  fetchMyMemberPledges,
  getActiveGoal,
  saveMemberPledge,
  type ActiveGoal,
  type GoalCategory,
  type PledgeResponse,
} from '../../../services/goalsApi';

/**
 * Feature A — « Mes objectifs » du simple MEMBRE : un objectif personnel par catégorie
 * (montant CURRENCY / nombre COUNT) qui alimente l'engagement de son assemblée de maison.
 */
export default function MemberGoalsScreen() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const [goal, setGoal] = useState<ActiveGoal | null>(null);
  const [pledges, setPledges] = useState<PledgeResponse[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [noGoal, setNoGoal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const year = selectedYear ?? goal?.currentYear ?? null;

  const load = useCallback(async () => {
    if (!me?.goalUnitId) {
      setLoading(false);
      return;
    }
    try {
      const g = await getActiveGoal();
      setGoal(g);
      setNoGoal(false);
      const y = selectedYear ?? g.currentYear;
      const ps = await fetchMyMemberPledges(y);
      setPledges(ps);
    } catch (e: any) {
      if (e?.response?.status === 404) setNoGoal(true);
    } finally {
      setLoading(false);
    }
  }, [me?.goalUnitId, selectedYear]);

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

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (!me?.goalUnitId) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <View style={styles.emptyBubble}>
            <Ionicons name="link-outline" size={30} color={colors.mossSoft} />
          </View>
          <Text style={styles.emptyTitle}>{t('goals.member.title')}</Text>
          <Text style={styles.emptyHint}>{t('goals.member.noAssembly')}</Text>
        </View>
      </ScreenShell>
    );
  }

  if (noGoal || !goal) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <View style={styles.emptyBubble}>
            <Ionicons name="flag-outline" size={30} color={colors.mossSoft} />
          </View>
          <Text style={styles.emptyTitle}>{t('goals.noGoalTitle')}</Text>
          <Text style={styles.emptyHint}>{t('goals.noGoalHint')}</Text>
        </View>
      </ScreenShell>
    );
  }

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const pledgeFor = (categoryId: string) =>
    pledges.find((p) => p.categoryId === categoryId) ?? null;

  // Lot G2 : deadline PAR ANNÉE (repli legacy sur celle du Goal).
  const deadlineIso =
    (year != null ? goal.yearDeadlines?.[String(year)] : null) ?? goal.submissionDeadline ?? null;
  const deadline = deadlineIso ? new Date(deadlineIso) : null;
  const deadlinePast = deadline != null && deadline.getTime() < Date.now();

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.titleRow}>
        <Ionicons name="flag-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{t('goals.member.title')}</Text>
      </View>
      <Text style={styles.subtitle}>
        {goal.name} · {`${new Date(goal.startDate).getFullYear()}–${new Date(goal.endDate).getFullYear()}`}
      </Text>

      {(goal.openYears?.length ?? 0) > 1 && year != null && (
        <YearSelector years={goal.openYears} value={year} onChange={setSelectedYear} />
      )}

      <Card variant="paper2" style={styles.hintCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.earthDeep} />
        <Text style={styles.hintText}>{t('goals.member.hint')}</Text>
      </Card>

      {deadline && (
        <Card variant="paper2" style={styles.hintCard}>
          <Ionicons
            name={deadlinePast ? 'alert-circle-outline' : 'time-outline'}
            size={18}
            color={deadlinePast ? colors.clay : colors.earthDeep}
          />
          <Text style={[styles.hintText, deadlinePast && { color: colors.clay }]}>
            {deadlinePast
              ? t('goals.deadlinePast', { date: fmtDate(deadline) })
              : t('goals.deadlineFuture', { date: fmtDate(deadline) })}
          </Text>
        </Card>
      )}

      <View style={{ gap: 8, marginTop: 14 }}>
        {year != null &&
          categories.map((category) => (
            <MemberPledgeCard
              key={`${category.id}-${year}`}
              category={category}
              pledge={pledgeFor(category.id)}
              year={year}
              currency={goal.defaultCurrency}
              onSaved={(p) =>
                setPledges((prev) => [
                  ...prev.filter((x) => x.categoryId !== p.categoryId),
                  p,
                ])
              }
            />
          ))}
      </View>
    </ScreenShell>
  );
}

/** Saisie + enregistrement d'un objectif personnel sur UNE catégorie. */
function MemberPledgeCard({
  category,
  pledge,
  year,
  currency,
  onSaved,
}: {
  category: GoalCategory;
  pledge: PledgeResponse | null;
  year: number;
  currency: string;
  onSaved: (p: PledgeResponse) => void;
}) {
  const { t } = useLanguage();
  const meta = goalCategoryMeta(category.code);
  const isCurrency = category.unitType === 'CURRENCY';
  const existing = pledge ? pledge.targetAmount ?? pledge.targetCount : null;
  const [value, setValue] = useState(existing != null ? String(existing) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(existing != null ? String(existing) : '');
  }, [existing]);

  // Server-driven : verrouillé (soumission) ou non modifiable (deadline).
  const locked = pledge != null && (pledge.locked || pledge.editable === false);

  const num = Number.parseFloat(value.replace(',', '.'));
  const valid = Number.isFinite(num) && num >= 0;
  const dirty = valid && num !== (existing ?? Number.NaN);

  const onSave = async () => {
    if (!valid) {
      notify(t('common.appName'), t('goals.member.invalidValue'));
      return;
    }
    setSaving(true);
    try {
      const saved = await saveMemberPledge({
        categoryId: category.id,
        year,
        ...(isCurrency ? { targetAmount: num } : { targetCount: Math.round(num) }),
      });
      onSaved(saved);
      notify(t('common.appName'), t('goals.member.saved'));
    } catch (e: any) {
      // Contrat 422 : NO_ASSEMBLY_ATTACHMENT / PLEDGE_LOCKED / DEADLINE_PASSED → message FR dédié.
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.lineCard}>
      <View style={styles.lineHead}>
        <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1F' }]}>
          <Ionicons name={meta.icon} size={18} color={meta.tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lineName}>{category.name}</Text>
          <Text style={styles.lineMeta}>
            {locked
              ? t('goals.member.locked')
              : pledge != null
              ? t('goals.lineDraft')
              : t('goals.lineToComplete')}
          </Text>
        </View>
        {locked && <Ionicons name="lock-closed" size={14} color={colors.ink3} />}
      </View>

      <View style={styles.inputRow}>
        <View style={styles.valueBox}>
          {isCurrency && <Text style={styles.cur}>{currencySymbol(currency)}</Text>}
          <TextInput
            value={value}
            onChangeText={(v) => setValue(v.replace(/[^0-9.,]/g, ''))}
            keyboardType={isCurrency ? 'decimal-pad' : 'number-pad'}
            editable={!locked}
            style={[styles.valueInput, locked && { color: colors.ink3 }]}
            maxLength={10}
            placeholder="0"
            placeholderTextColor={colors.ink3}
          />
          {!isCurrency && !!category.unitLabel && (
            <Text style={styles.unitLabel}>{category.unitLabel}</Text>
          )}
        </View>
        <Button
          label={t('common.save')}
          variant="soft"
          height={44}
          onPress={onSave}
          disabled={locked || !dirty}
          loading={saving}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  hintCard: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink2,
    lineHeight: 18,
  },
  lineCard: { paddingHorizontal: 16, paddingVertical: 14 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  lineMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  valueBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.paper,
  },
  cur: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink3 },
  valueInput: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    paddingVertical: 0,
  },
  unitLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  centerBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
  },
});
