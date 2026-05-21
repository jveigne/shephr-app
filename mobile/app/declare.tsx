import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Label from '../components/Label';
import Field from '../components/Field';
import Button from '../components/Button';
import HandDivider from '../components/HandDivider';
import { colors, fonts } from '../theme';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  type DonationCategory,
} from '../constants/categories';
import { createDonation } from '../services/donationApi';
import { fmtDateLong, toLocalDate } from '../utils/format';

const CURRENCIES = ['GBP', 'EUR', 'USD'];

export default function DeclareScreen() {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('40');
  const [currency, setCurrency] = useState('GBP');
  const [category, setCategory] = useState<DonationCategory>('dime');
  const [note, setNote] = useState('');
  const [date] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{
    amount: number;
    category: DonationCategory;
    date: Date;
    note: string;
    reference: string;
  } | null>(null);

  const onSubmit = async () => {
    const num = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) {
      Alert.alert('shephr', 'Saisissez un montant valide.');
      return;
    }
    setLoading(true);
    try {
      const res = await createDonation({
        amount: num,
        currency,
        category,
        donationDate: toLocalDate(date),
        note: note || undefined,
      });
      setDone({
        amount: num,
        category,
        date,
        note,
        reference: 'CMCI-' + res.id.replace(/[^0-9]/g, '').slice(-4).padStart(4, '0'),
      });
    } catch (e: any) {
      Alert.alert(
        'shephr',
        e?.response?.data?.message ?? "L'enregistrement a échoué.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) return <SuccessScreen done={done} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
        </View>
        <Text style={styles.title}>Déclarer un don</Text>
        <Text style={styles.intro}>
          Inscrivez un don déjà remis lors d'un culte — l'app ne traite aucun paiement.
        </Text>

        <Card style={styles.amountCard}>
          <Label style={{ color: colors.mossSoft, textAlign: 'center' }}>Montant</Label>
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
                style={[
                  styles.currencyBtn,
                  c === currency && styles.currencyBtnOn,
                ]}
              >
                <Text
                  style={[
                    styles.currencyText,
                    { color: c === currency ? colors.moss : colors.ink3 },
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <View style={{ marginTop: 18 }}>
          <Label style={{ marginBottom: 8 }}>Date du don</Label>
          <Card style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.mossSoft} />
            <Text style={styles.dateText}>{fmtDateLong(date)}</Text>
            <Text style={styles.dateChip}>Aujourd'hui</Text>
          </Card>
        </View>

        <View style={{ marginTop: 18 }}>
          <Label style={{ marginBottom: 8 }}>Catégorie</Label>
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
                  <Text style={styles.catLabel}>{c.fr}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Label style={{ marginBottom: 8 }}>Note (facultatif)</Label>
          <Field
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            placeholder="Une intention, un détail à se rappeler…"
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </View>

        <Button
          label="Confirmer la déclaration"
          onPress={onSubmit}
          loading={loading}
          fullWidth
          height={58}
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
        />

        <Text style={styles.footnote}>
          Un reçu sera ajouté à votre journal personnel. Vous pourrez le modifier dans les 24 h.
        </Text>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function SuccessScreen({
  done,
}: {
  done: {
    amount: number;
    category: DonationCategory;
    date: Date;
    note: string;
    reference: string;
  };
}) {
  const cat = CATEGORIES[done.category];
  return (
    <ScreenShell withTabBar={false} paddingTop={40}>
      <View style={{ alignItems: 'center' }}>
        <View style={styles.checkBubble}>
          <Ionicons name="checkmark" size={38} color={colors.white} />
        </View>
        <Text style={styles.successTitle}>Don enregistré, avec gratitude.</Text>
        <Text style={styles.successHint}>
          Votre déclaration figure désormais dans votre journal.
        </Text>
      </View>

      <Card variant="paper2" style={styles.receipt}>
        <View style={styles.receiptHeader}>
          <Text style={styles.receiptMono}>REÇU · {done.reference}</Text>
          <Text style={styles.receiptMono}>CMCI UK</Text>
        </View>
        <HandDivider style={{ marginVertical: 12 }} />
        <View style={styles.rec1}>
          <Text style={styles.recLabel}>Montant</Text>
          <Text style={styles.recAmount}>
            {done.amount % 1 === 0 ? done.amount.toFixed(0) : done.amount.toFixed(2)} GBP
          </Text>
        </View>
        <View style={styles.recRow}>
          <Text style={styles.recLabel}>Catégorie</Text>
          <Text style={[styles.recValue, { color: cat.tone, fontWeight: '700' }]}>{cat.fr}</Text>
        </View>
        <View style={styles.recRow}>
          <Text style={styles.recLabel}>Date</Text>
          <Text style={styles.recValue}>{fmtDateLong(done.date)}</Text>
        </View>
        {!!done.note && (
          <View style={styles.recRow}>
            <Text style={styles.recLabel}>Note</Text>
            <Text style={[styles.recValue, { fontStyle: 'italic' }]}>« {done.note} »</Text>
          </View>
        )}
        <HandDivider style={{ marginVertical: 14 }} />
        <Text style={styles.verse}>« Que chacun donne comme il l'a résolu en son cœur. »</Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
        <Button
          label="Voir mes dons"
          variant="ghost"
          onPress={() => {
            router.back();
            setTimeout(() => router.push('/(tabs)/donations'), 50);
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="Terminer"
          onPress={() => router.back()}
          style={{ flex: 1 }}
        />
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
  amountCard: { paddingVertical: 22, paddingHorizontal: 22, marginTop: 22, alignItems: 'center' },
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
  dateChip: { fontFamily: fonts.sans, fontSize: 12, color: colors.earthDeep, fontWeight: '700' },
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
  catIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink },
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
  recRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
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
