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
  Modal,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { confirmDialog, notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';
import { toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { MODULE_ROLE_LABELS } from '@/services/authApi';
import {
  acceptSupervisionRequest,
  cancelSupervisionRequest,
  createSupervisionRequest,
  declareMySupervisor,
  fetchSupervisionOverview,
  refuseSupervisionRequest,
  revokeSupervisionRequest,
  searchDesigneeCandidates,
  searchSupervisorCandidates,
  type DiscipleshipPerson,
  type SupervisionOverview,
  type SupervisionRequestView,
} from '@/services/leadersApi';

/**
 * Page 2 de la Hiérarchie, « Mon leadership » — D-HIE-01..07 (JP 28/10), GRATUITE. Remplace l'écran
 * `/superviseur` (supprimé). Axe : la CHAÎNE de supervision (`supervisor_id`), jamais la géographie.
 *
 * Sections :
 *  - Mon superviseur : déclaration MONTANTE inchangée et immédiate (`PUT /me/supervisor`, D-HIE-04,
 *    RG-HIE-21) — reprise de l'ancien `app/superviseur.tsx` (recherche + invitation) ;
 *  - Demandes reçues (`incoming`) : Valider / Refuser ; valider REMPLACE le superviseur actuel
 *    (D-HIE-03) → confirmation explicite si j'en ai un autre (RG-HIE-28) ;
 *  - Les dirigeants que je suis : liens réels (`followed`, P-HIE-b), puis demandes envoyées en
 *    attente (`outgoing`, Annuler — D-HIE-07), bouton « Désigner un dirigeant » (D-HIE-02 : une
 *    DEMANDE, le lien n'existe qu'après validation par le désigné) ;
 *  - Qui me suit (`followedBy`, P-HIE-c) : Retirer à tout moment (D-HIE-04).
 * Compte non éligible (`!canDesignate`, P-HIE-a) : « Mon superviseur » seule, en lecture.
 * Chaque mutation renvoie l'aperçu à jour : on l'affiche tel quel, sans recalcul.
 */

const errCode = (err: any): string | null => err?.response?.data?.error ?? null;

/** Ligne d'identification : assemblée, ville, email — de quoi départager deux homonymes. */
const personLine = (p: DiscipleshipPerson) => [p.unitName, p.cityName, p.email].filter(Boolean).join(' · ');

const roleOf = (p: DiscipleshipPerson) => {
  const role = p.goalRole ?? p.donationRole;
  return role ? MODULE_ROLE_LABELS[role] : null;
};

export default function MyLeadershipScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const tl = (k: string, o?: Record<string, unknown>) => t(`hierarchy.leadership.${k}`, o);

  const [data, setData] = useState<SupervisionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Déclaration montante (« Mon superviseur ») : recherche en ligne, comme l'ancien écran.
  const [supSearchOpen, setSupSearchOpen] = useState(false);
  // Désignation descendante : recherche dans une feuille.
  const [designOpen, setDesignOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchSupervisionOverview());
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Message d'un refus serveur : code traduit, sinon message générique traduit — R7 (§8, RG-HIE-32,
   * JP 29/10) : plus jamais le texte brut du serveur (code inconnu, 403 sans code…).
   */
  const errorText = useCallback(
    (e: any, prefix = 'hierarchy.leadership.errors') => {
      const key = `${prefix}.${errCode(e)}`;
      const translated = t(key);
      return translated !== key ? translated : t('hierarchy.leadership.errors.generic');
    },
    [t],
  );

  const run = async (id: string, action: () => Promise<SupervisionOverview>, done?: string) => {
    if (busy) return;
    setBusy(id);
    try {
      setData(await action());
      if (done) notify(t('common.appName'), done);
    } catch (e: any) {
      notify(tl('actionFailed'), errorText(e));
      // La demande a pu changer d'état ailleurs (NOT_PENDING…) : on relit l'aperçu.
      void load();
    } finally {
      setBusy(null);
    }
  };

  const accept = async (r: SupervisionRequestView) => {
    const current = data?.supervisor ?? null;
    // RG-HIE-28 : valider REMPLACE mon superviseur actuel — confirmation explicite.
    const replacing = current != null && current.id !== r.requester.id;
    const ok = await confirmDialog(
      replacing ? tl('acceptReplaceTitle') : tl('acceptTitle'),
      replacing
        ? tl('acceptReplace', { name: current!.fullName })
        : tl('acceptConfirm', { name: r.requester.fullName }),
      tl('accept'),
    );
    if (!ok) return;
    await run(r.id, () => acceptSupervisionRequest(r.id), tl('accepted', { name: r.requester.fullName }));
  };

  const refuse = async (r: SupervisionRequestView) => {
    const ok = await confirmDialog(tl('refuseTitle'), tl('refuseConfirm', { name: r.requester.fullName }), tl('refuse'), true);
    if (!ok) return;
    await run(r.id, () => refuseSupervisionRequest(r.id), tl('refused'));
  };

  const cancel = async (r: SupervisionRequestView) => {
    const ok = await confirmDialog(tl('cancelTitle'), tl('cancelConfirm', { name: r.designee.fullName }), tl('cancel'), true);
    if (!ok) return;
    await run(r.id, () => cancelSupervisionRequest(r.id), tl('canceled'));
  };

  const revoke = async (r: SupervisionRequestView) => {
    const ok = await confirmDialog(tl('revokeTitle'), tl('revokeConfirm', { name: r.requester.fullName }), tl('revoke'), true);
    if (!ok) return;
    await run(r.id, () => revokeSupervisionRequest(r.id), tl('revoked'));
  };

  const designate = async (p: DiscipleshipPerson) => {
    const ok = await confirmDialog(tl('designateTitle'), tl('designateConfirm', { name: p.fullName }), tl('send'));
    if (!ok) return;
    setDesignOpen(false);
    await run(`designate-${p.id}`, () => createSupervisionRequest(p.id), tl('sent', { name: p.fullName }));
  };

  const declareSupervisor = async (p: DiscipleshipPerson) => {
    if (busy) return;
    setBusy('declare');
    try {
      await declareMySupervisor(p.id);
      setSupSearchOpen(false);
      // RG-HIE-17 : une désignation acceptée écartée passe REPLACED côté serveur — on relit l'aperçu.
      await load();
      notify(t('common.appName'), t('supervisor.declared'));
    } catch (e: any) {
      notify(t('supervisor.declareFailed'), errorText(e, 'supervisor.errors'));
    } finally {
      setBusy(null);
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
  const canDesignate = !!data?.canDesignate;
  const day = (iso: string | null) => (iso ? fmtIsoDay(toLocalDate(new Date(iso)), t) : '');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell
        withTabBar={false}
        paddingTop={insets.top ? 4 : 16}
        refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.ink2} />
          </Pressable>
          <Text style={styles.title}>{tl('title')}</Text>
        </View>
        <Text style={styles.subtitle}>{tl('intro')}</Text>

        {error && <Text style={styles.empty}>{tl('loadError')}</Text>}

        {/* ---- Mon superviseur : déclaration montante INCHANGÉE (D-HIE-04, RG-HIE-21) ---- */}
        <Text style={styles.sectionTitle}>{t('supervisor.mine')}</Text>
        <Card style={styles.block}>
          {supervisor ? (
            <PersonLine person={supervisor} />
          ) : (
            <Text style={styles.none}>{t('supervisor.none')}</Text>
          )}
          {canDesignate && (
            <Button
              label={supervisor ? t('supervisor.change') : t('supervisor.declare')}
              variant={supervisor ? 'ghost' : 'primary'}
              onPress={() => setSupSearchOpen((v) => !v)}
              fullWidth
              height={46}
              style={{ marginTop: 14 }}
              iconLeft={
                <Ionicons
                  name={supervisor ? 'swap-horizontal-outline' : 'person-add-outline'}
                  size={17}
                  color={supervisor ? colors.ink2 : colors.white}
                />
              }
            />
          )}
        </Card>
        {canDesignate && supSearchOpen && (
          <Card variant="paper2" style={styles.block}>
            <PersonSearch
              label={t('supervisor.searchLabel')}
              placeholder={t('supervisor.searchPlaceholder')}
              hint={t('supervisor.searchHint')}
              tooShort={t('supervisor.searchTooShort')}
              noResult={t('supervisor.noResult')}
              search={searchSupervisorCandidates}
              searchErrorText={errorText}
              disabled={busy !== null}
              onPick={declareSupervisor}
            />
            <InviteBox />
          </Card>
        )}

        {!canDesignate && !error && <Text style={styles.hint}>{tl('readOnly')}</Text>}

        {canDesignate && (
          <>
            {/* ---- Demandes reçues (D-HIE-02 / D-HIE-03) ---- */}
            <Text style={styles.sectionTitle}>{tl('incomingTitle')}</Text>
            <Text style={styles.subtitle}>
              {supervisor ? tl('incomingHintReplace', { name: supervisor.fullName }) : tl('incomingHint')}
            </Text>
            <View style={styles.list}>
              {(data?.incoming ?? []).length === 0 ? (
                <Text style={styles.empty}>{tl('incomingEmpty')}</Text>
              ) : (
                data!.incoming.map((r) => (
                  <Card key={r.id} variant="paper2" style={styles.rowCard}>
                    <PersonLine person={r.requester} extra={tl('requestedOn', { date: day(r.createdAt) })} />
                    <View style={styles.actions}>
                      <Button
                        label={tl('refuse')}
                        variant="ghost"
                        height={40}
                        style={{ flex: 1 }}
                        disabled={busy !== null}
                        onPress={() => void refuse(r)}
                      />
                      <Button
                        label={tl('accept')}
                        height={40}
                        style={{ flex: 1 }}
                        loading={busy === r.id}
                        disabled={busy !== null && busy !== r.id}
                        onPress={() => void accept(r)}
                      />
                    </View>
                  </Card>
                ))
              )}
            </View>

            {/* ---- Les dirigeants que je suis (P-HIE-b) + demandes en attente (D-HIE-07) ---- */}
            <Text style={styles.sectionTitle}>{tl('followedTitle')}</Text>
            <Text style={styles.subtitle}>{tl('followedHint')}</Text>
            <View style={styles.list}>
              {(data?.followed ?? []).length === 0 && (data?.outgoing ?? []).length === 0 && (
                <Text style={styles.empty}>{tl('followedEmpty')}</Text>
              )}
              {(data?.followed ?? []).map((p) => (
                <Card key={p.id} variant="paper2" style={styles.rowCard}>
                  <PersonLine person={p} />
                </Card>
              ))}
              {(data?.outgoing ?? []).map((r) => (
                <Card key={r.id} variant="paper2" style={styles.rowCard}>
                  <PersonLine
                    person={r.designee}
                    pill={tl('pendingPill')}
                    extra={tl('sentOn', { date: day(r.createdAt) })}
                  />
                  <Button
                    label={tl('cancel')}
                    variant="ghost"
                    height={38}
                    style={{ marginTop: 10 }}
                    loading={busy === r.id}
                    disabled={busy !== null && busy !== r.id}
                    onPress={() => void cancel(r)}
                  />
                </Card>
              ))}
            </View>
            <Button
              label={tl('designate')}
              onPress={() => setDesignOpen(true)}
              fullWidth
              height={46}
              style={{ marginTop: 12 }}
              disabled={busy !== null}
              iconLeft={<Ionicons name="person-add-outline" size={17} color={colors.white} />}
            />
          </>
        )}

        {/* ---- Qui me suit (P-HIE-c) : Retirer à tout moment (D-HIE-04) ---- */}
        {(canDesignate || data?.followedBy) && (
          <>
            <Text style={styles.sectionTitle}>{tl('followedByTitle')}</Text>
            {data?.followedBy ? (
              <Card variant="paper2" style={[styles.rowCard, { marginTop: 10 }]}>
                <PersonLine
                  person={data.followedBy.requester}
                  extra={
                    data.followedBy.decidedAt
                      ? tl('followedSince', { date: day(data.followedBy.decidedAt) })
                      : undefined
                  }
                />
                <Button
                  label={tl('revoke')}
                  variant="danger"
                  height={38}
                  style={{ marginTop: 10 }}
                  loading={busy === data.followedBy.id}
                  disabled={busy !== null && busy !== data.followedBy.id}
                  onPress={() => void revoke(data.followedBy!)}
                />
              </Card>
            ) : (
              <Text style={styles.empty}>{tl('followedByEmpty')}</Text>
            )}
          </>
        )}
      </ScreenShell>

      {/* Feuille « Désigner un dirigeant » (D-HIE-02) — recherche RG-HIE-32. */}
      <Modal visible={designOpen} transparent animationType="slide" onRequestClose={() => setDesignOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setDesignOpen(false)} accessibilityLabel={t('common.cancel')} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{tl('designate')}</Text>
              <Pressable onPress={() => setDesignOpen(false)} hitSlop={10} accessibilityLabel={t('common.cancel')}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>{tl('designateHint')}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 10 }}>
              {designOpen && (
                <PersonSearch
                  label={tl('searchLabel')}
                  placeholder={t('supervisor.searchPlaceholder')}
                  hint={tl('searchHint')}
                  tooShort={t('supervisor.searchTooShort')}
                  noResult={tl('noResult')}
                  search={searchDesigneeCandidates}
                  searchErrorText={errorText}
                  disabled={busy !== null}
                  onPick={(p) => void designate(p)}
                />
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function PersonLine({ person, extra, pill }: { person: DiscipleshipPerson; extra?: string; pill?: string }) {
  const { t } = useLanguage();
  return (
    <View>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>{person.fullName}</Text>
        {!person.active && <Text style={styles.pill}>{t('membres.inactive')}</Text>}
        {!!pill && <Text style={[styles.pill, styles.pendingPill]}>{pill}</Text>}
      </View>
      <Text style={styles.meta} numberOfLines={2}>
        {[roleOf(person), personLine(person)].filter(Boolean).join(' · ')}
      </Text>
      {!!extra && <Text style={styles.meta}>{extra}</Text>}
    </View>
  );
}

/** Recherche différée (2 caractères min., anti-rebond 300 ms) d'un dirigeant du ministère. */
function PersonSearch({
  label,
  placeholder,
  hint,
  tooShort,
  noResult,
  search,
  disabled,
  onPick,
  searchErrorText,
}: {
  label: string;
  placeholder: string;
  hint: string;
  tooShort: string;
  noResult: string;
  search: (q: string) => Promise<DiscipleshipPerson[]>;
  disabled: boolean;
  onPick: (p: DiscipleshipPerson) => void;
  /** R7 : texte (traduit) d'un refus de la recherche. */
  searchErrorText: (e: unknown) => string;
}) {
  const [query, setQuery] = useState('');
  // R7 (RG-HIE-32, JP 29/10) : un refus (403, 422 NO_MINISTRY…) est une erreur, pas « Aucun résultat ».
  const [results, setResults] = useState<{ q: string; list: DiscipleshipPerson[]; error?: string } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const list = await search(q);
        if (!cancelled) setResults({ q, list });
      } catch (e: any) {
        if (!cancelled) setResults({ q, list: [], error: searchErrorText(e) });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, search, searchErrorText]);

  const current = q.length >= 2 && results?.q === q ? results.list : null;
  const searchError = q.length >= 2 && results?.q === q ? results.error ?? null : null;
  const searching = q.length >= 2 && current === null;

  return (
    <View>
      <Label style={{ marginBottom: 8 }}>{label}</Label>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />
      <Text style={styles.hint}>{q.length > 0 && q.length < 2 ? tooShort : hint}</Text>
      {searching && <ActivityIndicator color={colors.moss} style={{ marginTop: 12 }} />}
      {searchError ? (
        <Text style={[styles.empty, { color: colors.clay }]}>{searchError}</Text>
      ) : (
        current && current.length === 0 && <Text style={styles.empty}>{noResult}</Text>
      )}
      <View style={{ gap: 8, marginTop: 10 }}>
        {(current ?? []).map((p) => (
          <Pressable key={p.id} disabled={disabled} onPress={() => onPick(p)} style={styles.resultRow}>
            <Ionicons name="person-outline" size={16} color={colors.ink3} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{p.fullName}</Text>
              <Text style={styles.meta} numberOfLines={1}>{personLine(p)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Invitation à créer un compte (reprise de l'ancien écran « Mon superviseur »). */
function InviteBox() {
  const { t } = useLanguage();
  const shareInvitation = async () => {
    try {
      await Share.share({ message: t('supervisor.shareMessage') });
    } catch {
      // partage annulé — rien à signaler
    }
  };
  return (
    <>
      <View style={styles.noteBox}>
        <Ionicons name="information-circle-outline" size={16} color={colors.mossSoft} />
        <Text style={styles.noteText}>{t('supervisor.inviteHint')}</Text>
      </View>
      <Button
        label={t('supervisor.invite')}
        variant="ghost"
        onPress={shareInvitation}
        fullWidth
        height={46}
        style={{ marginTop: 10 }}
        iconLeft={<Ionicons name="share-outline" size={17} color={colors.ink2} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, flex: 1 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4, lineHeight: 18 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink, marginTop: 22 },
  block: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 16 },
  list: { gap: 8, marginTop: 10 },
  rowCard: { paddingHorizontal: 14, paddingVertical: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  none: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3 },
  hint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 8, lineHeight: 16 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(42,38,32,0.04)',
  },
  noteBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,47,0.06)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.mossDeep, lineHeight: 18 },
  pill: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  pendingPill: { color: colors.earthDeep, backgroundColor: 'rgba(201,149,107,0.22)', borderWidth: 0 },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 14 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(22,41,31,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink },
});
