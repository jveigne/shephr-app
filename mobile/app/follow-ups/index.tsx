import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Chip from '@/components/Chip';
import Field from '@/components/Field';
import ErrorBanner from '@/components/ErrorBanner';
import SelectField, { type SelectOption } from '@/components/SelectField';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  FOLLOW_UP_STATUSES,
  getFollowUpScope,
  listFollowUps,
  type FollowUpScope,
  type FollowUpStatus,
  type FollowUpSummary,
} from '@/services/followUpsApi';
import { countryErrorMessage } from '@/services/countriesApi';
import { goBack } from '@/utils/navigation';
import { fmtIsoDay } from '@/utils/meetingReport';

const ALL_CITIES = '__all__';
const NO_CITY = '__none__';

/**
 * « Personnes à suivre » — D-PAYS-13 / RG-PAYS-30..33 (JP 11/11, contrat 11/11 §9).
 *
 * <p>Comptes SANS assemblée ayant consenti, suivis par la GÉOGRAPHIE (dirigeants de la ville / région / nation,
 * SECRETARIAT ; superAdmin en lecture) — jamais par la chaîne, et séparés de Member Care. Atteint par la tuile de
 * l'accueil (`GET /follow-ups/scope` › `canView`). Liste filtrée PAR LE SERVEUR (jamais de 403 sur la liste) :
 * statut (défaut : à contacter + contactée), ville, « inscrits non venus », « nouveaux ce mois », recherche.
 * Pas de react-query : useState + useFocusEffect.
 */
export default function FollowUpsScreen() {
  const { t } = useLanguage();
  const [scope, setScope] = useState<FollowUpScope | null>(null);
  const [status, setStatus] = useState<FollowUpStatus | null>(null);
  const [city, setCity] = useState<string>(ALL_CITIES);
  const [noShow, setNoShow] = useState(false);
  const [newThisMonth, setNewThisMonth] = useState(false);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FollowUpSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getFollowUpScope().then(setScope, () => setScope({ canView: false, canEdit: false, localities: [] }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      const list = await listFollowUps({
        status: status ?? undefined,
        localityId: city !== ALL_CITIES && city !== NO_CITY ? city : undefined,
        withoutCity: city === NO_CITY,
        noShow,
        newThisMonth,
        q,
      });
      setItems(list);
      setError(null);
    } catch (e) {
      setError(countryErrorMessage(e, t));
    }
  }, [status, city, noShow, newThisMonth, q, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const cityOptions: SelectOption[] = useMemo(
    () => [
      { id: ALL_CITIES, name: t('followUps.filters.allCities') },
      ...(scope?.localities ?? []),
      { id: NO_CITY, name: t('followUps.filters.withoutCity') },
    ],
    [scope, t],
  );

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
      <Text style={styles.title}>{t('followUps.title')}</Text>
      <Text style={styles.subtitle}>{t('followUps.subtitle')}</Text>

      <View style={styles.chips}>
        <Chip label={t('followUps.filters.toFollow')} selected={status == null} onPress={() => setStatus(null)} />
        {FOLLOW_UP_STATUSES.map((s) => (
          <Chip key={s} label={t(`followUps.status.${s}`)} selected={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>
      <View style={styles.chips}>
        <Chip label={t('followUps.filters.noShow')} selected={noShow} onPress={() => setNoShow((v) => !v)} />
        <Chip
          label={t('followUps.filters.newThisMonth')}
          selected={newThisMonth}
          onPress={() => setNewThisMonth((v) => !v)}
        />
      </View>
      {(scope?.localities.length ?? 0) > 0 && (
        <SelectField
          label={t('followUps.filters.city')}
          options={cityOptions}
          pick={cityOptions.find((o) => o.id === city) ?? null}
          onChange={(o) => setCity(o.id)}
        />
      )}
      <View style={styles.search}>
        <Ionicons name="search" size={15} color={colors.ink3} />
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={t('followUps.filters.search')}
          autoCapitalize="none"
          style={styles.searchField}
        />
      </View>

      {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {items == null && !error ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : items != null && items.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="people-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('followUps.empty')}</Text>
        </Card>
      ) : (
        (items ?? []).map((p) => (
          <Card
            key={p.userId}
            onPress={() => router.push({ pathname: '/follow-ups/[userId]', params: { userId: p.userId } } as never)}
            style={styles.row}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{p.fullName}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[t(`followUps.status.${p.status}`), p.cityName ?? t('followUps.noCity')].join(' · ')}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {t('followUps.counts', {
                  registered: p.registrationCount,
                  attended: p.attendedCount,
                  noShow: p.noShowCount,
                })}
                {p.nextEventDate ? ` · ${t('followUps.next', { date: fmtIsoDay(p.nextEventDate, t) })}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </Card>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 8 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.paper,
    marginTop: 14,
  },
  searchField: { flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 },
  row: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  empty: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
