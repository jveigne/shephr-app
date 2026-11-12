import React from 'react';
import { View, Text } from 'react-native';
import Card from '@/components/Card';
import Label from '@/components/Label';
import { fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';

import { creerStyles } from '@/theme/creerStyles';
/**
 * Spec Recensement §6.1 — compteurs « ce mois / cette année » en tête de « Mes actions » : actions
 * COMPTÉES (D-EVT-03 : réalisées, d'un type évangélique ; « à vérifier » n'y change rien,
 * RG-ACT-07). Les miennes pour un dirigeant (`GET /me`), celles de mon assemblée pour un simple
 * membre (`/stats` sur l'année, D-EVT-14 JP 14/10, contrat §3.12). `null` = pas encore chargé.
 */
export default function EventCounters({
  month,
  monthCount,
  yearCount,
}: {
  /** 'yyyy-MM' du mois compté (local). */
  month: string;
  monthCount: number | null;
  yearCount: number | null;
}) {
  const styles = useStyles();
  const { t } = useLanguage();
  const monthName = t('common.monthsLong').split(',')[Number(month.slice(5, 7)) - 1] ?? '';
  return (
    <>
      <Card style={styles.counters}>
        <View style={styles.counterCell}>
          <Text style={styles.counterValue}>{monthCount ?? '—'}</Text>
          <Label>{t('events.mine.thisMonth', { month: monthName })}</Label>
        </View>
        <View style={styles.counterDivider} />
        <View style={styles.counterCell}>
          <Text style={styles.counterValue}>{yearCount ?? '—'}</Text>
          <Label>{t('events.mine.thisYear', { year: month.slice(0, 4) })}</Label>
        </View>
      </Card>
      <Text style={styles.counterHint}>{t('events.mine.countedHint')}</Text>
    </>
  );
}

const useStyles = creerStyles((c) => ({
  counters: {
    marginTop: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterCell: { flex: 1, alignItems: 'center', gap: 4 },
  counterDivider: { width: 1, alignSelf: 'stretch', backgroundColor: c.filet },
  counterValue: { fontFamily: fonts.serif, fontSize: 34, color: c.texte, letterSpacing: -0.6 },
  counterHint: {
    marginTop: 8,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: c.texte3,
    textAlign: 'center',
    lineHeight: 17,
  },
}));
