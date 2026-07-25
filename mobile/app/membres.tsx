import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { canManageUsers, MODULE_ROLE_LABELS, type ModuleRole } from '../services/authApi';
import { listUsers, listUnits, type AdminUserResponse, type UnitResponse } from '../services/adminApi';

/**
 * Membres (Lot S1 — 21/07) : annuaire du périmètre de la personne connectée. La liste est SCOPÉE
 * côté backend (sous-arbre superviseur + unités visibles) — un membre simple ne voit que lui-même,
 * un dirigeant voit son périmètre. Invitation réservée aux managers (canManageUsers).
 */
export default function MembresScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [pickingUnit, setPickingUnit] = useState(false);

  const canInvite = canManageUsers(me);

  const load = useCallback(async () => {
    const [u, un] = await Promise.allSettled([listUsers({ size: 200 }), listUnits()]);
    if (u.status === 'fulfilled') setUsers(u.value.content);
    if (un.status === 'fulfilled') setUnits(un.value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const unitName = useMemo(() => {
    const map = new Map(units.map((u) => [u.id, u.name]));
    return (u: AdminUserResponse) => {
      const id = u.goalUnitId ?? u.donationUnitId;
      return id ? map.get(id) ?? null : null;
    };
  }, [units]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.fullName.toLowerCase().includes(q) || (u.email ?? u.username ?? '').toLowerCase().includes(q))
      : users;
    return [...filtered].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, search]);

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      withTabBar={false}
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
        <Text style={styles.title}>{t('membres.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{t('membres.subtitle')}</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder={t('membres.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
        />
      </View>

      {canInvite && (
        <Button
          label={t('membres.invite')}
          variant="soft"
          onPress={() => setPickingUnit(true)}
          style={{ marginTop: 12 }}
          iconLeft={<Ionicons name="person-add-outline" size={17} color={colors.mossDeep} />}
        />
      )}

      <Text style={styles.count}>{t('membres.count', { count: rows.length })}</Text>

      <View style={{ gap: 8 }}>
        {rows.map((u) => {
          const role: ModuleRole | null = u.goalRole ?? u.donationRole;
          const unit = unitName(u);
          return (
            <Card key={u.id} style={styles.itemCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {u.fullName.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName} numberOfLines={1}>{u.fullName}</Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {u.superAdmin ? 'Super Admin' : role ? MODULE_ROLE_LABELS[role] : t('membres.roleMember')}
                  {unit ? ` · ${unit}` : ''}
                </Text>
              </View>
              {!u.active && <Text style={styles.inactivePill}>{t('membres.inactive')}</Text>}
            </Card>
          );
        })}
        {rows.length === 0 && <Text style={styles.empty}>{t('membres.empty')}</Text>}
      </View>

      <UnitPickerModal
        open={pickingUnit}
        units={units}
        onClose={() => setPickingUnit(false)}
        onPick={(u) => {
          setPickingUnit(false);
          router.push({ pathname: '/invite', params: { unitId: u.id, unitName: u.name } });
        }}
      />
    </ScreenShell>
  );
}

/** L'invitation rattache le membre à une assemblée : on la choisit avant d'ouvrir le formulaire. */
function UnitPickerModal({
  open, units, onClose, onPick,
}: {
  open: boolean;
  units: UnitResponse[];
  onClose: () => void;
  onPick: (u: UnitResponse) => void;
}) {
  const { t } = useLanguage();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('membres.pickUnitTitle')}</Text>
          <Text style={styles.subtitle}>{t('membres.pickUnitSub')}</Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            {units.map((u) => (
              <Card key={u.id} style={styles.itemCard} onPress={() => onPick(u)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemName}>{u.name}</Text>
                  {u.localityName != null && <Text style={styles.itemMeta}>{u.localityName}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
            ))}
            {units.length === 0 && <Text style={styles.empty}>{t('membres.pickUnitEmpty')}</Text>}
          </View>
          <Pressable onPress={onClose} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  count: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 14, marginBottom: 8 },
  itemCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.moss,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontFamily: fonts.serif, fontSize: 15 },
  itemName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  itemMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  inactivePill: {
    fontFamily: fonts.mono, fontSize: 9.5, color: colors.ink3, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)', borderWidth: 1, borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,41,31,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20, maxHeight: '80%' },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  cancelLink: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink3 },
});
