import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Label from './Label';
import Button from './Button';
import Chip from './Chip';
import Field from './Field';
import ErrorBanner from './ErrorBanner';
import SelectField from './SelectField';
import { DatePickerModal } from './DeclarationForm';
import { colors, fonts, radii } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import {
  createEvent,
  updateEvent,
  type EventResponse,
  type EventScopesResponse,
  type EventTypeDto,
  type ScopeNode,
} from '../services/eventsApi';
import { newEventClientId } from '../services/eventQueue';
import { eventActionMessage } from '../utils/eventErrors';
import { countOrUndefined, digitsOnly, isEnglishLang, todayLocal, typeLabel } from '../utils/events';
import { fmtIsoDay } from '../utils/meetingReport';
import { parseLocalDate, toLocalDate } from '../utils/format';

/**
 * Lot E7 (plan 14/10, §6.3) — formulaire d'évènement EN LIGNE, deux usages :
 * <ul>
 *   <li>`plan` : programmer un évènement `PLANNED` (D-EVT-08, RG-EVT-03) — dirigeant à son niveau
 *       ou en dessous, SECRETARIAT partout ([HYPOTHÈSE] RG-EVT-03) : seuls les nœuds `canPlan`
 *       sont proposés. Date future autorisée ; participants / âmes gagnées se saisissent à la
 *       clôture (D-EVT-02), pas ici ;</li>
 *   <li>`edit` : `PATCH` = REMPLACEMENT COMPLET (contrat §3.7) — tous les champs sont renvoyés,
 *       un champ vidé est effacé. Un DONE reste modifiable (RG-ACT-06) mais jamais re-daté dans le
 *       futur (RG-EVT-05) ; un PLANNED garde ses éventuels chiffres sans les montrer.</li>
 * </ul>
 * La déclaration terrain (DONE, file hors-ligne) a son propre écran : `app/events/declare`.
 * Programmer et modifier exigent le réseau (plan §6.3 : seules les déclarations passent par la
 * file). Le serveur revalide tout — nœud, type, dates : les contrôles d'ici évitent un aller-retour.
 */

export type EventFormMode = 'plan' | 'edit';

const LABEL_MAX = 120;
const TITLE_MAX = 200;
const PLACE_MAX = 200;
const NOTE_MAX = 280;

const scopeKey = (n: Pick<ScopeNode, 'level' | 'id'>) => `${n.level}:${n.id}`;
const trimOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export default function EventForm({
  mode,
  types,
  scopes,
  event,
  onSaved,
}: {
  mode: EventFormMode;
  /** Types ACTIFS du ministère (`GET /types`). */
  types: EventTypeDto[];
  scopes: EventScopesResponse;
  /** Évènement modifié (mode `edit`). */
  event?: EventResponse;
  onSaved: (saved: EventResponse) => void;
}) {
  const { t, language } = useLanguage();
  const english = isEnglishLang(language);
  const editing = mode === 'edit' && event != null ? event : null;
  /** Statut une fois enregistré : il pilote les règles de date et de nœud. */
  const isDone = editing?.status === 'DONE';

  // RG-EVT-07 : un identifiant par saisie, conservé si l'envoi est rejoué après une erreur.
  const [clientId] = useState(newEventClientId);

  // Un évènement modifié garde son type même désactivé depuis (contrat §3.7 : accepté) : on le
  // rajoute aux chips. Un libellé libre n'existe que pour un type « Autre » : il en trahit le
  // `requiresLabel`.
  const typeOptions: EventTypeDto[] = useMemo(() => {
    if (!editing || types.some((ty) => ty.id === editing.typeId)) return types;
    return [
      ...types,
      {
        id: editing.typeId,
        code: editing.typeCode,
        name: editing.typeName,
        nameEn: editing.typeNameEn,
        evangelism: editing.evangelism,
        requiresLabel: editing.customLabel != null,
        orderIndex: Number.MAX_SAFE_INTEGER,
      },
    ];
  }, [types, editing]);

  // Nœuds proposés (contrat §3.2 / §3.7) : un DONE se déplace là où je déclare, un PLANNED ou un
  // CANCELLED là où je programme. En modification, le nœud actuel reste proposé même s'il n'est
  // plus dans ma liste (auteur qui a changé d'assemblée) : il n'est renvoyé que s'il change.
  const nodes: ScopeNode[] = useMemo(() => {
    const list = isDone ? scopes.scopes : scopes.scopes.filter((s) => s.canPlan);
    if (!editing || list.some((s) => scopeKey(s) === scopeKey({ level: editing.scopeLevel, id: editing.scopeId }))) {
      return list;
    }
    return [
      {
        level: editing.scopeLevel,
        id: editing.scopeId,
        name: editing.scopeName ?? t(`events.levels.${editing.scopeLevel}`),
        parentId: null,
        canPlan: false,
      },
      ...list,
    ];
  }, [scopes.scopes, isDone, editing, t]);

  const [typeId, setTypeId] = useState<string | null>(() => {
    if (editing) return editing.typeId;
    return types.length === 1 ? types[0].id : null;
  });
  const [customLabel, setCustomLabel] = useState(editing?.customLabel ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [eventDate, setEventDate] = useState(editing?.eventDate ?? todayLocal());
  const [endDate, setEndDate] = useState<string | null>(editing?.endDate ?? null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [scope, setScope] = useState<string | null>(() => {
    if (editing) return scopeKey({ level: editing.scopeLevel, id: editing.scopeId });
    // RG-EVT-02 appliqué à la programmation : le nœud par défaut s'il est programmable, sinon le
    // seul nœud possible ; sinon le choix est obligatoire.
    const def = scopes.defaultScope;
    if (def && nodes.some((n) => scopeKey(n) === scopeKey(def))) return scopeKey(def);
    return nodes.length === 1 ? scopeKey(nodes[0]) : null;
  });
  const [place, setPlace] = useState(editing?.place ?? '');
  const [participants, setParticipants] = useState(editing?.participants != null ? String(editing.participants) : '');
  const [soulsWon, setSoulsWon] = useState(editing?.soulsWon != null ? String(editing.soulsWon) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const type = typeOptions.find((ty) => ty.id === typeId) ?? null;
  const target = nodes.find((n) => scopeKey(n) === scope) ?? null;
  const scopeOptions = useMemo(
    () => nodes.map((n) => ({ id: scopeKey(n), name: `${t(`events.levels.${n.level}`)} · ${n.name}` })),
    [nodes, t],
  );

  const labelMissing = !!type?.requiresLabel && customLabel.trim() === '';
  const endBeforeStart = endDate != null && endDate < eventDate;
  const canSubmit = !!type && !labelMissing && !endBeforeStart && !!target && !saving;

  const submit = async () => {
    if (!canSubmit || !type || !target) return;
    setSaving(true);
    setServerError(null);
    try {
      const label = type.requiresLabel ? customLabel.trim() : null;
      let saved: EventResponse;
      if (editing) {
        // Nœud inchangé = champs absents (contrat §3.7) : un nœud sorti de ma liste n'est donc
        // jamais « redéplacé » sur lui-même au risque d'un 403.
        const moved = scopeKey(target) !== scopeKey({ level: editing.scopeLevel, id: editing.scopeId });
        saved = await updateEvent(editing.id, {
          typeId: type.id,
          eventDate,
          customLabel: label,
          endDate,
          ...(moved ? { scopeLevel: target.level, scopeId: target.id } : {}),
          title: trimOrNull(title),
          place: trimOrNull(place),
          // Remplacement complet : un PLANNED renvoie ses chiffres tels quels (saisis à la clôture).
          participants: isDone ? countOrUndefined(participants) ?? null : editing.participants,
          soulsWon: isDone ? countOrUndefined(soulsWon) ?? null : editing.soulsWon,
          note: trimOrNull(note),
        });
      } else {
        saved = await createEvent({
          clientId,
          typeId: type.id,
          eventDate,
          status: 'PLANNED',
          // Programmer : le nœud est toujours explicite — le défaut serveur est celui d'une
          // DÉCLARATION (RG-EVT-02), il peut ne pas être programmable.
          scopeLevel: target.level,
          scopeId: target.id,
          ...(label ? { customLabel: label } : {}),
          ...(endDate ? { endDate } : {}),
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(place.trim() ? { place: place.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      }
      onSaved(saved);
    } catch (e) {
      setServerError(
        eventActionMessage(e, t, {
          UNAUTHORIZED_ACCESS: editing ? 'events.errors.actionDenied' : 'events.errors.planDenied',
          RESOURCE_NOT_FOUND: editing ? 'events.errors.notFoundOnEdit' : 'events.errors.RESOURCE_NOT_FOUND',
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  // Un DONE n'est jamais daté dans le futur (RG-EVT-05) ; un programmé peut l'être (RG-EVT-03).
  const allowFuture = !isDone;

  return (
    <>
      {/* Type — requis */}
      <View style={styles.section}>
        <Label style={styles.sectionLabel}>{t('events.form.type')}</Label>
        <View style={styles.chipWrap}>
          {typeOptions.map((ty) => (
            <Chip
              key={ty.id}
              label={typeLabel(ty, english)}
              selected={ty.id === typeId}
              onPress={() => setTypeId(ty.id)}
            />
          ))}
        </View>
        {type?.requiresLabel && (
          <View style={{ marginTop: 10 }}>
            <Field
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder={t('events.declare.customLabelPlaceholder')}
              maxLength={LABEL_MAX}
            />
            {labelMissing && <Text style={styles.fieldHint}>{t('events.declare.customLabelRequired')}</Text>}
          </View>
        )}
      </View>

      {/* Intitulé — utile pour un évènement programmé (« Conférence de rentrée ») */}
      <View style={styles.section}>
        <Label style={styles.sectionLabel}>{t('events.form.title')}</Label>
        <Field
          value={title}
          onChangeText={setTitle}
          placeholder={t('events.form.titlePlaceholder')}
          maxLength={TITLE_MAX}
        />
      </View>

      {/* Dates — début requis, fin facultative (retraite sur plusieurs jours) */}
      <View style={[styles.section, styles.datesRow]}>
        <View style={{ flex: 1 }}>
          <Label style={styles.sectionLabel}>{t('events.form.date')}</Label>
          <Card onPress={() => setPicking('start')} style={styles.dateCell}>
            <Ionicons name="calendar-outline" size={18} color={colors.mossSoft} />
            <Text style={styles.dateText}>{fmtIsoDay(eventDate, t)}</Text>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Label style={styles.sectionLabel}>{t('events.form.endDate')}</Label>
          <Card onPress={() => setPicking('end')} style={styles.dateCell}>
            <Ionicons name="calendar-number-outline" size={18} color={colors.mossSoft} />
            <Text style={[styles.dateText, !endDate && { color: colors.ink3 }]}>
              {endDate ? fmtIsoDay(endDate, t) : t('events.form.endDateNone')}
            </Text>
          </Card>
        </View>
      </View>
      {endDate != null && (
        <Pressable onPress={() => setEndDate(null)} hitSlop={8} style={styles.clearEnd}>
          <Text style={styles.link}>{t('events.form.endDateClear')}</Text>
        </Pressable>
      )}
      {endBeforeStart && <Text style={styles.fieldHint}>{t('events.errors.EVENT_END_BEFORE_START')}</Text>}

      {/* Rattachement : sélecteur seulement s'il y a un choix */}
      {scopeOptions.length > 1 && (
        <SelectField
          label={t('events.form.scope')}
          options={scopeOptions}
          pick={scopeOptions.find((o) => o.id === scope) ?? null}
          onChange={(o) => setScope(o.id)}
        />
      )}
      <View style={styles.banner}>
        <Ionicons name="location-outline" size={16} color={colors.mossSoft} />
        <Text style={styles.bannerText}>
          {target
            ? t(editing ? 'events.form.attachedTo' : 'events.form.plannedFor', {
                node: t(`events.scopeOf.${target.level}`, { name: target.name }),
              })
            : t('events.form.chooseScope')}
        </Text>
      </View>

      <View style={styles.section}>
        <Label style={styles.sectionLabel}>{t('events.declare.place')}</Label>
        <Field
          value={place}
          onChangeText={setPlace}
          placeholder={t('events.declare.placePlaceholder')}
          maxLength={PLACE_MAX}
        />
      </View>

      {/* Chiffres : seulement pour un réalisé — un programmé les reçoit à sa clôture (D-EVT-02) */}
      {isDone && (
        <View style={[styles.section, styles.datesRow]}>
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
      )}

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

      {!!serverError && <ErrorBanner message={serverError} />}

      <Button
        label={editing ? t('common.save') : t('events.plan.submit')}
        onPress={submit}
        loading={saving}
        disabled={!canSubmit}
        fullWidth
        height={56}
        style={{ marginTop: 18 }}
        iconLeft={<Ionicons name={editing ? 'checkmark' : 'calendar'} size={19} color={colors.white} />}
      />

      <DatePickerModal
        visible={picking != null}
        value={parseLocalDate(picking === 'end' ? endDate ?? eventDate : eventDate)}
        onClose={() => setPicking(null)}
        onChange={(d) => {
          const iso = toLocalDate(d);
          if (picking === 'end') setEndDate(iso);
          else setEventDate(iso);
          setPicking(null);
        }}
        title={picking === 'end' ? t('events.form.endDate') : t('events.form.date')}
        hint={allowFuture ? t('events.form.pickDateHintPlanned') : t('events.declare.pickDateHint')}
        allowFuture={allowFuture}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionLabel: { marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldHint: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.clay },
  datesRow: { flexDirection: 'row', gap: 12 },
  dateCell: { paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: colors.ink },
  clearEnd: { alignSelf: 'flex-end', marginTop: 8 },
  link: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.moss },
  banner: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.mossTint,
  },
  bannerText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink3 },
  noteField: { minHeight: 72, textAlignVertical: 'top' },
});
