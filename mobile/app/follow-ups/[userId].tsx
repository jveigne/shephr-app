import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Chip from '@/components/Chip';
import Field from '@/components/Field';
import Label from '@/components/Label';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import ContactButtons from '@/components/ContactButtons';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  EDITABLE_FOLLOW_UP_STATUSES,
  FOLLOW_UP_NOTE_MAX,
  getFollowUp,
  updateFollowUp,
  type FollowUpDetail,
  type FollowUpUpdateRequest,
} from '@/services/followUpsApi';
import { countryErrorMessage } from '@/services/countriesApi';
import { goBack } from '@/utils/navigation';
import { fmtIsoDay } from '@/utils/meetingReport';

/**
 * Fiche « Personne à suivre » — RG-PAYS-30..34 (JP 11/11, contrat 11/11 §9).
 *
 * <p>Coordonnées + Appeler / WhatsApp / E-mail (Q7, aucun envoi groupé), statut (À contacter / Contactée — un
 * dirigeant ne pose JAMAIS « Intégrée » ni « Ne souhaite pas », écart E-06), note (≤ 2 000), « Marquer comme
 * contactée » (`markContacted`), inscriptions et présences de la personne. `canEdit` vient du serveur ; une fiche
 * « Ne souhaite pas être recontactée » est en lecture seule, sans coordonnées (RG-PAYS-33 / 34).
 */
export default function FollowUpDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { t } = useLanguage();
  const [detail, setDetail] = useState<FollowUpDetail | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const d = await getFollowUp(userId);
      setDetail(d);
      setNote(d.note ?? '');
      setError(null);
    } catch (e) {
      setError(countryErrorMessage(e, t, 'followUps.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async (payload: FollowUpUpdateRequest, success: string) => {
    if (!userId || saving) return;
    setSaving(true);
    setFlash(null);
    try {
      const d = await updateFollowUp(userId, payload);
      setDetail(d);
      setNote(d.note ?? '');
      setFlash(success);
      setError(null);
    } catch (e) {
      setError(countryErrorMessage(e, t));
    } finally {
      setSaving(false);
    }
  };

  const back = (
    <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
      <Ionicons name="chevron-back" size={22} color={colors.ink2} />
    </Pressable>
  );

  if (loading || !detail) {
    return (
      <ScreenShell withTabBar={false}>
        {back}
        {loading ? (
          <ActivityIndicator color={colors.moss} style={{ marginTop: 60 }} />
        ) : (
          <ErrorBanner message={error ?? t('followUps.loadFailed')} onRetry={() => void load()} />
        )}
      </ScreenShell>
    );
  }

  const optedOut = detail.status === 'NE_SOUHAITE_PAS';
  const integrated = detail.status === 'INTEGREE';
  const editable = detail.canEdit && !optedOut && !integrated;
  const noteChanged = note !== (detail.note ?? '');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false}>
        {back}
        <Text style={styles.kicker}>{t('followUps.title')}</Text>
        <Text style={styles.title}>{detail.fullName}</Text>
        <Text style={styles.subtitle}>
          {[t(`followUps.status.${detail.status}`), detail.cityName ?? t('followUps.noCity')].join(' · ')}
        </Text>

        {!!flash && (
          <Card variant="tinted" style={styles.flash}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.moss} />
            <Text style={styles.flashText}>{flash}</Text>
          </Card>
        )}
        {!!error && <ErrorBanner message={error} />}

        <Card style={styles.card}>
          {optedOut ? (
            <Text style={styles.hint}>{t('followUps.optedOutHint')}</Text>
          ) : (
            <>
              {!!detail.phoneNumber && (
                <Text style={styles.contact} selectable>
                  {`${detail.phoneCountryCode ?? ''} ${detail.phoneNumber}`.trim()}
                </Text>
              )}
              {!!detail.email && (
                <Text style={styles.contact} selectable>
                  {detail.email}
                </Text>
              )}
              {!detail.phoneNumber && !detail.email && <Text style={styles.hint}>{t('followUps.noContact')}</Text>}
              <ContactButtons
                phoneNumber={detail.phoneNumber}
                phoneCountryCode={detail.phoneCountryCode}
                email={detail.email}
              />
            </>
          )}
          <Text style={styles.meta}>
            {t('followUps.consentOn', { date: fmtIsoDay(detail.consentAt.slice(0, 10), t) })}
            {detail.lastContactAt
              ? ` · ${t('followUps.lastContact', { date: fmtIsoDay(detail.lastContactAt.slice(0, 10), t) })}`
              : ''}
          </Text>
          {!!detail.updatedByName && (
            <Text style={styles.meta}>{t('followUps.updatedBy', { name: detail.updatedByName })}</Text>
          )}
        </Card>

        {integrated && <Text style={styles.hint}>{t('followUps.integratedHint')}</Text>}

        {editable && (
          <>
            <Label style={styles.section}>{t('followUps.statusLabel')}</Label>
            <View style={styles.chips}>
              {EDITABLE_FOLLOW_UP_STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={t(`followUps.status.${s}`)}
                  selected={detail.status === s}
                  onPress={() =>
                    detail.status !== s && void save({ status: s }, t('followUps.saved'))
                  }
                />
              ))}
            </View>
            <Button
              label={t('followUps.markContacted')}
              variant="soft"
              onPress={() => void save({ markContacted: true }, t('followUps.saved'))}
              disabled={saving}
              fullWidth
              height={46}
              style={{ marginTop: 12 }}
              iconLeft={<Ionicons name="checkmark-done-outline" size={17} color={colors.mossDeep} />}
            />

            <View style={styles.noteHead}>
              <Label>{t('followUps.note')}</Label>
              <Text style={styles.counter}>
                {note.length}/{FOLLOW_UP_NOTE_MAX}
              </Text>
            </View>
            <Field
              value={note}
              onChangeText={setNote}
              placeholder={t('followUps.notePlaceholder')}
              maxLength={FOLLOW_UP_NOTE_MAX}
              multiline
              style={styles.noteField}
            />
            <Button
              label={t('common.save')}
              onPress={() => void save({ note }, t('followUps.saved'))}
              loading={saving}
              disabled={!noteChanged}
              fullWidth
              height={48}
              style={{ marginTop: 10 }}
            />
          </>
        )}
        {!editable && !!detail.note && (
          <>
            <Label style={styles.section}>{t('followUps.note')}</Label>
            <Text style={styles.noteRead}>{detail.note}</Text>
          </>
        )}

        <Label style={styles.section}>{t('followUps.registrations')}</Label>
        {detail.registrations.length === 0 ? (
          <Text style={styles.hint}>{t('followUps.noRegistrations')}</Text>
        ) : (
          detail.registrations.map((r) => (
            <Card
              key={`${r.eventId}`}
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: r.eventId } })}
              style={styles.reg}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.regTitle} numberOfLines={2}>{r.label}</Text>
                <Text style={styles.meta}>
                  {[fmtIsoDay(r.eventDate, t), r.scopeName].join(' · ')}
                </Text>
                <Text style={styles.meta}>
                  {r.registrationStatus === 'CANCELED'
                    ? t('followUps.regCanceled')
                    : r.attended == null
                      ? r.eventStatus === 'CANCELLED'
                        ? t('events.status.CANCELLED')
                        : t('events.registration.mark.unmarked')
                      : r.attended
                        ? t('events.registration.mark.attended')
                        : t('events.registration.mark.absent')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </Card>
          ))
        )}
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4 },
  flash: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flashText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  card: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 14 },
  contact: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, marginTop: 2 },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 6 },
  hint: { marginTop: 8, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
  section: { marginTop: 22, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 8 },
  counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3 },
  noteField: { minHeight: 96, textAlignVertical: 'top' },
  noteRead: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2, lineHeight: 20 },
  reg: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  regTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.ink },
});
