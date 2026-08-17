import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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
import {
  listCountries, listLocalities, listZones,
  type CountrySummary, type LocalitySummary, type ZoneSummary,
} from '../../../services/orgApi';
import { contactMailto, useContactSettings } from '../../../services/contactApi';
import SelectField from '../../../components/SelectField';

/** Région « fictive » pour les villes sans région — voir le `NO_ZONE` de `app/structure.tsx`. */
const NO_ZONE = '__no_zone__';

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
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [cities, setCities] = useState<LocalitySummary[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  // Cascade Nation → Région → Ville (JP 16/08) : la liste à plat des villes du ministère devenait
  // illisible (des centaines d'entrées, homonymes d'une nation à l'autre). Seule la VILLE ouvre
  // la liste des assemblées ; nation et région ne servent qu'à la trouver.
  const [countryId, setCountryId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listCountries(), listZones(), listLocalities(), listUnits()])
      .then(([n, z, c, u]) => {
        if (cancelled) return;
        const nations = n.status === 'fulfilled' ? n.value : [];
        const regions = z.status === 'fulfilled' ? z.value : [];
        const villes = c.status === 'fulfilled' ? c.value : [];
        const assemblees = u.status === 'fulfilled' ? u.value : [];
        setCountries(nations); setZones(regions); setCities(villes); setUnits(assemblees);
        // On ouvre la cascade SUR L'ASSEMBLÉE ACTUELLE : le cas courant est de rejoindre une
        // autre assemblée de la même ville. À défaut, on présélectionne les niveaux à choix
        // unique (ministère mono-nation).
        const current = assemblees.find((a) => a.id === me?.goalUnitId);
        const city = current ? villes.find((v) => v.id === current.localityId) : undefined;
        const zone = city?.zoneId ? regions.find((r) => r.id === city.zoneId) : undefined;
        const nationId = zone?.countryId ?? (nations.length === 1 ? nations[0].id : '');
        setCountryId(nationId);
        setZoneId(zone?.id ?? (city && !city.zoneId ? NO_ZONE : ''));
        if (city) setCityId(city.id);
        else if (nationId && !zone) {
          const zs = regions.filter((r) => r.countryId === nationId);
          if (zs.length === 1) setZoneId(zs[0].id);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneOptions = useMemo(() => {
    const list = zones.filter((z) => z.countryId === countryId);
    // Échappatoire pour les villes sans région, sinon injoignables depuis la cascade.
    return cities.some((c) => !c.zoneId)
      ? [...list, { id: NO_ZONE, countryId, countryName: '', name: t('structure.noZone') }]
      : list;
  }, [zones, cities, countryId, t]);

  const cityOptions = useMemo(
    () => cities.filter((c) => (zoneId === NO_ZONE ? !c.zoneId : c.zoneId === zoneId)),
    [cities, zoneId],
  );

  const cityUnits = useMemo(
    () => (cityId ? units.filter((u) => u.localityId === cityId) : []),
    [units, cityId],
  );

  const pickCountry = (id: string) => {
    setCountryId(id);
    // Changer de nation invalide la région ET la ville déjà choisies.
    const zs = zones.filter((z) => z.countryId === id);
    setZoneId(zs.length === 1 ? zs[0].id : '');
    setCityId(null);
  };

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
      ) : (
        <>
          {/* Où chercher : nation → région → ville. Chaque niveau ouvre une liste cherchable
              (SelectField) et reste désactivé tant que celui du dessus n'est pas choisi —
              même cascade que l'écran « Rejoindre une assemblée ». */}
          <View style={{ marginTop: 16 }}>
            <SelectField
              label={t('join.pickNation')}
              options={countries}
              pick={countries.find((c) => c.id === countryId) ?? null}
              onChange={(c) => pickCountry(c.id)}
            />
            <SelectField
              label={t('join.pickRegion')}
              options={zoneOptions}
              pick={zoneOptions.find((z) => z.id === zoneId) ?? null}
              onChange={(z) => { setZoneId(z.id); setCityId(null); }}
              disabled={countryId === ''}
            />
            <SelectField
              label={t('join.pickCity')}
              options={cityOptions}
              pick={cityOptions.find((c) => c.id === cityId) ?? null}
              onChange={(c) => setCityId(c.id)}
              disabled={zoneId === ''}
            />
            {zoneId !== '' && cityOptions.length === 0 && (
              <Text style={styles.empty}>{t('assembly.noCity')}</Text>
            )}
          </View>

          {cityId != null && (
            <>
              <Label style={{ marginTop: 22, marginBottom: 8 }}>{t('assembly.pickAssembly')}</Label>
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
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.mossSoft, marginTop: 2 },
  empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, fontStyle: 'italic', marginTop: 12 },
  contactBlock: { marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.hair },
  contactHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
});
