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

type Mode = 'search' | 'browse' | 'create' | 'code' | 'pending';

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

  // Recherche par nom (debounce, min 2 caractères).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssemblySearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Drill nation → région → ville (context des demandes de structure).
  const [context, setContext] = useState<StructureRequestContext | null>(null);
  const [nation, setNation] = useState<RequestNodeOption | null>(null);
  const [region, setRegion] = useState<RequestNodeOption | null>(null);
  const [city, setCity] = useState<RequestNodeOption | null>(null);
  const [cityResults, setCityResults] = useState<AssemblySearchResult[] | null>(null);

  // Choix du rôle sur une assemblée existante.
  const [roleTarget, setRoleTarget] = useState<AssemblySearchResult | null>(null);

  // « Mon assemblée n'existe pas » : ville + nom.
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
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // Recherche debouncée (min 2 caractères — règle serveur QUERY_TOO_SHORT).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchAssemblies({ q })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
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

  // Assemblées de la ville choisie (drill).
  useEffect(() => {
    if (mode !== 'browse' || !city) {
      setCityResults(null);
      return;
    }
    searchAssemblies({ cityId: city.id })
      .then(setCityResults)
      .catch(() => setCityResults([]));
  }, [mode, city]);

  const resetDrill = () => {
    setNation(null);
    setRegion(null);
    setCity(null);
    setCityResults(null);
  };

  const submitJoin = async (payload: {
    assemblyNodeId?: string;
    requestedRole: JoinRequestedRole;
    newAssembly?: { cityId: string; name: string };
  }) => {
    setSubmitting(true);
    try {
      const r = await createJoinRequest(payload);
      setPending(r);
      setRoleTarget(null);
      setMode('pending');
      notify(t('common.appName'), t('join.requestSent'));
    } catch (e: any) {
      // Contrat 422 : JOIN_TARGET_REQUIRED / JOIN_REQUEST_ALREADY_PENDING / ALREADY_ATTACHED.
      notify(t('common.appName'), e?.response?.data?.message ?? t('join.sendFailed'));
    } finally {
      setSubmitting(false);
    }
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
                onPress={() => {
                  if (mode === 'create' || mode === 'browse') resetDrill();
                  setMode('search');
                }}
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
              onPick={setRoleTarget}
              onBrowse={async () => {
                await ensureContext();
                setMode('browse');
              }}
              onNotFound={async () => {
                await ensureContext();
                setMode('create');
              }}
              onCode={() => setMode('code')}
            />
          )}

          {mode === 'browse' && context && (
            <>
              <Text style={styles.title}>{t('join.browseByPlace')}</Text>
              <PlaceDrill
                context={context}
                nation={nation}
                region={region}
                city={city}
                onNation={(n) => { setNation(n); setRegion(null); setCity(null); }}
                onRegion={(r) => { setRegion(r); setCity(null); }}
                onCity={setCity}
              />
              {city && (
                <View style={{ marginTop: 16 }}>
                  <Label style={{ marginBottom: 8 }}>
                    {t('join.assembliesIn', { city: city.name })}
                  </Label>
                  {cityResults == null ? (
                    <ActivityIndicator color={colors.moss} />
                  ) : cityResults.length === 0 ? (
                    <Text style={styles.emptyHint}>{t('join.noAssemblyInCity')}</Text>
                  ) : (
                    cityResults.map((a) => (
                      <AssemblyRow key={a.id} assembly={a} onPress={() => setRoleTarget(a)} />
                    ))
                  )}
                  <Pressable onPress={() => setMode('create')} style={styles.secondaryLink}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.earthDeep} />
                    <Text style={styles.secondaryLinkText}>{t('join.notFound')}</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {mode === 'create' && context && (
            <>
              <Text style={styles.title}>{t('join.notFound')}</Text>
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
              <Label style={{ marginTop: 18, marginBottom: 8 }}>{t('join.roleQuestion')}</Label>
              <View style={{ gap: 10 }}>
                <Button
                  label={t('join.roleLeader')}
                  variant="soft"
                  loading={submitting}
                  disabled={!city || newName.trim().length === 0}
                  onPress={() =>
                    city &&
                    submitJoin({
                      newAssembly: { cityId: city.id, name: newName.trim() },
                      requestedRole: 'LEADER',
                    })
                  }
                />
                <Button
                  label={t('join.roleMember')}
                  variant="soft"
                  loading={submitting}
                  disabled={!city || newName.trim().length === 0}
                  onPress={() =>
                    city &&
                    submitJoin({
                      newAssembly: { cityId: city.id, name: newName.trim() },
                      requestedRole: 'MEMBER',
                    })
                  }
                />
              </View>
              {(!city || newName.trim().length === 0) && (
                <Text style={styles.emptyHint}>{t('join.fillFields')}</Text>
              )}
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
            <Text style={styles.modalTitle}>{roleTarget?.name}</Text>
            <Text style={styles.subtitle}>
              {roleTarget
                ? `${roleTarget.cityName} · ${roleTarget.regionName} · ${roleTarget.nationName}`
                : ''}
            </Text>
            <Label style={{ marginTop: 16, marginBottom: 8 }}>{t('join.roleQuestion')}</Label>
            <View style={{ gap: 10 }}>
              <Button
                label={t('join.roleLeader')}
                variant="soft"
                loading={submitting}
                onPress={() =>
                  roleTarget &&
                  submitJoin({ assemblyNodeId: roleTarget.id, requestedRole: 'LEADER' })
                }
              />
              <Button
                label={t('join.roleMember')}
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

function SearchSection({
  query,
  onQuery,
  searching,
  results,
  onPick,
  onBrowse,
  onNotFound,
  onCode,
}: {
  query: string;
  onQuery: (q: string) => void;
  searching: boolean;
  results: AssemblySearchResult[];
  onPick: (a: AssemblySearchResult) => void;
  onBrowse: () => void;
  onNotFound: () => void;
  onCode: () => void;
}) {
  const { t } = useLanguage();
  const q = query.trim();
  return (
    <>
      <Text style={styles.title}>{t('join.searchTitle')}</Text>
      <Text style={styles.subtitle}>{t('join.searchHint')}</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <Field
          value={query}
          onChangeText={onQuery}
          placeholder={t('join.searchPlaceholder')}
          autoCapitalize="none"
          style={styles.searchField}
        />
      </View>

      {searching && <ActivityIndicator color={colors.moss} style={{ marginTop: 14 }} />}
      {!searching && q.length >= 2 && results.length === 0 && (
        <Text style={styles.emptyHint}>{t('join.noResults')}</Text>
      )}
      <View style={{ marginTop: 10 }}>
        {results.map((a) => (
          <AssemblyRow key={a.id} assembly={a} onPress={() => onPick(a)} />
        ))}
      </View>

      <Pressable onPress={onBrowse} style={styles.secondaryLink}>
        <Ionicons name="map-outline" size={16} color={colors.mossDeep} />
        <Text style={[styles.secondaryLinkText, { color: colors.mossDeep }]}>
          {t('join.browseByPlace')}
        </Text>
      </Pressable>
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
          <Text style={styles.leaderTag}>{t('join.hasLeaderTag')}</Text>
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
    <View style={{ marginTop: 12 }}>
      <DrillLevel
        label={t('join.pickNation')}
        options={context.nations}
        pick={nation}
        onChange={onNation}
      />
      {nation && (
        <DrillLevel
          label={t('join.pickRegion')}
          options={regions}
          pick={region}
          onChange={onRegion}
        />
      )}
      {region && (
        <DrillLevel
          label={t('join.pickCity')}
          options={cities}
          pick={city}
          onChange={onCity}
        />
      )}
    </View>
  );
}

function DrillLevel({
  label,
  options,
  pick,
  onChange,
}: {
  label: string;
  options: RequestNodeOption[];
  pick: RequestNodeOption | null;
  onChange: (p: RequestNodeOption | null) => void;
}) {
  const { t } = useLanguage();
  if (pick) {
    return (
      <View style={{ marginTop: 10 }}>
        <Label style={{ marginBottom: 6 }}>{label}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={[styles.chip, styles.chipActive]}>
            <Text style={[styles.chipText, styles.chipTextActive]}>{pick.name}</Text>
          </View>
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={styles.cancelLink}>{t('requests.changePick')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 10 }}>
      <Label style={{ marginBottom: 6 }}>{label}</Label>
      <View style={styles.chipRow}>
        {options.length === 0 && (
          <Text style={styles.emptyHint}>{t('requests.noOption')}</Text>
        )}
        {options.map((o) => (
          <Pressable key={o.id} onPress={() => onChange(o)} style={styles.chip}>
            <Text style={styles.chipText}>{o.name}</Text>
          </Pressable>
        ))}
      </View>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.06)',
  },
  chipActive: { backgroundColor: colors.moss },
  chipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  chipTextActive: { color: colors.white },
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
