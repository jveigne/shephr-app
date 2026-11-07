import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TeachingMemberProgress } from '@/services/assemblyApi';
import { toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';

/** Une ligne du suivi (Caleb, Néhémie) : membre nommé, chapitres terminés, dernière activité. Tout vient du serveur. */
export default function TeachingMemberRow({ member }: { member: TeachingMemberProgress }) {
  const { t } = useLanguage();
  const last = member.lastActivityAt
    ? t('teaching.follow.lastActivity', { date: fmtIsoDay(toLocalDate(new Date(member.lastActivityAt)), t) })
    : t('teaching.follow.notStarted');
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {member.fullName}
        </Text>
        <Text style={styles.meta}>{last}</Text>
      </View>
      <Text style={styles.count} accessibilityLabel={t('teaching.follow.chapters', { completed: member.completedCount, total: member.totalCount })}>
        {t('teaching.course.progress', { completed: member.completedCount, total: member.totalCount })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
  },
  name: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  count: { fontFamily: fonts.mono, fontSize: 12, color: colors.moss },
});
