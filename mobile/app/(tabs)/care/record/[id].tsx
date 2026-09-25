import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { goBack } from '../../../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../../components/ScreenShell';
import Card from '../../../../components/Card';
import Label from '../../../../components/Label';
import Field from '../../../../components/Field';
import Button from '../../../../components/Button';
import Chip from '../../../../components/Chip';
import { colors, fonts } from '../../../../theme';
import { useLanguage } from '../../../../contexts/LanguageContext';
import {
  changeStatus,
  getRecord,
  listStatuses,
  updateNote,
  type MemberCareStatus,
  type MemberRecordDetail,
} from '../../../../services/memberCareApi';
import { notify } from '../../../../utils/dialogs';
import { fmtDateLong } from '../../../../utils/format';
import { fmtIsoDay } from '../../../../utils/meetingReport';

/** Nombre de présences affichées avant « Tout afficher ». */
const ATTENDANCE_PREVIEW = 8;

/**
 * Fiche de suivi d'un membre — refonte D-ASM-01 (JP 23/09) : la route porte le **userId** du
 * membre. Statut + historique + note + présences (RG-MCR-10, si ASSEMBLY actif).
 * Écriture (statut, note) uniquement si `record.canEdit` (RG-MCR-08 v2 : DIRIGEANT_UNITE de
 * l'assemblée courante) ; les superviseurs lisent (D-ASM-05). Plus de suppression (RG-MCR-02 v2).
 */
export default function RecordDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<MemberRecordDetail | null>(null);
  const [statuses, setStatuses] = useState<MemberCareStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickStatus, setPickStatus] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showAllAttendances, setShowAllAttendances] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [d, st] = await Promise.allSettled([getRecord(id), listStatuses()]);
    if (d.status === 'fulfilled') {
      setError(null);
      setDetail(d.value);
      setPickStatus(d.value.record.currentStatusId);
      setNoteDraft(d.value.record.note ?? '');
    } else {
      const e: any = d.reason;
      const code = e?.response?.status;
      setError(
        code === 404
          ? t('care.notFound')
          : code === 403
          ? t('care.forbidden')
          : e?.response?.data?.message ?? t('care.loadFailed'),
      );
    }
    if (st.status === 'fulfilled') setStatuses(st.value);
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          await load();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onSaveStatus = async () => {
    if (!detail || !pickStatus) return;
    setSavingStatus(true);
    try {
      await changeStatus(detail.record.userId, { statusId: pickStatus, note: statusNote.trim() || undefined });
      setStatusNote('');
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.saveFailed'));
    } finally {
      setSavingStatus(false);
    }
  };

  const onSaveNote = async () => {
    if (!detail) return;
    setSavingNote(true);
    try {
      // Note vide = effacée côté serveur (UpdateNoteRequest).
      await updateNote(detail.record.userId, { note: noteDraft.trim() || null });
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.saveFailed'));
    } finally {
      setSavingNote(false);
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable onPress={() => goBack()} hitSlop={10}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (!detail) {
    return (
      <ScreenShell>
        {header}
        <Card style={styles.emptyCard}>
          <Ionicons name="alert-circle-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{error ?? t('care.loadFailed')}</Text>
        </Card>
      </ScreenShell>
    );
  }

  const { record, history, attendanceEnabled, attendances } = detail;
  const canEdit = record.canEdit;
  const statusChanged = pickStatus !== record.currentStatusId;
  const noteChanged = noteDraft.trim() !== (record.note ?? '').trim();
  const shownAttendances = showAllAttendances ? attendances : attendances.slice(0, ATTENDANCE_PREVIEW);

  return (
    <ScreenShell>
      {header}

      <Text style={styles.name}>{record.fullName}</Text>
      {!!record.unitName && <Text style={styles.unit}>{record.unitName}</Text>}
      <View style={[styles.statusPill, { backgroundColor: (record.currentStatusColor || colors.moss) + '20' }]}>
        <View style={[styles.dot, { backgroundColor: record.currentStatusColor || colors.moss }]} />
        <Text style={[styles.statusPillText, { color: record.currentStatusColor || colors.mossSoft }]}>
          {record.currentStatusLabel ?? t('care.noStatus')}
        </Text>
      </View>

      {!canEdit && (
        <View style={styles.readOnly}>
          <Ionicons name="eye-outline" size={15} color={colors.ink3} />
          <Text style={styles.readOnlyText}>{t('care.readOnly')}</Text>
        </View>
      )}

      <Card style={styles.infoCard}>
        <InfoRow icon="call-outline" label={t('care.phone')} value={record.phoneNumber} t={t} />
        <InfoRow icon="mail-outline" label={t('care.email')} value={record.email} t={t} />
        {attendanceEnabled && (
          <InfoRow
            icon="calendar-outline"
            label={t('care.lastAttendance')}
            value={record.lastAttendanceDate ? fmtIsoDay(record.lastAttendanceDate, t) : t('care.never')}
            t={t}
          />
        )}
      </Card>

      {/* Note : éditable par le dirigeant d'assemblée, lue par les autres (D-ASM-05). */}
      <Card style={styles.editCard}>
        <Label style={{ marginBottom: 8 }}>{t('care.note')}</Label>
        {canEdit ? (
          <>
            <Field
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder={t('care.notePlaceholder')}
              multiline
              maxLength={1000}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            {noteChanged && (
              <Button
                label={t('care.saveNote')}
                onPress={onSaveNote}
                loading={savingNote}
                fullWidth
                height={46}
                style={{ marginTop: 10 }}
              />
            )}
          </>
        ) : record.note ? (
          <Text style={styles.note}>« {record.note} »</Text>
        ) : (
          <Text style={styles.emptyInline}>{t('care.noNote')}</Text>
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
          {statusChanged && !!pickStatus && (
            <>
              <Field
                value={statusNote}
                onChangeText={setStatusNote}
                placeholder={t('care.statusNotePlaceholder')}
                multiline
                maxLength={500}
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
        <Text style={styles.emptyInline}>{t('care.noHistory')}</Text>
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
                  <Text style={styles.histDate}>
                    {fmtDateLong(new Date(h.changedAt))}
                    {h.changedByName ? ` · ${t('care.changedBy', { name: h.changedByName })}` : ''}
                  </Text>
                  {!!h.note && <Text style={styles.histNote}>« {h.note} »</Text>}
                </View>
              </View>
            ))}
        </Card>
      )}

      {/* RG-MCR-10 / D-ASM-12 (JP 23/09) : présences seulement si le module ASSEMBLY est actif. */}
      {attendanceEnabled && (
        <>
          <Text style={styles.sectionTitle}>{t('care.attendances')}</Text>
          {attendances.length === 0 ? (
            <Text style={styles.emptyInline}>{t('care.noAttendance')}</Text>
          ) : (
            <Card style={{ marginTop: 10, paddingVertical: 4 }}>
              {shownAttendances.map((a, i, arr) => (
                <View
                  key={a.meetingId}
                  style={[styles.attRow, i < arr.length - 1 && styles.histRowBorder]}
                >
                  <Ionicons name="checkmark-circle-outline" size={17} color={colors.mossSoft} />
                  <Text style={styles.attDate}>{fmtIsoDay(a.meetingDate, t)}</Text>
                  {/* La fiche suit le membre (D-ASM-06) : l'assemblée d'origine est rappelée. */}
                  {a.unitId !== record.unitId && !!a.unitName && (
                    <Text style={styles.attUnit} numberOfLines={1}>{a.unitName}</Text>
                  )}
                </View>
              ))}
              {attendances.length > ATTENDANCE_PREVIEW && (
                <Pressable
                  style={styles.moreBtn}
                  onPress={() => setShowAllAttendances((v) => !v)}
                  hitSlop={6}
                >
                  <Text style={styles.moreText}>
                    {showAllAttendances
                      ? t('care.showLess')
                      : t('care.showAll', { count: attendances.length })}
                  </Text>
                </Pressable>
              )}
            </Card>
          )}
        </>
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
  name: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 8 },
  unit: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 2 },
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
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  readOnlyText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  infoCard: { marginTop: 18, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 110,
  },
  infoValue: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink, textAlign: 'right' },
  note: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 14, color: colors.mossSoft },
  editCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 24 },
  emptyInline: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, fontStyle: 'italic', marginTop: 8 },
  emptyCard: { marginTop: 16, paddingVertical: 30, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  histRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.06)' },
  histDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.mossSoft, marginTop: 5 },
  histLabel: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  histDate: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3, marginTop: 2 },
  histNote: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13, color: colors.mossSoft, marginTop: 4 },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  attDate: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink },
  attUnit: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, textAlign: 'right' },
  moreBtn: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  moreText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
});
