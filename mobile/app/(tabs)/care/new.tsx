import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../../components/ScreenShell';
import Label from '../../../components/Label';
import Field from '../../../components/Field';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import { colors, fonts } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  createRecord,
  getOverview,
  listStatuses,
  type MemberCareOverviewRow,
  type MemberCareStatus,
} from '../../../services/memberCareApi';
import { notify } from '../../../utils/dialogs';

export default function NewRecordScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [units, setUnits] = useState<MemberCareOverviewRow[]>([]);
  const [statuses, setStatuses] = useState<MemberCareStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [unitId, setUnitId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ov, st] = await Promise.allSettled([getOverview(), listStatuses()]);
        if (ov.status === 'fulfilled') {
          setUnits(ov.value);
          if (ov.value.length === 1) setUnitId(ov.value[0].unitId);
        }
        if (st.status === 'fulfilled') setStatuses(st.value);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async () => {
    if (!unitId) {
      notify(t('common.appName'), t('care.errUnit'));
      return;
    }
    if (firstName.trim().length < 1 || lastName.trim().length < 1) {
      notify(t('common.appName'), t('care.errName'));
      return;
    }
    setSaving(true);
    try {
      const rec = await createRecord({
        unitId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        contactPhone: phone.trim() || undefined,
        contactEmail: email.trim() || undefined,
        statusId: statusId ?? undefined,
        note: note.trim() || undefined,
      });
      router.replace(`/(tabs)/care/record/${rec.id}`);
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('care.newTitle')}</Text>
          <View style={{ width: 26 }} />
        </View>

        {units.length > 1 && (
          <View style={{ marginTop: 14 }}>
            <Label style={{ marginBottom: 8 }}>{t('care.unit')}</Label>
            <View style={styles.chipWrap}>
              {units.map((u) => (
                <Chip
                  key={u.unitId}
                  label={u.unitName}
                  selected={unitId === u.unitId}
                  onPress={() => setUnitId(u.unitId)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 8 }}>{t('care.firstName')}</Label>
            <Field value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 8 }}>{t('care.lastName')}</Label>
            <Field value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Label style={{ marginBottom: 8 }}>{t('care.phone')}</Label>
          <Field value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={t('care.optional')} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Label style={{ marginBottom: 8 }}>{t('care.email')}</Label>
          <Field
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('care.optional')}
          />
        </View>

        {statuses.filter((s) => s.active).length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Label style={{ marginBottom: 8 }}>{t('care.status')}</Label>
            <View style={styles.chipWrap}>
              {statuses
                .filter((s) => s.active)
                .map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    selected={statusId === s.id}
                    onPress={() => setStatusId(statusId === s.id ? null : s.id)}
                  />
                ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <Label style={{ marginBottom: 8 }}>{t('care.note')}</Label>
          <Field
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            placeholder={t('care.notePlaceholder')}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </View>

        <Button
          label={t('common.create')}
          onPress={onSave}
          loading={saving}
          fullWidth
          height={56}
          style={{ marginTop: 22 }}
          iconLeft={<Ionicons name="checkmark" size={18} color={colors.white} />}
        />
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink2 },
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
