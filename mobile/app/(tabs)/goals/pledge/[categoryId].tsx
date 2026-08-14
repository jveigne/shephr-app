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
import ScreenShell from '../../../../components/ScreenShell';
import Card from '../../../../components/Card';
import Label from '../../../../components/Label';
import Button from '../../../../components/Button';
import { colors, fonts } from '../../../../theme';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { goalCategoryMeta } from '../../../../constants/goalCategories';
import { useGoalsData } from '../../../../hooks/useGoalsData';
import { currencySymbol } from '../../../../utils/format';
import { notify } from '../../../../utils/dialogs';
import {
  createPledge,
  saveMemberPledge,
  updatePledge,
  type PledgeResponse,
} from '../../../../services/goalsApi';

const errMsg = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export default function PledgeEditScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { categoryId, year: yearParam, scope, unitId } = useLocalSearchParams<{
    categoryId: string;
    year?: string;
    scope?: string;
    /** Palier A3 — assemblée ciblée (dirigeant multi-assemblées) ; absente = son assemblée « home ». */
    unitId?: string;
  }>();
  const year = yearParam ? Number(yearParam) : null;
  // Feature A — `scope=member` : même écran de saisie, mais l'objectif est PERSONNEL
  // (niveau MEMBER) et non l'engagement de l'assemblée.
  const member = scope === 'member';
  const { goal, lines, loading, reload } = useGoalsData(year, member, unitId);

  const line = lines.find((l) => l.category.id === categoryId) ?? null;
  const category = line?.category ?? null;
  const pledge = line?.pledge ?? null;
  const locked = pledge?.locked ?? false;

  if (loading || !category) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  const meta = goalCategoryMeta(category.code);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.ink2} />
          </Pressable>
        </View>

        <View style={styles.titleRow}>
          <View style={[styles.titleIcon, { backgroundColor: meta.tone + '1F' }]}>
            <Ionicons name={meta.icon} size={20} color={meta.tone} />
          </View>
          <Text style={styles.title}>{category.name}</Text>
        </View>

        {locked && (
          <Card variant="tinted" style={styles.lockBanner}>
            <Ionicons name="lock-closed" size={16} color={colors.moss} />
            <Text style={styles.lockText}>
              {t('pledge.lockedBanner')}
            </Text>
          </Card>
        )}

        {pledge?.createdByName && (
          <Text style={styles.declaredBy}>
            {t('pledge.declaredBy', { name: pledge.createdByName })}
          </Text>
        )}

        <TargetSection
          categoryId={category.id}
          year={year ?? goal?.currentYear}
          unitType={category.unitType}
          unitLabel={category.unitLabel}
          currency={goal?.defaultCurrency ?? 'EUR'}
          pledge={pledge}
          locked={locked}
          member={member}
          unitId={unitId}
          onSaved={async () => {
            await reload();
            router.back();
          }}
        />
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

/** Saisie CURRENCY / COUNT (UC-DIR-09). La saisie de 0 est permise (pas d'engagement explicite). */
function TargetSection({
  categoryId,
  year,
  unitType,
  unitLabel,
  currency,
  pledge,
  locked,
  member = false,
  unitId,
  onSaved,
}: {
  categoryId: string;
  year?: number;
  unitType: 'CURRENCY' | 'COUNT';
  unitLabel: string | null;
  currency: string;
  pledge: PledgeResponse | null;
  locked: boolean;
  member?: boolean;
  /** Palier A3 — assemblée ciblée ; absente = l'assemblée « home » du dirigeant. */
  unitId?: string;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const isCurrency = unitType === 'CURRENCY';
  const initial = pledge ? (isCurrency ? pledge.targetAmount : pledge.targetCount) : null;
  const [value, setValue] = useState(initial != null ? String(initial) : '');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    const num = Number.parseFloat(value.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      notify(t('common.appName'), t('pledge.invalidValue'));
      return;
    }
    setSaving(true);
    try {
      const payload = isCurrency ? { targetAmount: num } : { targetCount: Math.round(num) };
      if (member) {
        // Upsert côté serveur : un seul appel couvre création et modification.
        await saveMemberPledge({ categoryId, year, ...payload });
      } else if (pledge) {
        await updatePledge(pledge.id, payload);
      } else {
        await createPledge({ categoryId, year, unitId, ...payload });
      }
      await onSaved();
    } catch (e: any) {
      notify(t('common.appName'), errMsg(e, t('errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card style={styles.amountCard}>
        <Label style={{ color: colors.mossSoft, textAlign: 'center' }}>
          {isCurrency ? t('pledge.amountPledged') : t('pledge.pledgeLabel', { unit: unitLabel ?? t('pledge.unitFallback') })}
        </Label>
        <View style={styles.amountRow}>
          {isCurrency && <Text style={styles.cur}>{currencySymbol(currency)}</Text>}
          <TextInput
            value={value}
            onChangeText={(v) => setValue(v.replace(/[^0-9.,]/g, ''))}
            keyboardType={isCurrency ? 'decimal-pad' : 'number-pad'}
            style={styles.amountInput}
            maxLength={10}
            editable={!locked}
            placeholder="0"
            placeholderTextColor={colors.ink3}
          />
        </View>
      </Card>

      {!locked && (
        <Button
          label={pledge ? t('pledge.save') : t('pledge.declarePledge')}
          onPress={onSubmit}
          loading={saving}
          fullWidth
          height={56}
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
        />
      )}
      <Text style={styles.footnote}>
        {t('pledge.footnote')}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  lockBanner: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  declaredBy: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 12 },
  amountCard: { paddingVertical: 22, paddingHorizontal: 22, marginTop: 22, alignItems: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  cur: { fontFamily: fonts.serif, fontSize: 32, color: colors.ink3, marginRight: 4 },
  amountInput: {
    fontFamily: fonts.serif,
    fontSize: 56,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'center',
    minWidth: 130,
    letterSpacing: -1,
    paddingVertical: 0,
  },
  footnote: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
