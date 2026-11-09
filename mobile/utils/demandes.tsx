import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import { fonts, transparence } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { canManageUsers, isAssemblyLeaderOnly, isSecretariat } from '@/services/authApi';
import { confirmDialog, notify } from '@/utils/dialogs';
import {
  cancelStructureRequest, createStructureRequest, fetchRequestContext, listMyRequests,
  type CreateRequestChain, type RequestNodeOption, type StructureRequestContext,
  type StructureRequestResponse, type StructureRequestStatus,
} from '@/services/structureRequestsApi';
import {
  approveJoinRequest, cancelJoinRequest, fetchMyJoinRequests, fetchPendingJoinRequests,
  rejectJoinRequest, reviewableJoinRequests, type JoinRequestResponse,
} from '@/services/joinRequestsApi';

import { creerStyles } from '@/theme/creerStyles';
import { tonDonnee } from '@/theme/tonsDonnees';
import type { PaletteTheme } from '@/theme/palettes';
import { useTheme } from '@/contexts/ThemeContext';
/**
 * Demandes de structure (RDG 22/07, restreintes par le RDG 25/07) : une demande ne porte plus
 * que sur une ASSEMBLÉE rattachée à une ville EXISTANTE — nation, région et ville se créent
 * directement (SECRETARIAT in-app / back-office). Suivi + annulation ; le secrétariat valide
 * (web / back-office) ; les chaînes déposées avant le 25/07 restent affichées et décidables.
 */
export default function DemandesScreen() {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { me } = useAuth();
  const [requests, setRequests] = useState<StructureRequestResponse[]>([]);
  const [context, setContext] = useState<StructureRequestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  // Feature B — demandes de rattachement : les miennes (tout user) + file de validation.
  const [myJoin, setMyJoin] = useState<JoinRequestResponse[]>([]);
  const [pendingJoin, setPendingJoin] = useState<JoinRequestResponse[]>([]);
  const [rejectTarget, setRejectTarget] = useState<JoinRequestResponse | null>(null);

  // File de validation : dirigeants (≥ DIRIGEANT_UNITE), secrétariat, superAdmin uniquement.
  const canDecideJoin = canManageUsers(me) || isSecretariat(me);
  // Un dirigeant d'assemblée ne voit QUE les rattachements à son assemblée : tout le bloc
  // « demandes de structure » (dépôt + suivi) lui est masqué.
  const showStructure = !isAssemblyLeaderOnly(me);

  const load = useCallback(async () => {
    const [mine, ctx, myJ, pendJ] = await Promise.allSettled([
      showStructure ? listMyRequests() : Promise.resolve([] as StructureRequestResponse[]),
      showStructure
        ? fetchRequestContext()
        : Promise.resolve({ nations: [], regions: [], cities: [] } as StructureRequestContext),
      fetchMyJoinRequests(),
      // 403 silencieux pour les non-décideurs (règle serveur).
      canDecideJoin ? fetchPendingJoinRequests() : Promise.resolve([] as JoinRequestResponse[]),
    ]);
    if (mine.status === 'fulfilled') setRequests(mine.value);
    if (ctx.status === 'fulfilled') setContext(ctx.value);
    if (myJ.status === 'fulfilled') setMyJoin(myJ.value);
    // Un dirigeant d'assemblée ne décide que des rattachements à SON assemblée : les demandes
    // portant création d'une assemblée (même dans sa ville) restent au secrétariat.
    setPendingJoin(pendJ.status === 'fulfilled' ? reviewableJoinRequests(me, pendJ.value) : []);
    setLoading(false);
  }, [canDecideJoin, me, showStructure]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  // RDG 25/07 : on ne peut demander qu'une assemblée — il faut une ville existante où la rattacher.
  const canPropose = (context?.cities.length ?? 0) > 0;

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

  const onCancelJoin = async (r: JoinRequestResponse) => {
    const ok = await confirmDialog(
      t('requests.cancelTitle'),
      t('requests.cancelConfirm', { name: r.assemblyName ?? r.newAssemblyName ?? '' }),
      t('requests.cancelYes'), true);
    if (!ok) return;
    try {
      await cancelJoinRequest(r.id);
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('requests.cancelFailed'));
    }
  };

  const onApproveJoin = async (r: JoinRequestResponse) => {
    const body = t('requests.approveConfirm', {
      name: r.userName, role: t(`requests.joinRole.${r.requestedRole}`),
    });
    const ok = await confirmDialog(t('requests.approveTitle'), body, t('requests.approveJoin'));
    if (!ok) return;
    try {
      await approveJoinRequest(r.id);
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('requests.approveFailed'));
    }
  };

  const onRejectJoin = async (reason: string) => {
    if (!rejectTarget) return;
    try {
      await rejectJoinRequest(rejectTarget.id, reason);
      setRejectTarget(null);
      await load();
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('requests.rejectFailed'));
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={c.accent} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      paddingTop={insets.top ? 4 : 16}
      refreshControl={<RefreshControl tintColor={c.accent} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('requests.title')}</Text>
      </View>
      {showStructure && <Text style={styles.subtitle}>{t('requests.subtitle')}</Text>}

      {showStructure && canPropose && (
        <Button
          label={t('requests.newRequest')}
          onPress={() => setDepositOpen(true)}
          style={{ marginTop: 14 }}
          iconLeft={<Ionicons name="add" size={18} color={c.surAccent} />}
        />
      )}

      {showStructure && (
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
      )}

      {/* Feature B — demandes de rattachement à une assemblée. */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('requests.joinSection')}</Text>
      </View>

      <Text style={styles.groupLabel}>{t('requests.myJoinRequests')}</Text>
      <View style={{ gap: 8, marginTop: 8 }}>
        {myJoin.length === 0 && <Text style={styles.empty}>{t('requests.emptyMine')}</Text>}
        {myJoin.map((r) => (
          <JoinRequestRow key={r.id} request={r} onCancel={() => onCancelJoin(r)} />
        ))}
      </View>

      {canDecideJoin && (
        <>
          <Text style={styles.groupLabel}>{t('requests.pendingQueue')}</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {pendingJoin.length === 0 && (
              <Text style={styles.empty}>{t('requests.joinEmptyPending')}</Text>
            )}
            {pendingJoin.map((r) => (
              <JoinPendingCard
                key={r.id}
                request={r}
                onApprove={() => onApproveJoin(r)}
                onReject={() => setRejectTarget(r)}
              />
            ))}
          </View>
        </>
      )}

      <RejectJoinModal
        request={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={onRejectJoin}
      />

      {showStructure && context && (
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

/** Statuts d'une demande (D8) : ton ocre « en attente » passé par le thème, alerte rouge partout. */
const statusMeta = (c: PaletteTheme): Record<StructureRequestStatus, { color: string; icon: keyof typeof Ionicons.glyphMap }> => ({
  PENDING: { color: tonDonnee(OCRE_EN_ATTENTE), icon: 'time-outline' },
  APPROVED: { color: c.accent, icon: 'checkmark-circle-outline' },
  REJECTED: { color: c.alerte, icon: 'close-circle-outline' },
  CANCELLED: { color: c.texte3, icon: 'remove-circle-outline' },
});

const OCRE_EN_ATTENTE = '#A9812C';

function RequestRow({ request, onCancel }: { request: StructureRequestResponse; onCancel: () => void }) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  const meta = statusMeta(c)[request.status];
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
//  Feature B — demandes de RATTACHEMENT (mes demandes + file de validation des décideurs).
// ---------------------------------------------------------------------------------------------

function JoinRequestRow({
  request, onCancel,
}: {
  request: JoinRequestResponse;
  onCancel: () => void;
}) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  const meta = statusMeta(c)[request.status];
  const name = request.assemblyName ?? request.newAssemblyName ?? '—';
  return (
    <Card style={styles.itemCard}>
      <Ionicons name={meta.icon} size={20} color={meta.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.itemName} numberOfLines={1}>
          {name} · {t(`requests.joinRole.${request.requestedRole}`)}
        </Text>
        <Text style={styles.itemMeta} numberOfLines={2}>
          {request.cityName ? `${request.cityName} · ` : ''}
          <Text style={{ color: meta.color, fontWeight: '600' }}>
            {t(`requests.status.${request.status}`)}
          </Text>
          {request.status === 'REJECTED' && request.decisionReason ? ` — ${request.decisionReason}` : ''}
          {request.decidedByName ? ` — ${t('requests.decidedBy', { name: request.decidedByName })}` : ''}
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

function JoinPendingCard({
  request, onApprove, onReject,
}: {
  request: JoinRequestResponse;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  return (
    <Card style={styles.joinPendingCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="person-add-outline" size={20} color={c.accent} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.itemName} numberOfLines={1}>{request.userName}</Text>
          <Text style={styles.itemMeta} numberOfLines={2}>
            {request.assemblyName ?? request.newAssemblyName ?? '—'}
            {request.cityName ? ` · ${request.cityName}` : ''}
            {' · '}
            {t(`requests.joinRole.${request.requestedRole}`)}
          </Text>
          {request.newAssemblyName != null && (
            <Text style={styles.itemMeta}>
              {t('requests.newAssemblyInline', { name: request.newAssemblyName })}
            </Text>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Button label={t('requests.approveJoin')} height={42} onPress={onApprove} style={{ flex: 1 }} />
        <Button label={t('requests.rejectJoin')} variant="danger" height={42} onPress={onReject} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

/** Refus d'une demande de rattachement — motif OBLIGATOIRE (modal cross-platform). */
function RejectJoinModal({
  request, onClose, onSubmit,
}: {
  request: JoinRequestResponse | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (request) setReason('');
  }, [request]);

  const submit = async () => {
    if (reason.trim().length === 0) return;
    setSaving(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={request != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('requests.rejectTitle')}</Text>
          <Text style={styles.subtitle}>
            {request?.userName} · {request?.assemblyName ?? request?.newAssemblyName ?? ''}
          </Text>
          <Label style={{ marginTop: 14, marginBottom: 6 }}>{t('requests.rejectReasonLabel')}</Label>
          <TextInput
            value={reason}
            onChangeText={setReason}
            style={styles.input}
            placeholder={t('requests.rejectReasonPlaceholder')}
            placeholderTextColor={c.texte3}
            multiline
          />
          <Button
            label={t('requests.rejectJoin')}
            variant="danger"
            onPress={submit}
            loading={saving}
            disabled={reason.trim().length === 0}
            fullWidth
            style={{ marginTop: 16 }}
          />
          <Pressable onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
//  Dépôt (RDG 25/07) — une assemblée, rattachée à une ville EXISTANTE (recherche sans création).
// ---------------------------------------------------------------------------------------------

function DepositModal({
  open, context, onClose, onSubmitted,
}: {
  open: boolean;
  context: StructureRequestContext;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  const [city, setCity] = useState<RequestNodeOption | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCity(null);
      setName('');
    }
  }, [open, context]);

  const payload: CreateRequestChain | null = useMemo(() => {
    if (!city || name.trim().length === 0) return null;
    return { rootParentId: city.id, links: [{ type: 'ASSEMBLY', name: name.trim() }] };
  }, [city, name]);

  // Existant à afficher (RG-DS-06) : les assemblées de la ville choisie.
  const existingHint = city ? { parent: city.name, list: city.existing } : null;

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

            <SearchExisting
              label={t('requests.parentLabel.ASSEMBLY')}
              options={context.cities}
              pick={city}
              onChange={setCity}
            />

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
              placeholderTextColor={c.texte3}
            />

            <Text style={styles.existing}>{t('requests.cityMissingHint')}</Text>

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

/** Recherche dans les villes EXISTANTES — la création d'une ville est réservée au secrétariat. */
function SearchExisting({
  label, options, pick, onChange,
}: {
  label: string;
  options: RequestNodeOption[];
  pick: RequestNodeOption | null;
  onChange: (p: RequestNodeOption | null) => void;
}) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');

  useEffect(() => { if (pick === null) setQuery(''); }, [pick]);

  if (pick) {
    return (
      <>
        <Label style={{ marginTop: 14, marginBottom: 6 }}>{label}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={[styles.chip, styles.chipActive]}>
            <Text style={[styles.chipText, styles.chipTextActive]}>{pick.name}</Text>
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

  return (
    <>
      <Label style={{ marginTop: 14, marginBottom: 6 }}>{label}</Label>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={15} color={c.texte3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder={t('requests.searchPlaceholder')}
          placeholderTextColor={c.texte3}
          autoCapitalize="none"
        />
      </View>
      <View style={{ marginTop: 6 }}>
        {matches.slice(0, 6).map((o) => (
          <Pressable key={o.id} onPress={() => onChange(o)} style={styles.optionRow}>
            <Text style={styles.optionText}>{o.name}</Text>
          </Pressable>
        ))}
        {matches.length === 0 && (
          <Text style={styles.existing}>{t('requests.noOption')}</Text>
        )}
      </View>
    </>
  );
}

const useStyles = creerStyles((c) => ({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: c.texte, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: c.texte3, marginTop: 4, lineHeight: 18 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 26,
  },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 20, color: c.texte },
  groupLabel: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: c.texte3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
  },
  joinPendingCard: { paddingHorizontal: 14, paddingVertical: 12 },
  itemCard: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.texte },
  itemMeta: { fontFamily: fonts.sans, fontSize: 12, color: c.texte3, marginTop: 2, lineHeight: 17 },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: c.texte3, textAlign: 'center', paddingVertical: 20 },
  backdrop: { flex: 1, backgroundColor: c.voile, justifyContent: 'center', padding: 20 },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20, maxHeight: '88%' },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: c.texte },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: transparence(c.texte, 0.06) },
  chipActive: { backgroundColor: c.accent },
  chipCreate: { backgroundColor: transparence(tonDonnee(OCRE_EN_ATTENTE), 0.14) },
  chipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.texte2 },
  chipTextActive: { color: c.surAccent },
  chipTextCreate: { color: tonDonnee(OCRE_EN_ATTENTE) },
  existing: { fontFamily: fonts.sans, fontSize: 12, color: c.texte3, marginTop: 10, lineHeight: 17 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: transparence(c.texte, 0.15), borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: c.texte, padding: 0 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: transparence(c.texte, 0.06),
  },
  optionText: { fontFamily: fonts.sans, fontSize: 14, color: c.texte2 },
  input: {
    fontFamily: fonts.sans, fontSize: 15, color: c.texte,
    borderWidth: 1, borderColor: transparence(c.texte, 0.15), borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  cancelLink: { fontFamily: fonts.sans, fontSize: 13.5, color: c.texte3, fontWeight: '600' },
}));
