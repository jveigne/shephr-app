import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Label from '../components/Label';
import Field from '../components/Field';
import Button from '../components/Button';
import HandDivider from '../components/HandDivider';
import { colors, fonts } from '../theme';
import { inviteUser } from '../services/adminApi';
import { notify } from '../utils/dialogs';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { assignableLeaderRoles, MODULE_ROLE_LABELS, type ModuleRole } from '../services/authApi';

/**
 * Invite un DIRIGEANT à rejoindre une assemblée (décision JP 21/07 : les simples membres n'ont
 * pas accès au module Goals — seuls des rôles dirigeants sont conférables, plafonnés au rang de
 * l'invitant côté backend). V1 : le backend renvoie un code court d'activation à transmettre.
 */
export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { me } = useAuth();
  const { unitId, unitName } = useLocalSearchParams<{ unitId: string; unitName?: string }>();

  const roles = assignableLeaderRoles(me);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ModuleRole>('DIRIGEANT_UNITE');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const onInvite = async () => {
    if (!unitId) return;
    if (fullName.trim().length < 2) {
      notify(t('common.appName'), t('invite.errName'));
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      notify(t('common.appName'), t('invite.errEmail'));
      return;
    }
    setLoading(true);
    try {
      const res = await inviteUser({
        email: email.trim(),
        fullName: fullName.trim(),
        goalRole: role,
        goalUnitId: unitId,
      });
      setCode(res.invitationShortCode);
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('invite.errFailed'));
    } finally {
      setLoading(false);
    }
  };

  const onShare = async () => {
    if (!code) return;
    try {
      await Share.share({ message: t('invite.shareMessage', { code, name: fullName.trim() }) });
    } catch {
      // l'utilisateur a annulé le partage — pas d'erreur à remonter
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
        </View>

        <Text style={styles.title}>{t('invite.title')}</Text>
        {!!unitName && (
          <Text style={styles.intro}>{t('invite.to', { unit: unitName })}</Text>
        )}

        {code ? (
          <Card variant="paper2" style={styles.codeCard}>
            <View style={styles.checkBubble}>
              <Ionicons name="checkmark" size={30} color={colors.white} />
            </View>
            <Label style={{ color: colors.mossSoft, textAlign: 'center', marginTop: 14 }}>
              {t('invite.code')}
            </Label>
            <Text selectable style={styles.code}>{code}</Text>
            <Text style={styles.validity}>{t('invite.validity')}</Text>
            <HandDivider style={{ marginVertical: 16, width: '70%', alignSelf: 'center' }} />
            <Text style={styles.hint}>{t('invite.shareHint')}</Text>
            <Button
              label={t('invite.share')}
              onPress={onShare}
              fullWidth
              height={52}
              style={{ marginTop: 14 }}
              iconLeft={<Ionicons name="share-outline" size={18} color={colors.white} />}
            />
            <Button
              label={t('invite.done')}
              variant="ghost"
              onPress={() => router.back()}
              fullWidth
              height={50}
              style={{ marginTop: 10 }}
            />
          </Card>
        ) : (
          <>
            <View style={{ marginTop: 22 }}>
              <Label style={{ marginBottom: 8 }}>{t('invite.fullName')}</Label>
              <Field
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('invite.fullNamePlaceholder')}
                autoCapitalize="words"
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <Label style={{ marginBottom: 8 }}>{t('invite.email')}</Label>
              <Field
                value={email}
                onChangeText={setEmail}
                placeholder={t('invite.emailPlaceholder')}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            <View style={{ marginTop: 16 }}>
              <Label style={{ marginBottom: 8 }}>{t('invite.role')}</Label>
              <View style={styles.roleRow}>
                {roles.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    style={[styles.roleChip, role === r && styles.roleChipActive]}
                  >
                    <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                      {MODULE_ROLE_LABELS[r]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.mossSoft} />
              <Text style={styles.noteText}>{t('invite.memberNote')}</Text>
            </View>

            <Button
              label={t('invite.submit')}
              onPress={onInvite}
              loading={loading}
              fullWidth
              height={58}
              style={{ marginTop: 22 }}
              iconLeft={<Ionicons name="person-add-outline" size={18} color={colors.white} />}
            />
          </>
        )}
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 6 },
  title: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink, letterSpacing: -0.5, marginTop: 2 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 6, lineHeight: 20 },
  noteBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,47,0.06)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.mossDeep, lineHeight: 18 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: 'rgba(42,38,32,0.06)' },
  roleChipActive: { backgroundColor: colors.moss },
  roleChipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  roleChipTextActive: { color: colors.white },
  codeCard: { marginTop: 24, paddingVertical: 26, paddingHorizontal: 22, alignItems: 'center' },
  checkBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: 34,
    letterSpacing: 6,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 8,
  },
  validity: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, textAlign: 'center', marginTop: 6 },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, textAlign: 'center', lineHeight: 19 },
});
