import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../components/ScreenShell';
import Card from '../components/Card';
import Label from '../components/Label';
import Field from '../components/Field';
import Button from '../components/Button';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { notify } from '../utils/dialogs';
import { MODULE_ROLE_LABELS } from '../services/authApi';
import {
  declareMySupervisor,
  fetchMyDiscipleship,
  searchSupervisorCandidates,
  type DiscipleshipPerson,
  type MyDiscipleshipResponse,
} from '../services/leadersApi';

/**
 * Faiseur de disciple (28/07) : chacun — du simple fidèle au coordinateur — déclare QUI
 * l'accompagne. On ne déclare jamais ses disciples : ils apparaissent ici parce qu'ils nous
 * ont déclaré. La recherche est scopée au ministère côté backend.
 */

const errCode = (err: any): string | null => err?.response?.data?.error ?? null;

/** Ligne d'identification : assemblée, ville, email — de quoi départager deux homonymes. */
const personLine = (p: DiscipleshipPerson) =>
  [p.unitName, p.cityName, p.email].filter(Boolean).join(' · ');

export default function FaiseurDeDiscipleScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [data, setData] = useState<MyDiscipleshipResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscipleshipPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchMyDiscipleship());
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recherche différée : on ne sollicite le serveur qu'à la pause de frappe, dès 2 caractères.
  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchSupervisorCandidates(q);
        if (!cancelled) setResults(res);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, searchOpen]);

  const declare = async (person: DiscipleshipPerson) => {
    setSaving(true);
    try {
      setData(await declareMySupervisor(person.id));
      setSearchOpen(false);
      setQuery('');
      notify(t('common.appName'), t('supervisor.declared'));
    } catch (e: any) {
      // Un code métier inconnu du dictionnaire retomberait sur la clé brute : on garde alors
      // le message du serveur, déjà rédigé en clair.
      const key = `supervisor.errors.${errCode(e)}`;
      const translated = t(key);
      notify(
        t('supervisor.declareFailed'),
        translated !== key ? translated : (e?.response?.data?.message ?? t('errors.saveFailed')),
      );
    } finally {
      setSaving(false);
    }
  };

  const shareInvitation = async () => {
    try {
      await Share.share({ message: t('supervisor.shareMessage') });
    } catch {
      // partage annulé — rien à signaler
    }
  };

  if (loading) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  const supervisor = data?.supervisor ?? null;
  const disciples = data?.disciples ?? [];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.ink2} />
          </Pressable>
          <Text style={styles.title}>{t('supervisor.title')}</Text>
        </View>
        <Text style={styles.subtitle}>{t('supervisor.intro')}</Text>

        {error && <Text style={styles.empty}>{t('supervisor.loadError')}</Text>}

        <Card style={styles.block}>
          <Label style={{ color: colors.mossSoft }}>{t('supervisor.mine')}</Label>
          {supervisor ? (
            <View style={{ marginTop: 8 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{supervisor.fullName}</Text>
                {!supervisor.active && <Text style={styles.inactivePill}>{t('membres.inactive')}</Text>}
              </View>
              <Text style={styles.meta} numberOfLines={2}>
                {[
                  (supervisor.goalRole ?? supervisor.donationRole)
                    ? MODULE_ROLE_LABELS[(supervisor.goalRole ?? supervisor.donationRole)!]
                    : null,
                  personLine(supervisor),
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : (
            <Text style={styles.none}>{t('supervisor.none')}</Text>
          )}
          <Button
            label={supervisor ? t('supervisor.change') : t('supervisor.declare')}
            variant={supervisor ? 'ghost' : 'primary'}
            onPress={() => setSearchOpen((v) => !v)}
            fullWidth
            height={48}
            style={{ marginTop: 14 }}
            iconLeft={
              <Ionicons
                name={supervisor ? 'swap-horizontal-outline' : 'person-add-outline'}
                size={17}
                color={supervisor ? colors.ink2 : colors.white}
              />
            }
          />
        </Card>

        {searchOpen && (
          <Card variant="paper2" style={styles.block}>
            <Label style={{ marginBottom: 8 }}>{t('supervisor.searchLabel')}</Label>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder={t('supervisor.searchPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <Text style={styles.hint}>
              {query.trim().length > 0 && query.trim().length < 2
                ? t('supervisor.searchTooShort')
                : t('supervisor.searchHint')}
            </Text>

            {searching && <ActivityIndicator color={colors.moss} style={{ marginTop: 12 }} />}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <Text style={styles.empty}>{t('supervisor.noResult')}</Text>
            )}

            <View style={{ gap: 8, marginTop: 10 }}>
              {results.map((p) => (
                <Pressable
                  key={p.id}
                  disabled={saving}
                  onPress={() => declare(p)}
                  style={styles.resultRow}
                >
                  <Ionicons name="person-outline" size={16} color={colors.ink3} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{p.fullName}</Text>
                    <Text style={styles.meta} numberOfLines={1}>{personLine(p)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </Pressable>
              ))}
            </View>

            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.mossSoft} />
              <Text style={styles.noteText}>{t('supervisor.inviteHint')}</Text>
            </View>
            <Button
              label={t('supervisor.invite')}
              variant="ghost"
              onPress={shareInvitation}
              fullWidth
              height={48}
              style={{ marginTop: 10 }}
              iconLeft={<Ionicons name="share-outline" size={17} color={colors.ink2} />}
            />
          </Card>
        )}

        <Text style={styles.sectionTitle}>{t('supervisor.superviseesTitle')}</Text>
        <Text style={styles.subtitle}>{t('supervisor.superviseesHint')}</Text>
        <View style={{ gap: 8, marginTop: 10 }}>
          {disciples.length === 0 ? (
            <Text style={styles.empty}>{t('supervisor.noSupervisee')}</Text>
          ) : (
            disciples.map((p) => (
              <Card key={p.id} variant="paper2" style={styles.discipleCard}>
                <Ionicons name="person-outline" size={16} color={colors.earthDeep} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{p.fullName}</Text>
                    {!p.active && <Text style={styles.inactivePill}>{t('membres.inactive')}</Text>}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>{personLine(p)}</Text>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, flex: 1 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink, marginTop: 22 },
  block: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  none: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, marginTop: 8 },
  hint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 8 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: 'rgba(42,38,32,0.04)',
  },
  discipleCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteBox: {
    marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(30,58,47,0.06)',
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  noteText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.mossDeep, lineHeight: 18 },
  inactivePill: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.ink3, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)', borderWidth: 1, borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 16 },
});
