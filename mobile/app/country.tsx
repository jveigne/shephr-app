import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Field from '@/components/Field';
import Label from '@/components/Label';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { canChangeCountry } from '@/services/authApi';
import {
  countryErrorMessage,
  fetchPublicCountries,
  patchMyCountry,
  type PublicCountry,
} from '@/services/countriesApi';
import { readBrandingCache } from '@/theme/branding';
import { chooseDeviceCountry } from '@/utils/brandingSync';
import { goBack } from '@/utils/navigation';
import { notify } from '@/utils/dialogs';
import { isEnglishLang } from '@/utils/events';

/** Valeur de sélection « Autre pays » (Shephr standard, `deviceCountry: null`). */
const OTHER = '__other__';
const SEARCH_FROM = 8;

/**
 * RG-PAYS-01 (JP 11/11) — pays proposé = région du TÉLÉPHONE (`expo-localization`), jamais la géolocalisation.
 * Chargé à la demande : un binaire antérieur au lot sans le module natif ne plante pas (même prudence que
 * `ExpoCrypto` dans `services/eventQueue.ts`) — il n'y a alors simplement pas de proposition.
 */
function phoneRegion(): string | null {
  try {
    if (!requireOptionalNativeModule('ExpoLocalization')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Localization = require('expo-localization') as typeof import('expo-localization');
    const region = Localization.getLocales()[0]?.regionCode;
    return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * « Dans quel pays êtes-vous ? » — D-PAYS-01 / RG-PAYS-01..03 (JP 11/11, contrat 11/11 §5.5).
 *
 * <p>Premier lancement (`app/index`, non connecté et `!deviceCountryChosen`) et réglages (`?from=settings`). Liste
 * `GET /api/public/countries` (pays configurés en tête), pays du téléphone proposé, « Autre pays » = Shephr
 * standard. « Continuer » enregistre le choix sur l'appareil (RG-PAYS-02), lit la configuration du pays et
 * recharge l'app si le thème change (`utils/brandingSync`). Sans réseau : « Autre pays » seul + « Réessayer ».
 * Depuis les réglages, un compte connecté et non verrouillé (RG-PAYS-06) enregistre aussi le pays sur son compte
 * (`PATCH /me/country`). Un lien universel n'arrive jamais ici (RG-PAYS-03, `returnTarget` inchangé).
 */
export default function CountryScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const { t, language } = useLanguage();
  const english = isEnglishLang(language);
  const { isAuthenticated, me, refreshMe } = useAuth();

  const [countries, setCountries] = useState<PublicCountry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggested] = useState(phoneRegion);
  const [picked, setPicked] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Chargé à l'ouverture, puis à chaque « Réessayer » (`attempt`) ; l'état ne change qu'à la réponse.
    let live = true;
    const preferred = fromSettings ? (me?.countryIso ?? readBrandingCache().deviceCountry) : null;
    fetchPublicCountries()
      .then((list) => {
        if (!live) return;
        setCountries(list);
        setPicked((cur) => {
          if (cur) return cur;
          const pre = preferred ?? suggested;
          return pre && list.some((c) => c.code === pre) ? pre : null;
        });
      })
      .catch(() => {
        if (!live) return;
        setCountries(null);
        setFailed(true);
        setPicked((cur) => cur ?? OTHER);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // `me` n'est lu qu'à l'ouverture (pays proposé) : pas de rechargement quand le profil se relit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  const retry = () => {
    setLoading(true);
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  const nameOf = useCallback((c: PublicCountry) => (english && c.nameEn) || c.name, [english]);

  const shown = useMemo(() => {
    const list = countries ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((c) => nameOf(c).toLowerCase().includes(q) || c.code.toLowerCase() === q) : list;
    // Le pays proposé passe en tête (le serveur a déjà mis les pays configurés devant).
    const top = suggested ? filtered.filter((c) => c.code === suggested) : [];
    return [...top, ...filtered.filter((c) => c.code !== suggested)];
  }, [countries, query, suggested, nameOf]);

  const lockedAccount = fromSettings && isAuthenticated && !!me && !canChangeCountry(me);

  const submit = async () => {
    if (!picked || saving) return;
    const iso = picked === OTHER ? null : picked;
    setSaving(true);
    try {
      if (fromSettings && isAuthenticated && iso && canChangeCountry(me)) {
        try {
          await patchMyCountry(iso);
        } catch (e) {
          notify(t('country.title'), countryErrorMessage(e, t));
          return;
        }
      }
      const reloading = await chooseDeviceCountry(iso);
      if (reloading) return;
      if (fromSettings) {
        if (isAuthenticated) void refreshMe();
        goBack();
      } else {
        router.replace('/(auth)/login');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell withTabBar={false} paddingTop={24}>
      {fromSettings && (
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      )}
      <Text style={styles.title}>{t('country.title')}</Text>
      <Text style={styles.subtitle}>{t('country.subtitle')}</Text>

      {lockedAccount && (
        <Card variant="tinted" style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.moss} />
          <Text style={styles.lockedText}>{t('settings.country.lockedByAssembly')}</Text>
        </Card>
      )}

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : (
        <>
          {failed && <ErrorBanner message={t('country.loadFailed')} onRetry={retry} />}
          {(countries?.length ?? 0) >= SEARCH_FROM && (
            <View style={styles.search}>
              <Ionicons name="search" size={15} color={colors.ink3} />
              <Field
                value={query}
                onChangeText={setQuery}
                placeholder={t('country.search')}
                autoCapitalize="none"
                style={styles.searchField}
              />
            </View>
          )}
          <Card style={styles.list}>
            {shown.map((c) => (
              <CountryRow
                key={c.code}
                label={nameOf(c)}
                hint={c.code === suggested ? t('country.suggested') : null}
                selected={picked === c.code}
                onPress={() => setPicked(c.code)}
              />
            ))}
            <CountryRow
              label={t('country.other')}
              hint={t('country.otherHint')}
              selected={picked === OTHER}
              onPress={() => setPicked(OTHER)}
              last
            />
          </Card>
        </>
      )}

      <Label style={{ marginTop: 14 }}>{t('country.changeLater')}</Label>
      <Button
        label={t('country.continue')}
        onPress={() => void submit()}
        loading={saving}
        disabled={!picked || loading}
        fullWidth
        height={54}
        style={{ marginTop: 16 }}
        iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
      />
    </ScreenShell>
  );
}

function CountryRow({
  label,
  hint,
  selected,
  onPress,
  last,
}: {
  label: string;
  hint: string | null;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, !last && styles.rowBorder]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? colors.moss : colors.ink3}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: 6 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.mossDeep, letterSpacing: -0.4, marginTop: 8 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, marginTop: 6, lineHeight: 20 },
  locked: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 18 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.paper,
    marginTop: 18,
  },
  searchField: { flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 },
  list: { marginTop: 14, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hair },
  rowLabel: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.ink },
  rowHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
});
