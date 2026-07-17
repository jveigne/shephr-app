import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Field from '../../../components/Field';
import Button from '../../../components/Button';
import { colors, fonts } from '../../../theme';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  type DonationCategory,
} from '../../../constants/categories';
import {
  getDonation,
  updateDonation,
  type DonationResponse,
} from '../../../services/donationApi';
import { fmtDateLong, parseLocalDate } from '../../../utils/format';
import { notify } from '../../../utils/dialogs';
import { useLanguage } from '../../../contexts/LanguageContext';

const CURRENCIES = ['GBP', 'EUR', 'USD'];

/** Édition d'un don dans la fenêtre de 24h (UC-MBR-05). Date figée (lecture seule). */
export default function EditDonationScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [donation, setDonation] = useState<DonationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [category, setCategory] = useState<DonationCategory>('dime');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await getDonation(id);
        setDonation(d);
        setAmount(String(d.amount));
        setCurrency(d.currency);
        if (d.category in CATEGORIES) setCategory(d.category as DonationCategory);
        setNote(d.note ?? '');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onSave = async () => {
    if (!donation) return;
    const num = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) {
      notify(t('common.appName'), t('declare.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await updateDonation(donation.id, {
        amount: num,
        currency,
        category,
        note: note || undefined,
      });
      router.back();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !donation) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  const date = parseLocalDate(donation.donationDate);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('editDon.title')}</Text>
          <View style={{ width: 26 }} />
        </View>

        <Card style={styles.amountCard}>
          <Label style={{ color: colors.mossSoft, textAlign: 'center' }}>{t('declare.amount')}</Label>
          <View style={styles.amountRow}>
            <Text style={styles.cur}>
              {currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'}
            </Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              maxLength={9}
            />
          </View>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCurrency(c)}
                style={[styles.currencyBtn, c === currency && styles.currencyBtnOn]}
              >
                <Text style={[styles.currencyText, { color: c === currency ? colors.moss : colors.ink3 }]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <View style={{ marginTop: 18 }}>
          <Label style={{ marginBottom: 8 }}>{t('declare.date')}</Label>
          <Card style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.mossSoft} />
            <Text style={styles.dateText}>{fmtDateLong(date)}</Text>
            <Ionicons name="lock-closed-outline" size={15} color={colors.ink3} />
          </Card>
        </View>

        <View style={{ marginTop: 18 }}>
          <Label style={{ marginBottom: 8 }}>{t('declare.category')}</Label>
          <View style={styles.catGrid}>
            {CATEGORY_ORDER.map((k) => {
              const c = CATEGORIES[k];
              const on = category === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setCategory(k)}
                  style={[
                    styles.catBtn,
                    {
                      borderColor: on ? c.tone : colors.hair,
                      backgroundColor: on ? c.tone + '14' : colors.paper,
                    },
                  ]}
                >
                  <View style={[styles.catIcon, { backgroundColor: c.tone + '22' }]}>
                    <Ionicons name={c.icon} size={18} color={c.tone} />
                  </View>
                  <Text style={styles.catLabel}>{t('categories.' + c.key)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Label style={{ marginBottom: 8 }}>{t('declare.note')}</Label>
          <Field
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            placeholder={t('declare.notePlaceholder')}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </View>

        <Button
          label={t('common.save')}
          onPress={onSave}
          loading={saving}
          fullWidth
          height={58}
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
        />
      </ScreenShell>
    </KeyboardAvoidingView>
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
  amountCard: { paddingVertical: 22, paddingHorizontal: 22, marginTop: 12, alignItems: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  cur: { fontFamily: fonts.serif, fontSize: 34, color: colors.ink3, marginRight: 4 },
  amountInput: {
    fontFamily: fonts.serif,
    fontSize: 64,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'center',
    minWidth: 140,
    letterSpacing: -1.2,
    paddingVertical: 0,
  },
  currencyRow: {
    flexDirection: 'row',
    marginTop: 8,
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderRadius: 99,
    padding: 3,
  },
  currencyBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  currencyBtnOn: {
    backgroundColor: colors.paper,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 1,
  },
  currencyText: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '600' },
  dateRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.ink },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  catIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink },
});
