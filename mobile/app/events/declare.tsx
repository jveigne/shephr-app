import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import Label from '../../components/Label';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Field from '../../components/Field';
import ErrorBanner from '../../components/ErrorBanner';
import SelectField from '../../components/SelectField';
import { DatePickerModal } from '../../components/DeclarationForm';
import { colors, fonts, radii } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useEventCatalog } from '../../hooks/useEventCatalog';
import {
  createEvent,
  type EventCreateRequest,
  type ScopeNode,
} from '../../services/eventsApi';
import {
  classifySendFailure,
  enqueueEvent,
  flushEventQueue,
  isOnline,
  newEventClientId,
  useEventQueue,
  type QueuedEvent,
} from '../../services/eventQueue';
import { eventFailureMessage, toSendFailure } from '../../utils/eventErrors';
import { fmtIsoDay } from '../../utils/meetingReport';
import { toLocalDate } from '../../utils/format';
import { digitsOnly } from '../../utils/events';
import { notify } from '../../utils/dialogs';
import { goBack } from '../../utils/navigation';

/**
 * Plan 14/10 (§6.3, lot E6) — DÉCLARER UNE ACTION D'ÉVANGÉLISATION (spec Recensement §4.2).
 *
 * <p>Règle d'or de la spec : « ça ne bloque jamais ». D'où, du haut vers le bas :
 * <ul>
 *   <li>RG-ACT-03 : DEUX champs requis, le type et la date (préremplie à aujourd'hui) ; tout le
 *       reste est facultatif et un champ vide n'est simplement pas envoyé. Seule exception, le
 *       type « Autre » (`requiresLabel`) exige son libellé libre — refusé à la saisie plutôt
 *       qu'au serveur (422 EVENT_LABEL_REQUIRED) ;</li>
 *   <li>RG-EVT-05 : une déclaration est créée RÉALISÉE (`DONE`, RG-ACT-04 : elle compte dès sa
 *       création) et ne peut donc pas être datée dans le futur — le calendrier s'arrête à
 *       aujourd'hui (défaut de `DatePickerModal`) ;</li>
 *   <li>RG-ACT-02 / RG-EVT-02 : rattachement automatique au nœud par défaut, annoncé par un
 *       bandeau. Un seul nœud possible (cas du membre) : pas de sélecteur, rattachement
 *       silencieux. Plusieurs : le défaut est présélectionné, un sélecteur permet de changer ;</li>
 *   <li>RG-ACT-08 : sans réseau, ou si le serveur est momentanément injoignable, la déclaration
 *       part dans la file hors-ligne (`services/eventQueue`) et l'écran confirme quand même.
 *       Seul un refus DÉFINITIF (règle métier, hors périmètre…) reste sur le formulaire, avec sa
 *       raison, pour être corrigé.</li>
 * </ul>
 */

/**
 * Au-delà, l'envoi direct est abandonné au profit de la file : sur un réseau de terrain qui
 * agonise, attendre les 15 s du client par défaut ferait mentir les « moins de 20 secondes » de
 * la spec. Sans risque de doublon : le rejeu du même `clientId` est idempotent (RG-EVT-07).
 */
const DIRECT_SEND_TIMEOUT_MS = 8000;

const LABEL_MAX = 120;
const PLACE_MAX = 200;
const NOTE_MAX = 280;

const scopeKey = (node: Pick<ScopeNode, 'level' | 'id'>) => `${node.level}:${node.id}`;

/**
 * Pourquoi une déclaration a été gardée sur le téléphone — la confirmation le dit sans mentir :
 * « pas de réseau » n'est vrai que hors ligne. `slow` : en ligne mais sans réponse à temps (le
 * serveur l'a peut-être déjà enregistrée, le rejeu idempotent le verra) ; `session` : 401, il faudra
 * se reconnecter ; `deferred` : tout autre refus passager (503, module suspendu…).
 */
type QueueReason = 'offline' | 'slow' | 'session' | 'deferred';

const QUEUED_HINT: Record<QueueReason, string> = {
  offline: 'events.declare.successQueued',
  slow: 'events.declare.successQueuedSlow',
  session: 'events.declare.successQueuedSession',
  deferred: 'events.declare.successQueuedDeferred',
};

export default function DeclareEventScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { me, hasEvents } = useAuth();
  const userId = me?.id ?? null;
  // RG-06 : sans l'abonnement EVENTS, aucune route du module n'est appelée.
  const catalog = useEventCatalog(hasEvents ? userId : null);
  const queue = useEventQueue(userId);

  // RG-EVT-07 : un `clientId` par saisie, gardé à travers les réessais du même formulaire.
  const [clientId, setClientId] = useState(newEventClientId);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [place, setPlace] = useState('');
  const [participants, setParticipants] = useState('');
  const [soulsWon, setSoulsWon] = useState('');
  const [note, setNote] = useState('');
  /** Nœud choisi EXPLICITEMENT dans le sélecteur ; null = le nœud par défaut. */
  const [pickedScope, setPickedScope] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Écran de confirmation : `queued` null = enregistrée par le serveur. */
  const [done, setDone] = useState<{ queued: QueueReason | null; scopeName: string } | null>(null);

  const scopes = catalog.scopes;
  const selectedType = catalog.types.find((ty) => ty.id === typeId) ?? null;
  const defaultScope = scopes?.defaultScope ?? null;
  const target: ScopeNode | null = useMemo(() => {
    if (!scopes) return null;
    if (pickedScope) return scopes.scopes.find((s) => scopeKey(s) === pickedScope) ?? defaultScope;
    // Contrat §7 : SECRETARIAT, LEADER ou superAdmin sans assemblée n'ont pas de défaut. S'il n'y a
    // qu'un nœud possible, c'est lui — sans sélecteur à afficher (il n'y a rien à choisir), le
    // formulaire resterait sinon bloqué. `buildRequest` envoie alors le nœud, faute de défaut.
    return defaultScope ?? (scopes.scopes.length === 1 ? scopes.scopes[0] : null);
  }, [scopes, pickedScope, defaultScope]);

  const scopeOptions = useMemo(
    () =>
      (scopes?.scopes ?? []).map((s) => ({
        id: scopeKey(s),
        name: `${t(`events.levels.${s.level}`)} · ${s.name}`,
      })),
    [scopes, t],
  );
  const pickedOption = target ? scopeOptions.find((o) => o.id === scopeKey(target)) ?? null : null;

  const labelMissing = !!selectedType?.requiresLabel && customLabel.trim() === '';
  const canSubmit = !!selectedType && !labelMissing && !!target && !saving;

  const resetForm = () => {
    setClientId(newEventClientId());
    setTypeId(null);
    setCustomLabel('');
    setDate(new Date());
    setPlace('');
    setParticipants('');
    setSoulsWon('');
    setNote('');
    setPickedScope(null);
    setDone(null);
  };

  const buildRequest = (): EventCreateRequest | null => {
    if (!selectedType || !target) return null;
    // Le nœud n'est envoyé que s'il a été CHOISI (ou s'il n'existe pas de défaut). Laisser le
    // serveur appliquer son défaut (RG-EVT-02) au moment de l'enregistrement évite qu'une
    // déclaration restée en file soit refusée en 403 — donc perdue — parce que son auteur a
    // changé d'assemblée entre-temps : « ça ne bloque jamais ».
    const sendScope = !defaultScope || scopeKey(target) !== scopeKey(defaultScope);
    return {
      clientId,
      typeId: selectedType.id,
      eventDate: toLocalDate(date),
      status: 'DONE',
      ...(selectedType.requiresLabel ? { customLabel: customLabel.trim() } : {}),
      ...(sendScope ? { scopeLevel: target.level, scopeId: target.id } : {}),
      ...(place.trim() ? { place: place.trim() } : {}),
      ...(participants !== '' ? { participants: Number(participants) } : {}),
      ...(soulsWon !== '' ? { soulsWon: Number(soulsWon) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
  };

  const onSubmit = async () => {
    const request = buildRequest();
    if (!request || !userId || !selectedType || !target || saving) return;
    const item: QueuedEvent = {
      request,
      queuedAt: new Date().toISOString(),
      typeName: selectedType.name,
      typeNameEn: selectedType.nameEn,
      scopeName: target.name,
    };
    const scopeName = target.name;
    setSaving(true);
    try {
      // Hors ligne : directement en file, sans attendre un délai d'expiration.
      const online = await NetInfo.fetch().then(isOnline, () => true);
      if (!online) {
        await enqueueEvent(userId, item);
        setDone({ queued: 'offline', scopeName });
        return;
      }
      try {
        await createEvent(request, { timeout: DIRECT_SEND_TIMEOUT_MS });
        setDone({ queued: null, scopeName });
        // Le réseau répond : c'est le moment d'envoyer ce qui attendait encore.
        if (queue.pending.length > 0) void flushEventQueue();
      } catch (e) {
        const failure = toSendFailure(e);
        if (classifySendFailure(failure) === 'retry') {
          // En ligne : aucun retour du réseau ne viendra la rattraper — c'est le nouvel essai
          // différé de `EventQueueSync` qui s'en charge.
          await enqueueEvent(userId, item, failure);
          const reason: QueueReason =
            failure.status === null ? 'slow' : failure.status === 401 ? 'session' : 'deferred';
          setDone({ queued: reason, scopeName });
        } else {
          notify(t('common.appName'), eventFailureMessage(failure, t, t('errors.saveFailed')));
        }
      }
    } catch {
      // La mise en file elle-même a échoué (compte en cours de changement) : on le dit, la
      // saisie reste à l'écran pour être renvoyée.
      notify(t('common.appName'), t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <SuccessScreen
        queued={done.queued}
        scopeName={done.scopeName}
        onAnother={resetForm}
      />
    );
  }

  const header = (
    <View style={styles.headerRow}>
      {hasEvents ? (
        <Pressable onPress={() => router.push('/events/mine')} hitSlop={10} style={styles.mineLink}>
          <Ionicons name="list-outline" size={16} color={colors.moss} />
          <Text style={styles.mineLinkText}>{t('events.mine.title')}</Text>
          {/* En attente + refusées : un refus survenu en arrière-plan se signale ici, sur le
              chemin naturel de la personne, avant même qu'elle n'ouvre « Mes actions ». */}
          {queue.pending.length + queue.rejected.length > 0 && (
            <Text style={[styles.mineBadge, queue.rejected.length > 0 && styles.mineBadgeAlert]}>
              {queue.pending.length + queue.rejected.length}
            </Text>
          )}
        </Pressable>
      ) : (
        <View />
      )}
      <Pressable onPress={() => goBack()} hitSlop={10}>
        <Ionicons name="close" size={26} color={colors.ink2} />
      </Pressable>
    </View>
  );

  const intro = (
    <>
      <Text style={styles.kicker}>{t('events.declare.kicker')}</Text>
      <Text style={styles.title}>{t('events.declare.title')}</Text>
      <Text style={styles.intro}>{t('events.declare.intro')}</Text>
    </>
  );

  // États sans formulaire : module absent, chargement, échec sans cache, rien à déclarer.
  let blocker: React.ReactNode = null;
  if (!hasEvents) {
    blocker = <EmptyState icon="lock-closed-outline" text={t('events.declare.moduleUnavailable')} />;
  } else if (catalog.loading) {
    blocker = (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.moss} />
      </View>
    );
  } else if (catalog.error || !scopes) {
    blocker = <ErrorBanner message={t('events.declare.loadFailed')} onRetry={catalog.reload} />;
  } else if (!scopes.canDeclare || scopes.scopes.length === 0) {
    blocker = <EmptyState icon="home-outline" text={t('events.declare.notAttached')} />;
  } else if (catalog.types.length === 0) {
    blocker = <EmptyState icon="pricetags-outline" text={t('events.declare.noTypes')} />;
  }

  if (blocker) {
    return (
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        {header}
        {intro}
        {blocker}
      </ScreenShell>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        {header}
        {intro}

        {catalog.stale && (
          <View style={styles.staleRow}>
            <Ionicons name="cloud-offline-outline" size={15} color={colors.ink3} />
            <Text style={styles.staleText}>{t('events.declare.offlineCatalog')}</Text>
          </View>
        )}

        {/* 1. Type — requis */}
        <View style={styles.section}>
          <Label style={styles.sectionLabel}>{t('events.declare.type')}</Label>
          <View style={styles.chipWrap}>
            {catalog.types.map((ty) => (
              <Chip
                key={ty.id}
                label={catalog.typeLabel(ty)}
                selected={ty.id === typeId}
                onPress={() => setTypeId(ty.id)}
              />
            ))}
          </View>
          {selectedType?.requiresLabel && (
            <View style={{ marginTop: 10 }}>
              <Field
                value={customLabel}
                onChangeText={setCustomLabel}
                placeholder={t('events.declare.customLabelPlaceholder')}
                maxLength={LABEL_MAX}
                autoFocus
              />
              {labelMissing && (
                <Text style={styles.fieldHint}>{t('events.declare.customLabelRequired')}</Text>
              )}
            </View>
          )}
        </View>

        {/* 2. Date — requise, préremplie à aujourd'hui */}
        <View style={styles.section}>
          <Label style={styles.sectionLabel}>{t('events.declare.date')}</Label>
          <Card onPress={() => setDateOpen(true)} style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.mossSoft} />
            <Text style={styles.dateText}>{fmtIsoDay(toLocalDate(date), t)}</Text>
            {toLocalDate(date) === toLocalDate(new Date()) && (
              <Text style={styles.dateChip}>{t('common.today')}</Text>
            )}
            <Ionicons name="chevron-down" size={16} color={colors.ink3} />
          </Card>
        </View>

        {/* 3 à 6. Facultatifs */}
        <View style={styles.section}>
          <Label style={styles.sectionLabel}>{t('events.declare.place')}</Label>
          <Field
            value={place}
            onChangeText={setPlace}
            placeholder={t('events.declare.placePlaceholder')}
            maxLength={PLACE_MAX}
          />
        </View>

        <View style={[styles.section, styles.numbersRow]}>
          <View style={{ flex: 1 }}>
            <Label style={styles.sectionLabel}>{t('events.declare.participants')}</Label>
            <Field
              value={participants}
              onChangeText={(v) => setParticipants(digitsOnly(v))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="—"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={styles.sectionLabel}>{t('events.declare.soulsWon')}</Label>
            <Field
              value={soulsWon}
              onChangeText={(v) => setSoulsWon(digitsOnly(v))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="—"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.noteHead}>
            <Label>{t('events.declare.note')}</Label>
            <Text style={styles.counter}>
              {note.length}/{NOTE_MAX}
            </Text>
          </View>
          <Field
            value={note}
            onChangeText={setNote}
            placeholder={t('events.declare.notePlaceholder')}
            maxLength={NOTE_MAX}
            multiline
            style={styles.noteField}
          />
        </View>

        {/* 7. Rattachement : sélecteur seulement s'il y a un choix (spec §4.3) */}
        {scopeOptions.length > 1 && (
          <SelectField
            label={t('events.declare.scope')}
            options={scopeOptions}
            pick={pickedOption}
            onChange={(o) => setPickedScope(o.id)}
          />
        )}
        <View style={styles.banner}>
          <Ionicons name="location-outline" size={16} color={colors.mossSoft} />
          <Text style={styles.bannerText}>
            {target
              ? t('events.declare.recordedFor', {
                  node: t(`events.scopeOf.${target.level}`, { name: target.name }),
                })
              : t('events.declare.chooseScope')}
          </Text>
        </View>

        <Button
          label={t('events.declare.submit')}
          onPress={onSubmit}
          loading={saving}
          disabled={!canSubmit}
          fullWidth
          height={58}
          style={{ marginTop: 18 }}
          iconLeft={<Ionicons name="checkmark" size={20} color={colors.white} />}
        />
        <Text style={styles.footnote}>{t('events.declare.footnote')}</Text>

        <DatePickerModal
          visible={dateOpen}
          value={date}
          onClose={() => setDateOpen(false)}
          onChange={(d) => {
            setDate(d);
            setDateOpen(false);
          }}
          title={t('events.declare.date')}
          hint={t('events.declare.pickDateHint')}
        />
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function EmptyState({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <Card variant="paper2" style={styles.empty}>
      <Ionicons name={icon} size={26} color={colors.ink3} />
      <Text style={styles.emptyText}>{text}</Text>
    </Card>
  );
}

/**
 * Confirmation brève (spec §4.2 : « Action enregistrée 🙏 »). Une déclaration mise en file le
 * dit — elle est gardée sur le téléphone et partira d'elle-même —, sans rien demander de plus.
 */
function SuccessScreen({
  queued,
  scopeName,
  onAnother,
}: {
  queued: QueueReason | null;
  scopeName: string;
  onAnother: () => void;
}) {
  const { t } = useLanguage();
  return (
    <ScreenShell withTabBar={false} paddingTop={40}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.checkBubble, queued && styles.checkBubbleQueued]}>
          <Ionicons name={queued ? 'cloud-upload-outline' : 'checkmark'} size={36} color={colors.white} />
        </View>
        <Text style={styles.successTitle}>{t('events.declare.successTitle')}</Text>
        <Text style={styles.successHint}>
          {queued
            ? t(QUEUED_HINT[queued])
            : t('events.declare.successFor', { name: scopeName })}
        </Text>
      </View>

      <Button
        label={t('events.declare.another')}
        variant="ghost"
        onPress={onAnother}
        fullWidth
        style={{ marginTop: 28 }}
        iconLeft={<Ionicons name="add" size={18} color={colors.moss} />}
      />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Button
          label={t('events.mine.title')}
          variant="soft"
          onPress={() => router.replace('/events/mine')}
          style={{ flex: 1 }}
        />
        <Button label={t('events.declare.finish')} onPress={() => goBack()} style={{ flex: 1 }} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  mineLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mineLinkText: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.moss },
  mineBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 99,
    overflow: 'hidden',
    backgroundColor: colors.earth,
    color: colors.white,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  mineBadgeAlert: { backgroundColor: colors.clay },
  kicker: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 320,
  },
  loadingBox: { marginTop: 48, alignItems: 'center' },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  staleText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  section: { marginTop: 18 },
  sectionLabel: { marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldHint: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.clay },
  dateRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.ink },
  dateChip: { fontFamily: fonts.sans, fontSize: 12, color: colors.earthDeep, fontWeight: '700' },
  numbersRow: { flexDirection: 'row', gap: 12 },
  noteHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3 },
  noteField: { minHeight: 72, textAlignVertical: 'top' },
  banner: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.mossTint,
  },
  bannerText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  footnote: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: fonts.sans,
    lineHeight: 18,
    paddingHorizontal: 24,
  },
  empty: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    lineHeight: 20,
    textAlign: 'center',
  },
  checkBubble: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBubbleQueued: { backgroundColor: colors.earthDeep },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    marginTop: 18,
    textAlign: 'center',
  },
  successHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 19,
  },
});
