import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import type { EventResponse } from '@/services/eventsApi';
import { eventLabel, fmtEventDates, isEnglishLang, isToClose } from '@/utils/events';
import type { Translate } from '@/utils/meetingReport';

/**
 * Plan 14/10 (§6.3) — ligne d'évènement partagée par « Mes actions » (lot E6), l'agenda de
 * l'onglet « Évènements » (lot E7) et la vue du simple membre (D-EVT-14) : libellé (le libellé libre d'un type « Autre » prime), statut,
 * « à vérifier », date(s) · lieu · nœud, chiffres saisis. Touchée, elle ouvre le détail
 * (`app/events/[id]`).
 */

/** « 12 octobre 2026 · Place de la Gare · Bruxelles Midi » — vides omis. */
export function eventMetaLine(
  dates: string,
  place: string | null | undefined,
  scopeName: string | null | undefined,
): string {
  return [dates, place, scopeName].filter(Boolean).join(' · ');
}

/** « 40 participants · 3 âmes gagnées » — seulement ce qui a été saisi. */
export function EventFigures({
  participants,
  soulsWon,
}: {
  participants: number | null | undefined;
  soulsWon: number | null | undefined;
}) {
  const { t } = useLanguage();
  const parts = [
    participants != null ? t('events.mine.participants', { count: participants }) : null,
    soulsWon != null ? t('events.mine.soulsWon', { count: soulsWon }) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <Text style={styles.rowFigures}>{parts.join(' · ')}</Text>;
}

export function EventPill({
  tone,
  icon,
  text,
}: {
  tone: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: tone + '16', borderColor: tone + '3A' }]}>
      <Ionicons name={icon} size={11} color={tone} />
      <Text style={[styles.pillText, { color: tone }]}>{text}</Text>
    </View>
  );
}

/**
 * Pastilles de statut d'un évènement : rien pour un réalisé (cas courant), « Programmé », « À
 * clôturer » (programmé dont la date est passée, RG-EVT-05) ou « Annulé » ; puis « À vérifier »
 * (RG-ACT-07 : informatif, l'évènement reste compté).
 */
export function EventStatusPills({ event, t }: { event: EventResponse; t: Translate }) {
  return (
    <>
      {event.status === 'PLANNED' &&
        (isToClose(event) ? (
          <EventPill tone={colors.clay} icon="time-outline" text={t('events.agenda.toCloseBadge')} />
        ) : (
          <EventPill tone={colors.earthDeep} icon="calendar-outline" text={t('events.status.PLANNED')} />
        ))}
      {event.status === 'CANCELLED' && (
        <EventPill tone={colors.ink3} icon="close-circle-outline" text={t('events.status.CANCELLED')} />
      )}
      {event.toVerify && <EventPill tone={colors.clay} icon="flag-outline" text={t('events.mine.toVerify')} />}
    </>
  );
}

export function EventRow({
  event,
  mine = false,
  onPress,
}: {
  event: EventResponse;
  /** D-EVT-14 (JP 14/10) : vue du simple membre — ses propres actions parmi celles de l'assemblée. */
  mine?: boolean;
  onPress?: () => void;
}) {
  const { t, language } = useLanguage();
  return (
    <Card style={styles.row} onPress={onPress}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {eventLabel(event, isEnglishLang(language))}
        </Text>
        {mine && <EventPill tone={colors.moss} icon="person-outline" text={t('events.mine.ownBadge')} />}
        <EventStatusPills event={event} t={t} />
        {onPress && <Ionicons name="chevron-forward" size={16} color={colors.ink3} style={styles.chevron} />}
      </View>
      {!!event.title && <Text style={styles.rowSub}>{event.title}</Text>}
      <Text style={styles.rowMeta}>
        {eventMetaLine(fmtEventDates(event, t), event.place, event.scopeName)}
      </Text>
      <EventFigures participants={event.participants} soulsWon={event.soulsWon} />
      {event.status === 'DONE' && !event.evangelism && (
        <Text style={styles.rowNote}>{t('events.mine.notCounted')}</Text>
      )}
    </Card>
  );
}

export const eventRowStyles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radii.md },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  rowTitle: {
    flex: 1,
    minWidth: 120,
    fontFamily: fonts.serif,
    fontSize: 16.5,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  rowMeta: { marginTop: 4, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
});

const styles = StyleSheet.create({
  ...eventRowStyles,
  chevron: { marginTop: 2 },
  rowSub: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  rowFigures: { marginTop: 4, fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.mossSoft },
  rowNote: { marginTop: 4, fontFamily: fonts.sans, fontSize: 11.5, fontStyle: 'italic', color: colors.ink3 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  pillText: { fontFamily: fonts.sans, fontSize: 10.5, fontWeight: '600' },
});
