import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import Field from '@/components/Field';
import ErrorBanner from '@/components/ErrorBanner';
import EventForm from '@/components/EventForm';
import { EventPill, EventStatusPills } from '@/components/EventRow';
import { colors, fonts } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEventCatalog } from '@/hooks/useEventCatalog';
import {
  cancelEvent,
  deleteEvent,
  getEvent,
  markEventDone,
  setEventToVerify,
  type EventResponse,
} from '@/services/eventsApi';
import { eventActionMessage, eventErrorCode } from '@/utils/eventErrors';
import { digitsOnly, eventLabel, fmtEventDates, isEnglishLang, todayLocal } from '@/utils/events';
import { confirmDialog, notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';

/**
 * Plan 14/10 (§6.3, lot E7) — DÉTAIL D'UN ÉVÈNEMENT et gestes permis par le serveur (contrat §4,
 * boutons dérivés ; aucun droit n'est recalculé ici) :
 * <ul>
 *   <li>« Marquer comme réalisé » / « Annuler » ⇔ `canEdit` et `PLANNED` (D-EVT-02, RG-EVT-06) —
 *       pas avant la date de l'évènement (RG-EVT-05, 422 EVENT_NOT_YET_HELD) ;</li>
 *   <li>« Modifier » / « Supprimer » ⇔ `canEdit` (RG-ACT-06, RG-EVT-04 : l'auteur, ou un dirigeant
 *       dont le périmètre contient le nœud) ; la suppression est un soft delete ;</li>
 *   <li>« À vérifier » ⇔ `canFlag` (dirigeants du périmètre et SECRETARIAT) — RG-ACT-07 :
 *       informatif, l'évènement reste compté.</li>
 * </ul>
 * Ouvert depuis l'agenda, « Mes actions » ou après une programmation. Ces gestes exigent le
 * réseau (plan §6.3) : un échec — y compris un 403, si le périmètre a changé entre-temps — se dit
 * à l'écran, avec sa raison.
 */

type Mode = 'detail' | 'edit' | 'done';

const NOTE_MAX = 280;

/** Contexte « évènement ouvert » : un 404 veut dire « supprimé entre-temps ». */
const ON_EVENT = {
  RESOURCE_NOT_FOUND: 'events.errors.eventGone',
  UNAUTHORIZED_ACCESS: 'events.errors.actionDenied',
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language } = useLanguage();
  const english = isEnglishLang(language);
  const { me, hasEvents } = useAuth();

  const [event, setEvent] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [view, setView] = useState<Mode>('detail');
  const [busy, setBusy] = useState(false);
  /** Confirmation de la dernière opération (l'app mobile n'a pas de toast). */
  const [flash, setFlash] = useState<string | null>(null);

  // Catalogue (types actifs, nœuds) : requis pour la modification seulement, mais lié au compte
  // dès l'ouverture — il est en cache (préchargé par `EventQueueSync`) et « Modifier » s'affiche
  // alors sans attente.
  const catalog = useEventCatalog(hasEvents ? me?.id : null);

  const load = useCallback((): Promise<void> => {
    if (!id || !hasEvents) {
      setLoading(false);
      return Promise.resolve();
    }
    return getEvent(id)
      .then(
        (fresh) => {
          setEvent(fresh);
          setLoadError(null);
          setGone(false);
        },
        (e) => {
          if (eventErrorCode(e) === 'RESOURCE_NOT_FOUND') {
            setGone(true);
            setEvent(null);
          } else {
            setLoadError(eventActionMessage(e, t, ON_EVENT));
          }
        },
      )
      .finally(() => setLoading(false));
    // `setEvent` est stable ; il figure ici parce que le compilateur React l'infère comme
    // dépendance (react-hooks/preserve-manual-memoization) — sans effet sur les rechargements.
  }, [id, hasEvents, t, setEvent]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  /** Exécute une opération en ligne ; sa réponse remplace l'évènement affiché. */
  const run = async (action: () => Promise<EventResponse | null>, success: string) => {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const saved = await action();
      if (saved) setEvent(saved);
      setFlash(success);
    } catch (e) {
      if (eventErrorCode(e) === 'RESOURCE_NOT_FOUND') {
        setGone(true);
        setEvent(null);
      }
      notify(t('common.appName'), eventActionMessage(e, t, ON_EVENT));
      // L'état a pu changer côté serveur (déjà réalisé, droits retirés…) : on relit.
      if (eventErrorCode(e) === 'EVENT_INVALID_TRANSITION') void load();
    } finally {
      setBusy(false);
    }
  };

  const onCancelEvent = async () => {
    if (!event) return;
    const ok = await confirmDialog(t('events.detail.cancelTitle'), t('events.detail.cancelConfirm'), t('events.detail.cancel'), true);
    if (ok) void run(() => cancelEvent(event.id), t('events.detail.cancelled'));
  };

  const onDelete = async () => {
    if (!event || busy) return;
    const ok = await confirmDialog(
      t('events.detail.deleteTitle'),
      event.counted ? t('events.detail.deleteConfirmCounted') : t('events.detail.deleteConfirm'),
      t('common.delete'),
      true,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteEvent(event.id);
      notify(t('common.appName'), t('events.detail.deleted'));
      goBack();
    } catch (e) {
      notify(t('common.appName'), eventActionMessage(e, t, ON_EVENT));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable
        onPress={() => (view === 'detail' ? goBack() : setView('detail'))}
        hitSlop={10}
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
    </View>
  );

  // États sans évènement : module absent, chargement, supprimé, échec.
  if (!hasEvents || loading || gone || !event) {
    return (
      <ScreenShell withTabBar={false}>
        {header}
        {!hasEvents ? (
          <EmptyState icon="lock-closed-outline" text={t('events.declare.moduleUnavailable')} />
        ) : loading ? (
          <ActivityIndicator color={colors.moss} style={{ marginTop: 60 }} />
        ) : gone ? (
          <EmptyState icon="trash-outline" text={t('events.errors.eventGone')} />
        ) : (
          <ErrorBanner message={loadError ?? t('events.errors.generic')} onRetry={load} />
        )}
      </ScreenShell>
    );
  }

  const label = eventLabel(event, english);
  // RG-EVT-05 : un évènement programmé ne se clôture qu'une fois sa date (locale) arrivée.
  const notYetHeld = event.eventDate > todayLocal();
  const canClose = event.canEdit && event.status === 'PLANNED';

  if (view === 'edit') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenShell withTabBar={false}>
          {header}
          <Text style={styles.kicker}>{t('events.detail.editKicker')}</Text>
          <Text style={styles.title}>{label}</Text>
          {catalog.loading ? (
            <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
          ) : catalog.error || !catalog.scopes ? (
            <ErrorBanner message={t('events.declare.loadFailed')} onRetry={catalog.reload} />
          ) : (
            <EventForm
              mode="edit"
              event={event}
              types={catalog.types}
              scopes={catalog.scopes}
              onSaved={(saved) => {
                setEvent(saved);
                setFlash(t('events.detail.updated'));
                setView('detail');
              }}
            />
          )}
          <Button
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => setView('detail')}
            fullWidth
            height={46}
            style={{ marginTop: 10 }}
          />
        </ScreenShell>
      </KeyboardAvoidingView>
    );
  }

  if (view === 'done') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenShell withTabBar={false}>
          {header}
          <Text style={styles.kicker}>{t('events.detail.markDone')}</Text>
          <Text style={styles.title}>{label}</Text>
          <DoneForm
            event={event}
            onCancel={() => setView('detail')}
            onDone={(saved) => {
              setEvent(saved);
              setFlash(t('events.detail.markedDone'));
              setView('detail');
            }}
          />
        </ScreenShell>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {header}
      <Text style={styles.kicker}>{t(event.evangelism ? 'events.detail.kickerEvangelism' : 'events.detail.kicker')}</Text>
      <Text style={styles.title}>{label}</Text>
      {!!event.title && <Text style={styles.subtitle}>{event.title}</Text>}
      <View style={styles.pills}>
        <EventStatusPills event={event} t={t} />
        {event.status === 'DONE' && (
          <EventPill tone={colors.moss} icon="checkmark-circle-outline" text={t('events.status.DONE')} />
        )}
      </View>

      {!!flash && (
        <Card variant="tinted" style={styles.flash}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.moss} />
          <Text style={styles.flashText}>{flash}</Text>
        </Card>
      )}

      {/* Relecture échouée (tirer pour rafraîchir hors ligne) : la dernière version reste affichée. */}
      {!!loadError && <ErrorBanner message={loadError} onRetry={load} />}

      <Card style={styles.detailCard}>
        {event.customLabel != null && (
          <Row label={t('events.detail.type')} value={t('events.detail.otherType', { name: event.typeName })} />
        )}
        <Row label={t('events.detail.date')} value={fmtEventDates(event, t)} />
        <Row
          label={t('events.detail.scope')}
          value={`${event.scopeName ?? '—'} · ${t(`events.levels.${event.scopeLevel}`)}`}
        />
        <Row label={t('events.declare.place')} value={event.place} />
        <Row label={t('events.declare.participants')} value={event.participants} />
        <Row label={t('events.declare.soulsWon')} value={event.soulsWon} />
        <Row label={t('events.declare.note')} value={event.note} />
        <Row label={t('events.detail.author')} value={event.createdByName} last />
      </Card>

      {event.status === 'DONE' && (
        <Text style={styles.hint}>
          {event.counted
            ? event.toVerify
              ? t('events.detail.countedToVerify')
              : t('events.detail.counted')
            : t('events.detail.notCountedHint')}
        </Text>
      )}
      {event.status === 'PLANNED' && <Text style={styles.hint}>{t('events.detail.plannedHint')}</Text>}
      {!event.canEdit && <Text style={styles.hint}>{t('events.detail.readOnly')}</Text>}

      {/* Gestes : dans l'ordre du cycle de vie, la clôture d'abord */}
      <View style={styles.actions}>
        {canClose && (
          <>
            <Button
              label={t('events.detail.markDone')}
              onPress={() => setView('done')}
              disabled={busy || notYetHeld}
              fullWidth
              height={52}
              iconLeft={<Ionicons name="checkmark-done" size={19} color={colors.white} />}
            />
            {notYetHeld && <Text style={styles.actionHint}>{t('events.detail.notYetHeld')}</Text>}
          </>
        )}
        {event.canEdit && (
          <Button
            label={t('common.edit')}
            variant="soft"
            onPress={() => {
              setFlash(null);
              setView('edit');
            }}
            disabled={busy}
            fullWidth
            height={48}
            iconLeft={<Ionicons name="create-outline" size={18} color={colors.mossDeep} />}
          />
        )}
        {event.canFlag && (
          <Button
            label={event.toVerify ? t('events.detail.unflag') : t('events.detail.flag')}
            variant="ghost"
            onPress={() =>
              void run(
                () => setEventToVerify(event.id, !event.toVerify),
                event.toVerify ? t('events.detail.unflagged') : t('events.detail.flagged'),
              )
            }
            disabled={busy}
            fullWidth
            height={48}
            iconLeft={<Ionicons name={event.toVerify ? 'flag' : 'flag-outline'} size={17} color={colors.moss} />}
          />
        )}
        {canClose && (
          <Button
            label={t('events.detail.cancel')}
            variant="danger"
            onPress={onCancelEvent}
            disabled={busy}
            fullWidth
            height={48}
          />
        )}
        {event.canEdit && (
          <Button
            label={t('common.delete')}
            variant="danger"
            onPress={onDelete}
            disabled={busy}
            fullWidth
            height={48}
            iconLeft={<Ionicons name="trash-outline" size={17} color={colors.clay} />}
          />
        )}
      </View>
    </ScreenShell>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: string | number | null | undefined;
  last?: boolean;
}) {
  const empty = value == null || value === '';
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, empty && { color: colors.ink3 }]}>{empty ? '—' : String(value)}</Text>
    </View>
  );
}

/**
 * « Marquer comme réalisé » (D-EVT-02, RG-EVT-06) : participants / âmes gagnées / note saisis à
 * ce moment. Contrat §3.8 : un champ ABSENT garde sa valeur — participants et âmes vides ne sont
 * donc pas envoyés ; la note est préremplie et toujours renvoyée ('' l'efface).
 */
function DoneForm({
  event,
  onCancel,
  onDone,
}: {
  event: EventResponse;
  onCancel: () => void;
  onDone: (saved: EventResponse) => void;
}) {
  const { t } = useLanguage();
  const [participants, setParticipants] = useState(event.participants != null ? String(event.participants) : '');
  const [soulsWon, setSoulsWon] = useState(event.soulsWon != null ? String(event.soulsWon) : '');
  const [note, setNote] = useState(event.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      onDone(
        await markEventDone(event.id, {
          ...(participants !== '' ? { participants: Number(participants) } : {}),
          ...(soulsWon !== '' ? { soulsWon: Number(soulsWon) } : {}),
          note: note.trim(),
        }),
      );
    } catch (e) {
      setError(eventActionMessage(e, t, ON_EVENT));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Text style={styles.intro}>{t('events.detail.markDoneIntro')}</Text>
      <View style={[styles.section, styles.numbersRow]}>
        <View style={{ flex: 1 }}>
          <Label style={styles.sectionLabel}>{t('events.declare.participants')}</Label>
          <Field
            value={participants}
            onChangeText={(v) => setParticipants(digitsOnly(v))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="—"
            autoFocus
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
      {!!error && <ErrorBanner message={error} />}
      <Button
        label={t('events.detail.markDone')}
        onPress={submit}
        loading={saving}
        fullWidth
        height={54}
        style={{ marginTop: 18 }}
        iconLeft={<Ionicons name="checkmark-done" size={19} color={colors.white} />}
      />
      <Button
        label={t('common.cancel')}
        variant="ghost"
        onPress={onCancel}
        fullWidth
        height={46}
        style={{ marginTop: 10 }}
      />
    </>
  );
}

function EmptyState({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <Card variant="paper2" style={styles.empty}>
      <Ionicons name={icon} size={26} color={colors.ink3} />
      <Text style={styles.emptyText}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2, marginTop: 4 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 8, lineHeight: 20 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  flash: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flashText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  detailCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 4 },
  row: { paddingVertical: 10, gap: 2 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hair },
  rowLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3 },
  rowValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, lineHeight: 20 },
  hint: { marginTop: 10, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  actions: { marginTop: 20, gap: 10 },
  actionHint: { marginTop: -4, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, textAlign: 'center' },
  section: { marginTop: 18 },
  sectionLabel: { marginBottom: 8 },
  numbersRow: { flexDirection: 'row', gap: 12 },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3 },
  noteField: { minHeight: 72, textAlignVertical: 'top' },
  empty: { marginTop: 24, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
