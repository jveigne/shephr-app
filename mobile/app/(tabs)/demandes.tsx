import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Label from '../../components/Label';
import Button from '../../components/Button';
import { colors, fonts } from '../../theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { confirmDialog, notify } from '../../utils/dialogs';
import {
  cancelStructureRequest, createStructureRequest, fetchRequestContext, listMyRequests,
  type CreateRequestChain, type RequestNodeOption, type StructureRequestContext,
  type StructureRequestResponse, type StructureRequestStatus, type StructureRequestType,
} from '../../services/structureRequestsApi';

/**
 * Demandes de structure v2 (RDG 22/07) : dépôt « chercher ou créer » — tout utilisateur peut
 * demander une région, ville ou assemblée (RG-DS-01 v2) ; un rattachement introuvable dans la
 * recherche devient un maillon de la chaîne (RG-DS-08). Suivi + annulation ; le secrétariat
 * valide (web / back-office) et sa décision cascade sur la chaîne.
 */
export default function DemandesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [requests, setRequests] = useState<StructureRequestResponse[]>([]);
  const [context, setContext] = useState<StructureRequestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const load = useCallback(async () => {
    const [mine, ctx] = await Promise.allSettled([listMyRequests(), fetchRequestContext()]);
    if (mine.status === 'fulfilled') setRequests(mine.value);
    if (ctx.status === 'fulfilled') setContext(ctx.value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const canPropose = (context?.nations.length ?? 0) > 0;

  const onCancel = async (r: StructureRequestResponse) => {
    const ok = await confirmDialog(
      t('requests.cancelTitle'), t('requests.cancelConfirm', { name: r.name }), t('requests.cancelYes'), true);
    if (!ok) return;
    try {
      await cancelStructureRequest(r.id);
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('requests.cancelFailed'));
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('requests.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{t('requests.subtitle')}</Text>

      {canPropose && (
        <Button
          label={t('requests.newRequest')}
          onPress={() => setDepositOpen(true)}
          style={{ marginTop: 14 }}
          iconLeft={<Ionicons name="add" size={18} color={colors.white} />}
        />
      )}

      <View style={{ gap: 8, marginTop: 16 }}>
        {requests.length === 0 && (
          <Text style={styles.empty}>
            {canPropose ? t('requests.emptyMine') : t('requests.notEligible')}
          </Text>
        )}
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} onCancel={() => onCancel(r)} />
        ))}
      </View>

      {context && (
        <DepositModal
          open={depositOpen}
          context={context}
          onClose={() => setDepositOpen(false)}
          onSubmitted={async () => { setDepositOpen(false); await load(); }}
        />
      )}
    </ScreenShell>
  );
}

const STATUS_META: Record<StructureRequestStatus, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  PENDING: { color: '#A9812C', icon: 'time-outline' },
  APPROVED: { color: colors.moss, icon: 'checkmark-circle-outline' },
  REJECTED: { color: colors.clay, icon: 'close-circle-outline' },
  CANCELLED: { color: colors.ink3, icon: 'remove-circle-outline' },
};

function RequestRow({ request, onCancel }: { request: StructureRequestResponse; onCancel: () => void }) {
  const { t } = useLanguage();
  const meta = STATUS_META[request.status];
  const parentLabel = request.parentName
    ? request.parentPending
      ? t('requests.parentPendingInline', { name: request.parentName })
      : request.parentName
    : '';
  return (
    <Card style={styles.itemCard}>
      <Ionicons name={meta.icon} size={20} color={meta.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.itemName} numberOfLines={1}>
          {t(`requests.types.${request.type}`)} · {request.name}
        </Text>
        <Text style={styles.itemMeta} numberOfLines={2}>
          {parentLabel ? `${parentLabel} · ` : ''}
          <Text style={{ color: meta.color, fontWeight: '600' }}>
            {t(`requests.status.${request.status}`)}
          </Text>
          {request.status === 'REJECTED' && request.decisionReason ? ` — ${request.decisionReason}` : ''}
          {request.status === 'APPROVED' && request.createdEntityId ? ` — ${t('requests.entityCreated')}` : ''}
        </Text>
      </View>
      {request.status === 'PENDING' && (
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancelLink}>{t('requests.cancel')}</Text>
        </Pressable>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
//  Dépôt « chercher ou créer » (RG-DS-08)
// ---------------------------------------------------------------------------------------------

type LevelPick = { kind: 'existing'; option: RequestNodeOption } | { kind: 'create'; name: string } | null;

function DepositModal({
  open, context, onClose, onSubmitted,
}: {
  open: boolean;
  context: StructureRequestContext;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [type, setType] = useState<StructureRequestType | ''>('');
  const [cityPick, setCityPick] = useState<LevelPick>(null);
  const [regionPick, setRegionPick] = useState<LevelPick>(null);
  const [nationId, setNationId] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType('');
      setCityPick(null);
      setRegionPick(null);
      setNationId(context.nations.length === 1 ? context.nations[0].id : '');
      setName('');
    }
  }, [open, context]);

  const needCity = type === 'ASSEMBLY';
  const needRegion = type === 'CITY' || (needCity && cityPick?.kind === 'create');
  const needNation = type === 'REGION' || (needRegion && regionPick?.kind === 'create');

  const regionsForNation = useMemo(
    () => (nationId ? context.regions.filter((r) => r.parentId === nationId) : context.regions),
    [context.regions, nationId],
  );
  const citiesForRegion = useMemo(
    () => (regionPick?.kind === 'existing'
      ? context.cities.filter((c) => c.parentId === regionPick.option.id)
      : context.cities),
    [context.cities, regionPick],
  );

  const payload: CreateRequestChain | null = useMemo(() => {
    if (type === '' || name.trim().length === 0) return null;
    const links: CreateRequestChain['links'] = [];
    let rootParentId: string | null = null;

    if (type === 'REGION') {
      if (!nationId) return null;
      rootParentId = nationId;
      links.push({ type: 'REGION', name: name.trim() });
    } else if (type === 'CITY') {
      if (regionPick?.kind === 'existing') {
        rootParentId = regionPick.option.id;
      } else if (regionPick?.kind === 'create') {
        if (!nationId) return null;
        rootParentId = nationId;
        links.push({ type: 'REGION', name: regionPick.name });
      } else return null;
      links.push({ type: 'CITY', name: name.trim() });
    } else {
      if (cityPick?.kind === 'existing') {
        rootParentId = cityPick.option.id;
      } else if (cityPick?.kind === 'create') {
        if (regionPick?.kind === 'existing') {
          rootParentId = regionPick.option.id;
        } else if (regionPick?.kind === 'create') {
          if (!nationId) return null;
          rootParentId = nationId;
          links.push({ type: 'REGION', name: regionPick.name });
        } else return null;
        links.push({ type: 'CITY', name: cityPick.name });
      } else return null;
      links.push({ type: 'ASSEMBLY', name: name.trim() });
    }
    return rootParentId ? { rootParentId, links } : null;
  }, [type, name, cityPick, regionPick, nationId]);

  const existingHint = useMemo(() => {
    if (type === 'REGION') {
      const nation = context.nations.find((n) => n.id === nationId);
      return nation ? { parent: nation.name, list: nation.existing } : null;
    }
    const direct = type === 'ASSEMBLY' ? cityPick : type === 'CITY' ? regionPick : null;
    if (direct?.kind === 'existing') {
      return { parent: direct.option.name, list: direct.option.existing };
    }
    return null;
  }, [type, cityPick, regionPick, nationId, context.nations]);

  const onSubmit = async () => {
    if (!payload) {
      notify(t('common.appName'), t('requests.fillFields'));
      return;
    }
    setSaving(true);
    try {
      await createStructureRequest(payload);
      notify(t('requests.createdTitle'), t('requests.createdBody'));
      await onSubmitted();
    } catch (e: any) {
      notify(t('requests.createRefused'), e?.response?.data?.message ?? t('requests.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{t('requests.newRequest')}</Text>
            <Text style={styles.subtitle}>{t('requests.newRequestSub')}</Text>

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('requests.typeLabel')}</Label>
            <View style={styles.chipRow}>
              {(['REGION', 'CITY', 'ASSEMBLY'] as StructureRequestType[]).map((tp) => (
                <Pressable
                  key={tp}
                  onPress={() => { setType(tp); setCityPick(null); setRegionPick(null); }}
                  style={[styles.chip, type === tp && styles.chipActive]}
                >
                  <Text style={[styles.chipText, type === tp && styles.chipTextActive]}>
                    {t(`requests.types.${tp}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {needCity && (
              <SearchOrCreate
                label={t('requests.parentLabel.ASSEMBLY')}
                options={citiesForRegion}
                pick={cityPick}
                onChange={(p) => { setCityPick(p); if (p?.kind !== 'create') setRegionPick(null); }}
              />
            )}

            {needRegion && (
              <SearchOrCreate
                label={t('requests.parentLabel.CITY')}
                options={regionsForNation}
                pick={regionPick}
                onChange={setRegionPick}
              />
            )}

            {needNation && (
              <>
                <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('requests.parentLabel.REGION')}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {context.nations.map((n) => (
                    <Pressable key={n.id} onPress={() => setNationId(n.id)}
                      style={[styles.chip, nationId === n.id && styles.chipActive]}>
                      <Text style={[styles.chipText, nationId === n.id && styles.chipTextActive]}>{n.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {existingHint && (
              <Text style={styles.existing}>
                {existingHint.list.length > 0
                  ? t('requests.existingList', { parent: existingHint.parent, list: existingHint.list.join(', ') })
                  : t('requests.existingNone', { parent: existingHint.parent })}
              </Text>
            )}

            <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('requests.nameLabel')}</Label>
            <TextInput
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder={t('requests.namePlaceholder')}
              placeholderTextColor={colors.ink3}
            />

            {payload && payload.links.length > 1 && (
              <Text style={styles.existing}>{t('requests.chainNote', { count: payload.links.length })}</Text>
            )}

            <Button label={t('requests.submit')} onPress={onSubmit} loading={saving} fullWidth style={{ marginTop: 18 }} />
            <Pressable onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
            </Pressable>
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

/** Recherche dans la liste du niveau ; introuvable → « Créer "…" » devient un maillon (RG-DS-08). */
function SearchOrCreate({
  label, options, pick, onChange,
}: {
  label: string;
  options: RequestNodeOption[];
  pick: LevelPick;
  onChange: (p: LevelPick) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');

  useEffect(() => { if (pick === null) setQuery(''); }, [pick]);

  if (pick) {
    return (
      <>
        <Label style={{ marginTop: 14, marginBottom: 6 }}>{label}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={[styles.chip, pick.kind === 'existing' ? styles.chipActive : styles.chipCreate]}>
            <Text style={[styles.chipText, pick.kind === 'existing' ? styles.chipTextActive : styles.chipTextCreate]}>
              {pick.kind === 'existing' ? pick.option.name : t('requests.toCreate', { name: pick.name })}
            </Text>
          </View>
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={styles.cancelLink}>{t('requests.changePick')}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  const exact = options.some((o) => o.name.toLowerCase() === q);

  return (
    <>
      <Label style={{ marginTop: 14, marginBottom: 6 }}>{label}</Label>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={15} color={colors.ink3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder={t('requests.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
        />
      </View>
      <View style={{ marginTop: 6 }}>
        {matches.slice(0, 6).map((o) => (
          <Pressable key={o.id} onPress={() => onChange({ kind: 'existing', option: o })} style={styles.optionRow}>
            <Text style={styles.optionText}>{o.name}</Text>
          </Pressable>
        ))}
        {q.length > 0 && !exact && (
          <Pressable onPress={() => onChange({ kind: 'create', name: query.trim() })} style={styles.optionRow}>
            <Ionicons name="add" size={15} color={colors.mossDeep} />
            <Text style={[styles.optionText, { color: colors.mossDeep, fontWeight: '600' }]}>
              {t('requests.createOption', { name: query.trim() })}
            </Text>
          </Pressable>
        )}
        {matches.length === 0 && q.length === 0 && (
          <Text style={styles.existing}>{t('requests.noOption')}</Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  itemCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.ink },
  itemMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2, lineHeight: 17 },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,41,31,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20, maxHeight: '88%' },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: 'rgba(42,38,32,0.06)' },
  chipActive: { backgroundColor: colors.moss },
  chipCreate: { backgroundColor: 'rgba(169,129,44,0.14)' },
  chipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  chipTextActive: { color: colors.white },
  chipTextCreate: { color: '#A9812C' },
  existing: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 10, lineHeight: 17 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink, padding: 0 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(42,38,32,0.06)',
  },
  optionText: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2 },
  input: {
    fontFamily: fonts.sans, fontSize: 15, color: colors.ink,
    borderWidth: 1, borderColor: 'rgba(42,38,32,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  cancelLink: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink3, fontWeight: '600' },
});
