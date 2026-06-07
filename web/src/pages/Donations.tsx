import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  Pagination,
  Select,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { listDonations, type DonationResponse } from '../services/donationApi';
import { downloadDonationsCsv, getByUnit } from '../services/statsApi';
import { fmtAmount, fmtDateShort, startOfMonthISO, todayISO } from '../utils/format';
import { CATEGORY_ORDER, CATEGORIES, categoryLabel } from '../constants/categories';
import { saveBlob } from '../utils/download';

const PER_PAGE = 14;

// NB: Localité / Type filters need the admin structure endpoints (/api/church/admin/*),
// which are SUPER_ADMIN-only today. They return in Phase 4 (Lot 4.2 — délégation scopée).
// Units for the filter are sourced from the LEADER-accessible by-unit stats instead.
interface Filters {
  period: 'month' | '30d' | 'ytd' | 'all';
  unitId: string | 'all';
  category: string | 'all';
  member: string;
  minAmount: string;
  maxAmount: string;
}

const DEFAULT_FILTERS: Filters = {
  period: 'month',
  unitId: 'all',
  category: 'all',
  member: '',
  minAmount: '',
  maxAmount: '',
};

export function DonationsPage() {
  const { push } = useToast();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [drawer, setDrawer] = useState<DonationResponse | null>(null);

  const { from, to } = useMemo(() => computeRange(filters.period), [filters.period]);

  // Units the current user can see, derived from the (scoped) by-unit stats.
  const unitsStatsQ = useQuery({ queryKey: ['stats', 'by-unit'], queryFn: () => getByUnit() });
  const units = useMemo(() => {
    const map = new Map<string, string>();
    (unitsStatsQ.data ?? []).forEach((s) => map.set(s.unitId, s.unitName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [unitsStatsQ.data]);

  const donationsQ = useQuery({
    queryKey: ['donations', { from, to, unitId: filters.unitId, category: filters.category, page }],
    queryFn: () =>
      listDonations({
        from,
        to,
        unitId: filters.unitId === 'all' ? undefined : filters.unitId,
        category: filters.category === 'all' ? undefined : filters.category,
        page,
        size: PER_PAGE,
      }),
  });

  const allRows = donationsQ.data?.content ?? [];

  // Client-side narrowing for fields not yet supported by the API (member name, amount range)
  const rows = allRows.filter((d) => {
    if (filters.member && !d.userFullName.toLowerCase().includes(filters.member.toLowerCase())) {
      return false;
    }
    if (filters.minAmount && d.amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount && d.amount > Number(filters.maxAmount)) return false;
    return true;
  });

  const totalElements = donationsQ.data?.totalElements ?? 0;
  const pageCount = donationsQ.data?.totalPages ?? 1;
  const totalAmount = rows.reduce((s, d) => s + d.amount, 0);

  const chips: { key: keyof Filters; label: string; value: string }[] = [];
  if (filters.period !== 'all') chips.push({ key: 'period', label: 'Période', value: periodLabel(filters.period) });
  if (filters.unitId !== 'all') {
    const u = units.find((x) => x.id === filters.unitId);
    chips.push({ key: 'unitId', label: 'Unité', value: u?.name ?? '—' });
  }
  if (filters.category !== 'all') chips.push({ key: 'category', label: 'Catégorie', value: categoryLabel(filters.category) });
  if (filters.member) chips.push({ key: 'member', label: 'Membre', value: filters.member });
  if (filters.minAmount) chips.push({ key: 'minAmount', label: 'Min', value: `£${filters.minAmount}` });
  if (filters.maxAmount) chips.push({ key: 'maxAmount', label: 'Max', value: `£${filters.maxAmount}` });

  const clearChip = (key: keyof Filters) => {
    setFilters((f) => ({ ...f, [key]: DEFAULT_FILTERS[key] }));
    setPage(0);
  };

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
  };

  const onExport = async () => {
    try {
      const blob = await downloadDonationsCsv({
        from,
        to,
        unitId: filters.unitId === 'all' ? undefined : filters.unitId,
      });
      saveBlob(blob, `dons-${todayISO()}.csv`);
      push({ kind: 'ok', title: 'Export téléchargé', msg: 'Fichier CSV prêt.' });
    } catch {
      push({ kind: 'error', title: 'Export impossible', msg: 'Réessayez plus tard.' });
    }
  };

  const cols: Column<DonationResponse>[] = [
    {
      label: 'Date',
      render: (r) => <span className="num">{fmtDateShort(r.donationDate)}</span>,
    },
    {
      label: 'Unité',
      render: (r) => r.unitName ?? <span className="muted">—</span>,
    },
    { label: 'Membre', render: (r) => r.userFullName },
    { label: 'Catégorie', render: (r) => <Badge tone="gray">{categoryLabel(r.category)}</Badge> },
    {
      label: 'Montant',
      cellClass: 'num right',
      style: { textAlign: 'right' },
      render: (r) => <span className="amount">{fmtAmount(r.amount, r.currency)}</span>,
    },
    {
      label: 'Note',
      render: (r) => (
        <span className="muted" style={{ fontSize: 12 }}>
          {r.note ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <TopBar
        title="Dons"
        crumbs={['shephr', 'Dons']}
        actions={
          <Button variant="primary" iconL={<Icon name="download" size={15} />} onClick={onExport}>
            Exporter CSV
          </Button>
        }
      />

      <div className="content">
        <div className="filters">
          <Field label="Période">
            <Select
              value={filters.period}
              onChange={(e) => {
                setFilters({ ...filters, period: e.target.value as Filters['period'] });
                setPage(0);
              }}
            >
              <option value="month">Ce mois-ci</option>
              <option value="30d">30 derniers jours</option>
              <option value="ytd">Année en cours</option>
              <option value="all">Tout</option>
            </Select>
          </Field>
          <Field label="Unité">
            <Select
              value={filters.unitId}
              onChange={(e) => {
                setFilters({ ...filters, unitId: e.target.value });
                setPage(0);
              }}
            >
              <option value="all">Toutes</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catégorie">
            <Select
              value={filters.category}
              onChange={(e) => {
                setFilters({ ...filters, category: e.target.value });
                setPage(0);
              }}
            >
              <option value="all">Toutes</option>
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>{CATEGORIES[k].fr}</option>
              ))}
            </Select>
          </Field>
          <Field label="Membre" style={{ minWidth: 180 }}>
            <Input
              placeholder="Recherche…"
              icon={<Icon name="search" size={14} />}
              value={filters.member}
              onChange={(e) => setFilters({ ...filters, member: e.target.value })}
            />
          </Field>
          <Field label="Min £">
            <Input
              placeholder="0"
              value={filters.minAmount}
              onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
              style={{ width: 90 }}
            />
          </Field>
          <Field label="Max £">
            <Input
              placeholder="∞"
              value={filters.maxAmount}
              onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
              style={{ width: 90 }}
            />
          </Field>
        </div>

        {chips.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-500)', marginRight: 4 }}>
              Filtres actifs :
            </span>
            {chips.map((c, i) => (
              <span className="chip" key={i}>
                <span className="key">{c.label} :</span>
                <span>{c.value}</span>
                <button className="x" onClick={() => clearChip(c.key)}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Tout effacer
            </Button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>
            <strong style={{ color: 'var(--ink-800)' }}>{rows.length}</strong> dons sur la page ·{' '}
            <strong style={{ color: 'var(--green-800)', marginLeft: 6 }}>
              {fmtAmount(totalAmount)}
            </strong>{' '}
            · {totalElements} au total
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<DonationResponse>
            columns={cols}
            rows={rows}
            zebra
            onRowClick={setDrawer}
            empty={
              <div className="empty">
                <div className="icon-wrap">
                  <Icon name="inbox" size={26} />
                </div>
                <h4>Aucun don ne correspond</h4>
                <p>Élargissez la période ou retirez un filtre.</p>
                <Button variant="secondary" onClick={clearAll}>
                  Réinitialiser les filtres
                </Button>
              </div>
            }
          />
          {totalElements > 0 && (
            <Pagination
              page={page + 1}
              pageCount={pageCount}
              total={totalElements}
              perPage={PER_PAGE}
              onPage={(p) => setPage(p - 1)}
            />
          )}
        </div>
      </div>

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title="Détail du don"
        sub={drawer ? `Référence ${drawer.id.slice(0, 8).toUpperCase()}` : undefined}
        footer={
          <Button variant="ghost" onClick={() => setDrawer(null)}>
            Fermer
          </Button>
        }
      >
        {drawer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div
                style={{
                  color: 'var(--ink-500)',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
              >
                Montant
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 36,
                  fontWeight: 500,
                  color: 'var(--green-800)',
                  letterSpacing: '-.015em',
                  marginTop: 4,
                }}
              >
                {fmtAmount(drawer.amount, drawer.currency)}
              </div>
              <div style={{ marginTop: 6 }}>
                <Badge tone="gray">{categoryLabel(drawer.category)}</Badge>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <DetailRow label="Date" value={fmtDateShort(drawer.donationDate)} />
              <DetailRow label="Devise" value={drawer.currency} />
              <DetailRow label="Membre" value={drawer.userFullName} />
              <DetailRow
                label="Saisi le"
                value={new Date(drawer.createdAt).toLocaleString('fr-FR')}
              />
              <DetailRow label="Unité" value={drawer.unitName ?? '—'} full />
              {drawer.note && <DetailRow label="Note" value={drawer.note} full />}
            </div>

            <div className="stat-row">
              <div className="icon-wrap">
                <Icon name="info" size={16} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-800)', fontWeight: 500 }}>
                  Don physique déclaré
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                  Espèces remises lors d'un culte. La saisie est verrouillée 24 h après création.
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

function DetailRow({
  label,
  value,
  full,
}: {
  label: string;
  value: ReactNode;
  full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-500)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 4, color: 'var(--ink-800)' }}>{value}</div>
    </div>
  );
}

function computeRange(period: Filters['period']): { from?: string; to?: string } {
  if (period === 'all') return {};
  if (period === 'month') return { from: startOfMonthISO(), to: todayISO() };
  if (period === '30d') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { from: `${y}-${m}-${day}`, to: todayISO() };
  }
  // ytd
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: todayISO() };
}

function periodLabel(p: Filters['period']) {
  if (p === 'month') return 'Ce mois-ci';
  if (p === '30d') return '30 derniers jours';
  if (p === 'ytd') return 'Année en cours';
  return 'Tout';
}
