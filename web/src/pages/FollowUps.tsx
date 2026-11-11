import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Drawer, Field, Input, Picker, Table, Toggle, TopBar, type Column, type PickerOption } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { ContactButtons } from '../components/EventRegistrations';
import {
  getFollowUp,
  getFollowUpScope,
  listFollowUps,
  updateFollowUp,
  type FollowUpDetail,
  type FollowUpListParams,
  type FollowUpStatus,
  type FollowUpSummary,
} from '../services/followUpsApi';
import { phoneDisplay } from '../utils/contactLinks';

// ---------------------------------------------------------------------------------------------
//  « Personnes à suivre » — lot « conf-pays » (D-PAYS-13, RG-PAYS-30..34, JP 11/11 ; contrat 11_11_2026/02 §9 / §10.3).
//  Comptes SANS assemblée ayant consenti au recontact, suivis par la GÉOGRAPHIE (dirigeants de la ville / région /
//  nation, secrétariat ; superAdmin en lecture) — séparé de Member Care (chaîne, comptes rattachés). Le serveur filtre
//  chaque ligne (`canView`) et décide de l'écriture (`canEdit`) : rien n'est recalculé ici.
//  Relance (Q7) : Appeler / WhatsApp / E-mail, aucun envoi groupé. `INTEGREE` et `NE_SOUHAITE_PAS` ne sont jamais posés
//  par un dirigeant (E-06) ; une fiche `NE_SOUHAITE_PAS` est en lecture seule, sans coordonnées (RG-PAYS-34).
// ---------------------------------------------------------------------------------------------

const STATUSES: FollowUpStatus[] = ['A_CONTACTER', 'CONTACTEE', 'INTEGREE', 'NE_SOUHAITE_PAS'];
const STATUS_TONE: Record<FollowUpStatus, 'warn' | 'green' | 'ok' | 'gray'> = {
  A_CONTACTER: 'warn',
  CONTACTEE: 'green',
  INTEGREE: 'ok',
  NE_SOUHAITE_PAS: 'gray',
};
const DEFAULT_STATUS = '__active';
const ALL_CITIES = '__all';
const WITHOUT_CITY = '__none';
const NOTE_MAX = 2000;

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const FU_KEY = ['follow-ups'] as const;

export function FollowUpsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  const scopeQ = useQuery({ queryKey: [...FU_KEY, 'scope'], queryFn: getFollowUpScope });

  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [city, setCity] = useState(ALL_CITIES);
  const [noShow, setNoShow] = useState(false);
  const [newThisMonth, setNewThisMonth] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  const params: FollowUpListParams = {
    status: status === DEFAULT_STATUS ? undefined : (status as FollowUpStatus),
    localityId: city !== ALL_CITIES && city !== WITHOUT_CITY ? city : undefined,
    withoutCity: city === WITHOUT_CITY || undefined,
    noShow: noShow || undefined,
    newThisMonth: newThisMonth || undefined,
    q: debouncedQ.length >= 2 ? debouncedQ : undefined,
  };
  const canView = scopeQ.data?.canView === true;
  const listQ = useQuery({ queryKey: [...FU_KEY, 'list', params], queryFn: () => listFollowUps(params), enabled: canView });

  const statusOptions: PickerOption[] = [
    { id: DEFAULT_STATUS, label: t('followUps.filters.active') },
    ...STATUSES.map((s) => ({ id: s, label: t(`followUps.status.${s}`) })),
  ];
  const cityOptions: PickerOption[] = [
    { id: ALL_CITIES, label: t('followUps.filters.allCities') },
    { id: WITHOUT_CITY, label: t('followUps.filters.withoutCity') },
    ...(scopeQ.data?.localities ?? []).map((l) => ({ id: l.id, label: l.name })),
  ];
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language) : '—');

  const columns: Column<FollowUpSummary & { id: string }>[] = [
    {
      label: t('followUps.cols.person'),
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{r.fullName}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{r.cityName ?? t('followUps.noCity')}</div>
        </div>
      ),
    },
    { label: t('followUps.cols.status'), render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{t(`followUps.status.${r.status}`)}</Badge> },
    {
      label: t('followUps.cols.events'),
      render: (r) => (
        <span style={{ fontSize: 12.5, color: 'var(--ink-600)' }}>
          {t('followUps.eventsSummary', { registered: r.registrationCount, attended: r.attendedCount, noShow: r.noShowCount })}
        </span>
      ),
    },
    { label: t('followUps.cols.lastContact'), render: (r) => <span style={{ fontSize: 12.5 }}>{fmtDate(r.lastContactAt)}</span> },
    {
      label: t('followUps.cols.contact'),
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <ContactButtons phoneNumber={r.phoneNumber} phoneCountryCode={r.phoneCountryCode} email={r.email} />
        </span>
      ),
    },
  ];

  return (
    <>
      <TopBar title={t('followUps.title')} crumbs={[t('common.brand'), t('followUps.title')]} />
      <div className="content">
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13.5, maxWidth: 760 }}>{t('followUps.sub')}</p>
        {scopeQ.isLoading ? (
          <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
        ) : !canView ? (
          <div className="card" style={{ padding: '18px 20px' }}>{t('followUps.noAccess')}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10, marginBottom: 12 }}>
              <Picker value={status} onChange={setStatus} options={statusOptions} placeholder={t('followUps.cols.status')} />
              <Picker value={city} onChange={setCity} options={cityOptions} placeholder={t('followUps.filters.allCities')} searchFrom={8} />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('followUps.filters.search')} icon={<Icon name="search" size={14} />} />
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
              <Toggle checked={noShow} onChange={setNoShow} label={t('followUps.filters.noShow')} />
              <Toggle checked={newThisMonth} onChange={setNewThisMonth} label={t('followUps.filters.newThisMonth')} />
            </div>
            <div className="card">
              {listQ.isLoading ? (
                <p style={{ padding: '16px 22px', margin: 0, color: 'var(--ink-500)' }}>{t('common.loading')}</p>
              ) : listQ.isError ? (
                <p role="alert" style={{ padding: '16px 22px', margin: 0, color: 'var(--err)' }}>{errMsg(listQ.error, t('common.error'))}</p>
              ) : (
                <Table
                  columns={columns}
                  rows={(listQ.data ?? []).map((r) => ({ ...r, id: r.userId }))}
                  onRowClick={(r) => navigate(`/follow-ups/${r.userId}`)}
                  empty={<p style={{ margin: 0, padding: '16px 22px', color: 'var(--ink-500)', fontSize: 13 }}>{t('followUps.empty')}</p>}
                />
              )}
            </div>
          </>
        )}
      </div>
      {userId && canView && <FollowUpDrawer userId={userId} onClose={() => navigate('/follow-ups')} />}
    </>
  );
}

function FollowUpDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...FU_KEY, 'detail', userId], queryFn: () => getFollowUp(userId), retry: false });
  const d = q.data;
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setNote(null), [userId]);
  const noteValue = note ?? d?.note ?? '';

  const saveM = useMutation({
    mutationFn: (body: Parameters<typeof updateFollowUp>[1]) => updateFollowUp(userId, body),
    onSuccess: (saved: FollowUpDetail) => {
      qc.setQueryData([...FU_KEY, 'detail', userId], saved);
      void qc.invalidateQueries({ queryKey: [...FU_KEY, 'list'] });
      setNote(null);
      push({ kind: 'ok', title: t('followUps.saved') });
    },
    onError: (err) => {
      const code = errCode(err);
      const known = code && ['FOLLOW_UP_OPTED_OUT', 'FOLLOW_UP_STATUS_FORBIDDEN', 'UNAUTHORIZED_ACCESS'].includes(code);
      push({ kind: 'error', title: known ? t(`followUps.errors.${code}`) : t('common.failure'), msg: known ? undefined : errMsg(err, t('common.error')) });
    },
  });

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language) : '—');
  const editable = !!d && d.canEdit && (d.status === 'A_CONTACTER' || d.status === 'CONTACTEE');

  const body = (() => {
    if (q.isLoading) return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    if (q.isError || !d) {
      const code = errCode(q.error);
      return <p role="alert" style={{ color: 'var(--err)' }}>{code === 'RESOURCE_NOT_FOUND' ? t('followUps.gone') : code === 'UNAUTHORIZED_ACCESS' ? t('followUps.errors.UNAUTHORIZED_ACCESS') : errMsg(q.error, t('common.error'))}</p>;
    }
    const phone = phoneDisplay(d.phoneNumber, d.phoneCountryCode);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={STATUS_TONE[d.status]} dot>{t(`followUps.status.${d.status}`)}</Badge>
          <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{d.cityName ?? t('followUps.noCity')}</span>
        </div>
        {d.status === 'NE_SOUHAITE_PAS' && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-600)' }}>{t('followUps.optedOutHint')}</p>}
        {d.status === 'INTEGREE' && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-600)' }}>{t('followUps.integratedHint')}</p>}
        <div style={{ fontSize: 13.5, color: 'var(--ink-700)', display: 'grid', gap: 4 }}>
          {phone && <span style={{ fontFamily: 'var(--font-mono)' }}>{phone}</span>}
          {d.email && <span>{d.email}</span>}
          <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
            {t('followUps.consentOn', { date: fmt(d.consentAt) })} · {t('followUps.lastContact', { date: fmt(d.lastContactAt) })}
          </span>
        </div>
        {d.status !== 'NE_SOUHAITE_PAS' && (
          <ContactButtons phoneNumber={d.phoneNumber} phoneCountryCode={d.phoneCountryCode} email={d.email} />
        )}
        {editable && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['A_CONTACTER', 'CONTACTEE'] as const).map((s) => (
              <Button key={s} variant={d.status === s ? 'primary' : 'secondary'} disabled={saveM.isPending || d.status === s} onClick={() => saveM.mutate({ status: s })}>
                {t(`followUps.status.${s}`)}
              </Button>
            ))}
            <Button variant="ghost" disabled={saveM.isPending} onClick={() => saveM.mutate({ markContacted: true })}>
              {t('followUps.markContacted')}
            </Button>
          </div>
        )}
        <Field label={t('followUps.note')} hint={editable ? t('followUps.noteHint', { n: NOTE_MAX - noteValue.length }) : undefined}>
          <textarea
            className="input"
            rows={4}
            maxLength={NOTE_MAX}
            value={noteValue}
            readOnly={!editable}
            onChange={(e) => setNote(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
        {editable && note !== null && note !== (d.note ?? '') && (
          <div>
            <Button variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate({ note })}>{t('common.save')}</Button>
          </div>
        )}
        <div>
          <h4 style={{ margin: '6px 0 8px', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 16, color: 'var(--green-800)' }}>
            {t('followUps.registrations')}
          </h4>
          {d.registrations.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>{t('followUps.noRegistrations')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {d.registrations.map((r) => (
                <div key={`${r.eventId}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{fmt(r.eventDate)} · {r.scopeName}</div>
                  </div>
                  {r.registrationStatus === 'CANCELED' ? (
                    <Badge tone="gray">{t('followUps.reg.canceled')}</Badge>
                  ) : r.attended === true ? (
                    <Badge tone="ok">{t('events.registration.came')}</Badge>
                  ) : r.attended === false ? (
                    <Badge tone="err">{t('events.registration.didNotCome')}</Badge>
                  ) : (
                    <Badge tone="gray">{r.eventStatus === 'CANCELLED' ? t('events.open.cancelled') : t('followUps.reg.registered')}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  })();

  return (
    <Drawer open onClose={onClose} title={d?.fullName ?? t('followUps.title')} sub={d?.updatedByName ? t('followUps.updatedBy', { name: d.updatedByName, date: fmt(d.updatedAt) }) : undefined}>
      {body}
    </Drawer>
  );
}
