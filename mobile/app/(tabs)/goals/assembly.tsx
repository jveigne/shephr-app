import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Button from '../../../components/Button';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { confirmDialog, notify } from '../../../utils/dialogs';
import { changeMyAssembly } from '../../../services/unitApi';
import { listUnits, type UnitResponse } from '../../../services/adminApi';
import { listLocalities, type LocalitySummary } from '../../../services/orgApi';
import { contactMailto, useContactSettings } from '../../../services/contactApi';

/**
 * RG-BQ-13 (JP 16/08) — « Changer d'assemblée », en libre-service.
 *
 * <p>Personne ne valide : on choisit sa ville, puis son assemblée, et c'est fait. Les engagements
 * SUIVENT la personne — année courante comme années passées : le total de l'ancienne assemblée
 * baisse, celui de la nouvelle monte. C'est voulu, et c'est dit avant de confirmer.
 *
 * <p>Seule frontière : le ministère (422 `ASSEMBLY_MINISTRY_MISMATCH`). Déplacer QUELQU'UN D'AUTRE
 * reste un acte d'administration (RG-BQ-09, back-office / secrétariat) — pas ici.
 */
export default function ChangeAssemblyScreen() {
  const insets = useSafeAreaInsets();
  const { me, refreshMe } = useAuth();
  const { t } = useLanguage();
  const contact = useContactSettings();
  const [cities, setCities] = useState<LocalitySummary[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityId, setCityId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listLocalities(), listUnits()])
      .then(([c, u]) => {
        if (cancelled) return;
        if (c.status === 'fulfilled') setCities(c.value);
        if (u.status === 'fulfilled') setUnits(u.value);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visibleCities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter((c) => c.name.toLowerCase().includes(q));
  }, [cities, query]);

  const cityUnits = useMemo(
    () => (cityId ? units.filter((u) => u.localityId === cityId) : []),
    [units, cityId],
  );

  const onPick = async (unit: UnitResponse) => {
    if (unit.id === me?.goalUnitId) {
      notify(t('assembly.title'), t('assembly.alreadyThere'));
      return;
    }
    const ok = await confirmDialog(
      t('assembly.confirmTitle', { name: unit.name }),
      t('assembly.confirmBody'),
      t('assembly.confirmCta'),
      true,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await changeMyAssembly(unit.id);
      // `goalUnitId` ET `donationUnitId` changent côté serveur : on resynchronise le profil.
      await refreshMe();
      notify(t('assembly.doneTitle'), t('assembly.doneBody', { name: unit.name }));
      router.back();
    } catch (e: any) {
      const status = e?.response?.status;
      const code = e?.response?.data?.error;
      notify(
        t('assembly.refusedTitle'),
        code === 'ASSEMBLY_MINISTRY_MISMATCH'
          ? t('errors.goals.ASSEMBLY_MINISTRY_MISMATCH')
          : status === 404
            ? t('assembly.notFound')
            : e?.response?.data?.message ?? t('errors.tryAgain'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
        <Text style={styles.title}>{t('assembly.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{t('assembly.subtitle')}</Text>

      {me?.unitNames?.length ? (
        <Card variant="paper2" style={styles.currentCard}>
          <Ionicons name="home-outline" size={18} color={colors.mossSoft} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Label>{t('assembly.current')}</Label>
            <Text style={styles.currentName}>{me.unitNames[0]}</Text>
          </View>
        </Card>
      ) : null}

      <Card variant="tinted" style={styles.warnCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.moss} />
        <Text style={styles.warnText}>{t('assembly.pledgesFollow')}</Text>
      </Card>

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : cityId == null ? (
        <>
          <Label style={{ marginTop: 22, marginBottom: 8 }}>{t('assembly.pickCity')}</Label>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.ink3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder={t('assembly.searchCity')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
            />
          </View>
          <View style={{ gap: 8, marginTop: 12 }}>
            {visibleCities.map((c) => (
              <Card key={c.id} variant="paper2" style={styles.row} onPress={() => setCityId(c.id)}>
                <Text style={styles.rowName}>{c.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
            ))}
            {visibleCities.length === 0 && <Text style={styles.empty}>{t('assembly.noCity')}</Text>}
          </View>

          {/* La VILLE reste créée par le secrétariat (RG-BQ-12) : sans issue de secours, une
              personne dont la ville n'existe pas serait bloquée. */}
          <View style={styles.contactBlock}>
            <Text style={styles.contactHint}>{t('assembly.missingCityHint')}</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              <Button
                label={t('join.contactWhatsapp')}
                variant="soft"
                onPress={() => Linking.openURL(contact.whatsappUrl).catch(() => {})}
                iconLeft={<Ionicons name="logo-whatsapp" size={18} color={colors.mossDeep} />}
              />
              <Button
                label={t('join.contactMail')}
                variant="ghost"
                onPress={() =>
                  Linking.openURL(contactMailto(t('assembly.contactMailSubject'))).catch(() => {})
                }
                iconLeft={<Ionicons name="mail-outline" size={18} color={colors.mossDeep} />}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <Pressable onPress={() => setCityId(null)} hitSlop={6} style={{ marginTop: 18 }}>
            <Text style={styles.backLink}>{t('assembly.backToCities')}</Text>
          </Pressable>
          <Label style={{ marginTop: 12, marginBottom: 8 }}>{t('assembly.pickAssembly')}</Label>
          <View style={{ gap: 8 }}>
            {cityUnits.map((u) => (
              <Card
                key={u.id}
                variant="paper2"
                style={styles.row}
                onPress={saving ? undefined : () => onPick(u)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName}>{u.name}</Text>
                  {u.id === me?.goalUnitId && (
                    <Text style={styles.rowMeta}>{t('assembly.currentTag')}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
            ))}
            {cityUnits.length === 0 && <Text style={styles.empty}>{t('assembly.noAssembly')}</Text>}
          </View>
          {saving && <ActivityIndicator color={colors.moss} style={{ marginTop: 18 }} />}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  currentCard: {
    marginTop: 16, paddingHorizontal: 16, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  currentName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink, marginTop: 2 },
  warnCard: {
    marginTop: 12, paddingHorizontal: 16, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  warnText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.mossSoft, marginTop: 2 },
  backLink: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.moss },
  empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, fontStyle: 'italic', marginTop: 12 },
  contactBlock: { marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.hair },
  contactHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
});
