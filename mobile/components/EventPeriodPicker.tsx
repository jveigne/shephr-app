import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Chip from '@/components/Chip';
import Card from '@/components/Card';
import { DatePickerModal } from '@/components/DeclarationForm';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtIsoDay } from '@/utils/meetingReport';
import { parseLocalDate, toLocalDate } from '@/utils/format';
import {
  fmtMonth,
  isCurrentOrLater,
  periodRangeError,
  shiftPeriod,
  type Period,
  type PeriodMode,
} from '@/utils/events';

/**
 * Lot E7 (plan 14/10, §6.3) — période des évènements RÉALISÉS de l'agenda et des statistiques.
 * D-EVT-06 : pas d'objectif, mais le filtre de période reste — mois, année ou plage libre.
 *
 * <p>Mois et année se parcourent par flèches, sans dépasser le mois / l'année en cours : on ne
 * compte que du réalisé (RG-EVT-05). La plage libre est bornée à aujourd'hui par le calendrier
 * (défaut de `DatePickerModal`) et à 5 ans par le serveur (400 INVALID_PERIOD, contrat §1.3) —
 * contrôlé ici pour ne pas lancer une requête vouée à l'échec.
 */
export default function EventPeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const rangeError = periodRangeError(value);
  const atEnd = isCurrentOrLater(value);

  const modes: PeriodMode[] = ['month', 'year', 'range'];

  return (
    <View style={styles.wrap}>
      <View style={styles.modes}>
        {modes.map((m) => (
          <Chip
            key={m}
            label={t(`events.period.${m}`)}
            selected={value.mode === m}
            onPress={() => onChange({ ...value, mode: m })}
          />
        ))}
      </View>

      {value.mode === 'range' ? (
        <>
          <View style={styles.rangeRow}>
            {(['from', 'to'] as const).map((bound) => (
              // `Card` cliquable s'enveloppe d'un Pressable : c'est ce conteneur qui partage la largeur.
              <View key={bound} style={{ flex: 1 }}>
                <Card onPress={() => setEditing(bound)} style={styles.rangeCell}>
                  <Text style={styles.rangeLabel}>{t(`events.period.${bound}`)}</Text>
                  <Text style={styles.rangeValue}>{fmtIsoDay(value[bound], t)}</Text>
                </Card>
              </View>
            ))}
          </View>
          {rangeError && <Text style={styles.error}>{t(rangeError)}</Text>}
        </>
      ) : (
        <View style={styles.stepRow}>
          <Pressable
            onPress={() => onChange(shiftPeriod(value, -1))}
            hitSlop={8}
            style={styles.stepBtn}
            accessibilityLabel={t('events.period.previous')}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink2} />
          </Pressable>
          <Text style={styles.stepText}>
            {value.mode === 'month' ? fmtMonth(value.month, t) : String(value.year)}
          </Text>
          <Pressable
            onPress={() => !atEnd && onChange(shiftPeriod(value, 1))}
            disabled={atEnd}
            hitSlop={8}
            style={[styles.stepBtn, atEnd && { opacity: 0.3 }]}
            accessibilityLabel={t('events.period.next')}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
          </Pressable>
        </View>
      )}

      <DatePickerModal
        visible={editing != null}
        value={parseLocalDate(editing === 'to' ? value.to : value.from)}
        onClose={() => setEditing(null)}
        onChange={(d) => {
          if (editing) onChange({ ...value, [editing]: toLocalDate(d) });
          setEditing(null);
        }}
        title={editing === 'to' ? t('events.period.to') : t('events.period.from')}
        hint={t('events.period.pickHint')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  stepBtn: { padding: 6 },
  stepText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.ink,
    minWidth: 150,
    textAlign: 'center',
  },
  rangeRow: { marginTop: 10, flexDirection: 'row', gap: 10 },
  rangeCell: { paddingHorizontal: 14, paddingVertical: 10 },
  rangeLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3 },
  rangeValue: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: colors.ink, marginTop: 2 },
  error: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.clay },
});
