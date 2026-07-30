import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../../components/Card';
import Field from '../../components/Field';
import Label from '../../components/Label';
import Button from '../../components/Button';
import Wordmark from '../../components/Wordmark';
import { colors, fonts } from '../../theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { confirmDialog, notify } from '../../utils/dialogs';
import { joinUnit } from '../../services/unitApi';
import {
  fetchRequestContext,
  type RequestNodeOption,
  type StructureRequestContext,
} from '../../services/structureRequestsApi';
import {
  cancelJoinRequest,
  createJoinRequest,
  fetchMyJoinRequests,
  searchAssemblies,
  type AssemblySearchResult,
  type JoinRequestResponse,
  type JoinRequestedRole,
} from '../../services/joinRequestsApi';

type Mode = 'search' | 'create' | 'code' | 'pending';

/**
 * Parcours « mon assemblée n'existe pas » (JP 30/07) : on qualifie D'ABORD le statut.
 *  • 'role' — deux boutons, et rien d'autre ;
 *  • 'stop' — cas MEMBRE : le parcours s'arrête ici, sans demande ni ticket ;
 *  • 'form' — cas DIRIGEANT confirmé : localisation + nom, puis création immédiate.
 */
type CreateStep = 'role' | 'stop' | 'form';

/** Miroirs des règles serveur (`AssemblyJoinRequestServiceImpl`). */
const MIN_QUERY_LENGTH = 2;

/** Contact JExcellence — même canal que la landing (JP 30/07). */
const CONTACT_EMAIL = 'jexcellence2065@gmail.com';
const CONTACT_WHATSAPP = 'https://wa.me/33754596796';
const RESULT_CAP = 50;

/**
 * Feature B — parcours de rattachement après inscription : trouver son assemblée de maison
 * (recherche ou drill nation→région→ville), choisir son rôle (dirigeant / fidèle), ou proposer
 * une nouvelle assemblée ; puis suivre sa demande en attente de validation.
 */
export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { refreshMe } = useAuth();

  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<Mode>('search');
  const [pending, setPending] = useState<JoinRequestResponse | null>(null);

  // Recherche par nom (debounce, min 2 caractères hors ville choisie).
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [results, setResults] = useState<AssemblySearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Drill nation → région → ville (context des demandes de structure).
  const [context, setContext] = useState<StructureRequestContext | null>(null);
  const [nation, setNation] = useState<RequestNodeOption | null>(null);
  const [region, setRegion] = useState<RequestNodeOption | null>(null);
  const [city, setCity] = useState<RequestNodeOption | null>(null);

  // Choix du rôle sur une assemblée existante.
  const [roleTarget, setRoleTarget] = useState<AssemblySearchResult | null>(null);

  // « Mon assemblée n'existe pas » : statut, puis ville + nom.
  const [createStep, setCreateStep] = useState<CreateStep>('role');
  const [newName, setNewName] = useState('');

  // « J'ai un code d'assemblée » (étape joinCode existante, accessible en lien secondaire).
  const [code, setCode] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const mine = await fetchMyJoinRequests();
        const p = mine.find((r) => r.status === 'PENDING') ?? null;
        if (p) {
          setPending(p);
          setMode('pending');
        }
      } catch {
        // Pas bloquant : on démarre sur la recherche.
      }
      // Le drill nation→région→ville est affiché EN LIGNE sous la recherche (parité web) :
      // son référentiel est donc chargé au démarrage, plus à l'entrée dans un mode dédié.
      try {
        setContext(await fetchRequestContext());
      } catch {
        setContext({ nations: [], regions: [], cities: [] });
      }
      setBooting(false);
    })();
  }, []);

  // Debounce commun aux deux voies (nom / ville).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const ensureContext = useCallback(async () => {
    if (context) return;
    try {
      setContext(await fetchRequestContext());
    } catch {
      setContext({ nations: [], regions: [], cities: [] });
    }
  }, [context]);

  /**
   * Une seule liste de résultats, alimentée par deux voies :
   *  • ville choisie → ses assemblées, ET le texte saisi FILTRE DEDANS (le serveur combine
   *    cityId + q, sans minimum de longueur) — indispensable au-delà de quelques dizaines,
   *    le serveur ne renvoyant que les 50 premières par ordre alphabétique ;
   *  • sinon → recherche par nom sur tout le ministère, à partir de 2 caractères
   *    (règle serveur QUERY_TOO_SHORT).
   */
  useEffect(() => {
    if (!city && debouncedQ.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchAssemblies(city ? { cityId: city.id, q: debouncedQ || undefined } : { q: debouncedQ })
      .then((r) => { if (!cancelled) setResults(r); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [city, debouncedQ]);

  const submitJoin = async (payload: {
    assemblyNodeId?: string;
    requestedRole: JoinRequestedRole;
    newAssembly?: { cityId: string; name: string };
  }) => {
    setSubmitting(true);
    try {
      const r = await createJoinRequest(payload);
      setRoleTarget(null);
      // Se déclarer dirigeant d'une assemblée EXISTANTE est titularisé sur-le-champ (JP 30/07) :
      // le serveur renvoie alors la demande DÉJÀ approuvée — on entre dans l'app, sans attente.
      if (r.status === 'APPROVED') {
        await refreshMe();
        const asLeader = r.requestedRole === 'LEADER';
        const name = r.assemblyName ?? r.newAssemblyName ?? '';
        notify(
          asLeader ? t('join.nowLeaderTitle') : t('join.nowMemberTitle'),
          asLeader ? t('join.nowLeaderBody', { name }) : t('join.nowMemberBody', { name }),
        );
        router.replace('/(tabs)/home');
        return;
      }
      setPending(r);
      setMode('pending');
      notify(t('common.appName'), t('join.requestSent'));
    } catch (e: any) {
      // Contrat 422 : JOIN_TARGET_REQUIRED / JOIN_REQUEST_ALREADY_PENDING / ALREADY_ATTACHED.
      notify(t('common.appName'), e?.response?.data?.message ?? t('join.sendFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Se déclarer dirigeant titularise sur-le-champ, et REMPLACE le titulaire s'il y en a un
   * (JP 30/07). Sur une assemblée déjà dirigée, on demande donc une confirmation explicite —
   * elle ne bloque pas l'inscription, elle évite juste la reprise par mégarde.
   */
  const onDeclareLeader = async (target: AssemblySearchResult) => {
    if (target.hasLeader) {
      const ok = await confirmDialog(
        t('join.replaceLeaderTitle'),
        t('join.replaceLeaderBody', { name: target.leaderName ?? t('join.theCurrentLeader') }),
        t('join.replaceLeaderConfirm'),
        true,
      );
      if (!ok) return;
    }
    submitJoin({ assemblyNodeId: target.id, requestedRole: 'LEADER' });
  };

  /**
   * Se déclarer dirigeant d'une assemblée à créer engage : l'assemblée sera créée sur simple
   * déclaration, sans validation du secrétariat (JP 30/07 — on corrige a posteriori dans le
   * back-office plutôt que de faire attendre une semaine). D'où une confirmation explicite.
   */
  const onDeclareNewAssemblyLeader = async () => {
    const ok = await confirmDialog(
      t('join.declareLeaderTitle'),
      t('join.declareLeaderBody'),
      t('join.declareLeaderConfirm'),
    );
    if (ok) setCreateStep('form');
  };

  const onCancelPending = async () => {
    if (!pending) return;
    const ok = await confirmDialog(
      t('join.cancelRequest'),
      t('requests.cancelConfirm', { name: pending.assemblyName ?? pending.newAssemblyName ?? '' }),
      t('requests.cancelYes'),
      true,
    );
    if (!ok) return;
    try {
      await cancelJoinRequest(pending.id);
      setPending(null);
      setMode('search');
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('join.cancelFailed'));
    }
  };

  const codeNormalized = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
    [code],
  );

  const onJoinByCode = async () => {
    if (codeNormalized.length !== 6) return;
    setSubmitting(true);
    try {
      await joinUnit({ joinCode: codeNormalized });
      await refreshMe();
      router.replace('/(tabs)/home');
    } catch (e: any) {
      notify(t('signup.invalidCodeTitle'), e?.response?.data?.message ?? t('signup.invalidCodeBody'));
    } finally {
      setSubmitting(false);
    }
  };

  if (booting) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.moss} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Hills />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            {mode !== 'search' && mode !== 'pending' && (
              <Pressable
                // Le drill est partagé avec la recherche : on le CONSERVE en revenant,
                // pour ne pas faire re-choisir nation/région/ville à l'utilisateur.
                onPress={() => setMode('search')}
                style={styles.iconBtn}
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={22} color={colors.mossDeep} />
              </Pressable>
            )}
            <Wordmark size={22} />
          </View>

          {mode === 'search' && (
            <SearchSection
              query={query}
              onQuery={setQuery}
              searching={searching}
              results={results}
              context={context}
              nation={nation}
              region={region}
              city={city}
              debouncedQ={debouncedQ}
              onNation={(n) => { setNation(n); setRegion(null); setCity(null); }}
              onRegion={(r) => { setRegion(r); setCity(null); }}
              onCity={setCity}
              onPick={setRoleTarget}
              onNotFound={async () => {
                await ensureContext();
                setCreateStep('role');
                setMode('create');
              }}
              onCode={() => setMode('code')}
            />
          )}

          {mode === 'create' && createStep === 'role' && (
            <>
              <Text style={styles.title}>{t('join.notFound')}</Text>
              <Text style={styles.subtitle}>{t('join.notFoundStatusHint')}</Text>
              <View style={{ gap: 10, marginTop: 24 }}>
                <Button
                  label={t('join.notFoundIamMember')}
                  variant="soft"
                  height={54}
                  onPress={() => setCreateStep('stop')}
                />
                <Button
                  label={t('join.notFoundIamLeader')}
                  height={54}
                  onPress={onDeclareNewAssemblyLeader}
                />
              </View>
            </>
          )}

          {mode === 'create' && createStep === 'stop' && (
            <>
              <Text style={styles.title}>{t('join.memberDeadEndTitle')}</Text>
              <Text style={styles.subtitle}>{t('join.memberDeadEndBody')}</Text>
              <Button
                label={t('join.backToSearch')}
                variant="soft"
                height={52}
                style={{ marginTop: 24 }}
                onPress={() => { setCreateStep('role'); setMode('search'); }}
                iconLeft={<Ionicons name="arrow-back" size={18} color={colors.mossDeep} />}
              />
            </>
          )}

          {mode === 'create' && createStep === 'form' && context && (
            <>
              <Text style={styles.title}>{t('join.newAssemblyTitle')}</Text>
              <Text style={styles.subtitle}>{t('join.chooseCity')}</Text>
              <PlaceDrill
                context={context}
                nation={nation}
                region={region}
                city={city}
                onNation={(n) => { setNation(n); setRegion(null); setCity(null); }}
                onRegion={(r) => { setRegion(r); setCity(null); }}
                onCity={setCity}
              />
              <Label style={{ marginTop: 16, marginBottom: 6 }}>{t('join.newAssemblyName')}</Label>
              <Field
                value={newName}
                onChangeText={setNewName}
                placeholder={t('join.newAssemblyNamePlaceholder')}
              />
              <Button
                label={t('join.createAssembly')}
                loading={submitting}
                height={54}
                style={{ marginTop: 20 }}
                disabled={!city || newName.trim().length === 0}
                onPress={() =>
                  city &&
                  submitJoin({
                    newAssembly: { cityId: city.id, name: newName.trim() },
                    requestedRole: 'LEADER',
                  })
                }
              />
              {(!city || newName.trim().length === 0) && (
                <Text style={styles.emptyHint}>{t('join.fillFields')}</Text>
              )}

              {/* Nation / région / ville absente : on ne laisse pas l'utilisateur sans issue. */}
              <View style={styles.contactBlock}>
                <Text style={styles.contactHint}>{t('join.missingPlaceHint')}</Text>
                <View style={{ gap: 8, marginTop: 10 }}>
                  <Button
                    label={t('join.contactWhatsapp')}
                    variant="soft"
                    onPress={() => Linking.openURL(CONTACT_WHATSAPP).catch(() => {})}
                    iconLeft={<Ionicons name="logo-whatsapp" size={18} color={colors.mossDeep} />}
                  />
                  <Button
                    label={t('join.contactMail')}
                    variant="ghost"
                    onPress={() =>
                      Linking.openURL(
                        `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('join.contactMailSubject'))}`,
                      ).catch(() => {})
                    }
                    iconLeft={<Ionicons name="mail-outline" size={18} color={colors.mossDeep} />}
                  />
                </View>
              </View>
            </>
          )}

          {mode === 'code' && (
            <>
              <Text style={styles.title}>{t('join.codeTitle')}</Text>
              <Text style={styles.subtitle}>{t('join.codeHint')}</Text>
              <Card style={{ paddingVertical: 18, paddingHorizontal: 18, marginTop: 18 }}>
                <Field
                  value={codeNormalized.replace(/(.{3})(.+)/, '$1-$2')}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  placeholder="ABC-123"
                  style={{
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    textAlign: 'center',
                    fontFamily: fonts.mono,
                    fontSize: 24,
                    letterSpacing: 1.5,
                    color: colors.mossDeep,
                    paddingVertical: 4,
                  }}
                />
              </Card>
              <Button
                label={t('signup.join')}
                onPress={onJoinByCode}
                fullWidth
                disabled={codeNormalized.length !== 6}
                loading={submitting}
                height={56}
                style={{ marginTop: 18 }}
                iconLeft={<Ionicons name="checkmark" size={18} color={colors.white} />}
              />
            </>
          )}

          {mode === 'pending' && pending && (
            <>
              <Text style={styles.title}>{t('join.requestSent')}</Text>
              <Card style={styles.pendingCard}>
                <View style={styles.pendingIcon}>
                  <Ionicons name="time-outline" size={26} color={colors.earthDeep} />
                </View>
                <Label>{t('join.myRequest')}</Label>
                <Text style={styles.pendingName}>
                  {pending.assemblyName ?? pending.newAssemblyName ?? '—'}
                </Text>
                <Text style={styles.pendingMeta}>
                  {pending.cityName ? `${pending.cityName} · ` : ''}
                  {t(`requests.joinRole.${pending.requestedRole}`)}
                  {' · '}
                  {t(`requests.status.${pending.status}`)}
                </Text>
                {pending.newAssemblyName && (
                  <Text style={styles.pendingMeta}>
                    {t('requests.newAssemblyInline', { name: pending.newAssemblyName })}
                  </Text>
                )}
              </Card>
              <Text style={styles.pendingHint}>{t('join.pendingHint')}</Text>
              <Button
                label={t('join.continueApp')}
                onPress={() => router.replace('/(tabs)/home')}
                fullWidth
                height={54}
                style={{ marginTop: 18 }}
                iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
              />
              <Button
                label={t('join.cancelRequest')}
                variant="danger"
                onPress={onCancelPending}
                fullWidth
                height={48}
                style={{ marginTop: 10 }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Choix du rôle sur une assemblée existante. */}
      <Modal
        visible={roleTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            {/* Modale de CONFIRMATION : le rattachement est immédiat, l'acte est donc nommé
                pour ce qu'il est — sans étape supplémentaire, le choix du rôle EST la
                confirmation (un seul geste, zéro friction). */}
            <Text style={styles.modalTitle}>
              {t('join.confirmJoinTitle', { name: roleTarget?.name ?? '' })}
            </Text>
            <Text style={styles.subtitle}>
              {roleTarget
                ? `${roleTarget.cityName} · ${roleTarget.regionName} · ${roleTarget.nationName}`
                : ''}
            </Text>
            <Label style={{ marginTop: 16, marginBottom: 8 }}>{t('join.confirmJoinHint')}</Label>
            <View style={{ gap: 10 }}>
              <Button
                label={t('join.confirmAsLeader')}
                variant="soft"
                loading={submitting}
                onPress={() =>
                  roleTarget && onDeclareLeader(roleTarget)
                }
              />
              <Button
                label={t('join.confirmAsMember')}
                variant="soft"
                loading={submitting}
                onPress={() =>
                  roleTarget &&
                  submitJoin({ assemblyNodeId: roleTarget.id, requestedRole: 'MEMBER' })
                }
              />
            </View>
            <Pressable
              onPress={() => setRoleTarget(null)}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Recherche + parcours de la structure sur UN SEUL écran (parité web) : le champ de recherche
 * et le drill nation→région→ville coexistent. Choisir une ville liste ses assemblées ; taper au
 * moins 2 caractères cherche par nom. Les deux voies alimentent la même liste de résultats.
 */
function SearchSection({
  query,
  onQuery,
  searching,
  results,
  context,
  nation,
  region,
  city,
  debouncedQ,
  onNation,
  onRegion,
  onCity,
  onPick,
  onNotFound,
  onCode,
}: {
  query: string;
  onQuery: (q: string) => void;
  searching: boolean;
  results: AssemblySearchResult[];
  context: StructureRequestContext | null;
  nation: RequestNodeOption | null;
  region: RequestNodeOption | null;
  city: RequestNodeOption | null;
  debouncedQ: string;
  onNation: (n: RequestNodeOption | null) => void;
  onRegion: (r: RequestNodeOption | null) => void;
  onCity: (c: RequestNodeOption | null) => void;
  onPick: (a: AssemblySearchResult) => void;
  onNotFound: () => void;
  onCode: () => void;
}) {
  const { t } = useLanguage();
  // Une recherche est « active » dès qu'une ville est choisie, ou dès 2 caractères saisis.
  const active = city != null || debouncedQ.length >= MIN_QUERY_LENGTH;
  // Le serveur plafonne à 50 : au plafond, la liste est forcément incomplète — on le dit.
  const capped = results.length >= RESULT_CAP;

  return (
    <>
      <Text style={styles.title}>{t('join.searchTitle')}</Text>
      <Text style={styles.subtitle}>{t('join.searchHint')}</Text>

      <Text style={styles.drillHint}>{t('join.browseTitle')}</Text>
      {context == null ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 10 }} />
      ) : (
        <PlaceDrill
          context={context}
          nation={nation}
          region={region}
          city={city}
          onNation={onNation}
          onRegion={onRegion}
          onCity={onCity}
        />
      )}

      {/* Le champ de recherche appartient à la LISTE : il est rendu juste au-dessus d'elle,
          là où on filtre — pas en tête d'écran, hors de vue dès que la liste s'allonge. */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <Field
          value={query}
          onChangeText={onQuery}
          placeholder={city ? t('join.filterInCity', { city: city.name }) : t('join.searchPlaceholder')}
          autoCapitalize="none"
          style={styles.searchField}
        />
      </View>

      {searching && <ActivityIndicator color={colors.moss} style={{ marginTop: 14 }} />}
      {!searching && active && results.length === 0 && (
        <Text style={styles.emptyHint}>
          {city ? t('join.noAssemblyInCity') : t('join.noResults')}
        </Text>
      )}
      {!searching && active && results.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Label style={{ marginBottom: 8 }}>
            {city
              ? t('join.assembliesIn', { city: city.name })
              : t('join.resultCount', { count: results.length })}
          </Label>
          {results.map((a) => (
            <AssemblyRow key={a.id} assembly={a} onPress={() => onPick(a)} />
          ))}
          {capped && <Text style={styles.cappedHint}>{t('join.tooMany', { count: RESULT_CAP })}</Text>}
        </View>
      )}

      <Pressable onPress={onNotFound} style={styles.secondaryLink}>
        <Ionicons name="add-circle-outline" size={16} color={colors.earthDeep} />
        <Text style={styles.secondaryLinkText}>{t('join.notFound')}</Text>
      </Pressable>
      <Pressable onPress={onCode} style={styles.secondaryLink}>
        <Ionicons name="key-outline" size={16} color={colors.earthDeep} />
        <Text style={styles.secondaryLinkText}>{t('join.hasJoinCode')}</Text>
      </Pressable>
    </>
  );
}

function AssemblyRow({
  assembly,
  onPress,
}: {
  assembly: AssemblySearchResult;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card onPress={onPress} style={styles.resultCard}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.resultName} numberOfLines={1}>{assembly.name}</Text>
        <Text style={styles.resultMeta} numberOfLines={1}>
          {assembly.cityName} · {assembly.regionName} · {assembly.nationName}
        </Text>
        {assembly.hasLeader && (
          <Text style={styles.leaderTag}>
            {assembly.leaderName
              ? t('join.ledBy', { name: assembly.leaderName })
              : t('join.hasLeaderTag')}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
    </Card>
  );
}

/** Drill nation → région → ville sur le context des demandes de structure. */
function PlaceDrill({
  context,
  nation,
  region,
  city,
  onNation,
  onRegion,
  onCity,
}: {
  context: StructureRequestContext;
  nation: RequestNodeOption | null;
  region: RequestNodeOption | null;
  city: RequestNodeOption | null;
  onNation: (n: RequestNodeOption | null) => void;
  onRegion: (r: RequestNodeOption | null) => void;
  onCity: (c: RequestNodeOption | null) => void;
}) {
  const { t } = useLanguage();
  const regions = nation ? context.regions.filter((r) => r.parentId === nation.id) : [];
  const cities = region ? context.cities.filter((c) => c.parentId === region.id) : [];
  return (
    <View style={{ marginTop: 4 }}>
      <SelectField
        label={t('join.pickNation')}
        options={context.nations}
        pick={nation}
        onChange={onNation}
      />
      <SelectField
        label={t('join.pickRegion')}
        options={regions}
        pick={region}
        onChange={onRegion}
        disabled={!nation}
      />
      <SelectField
        label={t('join.pickCity')}
        options={cities}
        pick={city}
        onChange={onCity}
        disabled={!region}
      />
    </View>
  );
}

/**
 * Sélecteur en LISTE — parité avec le `Picker` du web : un champ qui montre la valeur choisie,
 * et une modale déroulante avec recherche dès que la liste est longue. Remplace les pastilles,
 * qui débordaient dès qu'un niveau comptait plus de quelques entrées.
 */
function SelectField({
  label,
  options,
  pick,
  onChange,
  disabled,
}: {
  label: string;
  options: RequestNodeOption[];
  pick: RequestNodeOption | null;
  onChange: (p: RequestNodeOption | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q.length === 0 ? options : options.filter((o) => o.name.toLowerCase().includes(q));
  const SEARCH_FROM = 8;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={{ marginTop: 10 }}>
      <Label style={{ marginBottom: 6 }}>{label}</Label>
      <Pressable
        onPress={() => !disabled && options.length > 0 && setOpen(true)}
        style={[styles.selectField, disabled && styles.selectFieldDisabled]}
      >
        <Text
          style={[styles.selectValue, !pick && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {pick ? pick.name : t('common.choose')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.ink3} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.pickerBackdrop}>
          <Card style={styles.pickerCard}>
            <Label style={{ marginBottom: 8 }}>{label}</Label>
            {options.length >= SEARCH_FROM && (
              <View style={styles.pickerSearch}>
                <Ionicons name="search" size={15} color={colors.ink3} />
                <Field
                  value={query}
                  onChangeText={setQuery}
                  placeholder={label}
                  autoCapitalize="none"
                  style={styles.pickerSearchInput}
                />
              </View>
            )}
            <ScrollView style={{ marginTop: 8, maxHeight: 360 }}>
              {shown.length === 0 && (
                <Text style={styles.emptyHint}>{t('join.noOption')}</Text>
              )}
              {shown.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => { onChange(o); close(); }}
                  style={styles.pickerRow}
                >
                  <Text
                    style={[styles.pickerName, pick?.id === o.id && styles.pickerNameActive]}
                    numberOfLines={1}
                  >
                    {o.name}
                  </Text>
                  {pick?.id === o.id && (
                    <Ionicons name="checkmark" size={16} color={colors.moss} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={close} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function Hills() {
  return (
    <Svg
      viewBox="0 0 402 240"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFillObject, { opacity: 0.65 }] as any}
    >
      <Path
        d="M-10,130 C 80,80 160,180 240,130 S 380,80 420,120 L 420,250 L -10,250 Z"
        fill="#1E3A2F"
        opacity={0.14}
      />
      <Circle cx="320" cy="80" r="34" fill="#C9956B" opacity={0.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 4 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.mossDeep,
    marginTop: 18,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink2,
    marginTop: 6,
    lineHeight: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.paper,
    marginTop: 18,
  },
  searchField: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    backgroundColor: colors.paper,
  },
  selectFieldDisabled: { opacity: 0.45 },
  selectValue: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink },
  selectPlaceholder: { color: colors.ink3 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: { paddingHorizontal: 18, paddingVertical: 18, maxHeight: '85%' },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  pickerSearchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,38,32,0.06)',
  },
  pickerName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink2 },
  pickerNameActive: { color: colors.mossDeep, fontWeight: '600' },
  drillHint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink3,
    marginTop: 16,
  },
  contactBlock: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.10)',
  },
  contactHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 19,
  },
  cappedHint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.earthDeep,
    lineHeight: 18,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(201,149,107,0.14)',
  },
  resultCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  resultName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  resultMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  leaderTag: {
    alignSelf: 'flex-start',
    fontFamily: fonts.sans,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.earthDeep,
    backgroundColor: 'rgba(201,149,107,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    marginTop: 5,
    overflow: 'hidden',
  },
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 6,
  },
  secondaryLinkText: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.earthDeep,
  },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink3,
    marginTop: 12,
    lineHeight: 18,
  },
  cancelLink: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink3, fontWeight: '600' },
  pendingCard: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'flex-start',
  },
  pendingIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(201,149,107,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pendingName: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink, marginTop: 2 },
  pendingMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  pendingHint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink2,
    lineHeight: 18,
    marginTop: 14,
    backgroundColor: 'rgba(42,38,32,0.04)',
    padding: 12,
    borderRadius: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,41,31,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { paddingHorizontal: 20, paddingVertical: 20 },
  modalTitle: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink },
});
