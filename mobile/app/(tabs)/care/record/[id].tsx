import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../../components/ScreenShell';
import Card from '../../../../components/Card';
import Label from '../../../../components/Label';
import Field from '../../../../components/Field';
import Button from '../../../../components/Button';
import Chip from '../../../../components/Chip';
import HandDivider from '../../../../components/HandDivider';
import { colors, fonts } from '../../../../theme';
import { useLanguage } from '../../../../contexts/LanguageContext';
import {
  changeStatus,
  deleteRecord,
  getRecord,
  listStatuses,
  type MemberCareStatus,
  type MemberRecordDetail,
} from '../../../../services/memberCareApi';
import { confirmDialog, notify } from '../../../../utils/dialogs';
import { fmtDateLong } from '../../../../utils/format';

export default function RecordDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<MemberRecordDetail | null>(null);
  const [statuses, setStatuses] = useState<MemberCareStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickStatus, setPickStatus] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [d, st] = await Promise.allSettled([getRecord(id), listStatuses()]);
    if (d.status === 'fulfilled') {
      setDetail(d.value);
      setPickStatus(d.value.record.currentStatusId);
    }
    if (st.status === 'fulfilled') setStatuses(st.value);
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onSaveStatus = async () => {
    if (!detail || !pickStatus) return;
    setSavingStatus(true);
    try {
      await changeStatus(detail.record.id, { statusId: pickStatus, note: statusNote.trim() || undefined });
      setStatusNote('');
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.saveFailed'));
    } finally {
      setSavingStatus(false);
    }
  };

  const onDelete = async () => {
    if (!detail) return;
    const ok = await confirmDialog(t('common.appName'), t('care.deleteConfirm'), t('common.delete'), true);
    if (!ok) return;
    try {
      await deleteRecord(detail.record.id);
      router.back();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('care.deleteFailed'));
    }
  };

  if (loading || !detail) {
    return (
      <ScreenShell>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  const { record, history } = detail;
  const canEdit = record.canEdit;
  const statusChanged = pickStatus !== record.currentStatusId;

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {canEdit && (
          <Pressable style={styles.delBtn} onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={colors.clay} />
          </Pressable>
        )}
      </View>

      <Text style={styles.name}>
        {record.firstName} {record.lastName}
      </Text>
      {!!record.currentStatusLabel && (
        <View style={[styles.statusPill, { backgroundColor: (record.currentStatusColor || colors.moss) + '20' }]}>
          <View style={[styles.dot, { backgroundColor: record.currentStatusColor || colors.moss }]} />
          <Text style={[styles.statusPillText, { color: record.currentStatusColor || colors.mossSoft }]}>
            {record.currentStatusLabel}
          </Text>
        </View>
      )}

      <Card style={styles.infoCard}>
        <InfoRow icon="call-outline" label={t('care.phone')} value={record.contactPhone} t={t} />
        <InfoRow icon="mail-outline" label={t('care.email')} value={record.contactEmail} t={t} />
        <InfoRow
          icon="calendar-outline"
          label={t('care.firstMet')}
          value={record.firstMetAt ? fmtDateLong(new Date(record.firstMetAt)) : null}
          t={t}
        />
        {!!record.note && (
          <View style={{ marginTop: 4 }}>
            <Label>{t('care.note')}</Label>
            <Text style={styles.note}>« {record.note} »</Text>
          </View>
        )}
      </Card>

      {canEdit && (
        <Card style={styles.editCard}>
          <Label style={{ marginBottom: 10 }}>{t('care.changeStatus')}</Label>
          <View style={styles.chipWrap}>
            {statuses
              .filter((s) => s.active)
              .map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  selected={pickStatus === s.id}
                  onPress={() => setPickStatus(s.id)}
                />
              ))}
          </View>
          {statusChanged && (
            <>
              <Field
                value={statusNote}
                onChangeText={setStatusNote}
                placeholder={t('care.statusNotePlaceholder')}
                multiline
                style={{ minHeight: 70, textAlignVertical: 'top', marginTop: 12 }}
              />
              <Button
                label={t('care.saveStatus')}
                onPress={onSaveStatus}
                loading={savingStatus}
                fullWidth
                height={50}
                style={{ marginTop: 12 }}
              />
            </>
          )}
        </Card>
      )}

      <Text style={styles.sectionTitle}>{t('care.timeline')}</Text>
      {history.length === 0 ? (
        <Text style={styles.emptyTimeline}>{t('care.noHistory')}</Text>
      ) : (
        <Card style={{ marginTop: 10, paddingVertical: 4 }}>
          {history
            .slice()
            .reverse()
            .map((h, i, arr) => (
              <View key={h.id} style={[styles.histRow, i < arr.length - 1 && styles.histRowBorder]}>
                <View style={styles.histDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.histLabel}>
                    {h.oldStatusLabel ? `${h.oldStatusLabel} → ` : ''}
                    {h.newStatusLabel ?? t('care.noStatus')}
                  </Text>
                  <Text style={styles.histDate}>{fmtDateLong(new Date(h.changedAt))}</Text>
                  {!!h.note && <Text style={styles.histNote}>« {h.note} »</Text>}
                </View>
              </View>
            ))}
        </Card>
      )}
    </ScreenShell>
  );
}

function InfoRow({
  icon,
  label,
  value,
  t,
}: {
  icon: any;
  label: string;
  value: string | null;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={17} color={colors.mossSoft} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || t('care.notProvided')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  delBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(184,106,74,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 8 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
    marginTop: 10,
  },
  statusPillText: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  infoCard: { marginTop: 18, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 90,
  },
  infoValue: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink, textAlign: 'right' },
  note: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 14, color: colors.mossSoft, marginTop: 4 },
  editCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 24 },
  emptyTimeline: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, fontStyle: 'italic', marginTop: 8 },
  histRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.06)' },
  histDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.mossSoft, marginTop: 5 },
  histLabel: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  histDate: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3, marginTop: 2 },
  histNote: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13, color: colors.mossSoft, marginTop: 4 },
});
