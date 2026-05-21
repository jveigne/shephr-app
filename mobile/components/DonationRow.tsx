import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, DonationCategory } from '../constants/categories';
import { colors, fonts } from '../theme';
import { fmtDate, parseLocalDate } from '../utils/format';
import Amount from './Amount';
import Card from './Card';

export interface DonationRowItem {
  id: string;
  category: string;
  amount: number;
  currency: string;
  donationDate: string;
  note?: string | null;
}

interface Props {
  donation: DonationRowItem;
  onPress?: () => void;
  compact?: boolean;
}

export default function DonationRow({ donation, onPress, compact }: Props) {
  const cat = CATEGORIES[donation.category as DonationCategory] ?? CATEGORIES.autre;
  const dateLabel = fmtDate(parseLocalDate(donation.donationDate));
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: cat.tone + '1A' }]}>
        <Ionicons name={cat.icon} size={compact ? 17 : 20} color={cat.tone} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {cat.fr}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {dateLabel}
          {donation.note ? ` · ${donation.note}` : ''}
        </Text>
      </View>
      <Amount value={donation.amount} currency={donation.currency} size={compact ? 17 : 18} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: 14.5,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    marginTop: 2,
  },
});
