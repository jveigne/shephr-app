import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Modal } from './ui';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { EventCountFields, EventForm } from './EventForm';
import { EventStatusBadges } from './EventsTable';
import {
  cancelEvent,
  deleteEvent,
  getEvent,
  getMyEventScopes,
  listEventTypes,
  markEventDone,
  setEventToVerify,
  type EventResponse,
} from '../services/eventsApi';
import {
  EVENT_KEYS,
  countKeysFor,
  errCode,
  eventErrorMessage,
  eventTypeLabel,
  fmtEventDates,
  initialCountValues,
  EVENT_NOTE_MAX,
  invalidateEvents,
  levelKey,
  parseCount,
  todayLocal,
  typeLabel,
  type EventCountKey,
} from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Détail d'un évènement + gestes permis par le serveur (contrat §4, boutons dérivés) :
//   - « Marquer comme réalisé » / « Annuler »  ⇔ canEdit && PLANNED (RG-EVT-06) ;
//   - « Modifier » / « Supprimer »             ⇔ canEdit (RG-ACT-06, RG-EVT-04) ;
//   - « À vérifier »                           ⇔ canFlag (RG-ACT-07 : informatif, ne retire
//     jamais du total).
//  Aucun droit n'est recalculé ici : un 403 (périmètre changé entre-temps) s'affiche en toast.
// ---------------------------------------------------------------------------------------------

type View = 'detail' | 'edit' | 'done';

export function EventDetailModal({
  eventId,
  initial,
  onClose,
}: {
  eventId: string;
  /** Ligne de liste déjà connue : affichée tout de suite, le détail frais la remplace. */
  initial?: EventResponse;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { push } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('detail');
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);

  const detailQ = useQuery({
    queryKey: [...EVENT_KEYS.data, 'detail', eventId],
    queryFn: () => getEvent(eventId),
    placeholderData: initial,
    retry: (count, err) => errCode(err) !== 'RESOURCE_NOT_FOUND' && count < 1,
  });
  const event = detailQ.data ?? null;

  // Catalogue nécessaire à la modification seulement (déjà en cache depuis la page, le plus souvent).
  const typesQ = useQuery({ queryKey: EVENT_KEYS.types, queryFn: listEventTypes, enabled: view === 'edit' });
  const scopesQ = useQuery({ queryKey: EVENT_KEYS.scopes, queryFn: getMyEventScopes, enabled: view === 'edit' });

  const onActionError = (title: string) => (err: unknown) =>
    push({ kind: 'error', title, msg: eventErrorMessage(err, t) });

  const applied = (saved: EventResponse | null, title: string) => {
    if (saved) qc.setQueryData([...EVENT_KEYS.data, 'detail', eventId], saved);
    void invalidateEvents(qc);
    push({ kind: 'ok', title });
  };

  const cancelM = useMutation({
    mutationFn: () => cancelEvent(eventId),
    onSuccess: (saved) => {
      setConfirm(null);
      applied(saved, t('events.detail.cancelled'));
    },
    onError: onActionError(t('events.detail.cancelFailed')),
  });

  const deleteM = useMutation({
    mutationFn: () => deleteEvent(eventId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...EVENT_KEYS.data, 'detail', eventId] });
      void invalidateEvents(qc);
      push({ kind: 'ok', title: t('events.detail.deleted') });
      onClose();
    },
    onError: onActionError(t('events.detail.deleteFailed')),
  });

  const flagM = useMutation({
    mutationFn: (toVerify: boolean) => setEventToVerify(eventId, toVerify),
    onSuccess: (saved) =>
      applied(saved, saved.toVerify ? t('events.detail.flagged') : t('events.detail.unflagged')),
    onError: onActionError(t('events.detail.flagFailed')),
  });

  const title = event ? eventTypeLabel(event, lang) : t('events.detail.title');

  const body = (() => {
    if (!event) {
      if (detailQ.isError) {
        return (
          <p style={{ margin: 0, color: 'var(--ink-500)' }}>
            {errCode(detailQ.error) === 'RESOURCE_NOT_FOUND'
              ? t('events.detail.gone')
              : eventErrorMessage(detailQ.error, t)}
          </p>
        );
      }
      return <p style={{ margin: 0, color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (view === 'edit') {
      if (typesQ.isLoading || scopesQ.isLoading) {
        return <p style={{ margin: 0, color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
      }
      if (!typesQ.data || !scopesQ.data) {
        return (
          <p style={{ margin: 0, color: 'var(--err)' }}>
            {eventErrorMessage(typesQ.error ?? scopesQ.error, t)}
          </p>
        );
      }
      return (
        <EventForm
          mode="edit"
          event={event}
          types={typesQ.data}
          scopes={scopesQ.data}
          onCancel={() => setView('detail')}
          onSaved={(saved) => {
            qc.setQueryData([...EVENT_KEYS.data, 'detail', eventId], saved);
            push({ kind: 'ok', title: t('events.detail.updated') });
            setView('detail');
          }}
        />
      );
    }
    if (view === 'done') {
      return (
        <DoneForm
          event={event}
          onCancel={() => setView('detail')}
          onDone={(saved) => {
            applied(saved, t('events.detail.markedDone'));
            setView('detail');
          }}
        />
      );
    }
    return <EventDetailBody event={event} />;
  })();

  // RG-EVT-05 : un évènement programmé ne se clôture qu'une fois sa date arrivée.
  const notYetHeld = event != null && event.eventDate > todayLocal();
  const busy = cancelM.isPending || deleteM.isPending || flagM.isPending;

  const footer =
    event && view === 'detail' ? (
      <>
        {event.canEdit && (
          <Button
            variant="danger"
            iconL={<Icon name="trash" size={14} />}
            onClick={() => setConfirm('delete')}
            disabled={busy}
            style={{ marginRight: 'auto' }}
          >
            {t('common.delete')}
          </Button>
        )}
        {event.canFlag && (
          <Button
            variant="ghost"
            iconL={<Icon name="warning" size={14} />}
            onClick={() => flagM.mutate(!event.toVerify)}
            disabled={busy}
          >
            {event.toVerify ? t('events.detail.unflag') : t('events.detail.flag')}
          </Button>
        )}
        {event.canEdit && (
          <Button variant="secondary" iconL={<Icon name="edit" size={14} />} onClick={() => setView('edit')} disabled={busy}>
            {t('common.edit')}
          </Button>
        )}
        {event.canEdit && event.status === 'PLANNED' && (
          <>
            <Button variant="secondary" onClick={() => setConfirm('cancel')} disabled={busy}>
              {t('events.detail.cancel')}
            </Button>
            <Button
              variant="primary"
              iconL={<Icon name="check" size={14} />}
              onClick={() => setView('done')}
              disabled={busy || notYetHeld}
              title={notYetHeld ? t('events.detail.notYetHeld') : undefined}
            >
              {t('events.detail.markDone')}
            </Button>
          </>
        )}
        {!event.canEdit && (
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        )}
      </>
    ) : !event ? (
      <Button variant="ghost" onClick={onClose}>
        {t('common.close')}
      </Button>
    ) : undefined;

  return (
    <>
      {/* Chaque Modal écoute Échap sur window : tant que la confirmation est ouverte, Échap ne
          referme qu'elle et ramène au détail. */}
      <Modal
        open
        size={view === 'edit' ? 'lg' : undefined}
        onClose={confirm ? () => setConfirm(null) : onClose}
        title={view === 'edit' ? t('events.detail.editTitle') : view === 'done' ? t('events.detail.markDone') : title}
        sub={event ? <EventStatusBadges event={event} /> : undefined}
        footer={footer}
      >
        {body}
      </Modal>

      <Modal
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? t('common.deleteTitle') : t('events.detail.cancelTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t('events.detail.keep')}
            </Button>
            {confirm === 'delete' ? (
              <Button variant="danger" onClick={() => deleteM.mutate()} disabled={deleteM.isPending}>
                {deleteM.isPending ? t('common.deleting') : t('common.delete')}
              </Button>
            ) : (
              <Button variant="danger" onClick={() => cancelM.mutate()} disabled={cancelM.isPending}>
                {cancelM.isPending ? t('common.saving') : t('events.detail.cancel')}
              </Button>
            )}
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {confirm === 'delete'
            ? event?.counted
              ? t('events.detail.deleteConfirmCounted')
              : t('events.detail.deleteConfirm')
            : t('events.detail.cancelConfirm')}
        </p>
      </Modal>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--ink-500)' }}>{label}</span>
      <span style={{ color: 'var(--ink-800)', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

function EventDetailBody({ event }: { event: EventResponse }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const dash = <span style={{ color: 'var(--ink-400)' }}>—</span>;
  return (
    <div>
      {event.title && <Row label={t('events.form.title')}>{event.title}</Row>}
      {event.customLabel && (
        <Row label={t('events.detail.type')}>{t('events.detail.otherType', { name: typeLabel({ name: event.typeName, nameEn: event.typeNameEn }, lang) })}</Row>
      )}
      <Row label={t('events.detail.date')}>{fmtEventDates(event, lang)}</Row>
      <Row label={t('events.detail.scope')}>
        {event.scopeName ?? '—'}
        <span style={{ color: 'var(--ink-500)' }}> · {t(levelKey(event.scopeLevel))}</span>
      </Row>
      <Row label={t('events.form.place')}>{event.place ?? dash}</Row>
      {/* D-EVT-15 : conversions / restaurations / baptêmes n'existent que pour un type évangélique. */}
      {countKeysFor(event.evangelism).map((k) => (
        <Row key={k} label={t(`events.counters.${k}`)}>{event[k] ?? dash}</Row>
      ))}
      <Row label={t('events.form.note')}>
        {event.note ? <span style={{ whiteSpace: 'pre-wrap' }}>{event.note}</span> : dash}
      </Row>
      <Row label={t('events.detail.author')}>{event.createdByName}</Row>
      {event.status === 'DONE' && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-500)' }}>
          {event.counted
            ? event.toVerify
              ? t('events.detail.countedToVerify')
              : t('events.detail.counted')
            : t('events.detail.notCountedHint')}
        </p>
      )}
      {!event.canEdit && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('events.detail.readOnly')}</p>
      )}
    </div>
  );
}

/**
 * « Marquer comme réalisé » (D-EVT-02, RG-EVT-06) : compteurs et note saisis à ce moment —
 * participants, + conversions / restaurations / baptêmes pour un type évangélique (D-EVT-15 ; le
 * type ne change pas à la clôture, seuls ceux-là sont proposés et envoyés). Contrat §3.8 : un champ
 * ABSENT garde sa valeur — un compteur vide n'est donc pas envoyé ; la note est préremplie et
 * toujours renvoyée ("" l'efface).
 * Un compte prérempli puis vidé n'est donc PAS effacé par /done : l'aide le dit explicitement
 * (sinon l'ancienne valeur resterait dans les statistiques à l'insu du dirigeant) ; l'effacer passe
 * par « Modifier » (PATCH = remplacement complet, §3.7).
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
  const { t } = useTranslation();
  const [counts, setCounts] = useState(() => initialCountValues(event));
  const [note, setNote] = useState(event.note ?? '');

  const countKeys = countKeysFor(event.evangelism);
  const parsed = (k: EventCountKey) => parseCount(counts[k]);
  const countHint = (k: EventCountKey) =>
    parsed(k) === undefined ? (
      <span style={{ color: 'var(--err)' }}>{t('events.form.countInvalid')}</span>
    ) : counts[k].trim() === '' && event[k] != null ? (
      <span style={{ color: 'var(--warn)' }}>{t('events.detail.countKept', { n: event[k] })}</span>
    ) : (
      t('common.optional')
    );
  const ok = countKeys.every((k) => parsed(k) !== undefined);

  const doneM = useMutation({
    mutationFn: () =>
      markEventDone(event.id, {
        ...Object.fromEntries(countKeys.flatMap((k) => (parsed(k) != null ? [[k, parsed(k)]] : []))),
        note: note.trim(),
      }),
    onSuccess: onDone,
  });

  return (
    <form
      // Validation par nos messages traduits, pas par les bulles natives du navigateur.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !doneM.isPending) doneM.mutate();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-700)' }}>
        {event.evangelism ? t('events.detail.markDoneIntroEvangelism') : t('events.detail.markDoneIntro')}
      </p>
      <EventCountFields
        keys={countKeys}
        values={counts}
        onChange={(k, v) => setCounts((c) => ({ ...c, [k]: v }))}
        hint={countHint}
        autoFocus
      />
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
      {doneM.isError && (
        <div role="alert" style={{ color: 'var(--err)', fontSize: 13 }}>
          {eventErrorMessage(doneM.error, t)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!ok || doneM.isPending}>
          {doneM.isPending ? t('common.saving') : t('events.detail.markDone')}
        </Button>
      </div>
    </form>
  );
}
