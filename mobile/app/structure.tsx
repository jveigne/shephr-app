import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
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
import Label from '../components/Label';
import Button from '../components/Button';
import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { canManageStructure, canManageZones, isSecretariat } from '../services/authApi';
import { confirmDialog, notify } from '../utils/dialogs';
import i18n from '../utils/i18n/i18n';
import {
  createCountry, createLocality, createUnit, createZone,
  deleteCountry, deleteLocality, deleteUnit, deleteZone,
  listContinents, listCountries, listLocalities, listUnits, listZones,
  updateLocality, updateUnit, updateZone,
  type ContinentResponse, type CountryResponse, type LocalityResponse,
  type UnitResponse, type ZoneResponse,
} from '../services/adminApi';

type Level = 'countries' | 'zones' | 'localities' | 'units';

const errMsg = (e: any, fb: string) =>
  e?.response ? e.response.data?.message ?? fb : i18n.t('errors.serverUnreachableShort');

export default function StructureScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const { t } = useLanguage();
  const [level, setLevel] = useState<Level>('zones');
  const [countries, setCountries] = useState<CountryResponse[]>([]);
  const [zones, setZones] = useState<ZoneResponse[]>([]);
  const [localities, setLocalities] = useState<LocalityResponse[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ level: Level; item: any | null } | null>(null);

  const load = useCallback(async () => {
    const [c, z, l, u] = await Promise.allSettled([
      listCountries(), listZones(), listLocalities(), listUnits(),
    ]);
    if (c.status === 'fulfilled') setCountries(c.value);
    if (z.status === 'fulfilled') setZones(z.value);
    if (l.status === 'fulfilled') setLocalities(l.value);
    if (u.status === 'fulfilled') setUnits(u.value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const isAdmin = me?.superAdmin ?? false;
  // RDG 25/07 : la création ET la suppression directes de nation/région/ville sont réservées au
  // SUPER_ADMIN (back-office) et au SECRETARIAT. Les assemblées gardent leurs règles (création
  // directe SUPER_ADMIN ; les dirigeants déposent une DEMANDE — écran Demandes).
  const secretariat = isSecretariat(me);
  const canDirect = isAdmin || secretariat;
  const canEdit = level === 'countries' ? false
    : level === 'zones' ? canManageZones(me)
    : canManageStructure(me);
  const canAdd = level === 'units' ? isAdmin && canEdit : canDirect;
  // Suppression sans passer par la modale d'édition (pas de modification in-app pour les
  // nations ; le SECRETARIAT ne modifie pas les régions/villes).
  const canDeleteRow = level === 'countries' ? canDirect
    : level !== 'units' && secretariat && !canEdit;
  const canPropose = !isAdmin && canManageStructure(me);

  const onDelete = async (lvl: Level, id: string, name: string) => {
    const ok = await confirmDialog(t('structure.deleteTitle'), t('structure.deleteConfirm', { name }), t('common.delete'), true);
    if (!ok) return;
    try {
      if (lvl === 'countries') await deleteCountry(id);
      else if (lvl === 'zones') await deleteZone(id);
      else if (lvl === 'localities') await deleteLocality(id);
      else await deleteUnit(id);
      await load();
    } catch (e: any) {
      notify(t('structure.deleteFailedTitle'), errMsg(e, t('structure.deleteFailedBody')));
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

  const rows = level === 'countries' ? countries
    : level === 'zones' ? zones
    : level === 'localities' ? localities
    : units;
  // Le niveau Pays n'apparaît que pour ceux qui le gèrent (secrétariat / superAdmin).
  const levels: Level[] = canDirect
    ? ['countries', 'zones', 'localities', 'units']
    : ['zones', 'localities', 'units'];

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
        <Text style={styles.title}>{t('structure.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{t('structure.subtitle')}</Text>

      {/* Lot S1 (D4) : un non-manager voit d'abord SON rattachement — les listes ci-dessous
          restent scopées backend (souvent vides pour un membre simple). */}
      {!canManageStructure(me) && (
        <Card style={styles.attachCard}>
          <Text style={styles.attachTitle}>{t('structure.myAttachment')}</Text>
          {([
            [t('structure.units'), me?.unitNames],
            [t('structure.localities'), me?.cityNames],
            [t('structure.zones'), me?.zoneNames],
            [t('structure.countries'), me?.countryNames],
          ] as [string, string[] | null | undefined][])
            .filter(([, names]) => names && names.length > 0)
            .map(([label, names]) => (
              <View key={label} style={styles.attachRow}>
                <Text style={styles.attachLabel}>{label}</Text>
                <Text style={styles.attachNames}>{(names ?? []).join(', ')}</Text>
              </View>
            ))}
          {!(me?.unitNames?.length || me?.cityNames?.length || me?.zoneNames?.length || me?.countryNames?.length) && (
            <Text style={styles.empty}>{t('structure.attachEmpty')}</Text>
          )}
        </Card>
      )}

      <View style={styles.segmentRow}>
        {levels.map((lv) => (
          <Pressable key={lv} onPress={() => setLevel(lv)} style={[styles.segment, level === lv && styles.segmentActive]}>
            <Text style={[styles.segmentText, level === lv && styles.segmentTextActive]}>
              {lv === 'countries' ? t('structure.countriesTab') : lv === 'zones' ? t('structure.zones') : lv === 'localities' ? t('structure.localities') : t('structure.units')}
            </Text>
          </Pressable>
        ))}
      </View>

      {canAdd && (
        <Button
          label={level === 'countries' ? t('structure.addCountry') : level === 'zones' ? t('structure.addZone') : level === 'localities' ? t('structure.addLocality') : t('structure.addUnit')}
          variant="soft"
          onPress={() => setEditing({ level, item: null })}
          style={{ marginTop: 12 }}
          iconLeft={<Ionicons name="add" size={18} color={colors.mossDeep} />}
        />
      )}
      {canPropose && (
        <Button
          label={t('structure.requestCreate')}
          variant="soft"
          onPress={() => router.push('/demandes')}
          style={{ marginTop: 12 }}
          iconLeft={<Ionicons name="add" size={18} color={colors.mossDeep} />}
        />
      )}

      <View style={{ gap: 8, marginTop: 12 }}>
        {rows.map((r: any) => (
          <Card key={r.id} style={styles.itemCard} onPress={canEdit ? () => setEditing({ level, item: r }) : undefined}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.itemName}>{r.name}</Text>
              <Text style={styles.itemMeta}>
                {level === 'countries' && (r.code ?? '')}
                {level === 'zones' && (r.countryName ?? '')}
                {level === 'localities' && (r.zoneName ?? t('structure.noZone'))}
                {level === 'units' && t('structure.unitMeta', { locality: r.localityName, code: r.joinCode })}
              </Text>
            </View>
            {canDeleteRow && (
              <Pressable onPress={() => onDelete(level, r.id, r.name)} hitSlop={8}>
                <Ionicons name="trash-outline" size={17} color={colors.clay} />
              </Pressable>
            )}
            {canEdit && <Ionicons name="chevron-forward" size={16} color={colors.ink3} />}
          </Card>
        ))}
        {/* Niveau Région gaté par rang (lecture admin dès SENIOR) : un dirigeant de ville a une
            liste vide — on affiche sa/ses région(s) de rattachement en LECTURE SEULE (info). */}
        {rows.length === 0 && level === 'zones' && (me?.zoneNames?.length ?? 0) > 0 ? (
          (me?.zoneNames ?? []).map((name) => (
            <Card key={name} style={styles.itemCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName}>{name}</Text>
                <Text style={styles.itemMeta}>{t('structure.attachedRegionReadOnly')}</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={14} color={colors.ink3} />
            </Card>
          ))
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>{t('structure.emptyPerimeter')}</Text>
        ) : null}
      </View>

      <StructureFormModal
        editing={editing?.level === 'countries' ? null : editing}
        countries={countries}
        zones={zones}
        localities={localities}
        ministryId={me?.ministryId ?? null}
        zoneOptional={isAdmin}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
        onDelete={onDelete}
      />

      <CountryFormModal
        open={editing?.level === 'countries'}
        ministryId={me?.ministryId ?? null}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
      />
    </ScreenShell>
  );
}

// RDG 25/07 — création d'une NATION in-app (secrétariat / superAdmin) : continent, nom, code
// ISO 2 lettres et devise ISO 3 lettres (mêmes contraintes que le back-office).
function CountryFormModal({
  open, ministryId, onClose, onSaved,
}: {
  open: boolean;
  ministryId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [continents, setContinents] = useState<ContinentResponse[]>([]);
  const [continentId, setContinentId] = useState('');
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState('');
  const [currency, setCurrency] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(''); setNameEn(''); setCode(''); setCurrency(''); setContinentId('');
      listContinents()
        .then((list) => { setContinents(list); setContinentId(list[0]?.id ?? ''); })
        .catch(() => setContinents([]));
    }
  }, [open]);

  const valid = ministryId != null && continentId !== ''
    && name.trim().length > 0
    && /^[A-Z]{2}$/.test(code.trim().toUpperCase())
    && /^[A-Z]{3}$/.test(currency.trim().toUpperCase());

  const onSave = async () => {
    if (!valid) { notify(t('common.appName'), t('structure.fillFields')); return; }
    setSaving(true);
    try {
      await createCountry({
        ministryId: ministryId!,
        continentId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        nameEn: nameEn.trim() || name.trim(),
        defaultCurrency: currency.trim().toUpperCase(),
      });
      await onSaved();
    } catch (e: any) {
      notify(t('structure.saveRefusedTitle'), errMsg(e, t('structure.saveRefusedBody')));
    } finally {
      setSaving(false);
    }
  };

  const isEn = i18n.language?.startsWith('en');

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{t('structure.modalAddCountry')}</Text>

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('structure.continent')}</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {continents.map((c) => (
                <Pressable key={c.id} onPress={() => setContinentId(c.id)} style={[styles.chip, continentId === c.id && styles.chipActive]}>
                  <Text style={[styles.chipText, continentId === c.id && styles.chipTextActive]}>
                    {isEn ? c.nameEn : c.name}
                  </Text>
                </Pressable>
              ))}
              {continents.length === 0 && <Text style={styles.empty}>{t('structure.noContinent')}</Text>}
            </ScrollView>

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('structure.countryName')}</Label>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder={t('structure.countryNamePlaceholder')} placeholderTextColor={colors.ink3} />

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('structure.countryNameEn')}</Label>
            <TextInput value={nameEn} onChangeText={setNameEn} style={styles.input} placeholder={t('structure.countryNameEnPlaceholder')} placeholderTextColor={colors.ink3} />

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('structure.countryCode')}</Label>
            <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} style={styles.input} placeholder="CM" autoCapitalize="characters" maxLength={2} placeholderTextColor={colors.ink3} />

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('structure.countryCurrency')}</Label>
            <TextInput value={currency} onChangeText={(v) => setCurrency(v.toUpperCase())} style={styles.input} placeholder="XAF" autoCapitalize="characters" maxLength={3} placeholderTextColor={colors.ink3} />

            <Button label={t('common.create')} onPress={onSave} loading={saving} fullWidth style={{ marginTop: 18 }} />
            <Pressable onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
            </Pressable>
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

function StructureFormModal({
  editing, countries, zones, localities, ministryId, zoneOptional, onClose, onSaved, onDelete,
}: {
  editing: { level: Level; item: any | null } | null;
  countries: CountryResponse[];
  zones: ZoneResponse[];
  localities: LocalityResponse[];
  ministryId: string | null;
  /** Ville sans région : réservé au SUPER_ADMIN (le SECRETARIAT doit rattacher — ZONE_REQUIRED). */
  zoneOptional: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete: (lvl: Level, id: string, name: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);
  const open = editing != null;
  const level = editing?.level ?? 'zones';
  const item = editing?.item ?? null;

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setParentId(
        level === 'zones' ? item?.countryId ?? ''
          : level === 'localities' ? item?.zoneId ?? ''
          : item?.localityId ?? '',
      );
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const parentLabel = level === 'zones' ? t('structure.parentCountry') : level === 'localities' ? t('structure.parentZone') : t('structure.parentLocality');
  const parents = level === 'zones'
    ? countries.map((c) => ({ id: c.id, name: c.name }))
    : level === 'localities'
    ? zones.map((z) => ({ id: z.id, name: z.name }))
    : localities.map((l) => ({ id: l.id, name: l.name }));

  const valid = name.trim().length > 0
    && (level === 'localities' ? (zoneOptional || parentId !== '') : parentId !== '');

  const onSave = async () => {
    if (!valid) { notify(t('common.appName'), t('structure.fillFields')); return; }
    setSaving(true);
    try {
      if (level === 'zones') {
        if (item) await updateZone(item.id, { name: name.trim() });
        else await createZone({ countryId: parentId, name: name.trim() });
      } else if (level === 'localities') {
        // Chantier B : la Ville se rattache à sa Région (les teams sont dissoutes).
        if (item) await updateLocality(item.id, { name: name.trim(), zoneId: parentId || undefined });
        else await createLocality({ ministryId: ministryId!, zoneId: parentId || undefined, name: name.trim() });
      } else {
        // Décision #5 : plus de type CENTER — toute unité est une assemblée de maison.
        if (item) await updateUnit(item.id, { name: name.trim(), localityId: parentId, type: 'ASSEMBLY' });
        else await createUnit({ ministryId: ministryId!, localityId: parentId, name: name.trim(), type: 'ASSEMBLY' });
      }
      await onSaved();
    } catch (e: any) {
      notify(t('structure.saveRefusedTitle'), errMsg(e, t('structure.saveRefusedBody')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {item ? (level === 'zones' ? t('structure.modalEditZone') : level === 'localities' ? t('structure.modalEditLocality') : t('structure.modalEditUnit')) : (level === 'zones' ? t('structure.modalAddZone') : level === 'localities' ? t('structure.modalAddLocality') : t('structure.modalAddUnit'))}
          </Text>

          <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('structure.name')}</Label>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder={t('structure.namePlaceholder')} placeholderTextColor={colors.ink3} />

          <Label style={{ marginTop: 14, marginBottom: 6 }}>
            {parentLabel}{level === 'localities' && zoneOptional ? t('structure.optional') : ''}
          </Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {parents.map((p) => (
              <Pressable key={p.id} onPress={() => setParentId(p.id)} style={[styles.chip, parentId === p.id && styles.chipActive]}>
                <Text style={[styles.chipText, parentId === p.id && styles.chipTextActive]}>{p.name}</Text>
              </Pressable>
            ))}
            {parents.length === 0 && <Text style={styles.empty}>{t('structure.noParent', { parent: parentLabel.toLowerCase() })}</Text>}
          </ScrollView>

          <Button label={item ? t('common.save') : t('common.create')} onPress={onSave} loading={saving} fullWidth style={{ marginTop: 18 }} />
          {item && (
            <Pressable onPress={() => { onClose(); onDelete(level, item.id, item.name); }} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={styles.deleteLink}>{t('common.delete')}</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  attachCard: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 14 },
  attachTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink, marginBottom: 6 },
  attachRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  attachLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, width: 90 },
  attachNames: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 99, backgroundColor: 'rgba(42,38,32,0.06)', alignItems: 'center' },
  segmentActive: { backgroundColor: colors.moss },
  segmentText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segmentTextActive: { color: colors.white },
  itemCard: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  itemMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, fontStyle: 'italic', marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,41,31,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20 },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  input: {
    fontFamily: fonts.sans, fontSize: 15, color: colors.ink,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, backgroundColor: 'rgba(42,38,32,0.06)' },
  chipActive: { backgroundColor: colors.moss },
  chipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  chipTextActive: { color: colors.white },
  deleteLink: { fontFamily: fonts.sans, fontSize: 14, color: colors.clay, fontWeight: '600' },
  cancelLink: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink3 },
});
