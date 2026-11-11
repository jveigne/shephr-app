import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from './ui';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { ConsentCheck } from './ConsentCheck';
import { useAuth } from '../hooks/useAuth';
import {
  listEventRegistrations,
  markRegistrationAttendance,
  registerToEvent,
  unregisterFromEvent,
  type EventRegistrationRow,
  type EventStatus,
  type MyEventRegistration,
} from '../services/eventsApi';
import { EVENT_KEYS, errCode, eventErrorMessage, invalidateEvents, todayLocal } from '../utils/events';
import { mailtoHref, phoneDisplay, telHref, whatsappHref } from '../utils/contactLinks';

// ---------------------------------------------------------------------------------------------
//  Évènements ouverts à tous — lot « conf-pays » (D-PAYS-11 / 12, JP 11/11 ; contrat 11_11_2026/02 §8).
//   - `EventRegistrationBlock` : « Je participe » / « Je ne participe plus » pour tout lecteur (RG-PAYS-26) ; la case
//     de consentement n'est montrée que si le compte n'a pas de consentement de contact en cours (`me.contactConsent`)
//     ou si le serveur la réclame (400 `EVENT_REGISTRATION_CONSENT_REQUIRED`).
//   - `EventRegistrations` : liste des inscrits et pointage, réservés à l'organisateur et au SECRETARIAT (`canManageRegistrations`, RG-PAYS-25 / 28, E-15),
//     boutons Appeler / WhatsApp / E-mail (Q7 : aucun envoi groupé). Les compteurs saisis à la main ne sont jamais
//     remplacés (RG-PAYS-29) : « 12 inscrits · 9 venus » s'affiche à côté.
// ---------------------------------------------------------------------------------------------

export function EventRegistrationBlock({
  eventId,
  status,
  eventDate,
  myRegistration,
  canRegister,
}: {
  eventId: string;
  status: EventStatus;
  eventDate: string;
  myRegistration: MyEventRegistration | null | undefined;
  canRegister: boolean | undefined;
}) {
  const { t } = useTranslation();
  const { me, refreshMe } = useAuth();
  const { push } = useToast();
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [needConsent, setNeedConsent] = useState(!me?.contactConsent);
  const registered = myRegistration?.status === 'REGISTERED';
  const stillOpen = status === 'PLANNED' && eventDate >= todayLocal();

  const registerM = useMutation({
    mutationFn: () => registerToEvent(eventId, { consent: needConsent ? consent : null }),
    onSuccess: async () => {
      await invalidateEvents(qc);
      if (needConsent && consent) void refreshMe().catch(() => undefined);
      push({ kind: 'ok', title: t('events.registration.registered') });
    },
    onError: (err) => {
      if (errCode(err) === 'EVENT_REGISTRATION_CONSENT_REQUIRED') setNeedConsent(true);
      push({ kind: 'error', title: t('events.registration.failed'), msg: eventErrorMessage(err, t) });
    },
  });
  const unregisterM = useMutation({
    mutationFn: () => unregisterFromEvent(eventId),
    onSuccess: async () => {
      await invalidateEvents(qc);
      push({ kind: 'ok', title: t('events.registration.unregistered') });
    },
    onError: (err) => push({ kind: 'error', title: t('events.registration.failed'), msg: eventErrorMessage(err, t) }),
  });

  if (!registered && !canRegister) return null;
  const busy = registerM.isPending || unregisterM.isPending;

  return (
    <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 'var(--radius)', background: 'var(--green-50)', border: '1px solid var(--green-100)' }}>
      {registered ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge tone="ok" dot>{t('events.registration.youParticipate')}</Badge>
          {myRegistration?.attended === true && <Badge tone="green">{t('events.registration.attended')}</Badge>}
          {stillOpen && (
            <Button variant="ghost" disabled={busy} onClick={() => unregisterM.mutate()} style={{ marginLeft: 'auto' }}>
              {unregisterM.isPending ? t('common.saving') : t('events.registration.unregister')}
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {needConsent && (
            <ConsentCheck checked={consent} onChange={setConsent}>{t('events.registration.consent')}</ConsentCheck>
          )}
          <div>
            <Button
              variant="primary"
              iconL={<Icon name="check" size={14} />}
              disabled={busy || (needConsent && !consent)}
              onClick={() => registerM.mutate()}
            >
              {registerM.isPending ? t('common.saving') : t('events.registration.register')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Boutons de relance d'une personne (Q7) — masqués quand la donnée manque. */
export function ContactButtons({ phoneNumber, phoneCountryCode, email }: { phoneNumber: string | null; phoneCountryCode: string | null; email: string | null }) {
  const { t } = useTranslation();
  const tel = telHref(phoneNumber, phoneCountryCode);
  const wa = whatsappHref(phoneNumber, phoneCountryCode);
  const mail = mailtoHref(email);
  const linkStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--line)', color: 'var(--green-800)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
    background: 'var(--ivory-card)',
  } as const;
  if (!tel && !wa && !mail) return <span style={{ fontSize: 12.5, color: 'var(--ink-400)' }}>{t('followUps.noContact')}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {tel && <a href={tel} style={linkStyle}>{t('followUps.call')}</a>}
      {wa && <a href={wa} target="_blank" rel="noreferrer" style={linkStyle}>{t('followUps.whatsapp')}</a>}
      {mail && <a href={mail} style={linkStyle}><Icon name="mail" size={12} />{t('followUps.email')}</a>}
    </span>
  );
}

export function EventRegistrations({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const qc = useQueryClient();
  const key = [...EVENT_KEYS.data, 'registrations', eventId];
  const q = useQuery({ queryKey: key, queryFn: () => listEventRegistrations(eventId) });

  const markM = useMutation({
    mutationFn: ({ row, attended }: { row: EventRegistrationRow; attended: boolean | null }) =>
      markRegistrationAttendance(eventId, row.id, { attended }),
    onSuccess: () => void invalidateEvents(qc),
    onError: (err) => push({ kind: 'error', title: t('events.registration.markFailed'), msg: eventErrorMessage(err, t) }),
  });

  const data = q.data;
  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ margin: '0 0 6px', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 17, color: 'var(--green-800)' }}>
        {t('events.registration.listTitle')}
      </h4>
      {q.isLoading ? (
        <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>
      ) : q.isError || !data ? (
        <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{eventErrorMessage(q.error, t)}</p>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-600)' }}>
            {t('events.registration.summary', {
              registered: data.registeredCount, attended: data.attendedCount, absent: data.absentCount, unmarked: data.unmarkedCount,
            })}
          </p>
          {!data.canMarkAttendance && data.items.length > 0 && (
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('events.registration.markLater')}</p>
          )}
          {data.items.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>{t('events.registration.none')}</p>
          ) : (
            <div style={{ border: '1px solid var(--line-soft)', borderRadius: 10, overflow: 'hidden' }}>
              {data.items.map((row) => (
                <div key={row.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--ink-900)' }}>{row.fullName}</strong>
                    <Badge tone={row.unattached ? 'earth' : 'gray'}>
                      {row.unattached ? t('events.registration.unattached') : row.assemblyName ?? '—'}
                    </Badge>
                    {row.followUpStatus && <Badge tone="green">{t(`followUps.status.${row.followUpStatus}`)}</Badge>}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-500)' }}>
                      {t('events.registration.registeredOn', { date: new Date(row.registeredAt).toLocaleDateString(i18n.language) })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {phoneDisplay(row.phoneNumber, row.phoneCountryCode) && (
                      <span style={{ fontSize: 12.5, color: 'var(--ink-600)', fontFamily: 'var(--font-mono)' }}>
                        {phoneDisplay(row.phoneNumber, row.phoneCountryCode)}
                      </span>
                    )}
                    <ContactButtons phoneNumber={row.phoneNumber} phoneCountryCode={row.phoneCountryCode} email={row.email} />
                    <AttendanceSwitch
                      value={row.attended}
                      disabled={!data.canMarkAttendance || markM.isPending}
                      onChange={(attended) => markM.mutate({ row, attended })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Venu / Pas venu / — (non pointé, `attended: null`). */
function AttendanceSwitch({ value, disabled, onChange }: { value: boolean | null; disabled: boolean; onChange: (v: boolean | null) => void }) {
  const { t } = useTranslation();
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: t('events.registration.came') },
    { v: false, label: t('events.registration.didNotCome') },
    { v: null, label: t('events.registration.unmarked') },
  ];
  return (
    <span role="radiogroup" aria-label={t('events.registration.attendance')} style={{ display: 'inline-flex', marginLeft: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(o.v)}
            style={{
              padding: '5px 10px', border: 'none', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
              cursor: disabled ? 'default' : 'pointer', opacity: disabled && !active ? 0.55 : 1,
              background: active ? (o.v === false ? 'var(--err-bg)' : o.v === true ? 'var(--green-800)' : 'var(--ivory)') : 'transparent',
              color: active ? (o.v === false ? 'var(--err)' : o.v === true ? 'var(--on-primary)' : 'var(--ink-700)') : 'var(--ink-600)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}
