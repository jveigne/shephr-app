import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../components/ScreenShell';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Label from '../../components/Label';
import HandDivider from '../../components/HandDivider';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { canManageStructure, deleteMyAccount, roleLabel } from '../../services/authApi';
import { useLanguage } from '../../contexts/LanguageContext';
import { confirmDialog, notify } from '../../utils/dialogs';
import { contactMailto, contactWhatsapp, useContactSettings } from '../../services/contactApi';

export default function ProfileScreen() {
  const { me, isLeader, logout } = useAuth();
  // Coordonnées d'assistance pilotées depuis le back-office.
  const contact = useContactSettings();
  const { language, setLanguage, t } = useLanguage();

  const initials = (me?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  const doLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const confirmLogout = () => {
    // react-native-web ne supporte pas les boutons d'Alert.alert → le onPress ne se
    // déclenche jamais. On bascule sur window.confirm sur le web, Alert sur natif.
    if (Platform.OS === 'web') {
      const ok =
        typeof window === 'undefined' || window.confirm(t('profile.logoutConfirm'));
      if (ok) void doLogout();
      return;
    }
    Alert.alert(t('common.appName'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => void doLogout() },
    ]);
  };

  // Feature C — suppression (ou anonymisation) définitive du compte.
  const confirmDeleteAccount = async () => {
    const ok = await confirmDialog(
      t('profile.deleteTitle'),
      t('profile.deleteMessage'),
      t('profile.deleteAccount'),
      true,
    );
    if (!ok) return;
    try {
      await deleteMyAccount();
      await logout();
      router.replace('/(auth)/login');
    } catch (e: any) {
      // 422 USER_LEADS_ORPHAN_NODES : message FR explicite (structures à transférer) — tel quel.
      notify(t('profile.deleteTitle'), e?.response?.data?.message ?? t('profile.deleteError'));
    }
  };

  return (
    <ScreenShell>
      <Text style={styles.title}>{t('profile.title')}</Text>

      <Card style={styles.idCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '·'}</Text>
        </View>
        <Text style={styles.name}>{me?.fullName ?? '—'}</Text>
        <Text style={styles.email}>{me?.email ?? ''}</Text>

        <View style={styles.pillRow}>
          <View
            style={[
              styles.pill,
              {
                backgroundColor: isLeader ? colors.moss : 'rgba(42,38,32,0.06)',
              },
            ]}
          >
            {isLeader && <Ionicons name="people" size={13} color={colors.white} />}
            <Text
              style={[
                styles.pillText,
                { color: isLeader ? colors.white : colors.ink2 },
              ]}
            >
              {roleLabel(me)}
            </Text>
          </View>
          {me?.donationUnitId && (
            <View style={[styles.pill, { backgroundColor: 'rgba(201,149,107,0.18)' }]}>
              <Text style={[styles.pillText, { color: colors.earthDeep }]}>{t('profile.myUnit')}</Text>
            </View>
          )}
        </View>

        <HandDivider style={{ marginVertical: 18 }} />

        <View style={styles.statsRow}>
          <Stat label={t('profile.status')} value={me?.active ? t('profile.active') : '—'} />
          <View style={styles.statsDivider} />
          <Stat label={t('profile.role')} value={roleLabel(me)} />
        </View>
      </Card>

      {(me?.unitNames?.length || me?.zoneNames?.length || me?.countryNames?.length) ? (
        <>
          <Label style={{ marginTop: 26, marginBottom: 8, paddingHorizontal: 4 }}>
            {t('profile.perimeter')}
          </Label>
          <Card style={{ paddingVertical: 4 }}>
            {me?.unitNames?.length ? (
              <InfoRow
                icon="business-outline"
                label={me.unitNames.length > 1 ? t('profile.units') : t('profile.unit')}
                value={me.unitNames.join(', ')}
              />
            ) : null}
            {me?.zoneNames?.length ? (
              <InfoRow
                icon="map-outline"
                label={me.zoneNames.length > 1 ? t('profile.zones') : t('profile.zone')}
                value={me.zoneNames.join(', ')}
              />
            ) : null}
            {me?.countryNames?.length ? (
              <InfoRow icon="flag-outline" label={t('profile.countries')} value={me.countryNames.join(', ')} />
            ) : null}
          </Card>
        </>
      ) : null}

      {/* RG-BQ-13 (JP 16/08) — on change d'assemblée SOI-MÊME, sans demande ni valideur. Le
          profil est l'endroit naturel : c'est là qu'on lit son rattachement. */}
      <Card style={{ paddingVertical: 0, marginTop: 12 }}>
        <Row
          icon="swap-horizontal-outline"
          label={t('assembly.changeCta')}
          value={t('assembly.changeHintShort')}
          onPress={() => router.push('/(tabs)/goals/assembly')}
          last
        />
      </Card>

{/*      {canManageStructure(me) && (
        <>
          <Label style={{ marginTop: 26, marginBottom: 8, paddingHorizontal: 4 }}>{t('profile.management')}</Label>
          <Card style={{ paddingVertical: 0 }}>
            <Row
              icon="git-branch-outline"
              label={t('profile.manageStructure')}
              value={t('profile.manageStructureValue')}
              onPress={() => router.push('/structure')}
              last
            />
          </Card>
        </>
      )}*/}

      <Label style={{ marginTop: 26, marginBottom: 8, paddingHorizontal: 4 }}>
        {t('profile.preferences')}
      </Label>
      <Card style={{ paddingVertical: 0 }}>
        <Row
          icon="globe-outline"
          label={t('profile.language')}
          value={language === 'fr' ? 'Français' : 'English'}
          onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
        />
{/*        <Row icon="notifications-outline" label={t('profile.notifications')} value={t('profile.notificationsValue')} />
        <Row icon="receipt-outline" label={t('profile.receipts')} value={t('profile.receiptsValue')} />
        <Row icon="shield-outline" label={t('profile.privacy')} value={t('profile.privacyValue')} last />*/}
      </Card>

      {/* Contactez-nous (JP 31/07) — mêmes canaux et même mise en forme que le bloc d'aide du
          rattachement à une assemblée : WhatsApp mis en avant, e-mail en second. */}
      <Label style={{ marginTop: 26, marginBottom: 8, paddingHorizontal: 4 }}>
        {t('profile.help')}
      </Label>
      <Card style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
        <Text style={styles.contactHint}>{t('profile.contactHint')}</Text>
        <View style={{ gap: 8, marginTop: 12 }}>
          <Button
            label={t('join.contactWhatsapp')}
            variant="soft"
            onPress={() =>
              Linking.openURL(contactWhatsapp(t('profile.contactWhatsappText')))
                .catch(() => Linking.openURL(contact.whatsappUrl).catch(() => {}))
            }
            iconLeft={<Ionicons name="logo-whatsapp" size={18} color={colors.mossDeep} />}
          />
          <Button
            label={t('join.contactMail')}
            variant="ghost"
            onPress={() => Linking.openURL(contactMailto(t('profile.contactMailSubject'))).catch(() => {})}
            iconLeft={<Ionicons name="mail-outline" size={18} color={colors.mossDeep} />}
          />
        </View>
      </Card>

      <Card style={styles.logoutCard}>
        <Pressable onPress={confirmLogout} style={styles.logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.moss} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </Pressable>
      </Card>

      <Label style={{ marginTop: 18, marginBottom: 8, paddingHorizontal: 4 }}>
        {t('profile.dangerZone')}
      </Label>
      <Card style={styles.dangerCard}>
        <Pressable onPress={() => void confirmDeleteAccount()} style={styles.dangerRow}>
          <Ionicons name="trash-outline" size={18} color={colors.clay} />
          <Text style={styles.dangerText}>{t('profile.deleteAccount')}</Text>
        </Pressable>
      </Card>

      <Text style={styles.version}>{t('profile.version')}</Text>
    </ScreenShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        { borderBottomWidth: last ? 0 : 1 },
      ]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.mossSoft} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
    </Pressable>
  );
}

/** Ligne d'info en lecture seule (périmètre) — pas de chevron, pas de pression. */
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.mossSoft} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  idCard: { paddingVertical: 22, paddingHorizontal: 22, alignItems: 'center', marginTop: 18 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.serif, fontSize: 30, color: colors.white },
  name: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: 14,
  },
  email: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 2 },
  contactHint: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 99,
  },
  pillText: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  statsDivider: { width: 1, backgroundColor: 'rgba(42,38,32,0.10)' },
  statValue: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  statLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.ink3, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomColor: 'rgba(42,38,32,0.06)',
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(30,58,47,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '500', color: colors.ink },
  rowValue: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  infoLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  // Même traitement visuel que la carte « Supprimer mon compte » (carte bordée, texte gras) ;
  // la couleur terre-cuite (clay) reste réservée à l'action destructrice.
  logoutCard: {
    marginTop: 18,
    paddingVertical: 0,
    borderColor: colors.mossTint2,
  },
  logout: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  logoutText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.moss },
  dangerCard: {
    paddingVertical: 0,
    borderColor: 'rgba(184,106,74,0.3)',
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  dangerText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.clay },
  version: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 0.6,
    fontFamily: fonts.mono,
  },
});
