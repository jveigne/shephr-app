import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Label from '../../components/Label';
import Amount from '../../components/Amount';
import Button from '../../components/Button';
import HandDivider from '../../components/HandDivider';
import { colors, fonts } from '../../theme';
import { CATEGORIES, type DonationCategory } from '../../constants/categories';
import {
  deleteDonation,
  getDonation,
  type DonationResponse,
} from '../../services/donationApi';
import { fmtDateLong, parseLocalDate } from '../../utils/format';

export default function DonationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [donation, setDonation] = useState<DonationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await getDonation(id);
        setDonation(d);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onDelete = () => {
    if (!donation) return;
    Alert.alert('shephr', 'Supprimer ce don ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDonation(donation.id);
            router.back();
          } catch (e: any) {
            Alert.alert(
              'shephr',
              e?.response?.data?.message ?? 'Suppression impossible.',
            );
          }
        },
      },
    ]);
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

  const cat = CATEGORIES[donation.category as DonationCategory] ?? CATEGORIES.autre;
  const date = parseLocalDate(donation.donationDate);
  const hoursOld = (Date.now() - new Date(donation.createdAt).getTime()) / 36e5;
  const editable = hoursOld < 24;
  const reference = 'CMCI-' + donation.id.replace(/[^0-9]/g, '').slice(-4).padStart(4, '0');

  return (
    <ScreenShell withTabBar={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <Text style={styles.headerTitle}>Détail du don</Text>
        <View style={{ width: 22 }} />
      </View>

      <Card variant="paper2" style={styles.certificate}>
        <Text style={styles.certLabel}>ATTESTATION DE DON</Text>
        <HandDivider style={{ marginVertical: 10, width: '60%', alignSelf: 'center' }} />

        <View style={{ alignItems: 'center', marginTop: 14 }}>
          <View style={[styles.catBubble, { backgroundColor: cat.tone + '18' }]}>
            <Ionicons name={cat.icon} size={28} color={cat.tone} />
          </View>
          <Amount value={donation.amount} currency={donation.currency} size={56} showDecimals />
          <Text style={[styles.catName, { color: cat.tone }]}>{cat.fr}</Text>
        </View>

        <HandDivider style={{ marginVertical: 20, width: '85%', alignSelf: 'center' }} />

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Label>Date</Label>
            <Text style={styles.metaValue}>{fmtDateLong(date)}</Text>
          </View>
          <View style={[styles.metaItem, { alignItems: 'flex-end' }]}>
            <Label>Référence</Label>
            <Text style={[styles.metaValue, { fontFamily: fonts.mono, fontSize: 13 }]}>{reference}</Text>
          </View>
          <View style={styles.metaItem}>
            <Label>Unité</Label>
            <Text style={styles.metaValue}>{donation.unitName ?? '—'}</Text>
          </View>
          <View style={[styles.metaItem, { alignItems: 'flex-end' }]}>
            <Label>Moyen</Label>
            <Text style={styles.metaValue}>Espèces · enveloppe</Text>
          </View>
          {!!donation.note && (
            <View style={[styles.metaItem, { width: '100%' }]}>
              <Label>Note</Label>
              <Text style={[styles.metaValue, { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.mossSoft }]}>
                « {donation.note} »
              </Text>
            </View>
          )}
        </View>

        <HandDivider style={{ marginTop: 22, marginBottom: 12, width: '85%', alignSelf: 'center' }} />
        <Text style={styles.certFooter}>Enregistré dans shephr · CMCI UK</Text>
      </Card>

      {editable ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <Button
            label="Modifier"
            variant="ghost"
            iconLeft={<Ionicons name="pencil" size={16} color={colors.moss} />}
            style={{ flex: 1 }}
            onPress={() => Alert.alert('shephr', 'Édition à venir.')}
          />
          <Button
            label="Supprimer"
            variant="danger"
            iconLeft={<Ionicons name="trash-outline" size={16} color={colors.clay} />}
            style={{ flex: 1 }}
            onPress={onDelete}
          />
        </View>
      ) : (
        <View style={styles.locked}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.mossSoft} />
          <Text style={styles.lockedText}>
            Ce don est verrouillé (plus de 24 h). Contactez un responsable pour toute correction.
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink2,
  },
  certificate: {
    marginTop: 24,
    paddingHorizontal: 26,
    paddingVertical: 28,
    borderColor: 'rgba(42,38,32,0.10)',
  },
  certLabel: {
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink3,
    letterSpacing: 1.8,
  },
  catBubble: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  catName: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontStyle: 'italic',
    marginTop: 8,
  },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  metaItem: { width: '50%' },
  metaValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, marginTop: 3 },
  certFooter: {
    textAlign: 'center',
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.4,
  },
  locked: {
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(42,38,32,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockedText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
});
