import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../../components/ScreenShell';
import Card from '../../../../components/Card';
import Label from '../../../../components/Label';
import ErrorBanner from '../../../../components/ErrorBanner';
import MeetingReportCard from '../../../../components/MeetingReportCard';
import { colors, fonts } from '../../../../theme';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { deleteMeeting, getMeeting, type MeetingDetail } from '../../../../services/assemblyApi';
import { fmtIsoDay, formatChapters, type MeetingReportInput } from '../../../../utils/meetingReport';
import { confirmDialog, notify } from '../../../../utils/dialogs';

/**
 * Détail d'un compte rendu — §6.3 plan 23/09 (lot L5).
 * Lecture : public RG-ASM-05 (CR complet, présents inclus — [HYPOTHÈSE] du plan).
 * Modifier / supprimer (soft delete) : seulement si `canWrite` (RG-ASM-04, D-ASM-03).
 */
export default function MeetingDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setDetail(await getMeeting(id));
    } catch (e: any) {
      setError(
        e?.response?.status === 404
          ? t('assemblyLife.detail.notFound')
          : e?.response?.data?.message ?? t('assemblyLife.loadFailed'),
      );
    }
  }, [id, t]);

  // Rechargé au retour du formulaire de modification.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await load();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const reportInput: MeetingReportInput | null = useMemo(
    () =>
      detail && {
        meetingDate: detail.meetingDate,
        unitName: detail.unitName ?? '',
        attendeeNames: detail.attendees.map((a) => a.displayName),
        breadBreaking: detail.breadBreaking,
        bookTitle: detail.bookTitle || detail.moduleName,
        chapters: [...detail.chapters].sort((a, b) => a.orderIndex - b.orderIndex),
      },
    [detail],
  );

  const onDelete = async () => {
    if (!detail) return;
    const ok = await confirmDialog(
      t('common.appName'),
      t('assemblyLife.detail.deleteConfirm'),
      t('common.delete'),
      true,
    );
    if (!ok) return;
    try {
      await deleteMeeting(detail.id);
      router.back();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.deleteFailed'));
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {detail?.canWrite && (
          <>
            <Pressable
              style={styles.iconBtn}
              hitSlop={8}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/assembly/form',
                  params: { id: detail.id },
                } as unknown as Href)
              }
            >
              <Ionicons name="create-outline" size={16} color={colors.moss} />
            </Pressable>
            <Pressable style={[styles.iconBtn, styles.delBtn]} hitSlop={8} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color={colors.clay} />
            </Pressable>
          </>
        )}
      </View>

      {!!error && <ErrorBanner message={error} onRetry={load} />}

      {detail && reportInput && (
        <>
          <Label style={{ marginTop: 8 }}>{t('assemblyLife.detail.title')}</Label>
          <Text style={styles.title}>{fmtIsoDay(detail.meetingDate, t)}</Text>
          <Text style={styles.subtitle}>{detail.unitName}</Text>

          <Card style={styles.card}>
            <InfoRow
              icon="restaurant-outline"
              label={t('assemblyLife.breadBreaking')}
              value={detail.breadBreaking ? t('assemblyLife.detail.yes') : t('assemblyLife.detail.no')}
            />
            <InfoRow
              icon="book-outline"
              label={t('assemblyLife.detail.reading')}
              value={
                reportInput.bookTitle && reportInput.chapters.length > 0
                  ? `${reportInput.bookTitle} — ${formatChapters(reportInput.chapters, t)}`
                  : t('assemblyLife.noReading')
              }
            />
          </Card>

          <Card style={styles.card}>
            <Label style={{ marginBottom: 8 }}>
              {t('assemblyLife.detail.attendees')} · {detail.attendees.length}
            </Label>
            {detail.attendees.length === 0 ? (
              <Text style={styles.hint}>{t('assemblyLife.detail.noAttendees')}</Text>
            ) : (
              detail.attendees.map((a) => (
                <View key={a.userId} style={styles.personRow}>
                  <Ionicons name="person-outline" size={15} color={colors.mossSoft} />
                  <Text style={styles.personName}>{a.displayName}</Text>
                </View>
              ))
            )}
          </Card>

          <MeetingReportCard input={reportInput} />
        </>
      )}
    </ScreenShell>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={17} color={colors.mossSoft} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delBtn: { backgroundColor: colors.mossTint },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4 },
  card: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoLabel: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, marginTop: 2, lineHeight: 19 },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
});
