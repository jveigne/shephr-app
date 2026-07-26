import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  StatusBadge,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { isSecretariat } from '../services/authApi';
import {
  createCountry,
  deleteCountry,
  listContinents,
  listCountries,
  type ContinentResponse,
  type CountryResponse,
} from '../services/adminApi';
import { ConfirmDelete } from './Zones';

// RDG 25/07 : la création et la suppression d'une NATION sont ouvertes au SECRETARIAT du
// ministère (en plus du back-office SUPER_ADMIN). La modification reste back-office.

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function PaysPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const canWrite = (me?.superAdmin ?? false) || isSecretariat(me);

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<CountryResponse | null>(null);

  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries });
  const continentsQ = useQuery({ queryKey: ['admin', 'continents'], queryFn: listContinents, enabled: canWrite });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'countries'] });

  const createM = useMutation({
    mutationFn: createCountry,
    onSuccess: () => { invalidate(); setCreating(false); push({ kind: 'ok', title: t('countries.created') }); },
    onError: (err) => push({ kind: 'error', title: t('countries.createRefused'), msg: errMsg(err, t('countries.createFailed')) }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteCountry(id),
    onSuccess: () => { invalidate(); setToDelete(null); push({ kind: 'ok', title: t('countries.deleted') }); },
    onError: (err) => push({ kind: 'error', title: t('countries.deleteRefused'), msg: errMsg(err, t('countries.deleteFailed')) }),
  });

  const rows = useMemo(() => {
    const all = countriesQ.data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((c) => `${c.name} ${c.nameEn} ${c.code}`.toLowerCase().includes(q));
  }, [countriesQ.data, search]);

  const cols: Column<CountryResponse>[] = [
    {
      label: t('countries.colCountry'),
      render: (c) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{c.name}</span>
          <Badge tone="gray">{c.code}</Badge>
        </span>
      ),
    },
    { label: t('countries.colContinent'), render: (c) => t(`continents.${c.continentCode}`) },
    { label: t('countries.colCurrency'), render: (c) => c.defaultCurrency },
    { label: t('common.status'), render: (c) => <StatusBadge active={c.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 60 },
          render: (c: CountryResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="trash" size={15} />} danger title={t('common.delete')} onClick={() => setToDelete(c)} />
            </div>
          ),
        } as Column<CountryResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title={t('countries.title')}
        crumbs={[t('common.brand'), t('nav.structure'), t('countries.title')]}
        actions={
          canWrite ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={15} />}
              onClick={() => setCreating(true)}
            >
              {t('countries.newCountry')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        <p className="section-sub">{t('countries.intro')}</p>

        <div className="filters">
          <Field label={t('common.searchLabel')} style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder={t('countries.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('countries.count', { count: rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<CountryResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="globe" size={26} /></div>
                <h4>{t('countries.noCountry')}</h4>
                <p>{canWrite ? t('countries.createFirst') : t('countries.noneInScope')}</p>
              </div>
            }
          />
        </div>
      </div>

      <CountryFormModal
        open={creating}
        onClose={() => setCreating(false)}
        continents={continentsQ.data ?? []}
        ministryId={me?.ministryId ?? null}
        submitting={createM.isPending}
        onSubmit={(payload) => createM.mutate(payload)}
      />

      <ConfirmDelete
        open={toDelete != null}
        label={toDelete ? t('countries.deleteLabel', { name: toDelete.name }) : ''}
        submitting={deleteM.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </>
  );
}

function CountryFormModal({
  open,
  onClose,
  continents,
  ministryId,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  continents: ContinentResponse[];
  ministryId: string | null;
  submitting: boolean;
  onSubmit: (payload: {
    ministryId: string; continentId: string; code: string;
    name: string; nameEn: string; defaultCurrency: string;
  }) => void;
}) {
  const { t, i18n } = useTranslation();
  const isEn = (i18n.resolvedLanguage || i18n.language) === 'en';
  const [continentId, setContinentId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [currency, setCurrency] = useState('');

  useEffect(() => {
    if (open) {
      setContinentId(continents[0]?.id ?? '');
      setCode('');
      setName('');
      setNameEn('');
      setCurrency('');
    }
  }, [open, continents]);

  const codeOk = /^[A-Z]{2}$/.test(code.trim().toUpperCase());
  const currencyOk = /^[A-Z]{3}$/.test(currency.trim().toUpperCase());
  const valid = ministryId != null && continentId !== '' && codeOk && currencyOk
    && name.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('countries.newTitle')}
      sub={t('countries.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() =>
              ministryId && onSubmit({
                ministryId,
                continentId,
                code: code.trim().toUpperCase(),
                name: name.trim(),
                nameEn: nameEn.trim() || name.trim(),
                defaultCurrency: currency.trim().toUpperCase(),
              })
            }
          >
            {submitting ? t('common.saving') : t('common.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('countries.continentLabel')}>
          <Select value={continentId} onChange={(e) => setContinentId(e.target.value)}>
            {continents.map((c) => (
              <option key={c.id} value={c.id}>{isEn ? c.nameEn : c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('countries.nameLabel')}>
          <Input placeholder={t('countries.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('countries.nameEnLabel')} hint={t('countries.nameEnHint')}>
          <Input placeholder={t('countries.nameEnPlaceholder')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={t('countries.codeLabel')} hint={t('countries.codeHint')}>
          <Input placeholder="CM" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label={t('countries.currencyLabel')} hint={t('countries.currencyHint')}>
          <Input placeholder="XAF" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>
      </div>
    </Modal>
  );
}
