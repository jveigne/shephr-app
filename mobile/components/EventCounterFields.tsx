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
 * <p>D-EVT-17 (JP 14/10) : « Invités » suit « Participants », pour tout type, avec une aide courte
 * (« dont personnes extérieures ») ; invités > participants s'annonce sous le champ
 * (`guestsInvalid`, calculé par l'écran, qui bloque aussi son bouton d'enregistrement).
 *
 * <p>Changer de type ne vide pas la saisie : elle réapparaît si l'on revient à un type
 * évangélique, et seuls les compteurs affichés sont envoyés (`filledCounters` / `replacedCounters`).
 */
export default function EventCounterFields({
  value,
  onChange,
  evangelism,
  guestsInvalid = false,
  autoFocus = false,
}: {
  value: CounterDraft;
  onChange: (next: CounterDraft) => void;
  /** Type évangélique : les trois compteurs D-EVT-15 s'ajoutent à « Participants ». */
  evangelism: boolean;
  /** D-EVT-17 : invités > participants dans l'état résultant (`guestsExceedParticipants`). */
  guestsInvalid?: boolean;
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
              style={key === 'guests' && guestsInvalid ? styles.invalid : undefined}
            />
            {key === 'guests' &&
              (guestsInvalid ? (
                <Text style={styles.error}>{t('events.errors.EVENT_GUESTS_EXCEED_PARTICIPANTS')}</Text>
              ) : (
                <Text style={styles.fieldHint}>{t('events.declare.guestsHint')}</Text>
              ))}
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
  // Deux par ligne : « Participants » et « Invités » (D-EVT-17) ouvrent toujours la grille.
  cell: { width: '47%', flexGrow: 0 },
  label: { marginBottom: 8 },
  invalid: { borderColor: colors.clay },
  fieldHint: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  error: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.clay },
  hint: { marginTop: 8, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
});
