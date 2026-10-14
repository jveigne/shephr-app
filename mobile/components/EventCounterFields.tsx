import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Label from '@/components/Label';
import Field from '@/components/Field';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { counterKeysFor, digitsOnly, type CounterDraft } from '@/utils/events';

/**
 * D-EVT-15 (JP 14/10, retour de l'évangéliste) — saisie des compteurs d'un évènement, partagée par
 * la déclaration (`app/events/declare`), la modification d'un réalisé (`EventForm`) et « Marquer
 * comme réalisé » (`app/events/[id]`) : « Participants » pour tout type ; conversions,
 * restaurations et baptêmes pour un type ÉVANGÉLIQUE seulement. Tous facultatifs (RG-ACT-03) :
 * pavé numérique, chiffres seuls, vide = non renseigné — jamais un 0 implicite.
 *
 * <p>Changer de type ne vide pas la saisie : elle réapparaît si l'on revient à un type
 * évangélique, et seuls les compteurs affichés sont envoyés (`filledCounters` / `replacedCounters`).
 */
export default function EventCounterFields({
  value,
  onChange,
  evangelism,
  autoFocus = false,
}: {
  value: CounterDraft;
  onChange: (next: CounterDraft) => void;
  /** Type évangélique : les trois compteurs D-EVT-15 s'ajoutent à « Participants ». */
  evangelism: boolean;
  /** Focus sur « Participants » à l'ouverture (clôture : c'est tout l'objet de l'écran). */
  autoFocus?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.section}>
      <View style={styles.grid}>
        {counterKeysFor(evangelism).map((key, i) => (
          <View key={key} style={styles.cell}>
            <Label style={styles.label}>{t(`events.declare.${key}`)}</Label>
            <Field
              value={value[key]}
              onChangeText={(v) => onChange({ ...value, [key]: digitsOnly(v) })}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              placeholder="—"
              selectTextOnFocus
              autoFocus={autoFocus && i === 0}
              accessibilityLabel={t(`events.declare.${key}`)}
            />
          </View>
        ))}
      </View>
      {evangelism && <Text style={styles.hint}>{t('events.declare.countersHint')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14 },
  // Deux par ligne ; « Participants » seul (type non évangélique) garde la même largeur.
  cell: { width: '47%', flexGrow: 0 },
  label: { marginBottom: 8 },
  hint: { marginTop: 8, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
});
