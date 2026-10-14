import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Picker } from './ui';
import { Icon } from './Icon';
import {
  createEvent,
  updateEvent,
  type EventResponse,
  type EventScopes,
  type EventType,
  type ScopeNode,
} from '../services/eventsApi';
import {
  EVENT_NOTE_MAX,
  eventErrorMessage,
  invalidateEvents,
  newClientId,
  parseCount,
  scopeOptions,
  todayLocal,
  typeLabel,
} from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Formulaire d'évènement (lot E8) — trois usages :
//   - `declare` : déclaration terrain (spec §4.2), créée directement en DONE (RG-ACT-04). Doit se
//     remplir en < 20 s : type en chips, date = aujourd'hui, bandeau du nœud de rattachement
//     (RG-EVT-02) — sélecteur seulement s'il y a plusieurs nœuds possibles (spec §4.3) ;
//   - `plan`    : programmation d'un évènement PLANNED (RG-EVT-03) — D-EVT-13 (JP 14/10) : par
//     tout compte qui déclare, membre compris, aux mêmes nœuds (`canPlan`) ; date future autorisée, participants / âmes saisis à la clôture (D-EVT-02) ;
//   - `edit`    : PATCH = remplacement complet (contrat §3.7) — tous les champs sont renvoyés.
//  Le serveur revalide tout (nœud, type, dates) : les contrôles d'ici évitent un aller-retour,
//  ils ne remplacent pas les siens.
// ---------------------------------------------------------------------------------------------

export type EventFormMode = 'declare' | 'plan' | 'edit';

const LABEL_MAX = 120;
const TITLE_MAX = 200;
const PLACE_MAX = 200;

const trimOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function EventForm({
  mode,
  types,
  scopes,
  event,
  onSaved,
  onCancel,
}: {
  mode: EventFormMode;
  /** Types ACTIFS du ministère (`GET /types`). */
  types: EventType[];
  scopes: EventScopes;
  /** Évènement modifié (mode `edit`). */
  event?: EventResponse;
  onSaved: (saved: EventResponse) => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const isEdit = mode === 'edit' && event != null;
  /** Statut de l'évènement une fois enregistré : il pilote les règles de date et de nœud. */
  const status = isEdit ? event.status : mode === 'plan' ? 'PLANNED' : 'DONE';
  const isDone = status === 'DONE';
  const today = todayLocal();

  // RG-EVT-07 : un identifiant par saisie, conservé si l'envoi est rejoué après une erreur.
  const [clientId] = useState(newClientId);

  // Un évènement modifié garde son type même désactivé depuis (contrat §3.7) : on le rajoute aux
  // chips. Un libellé libre n'existe que pour un type « Autre » : il en trahit le `requiresLabel`.
  const typeOptions: EventType[] = useMemo(() => {
    if (!isEdit || types.some((ty) => ty.id === event.typeId)) return types;
    return [
      ...types,
      {
        id: event.typeId,
        code: event.typeCode,
        name: event.typeName,
        nameEn: event.typeNameEn,
        evangelism: event.evangelism,
        requiresLabel: event.customLabel != null,
        orderIndex: Number.MAX_SAFE_INTEGER,
      },
    ];
  }, [types, isEdit, event]);

  // Nœuds proposés : déclarer (DONE) partout où je déclare ; programmer seulement où `canPlan`
  // (contrat §3.2). En modification, le nœud actuel reste proposé même s'il n'est plus dans ma
  // liste (auteur qui a changé d'assemblée) : il n'est renvoyé au serveur que s'il change.
  const nodes: ScopeNode[] = useMemo(() => {
    const list = isDone ? scopes.scopes : scopes.scopes.filter((s) => s.canPlan);
    if (!isEdit || list.some((s) => s.id === event.scopeId)) return list;
    return [
      { level: event.scopeLevel, id: event.scopeId, name: event.scopeName ?? '—', parentId: null, canPlan: false },
      ...list,
    ];
  }, [scopes.scopes, isDone, isEdit, event]);

  const initialScopeId = (() => {
    if (isEdit) return event.scopeId;
    const def = scopes.defaultScope;
    if (def && nodes.some((n) => n.id === def.id)) return def.id;
    // RG-EVT-02 : un seul nœud possible → rattachement silencieux ; sinon choix obligatoire.
    return nodes.length === 1 ? nodes[0].id : '';
  })();

  const [typeId, setTypeId] = useState(() => {
    if (isEdit) return event.typeId;
    return types.length === 1 ? types[0].id : '';
  });
  const [customLabel, setCustomLabel] = useState(isEdit ? event.customLabel ?? '' : '');
  const [title, setTitle] = useState(isEdit ? event.title ?? '' : '');
  const [eventDate, setEventDate] = useState(isEdit ? event.eventDate : today);
  const [endDate, setEndDate] = useState(isEdit ? event.endDate ?? '' : '');
  const [scopeId, setScopeId] = useState(initialScopeId);
  const [place, setPlace] = useState(isEdit ? event.place ?? '' : '');
  const [participants, setParticipants] = useState(isEdit && event.participants != null ? String(event.participants) : '');
  const [soulsWon, setSoulsWon] = useState(isEdit && event.soulsWon != null ? String(event.soulsWon) : '');
  const [note, setNote] = useState(isEdit ? event.note ?? '' : '');
  const [submitted, setSubmitted] = useState(false);

  const type = typeOptions.find((ty) => ty.id === typeId) ?? null;
  const scope = nodes.find((n) => n.id === scopeId) ?? null;
  const showTitle = !isDone || (isEdit && event.title != null);
  const showEndDate = mode !== 'declare';
  const showCounts = isDone;

  const parsedParticipants = parseCount(participants);
  const parsedSouls = parseCount(soulsWon);

  // Contrôles locaux, affichés après la première tentative d'envoi (spec §4.2 : le bouton reste
  // actif dès que type + date sont remplis, rien ne bloque la saisie elle-même).
  const errors: Partial<Record<'label' | 'date' | 'endDate' | 'scope' | 'participants' | 'soulsWon', string>> = {};
  if (type?.requiresLabel && customLabel.trim() === '') errors.label = t('events.form.labelRequired');
  // Le formulaire est en noValidate : la date obligatoire est contrôlée ici, pas par `required`.
  if (eventDate === '') errors.date = t('events.form.dateRequired');
  // RG-EVT-05 : une déclaration (DONE) n'est jamais datée dans le futur.
  else if (isDone && eventDate > today) errors.date = t('events.form.dateInFuture');
  if (showEndDate && endDate && eventDate && endDate < eventDate) errors.endDate = t('events.form.endBeforeStart');
  if (!scope) errors.scope = t('events.form.scopeRequired');
  if (showCounts && parsedParticipants === undefined) errors.participants = t('events.form.countInvalid');
  if (showCounts && parsedSouls === undefined) errors.soulsWon = t('events.form.countInvalid');
  const valid = Object.keys(errors).length === 0;

  const saveM = useMutation({
    mutationFn: () => {
      const label = type?.requiresLabel ? trimOrNull(customLabel) : null;
      const counts = showCounts
        ? { participants: parsedParticipants ?? null, soulsWon: parsedSouls ?? null }
        : { participants: isEdit ? event.participants : null, soulsWon: isEdit ? event.soulsWon : null };
      if (isEdit) {
        // Nœud inchangé = champs absents (contrat §3.7) : un nœud qui n'est plus dans ma liste
        // n'est donc jamais « redéplacé » sur lui-même au risque d'un 403.
        const moved = scope != null && scope.id !== event.scopeId;
        return updateEvent(event.id, {
          typeId,
          eventDate,
          customLabel: label,
          endDate: endDate || null,
          ...(moved ? { scopeLevel: scope.level, scopeId: scope.id } : {}),
          title: trimOrNull(title),
          place: trimOrNull(place),
          note: trimOrNull(note),
          ...counts,
        });
      }
      return createEvent({
        clientId,
        typeId,
        eventDate,
        status: mode === 'plan' ? 'PLANNED' : 'DONE',
        customLabel: label,
        endDate: showEndDate ? endDate || null : null,
        scopeLevel: scope?.level ?? null,
        scopeId: scope?.id ?? null,
        title: showTitle ? trimOrNull(title) : null,
        place: trimOrNull(place),
        note: trimOrNull(note),
        ...counts,
      });
    },
    onSuccess: (saved) => {
      void invalidateEvents(qc);
      onSaved(saved);
    },
  });

  const submit = () => {
    setSubmitted(true);
    if (valid && !saveM.isPending) saveM.mutate();
  };

  const showErr = (k: keyof typeof errors) =>
    submitted && errors[k] ? <span style={{ color: 'var(--err)' }}>{errors[k]}</span> : undefined;

  const submitLabel = saveM.isPending
    ? t('common.saving')
    : mode === 'plan'
      ? t('events.form.submitPlan')
      : t('common.save');

  // « l'assemblée Bruxelles Midi », « la ville Bruxelles »… : article et niveau portés par l'i18n.
  const scopeLabel = scope ? t(`events.levelOf.${scope.level}`, { name: scope.name }) : '';
  const twoCols: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 };

  return (
    <form
      // min / max / required ne servent que d'indications aux sélecteurs : la validation passe par
      // `errors` et ses messages traduits, pas par les bulles natives (langue du navigateur).
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* 1. Type d'action — chips (spec §4.2). */}
      <Field label={t('events.form.type')}>
        <div role="radiogroup" aria-label={t('events.form.type')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {typeOptions.map((ty) => (
            <TypeChip key={ty.id} selected={ty.id === typeId} onClick={() => setTypeId(ty.id)}>
              {typeLabel(ty, lang)}
            </TypeChip>
          ))}
        </div>
      </Field>

      {/* RG-EVT-01 : type « Autre » → libellé libre obligatoire. */}
      {type?.requiresLabel && (
        <Field label={t('events.form.customLabel')} hint={showErr('label')}>
          <Input
            value={customLabel}
            maxLength={LABEL_MAX}
            autoFocus={!isEdit}
            placeholder={t('events.form.customLabelPlaceholder')}
            onChange={(e) => setCustomLabel(e.target.value)}
          />
        </Field>
      )}

      {showTitle && (
        <Field label={t('events.form.title')} hint={!isDone ? t('events.form.titleHint') : undefined}>
          <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      )}

      {/* 2. Date — aujourd'hui par défaut ; bornée à aujourd'hui (local) pour une déclaration (contrat §1.4). */}
      <div style={twoCols}>
        <Field label={showEndDate ? t('events.form.startDate') : t('events.form.date')} hint={showErr('date')}>
          <Input
            type="date"
            value={eventDate}
            max={isDone ? today : undefined}
            required
            onChange={(e) => setEventDate(e.target.value)}
          />
        </Field>
        {showEndDate && (
          <Field label={t('events.form.endDate')} hint={showErr('endDate') ?? t('common.optional')}>
            <Input
              type="date"
              value={endDate}
              min={eventDate || undefined}
              max={isDone ? today : undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* 3. Lieu. */}
      <Field label={t('events.form.place')} hint={t('common.optional')}>
        <Input
          value={place}
          maxLength={PLACE_MAX}
          placeholder={t('events.form.placePlaceholder')}
          onChange={(e) => setPlace(e.target.value)}
        />
      </Field>

      {/* 4–5. Participants / âmes gagnées (à la clôture pour un évènement programmé, D-EVT-02). */}
      {showCounts && (
        <div style={twoCols}>
          <Field label={t('events.form.participants')} hint={showErr('participants') ?? t('common.optional')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
            />
          </Field>
          <Field label={t('events.form.soulsWon')} hint={showErr('soulsWon') ?? t('common.optional')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={soulsWon}
              onChange={(e) => setSoulsWon(e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* 6. Note (≤ 280). */}
      <Field label={t('events.form.note')} hint={t('events.form.noteHint', { n: EVENT_NOTE_MAX - note.length })}>
        <textarea
          className="input"
          rows={2}
          maxLength={EVENT_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Field>

      {/* 7. Rattachement (RG-EVT-02) : sélecteur seulement s'il y a un vrai choix (spec §4.3). */}
      {nodes.length > 1 ? (
        <Field label={mode === 'plan' ? t('events.form.planScope') : t('events.form.scope')} hint={showErr('scope')}>
          <Picker
            value={scopeId}
            onChange={setScopeId}
            options={scopeOptions(nodes, t)}
            placeholder={t('events.form.chooseScope')}
          />
        </Field>
      ) : null}
      {scope ? (
        <ScopeBanner>
          {isDone ? t('events.form.bannerDone', { node: scopeLabel }) : t('events.form.bannerPlanned', { node: scopeLabel })}
        </ScopeBanner>
      ) : nodes.length <= 1 ? (
        <ScopeBanner tone="warn">{t('events.form.noScope')}</ScopeBanner>
      ) : null}

      {saveM.isError && (
        <div role="alert" style={{ color: 'var(--err)', fontSize: 13 }}>
          {eventErrorMessage(saveM.error, t)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!typeId || !eventDate || saveM.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Chip de type : sélection en un clic (spec §4.2). */
function TypeChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      style={{
        padding: '7px 13px',
        borderRadius: 999,
        fontSize: 13.5,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${selected ? 'var(--green-700)' : 'var(--line)'}`,
        background: selected ? 'var(--green-700)' : 'var(--ivory-raised)',
        color: selected ? 'var(--ivory)' : 'var(--ink-800)',
        fontWeight: selected ? 600 : 500,
      }}
    >
      {selected && <Icon name="check" size={12} />}
      {children}
    </button>
  );
}

/** Bandeau discret du rattachement (spec §4.2, point 7). */
export function ScopeBanner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 12px',
        borderRadius: 'var(--radius)',
        fontSize: 13,
        background: tone === 'warn' ? 'var(--warn-bg)' : 'var(--green-50)',
        color: tone === 'warn' ? 'var(--warn)' : 'var(--green-800)',
        border: `1px solid ${tone === 'warn' ? 'var(--warn-bg)' : 'var(--green-100)'}`,
      }}
    >
      <Icon name={tone === 'warn' ? 'warning' : 'info'} size={15} />
      <span>{children}</span>
    </div>
  );
}
