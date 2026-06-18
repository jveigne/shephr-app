import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Badge, Button, TopBar } from '../components/ui';
import { AreaChart, HorizontalBars, monthIndexToLabel } from '../components/charts';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { downloadDonationsCsv, getByCategory, getByMonth, getByUnit, getSummary } from '../services/statsApi';
import { listDonations } from '../services/donationApi';
import { fmtAmount, fmtDateLabel, monthLong, startOfMonthISO, todayISO } from '../utils/format';
import { saveBlob } from '../utils/download';
import { categoryKey } from '../constants/categories';

const PRIMARY = 'GBP';

export function DashboardPage() {
  const { me } = useAuth();
  const { push } = useToast();
  const { t } = useTranslation();

  const summaryQ = useQuery({ queryKey: ['stats', 'summary'], queryFn: () => getSummary() });
  const monthsQ = useQuery({ queryKey: ['stats', 'by-month'], queryFn: () => getByMonth() });
  const unitsStatsQ = useQuery({ queryKey: ['stats', 'by-unit'], queryFn: () => getByUnit() });
  const categoryStatsQ = useQuery({ queryKey: ['stats', 'by-category'], queryFn: () => getByCategory() });
  const recentQ = useQuery({
    queryKey: ['donations', 'recent'],
    queryFn: () => listDonations({ size: 10 }),
  });

  const firstName = (me?.fullName ?? '').split(' ')[0];

  const cur =
    summaryQ.data?.currentMonth.find((t) => t.currency === PRIMARY)?.total ?? 0;
  const prev = summaryQ.data?.lastMonth.find((t) => t.currency === PRIMARY)?.total ?? 0;
  const ytd = summaryQ.data?.yearToDate.find((t) => t.currency === PRIMARY)?.total ?? 0;
  const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  const monthsSeries = (monthsQ.data ?? [])
    .filter((m) => m.currency === PRIMARY)
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .slice(-12)
    .map((m) => ({ label: monthIndexToLabel(m.year, m.month), value: m.total }));

  const categoryTotals = (categoryStatsQ.data ?? [])
    .filter((c) => c.currency === PRIMARY)
    .map((c) => ({ name: t(categoryKey(c.category)), total: c.total }))
    .sort((a, b) => b.total - a.total);

  const unitStats = (unitsStatsQ.data ?? []).filter((s) => s.currency === PRIMARY);
  const distinctUnits = new Set(unitStats.map((s) => s.unitId)).size;

  const topUnits = [...unitStats].sort((a, b) => b.total - a.total).slice(0, 5);

  const recent = recentQ.data?.content ?? [];

  const today = new Date();
  const dateLong = `${today.getDate()} ${monthLong(today.getMonth())} ${today.getFullYear()}`;

  return (
    <>
      <TopBar
        title={t('dashboard.title')}
        crumbs={[t('common.brand'), t('dashboard.title')]}
        actions={
          <>
            <Button variant="ghost" iconL={<Icon name="calendar" size={15} />}>{t('dashboard.thisMonth')}</Button>
            <Button
              variant="secondary"
              iconL={<Icon name="download" size={15} />}
              onClick={async () => {
                try {
                  const blob = await downloadDonationsCsv({
                    from: startOfMonthISO(),
                    to: todayISO(),
                  });
                  saveBlob(blob, `dons-${todayISO()}.csv`);
                  push({ kind: 'ok', title: t('dashboard.exportDownloaded'), msg: t('dashboard.csvReady') });
                } catch {
                  push({ kind: 'error', title: t('dashboard.exportFailed'), msg: t('common.retryLater') });
                }
              }}
            >
              {t('dashboard.exportMonth')}
            </Button>
          </>
        }
      />

      <div className="content">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 30,
                fontWeight: 500,
                color: 'var(--green-800)',
                letterSpacing: '-0.015em',
                lineHeight: 1.1,
              }}
            >
              {t('dashboard.greeting')}{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--earth-600)' }}>{firstName || '…'}</em>.
            </div>
            <div style={{ color: 'var(--ink-500)', marginTop: 6, fontSize: 13.5 }}>
              {t('dashboard.overview', { date: dateLong })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, color: 'var(--ink-500)', fontSize: 12.5 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {t('dashboard.currency')}
              </div>
              <div style={{ color: 'var(--ink-800)', fontWeight: 500, marginTop: 2 }}>{PRIMARY} £</div>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <KpiCard label={t('dashboard.kpiTotalMonth')} value={fmtAmount(cur, PRIMARY)} delta={delta} />
          <KpiCard label={t('dashboard.kpiPrevMonth')} value={fmtAmount(prev, PRIMARY)} sub={t('dashboard.kpiVsPrev')} />
          <KpiCard label={t('dashboard.kpiYtd')} value={fmtAmount(ytd, PRIMARY)} sub={t('dashboard.kpiYtdSub')} />
          <KpiCard
            label={t('dashboard.kpiActiveUnits')}
            value={String(distinctUnits)}
            sub={t('dashboard.kpiActiveUnitsSub')}
          />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h3 className="ttl">{t('dashboard.monthlyEvolution')}</h3>
              <div className="sub">{t('dashboard.last12Months')}</div>
            </div>
            <div className="right chart-legend">
              <span>
                <span className="swatch" style={{ background: 'var(--green-700)' }} />
                {t('dashboard.monthlyTotal')}
              </span>
            </div>
          </div>
          <div className="card-body">
            {monthsSeries.length === 0 ? (
              <div className="empty">
                <div className="icon-wrap"><Icon name="inbox" size={26} /></div>
                <h4>{t('dashboard.noDataYet')}</h4>
                <p>{t('dashboard.noDataYetText')}</p>
              </div>
            ) : (
              <AreaChart data={monthsSeries} />
            )}
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="ttl">{t('dashboard.byCategory')}</h3>
                <div className="sub">{t('dashboard.currentPeriod')}</div>
              </div>
            </div>
            <div className="card-body">
              {categoryTotals.length === 0 ? (
                <div className="muted" style={{ padding: '8px 0' }}>{t('dashboard.noCategorized')}</div>
              ) : (
                <HorizontalBars data={categoryTotals} />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="ttl">{t('dashboard.top5Units')}</h3>
                <div className="sub">{t('dashboard.byVolume')}</div>
              </div>
              <div className="right">
                <Link to="/structure/unites">
                  <Button variant="ghost" size="sm">{t('dashboard.seeAll')}</Button>
                </Link>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {topUnits.length === 0 ? (
                <div className="muted" style={{ padding: 22 }}>{t('dashboard.noRanking')}</div>
              ) : (
                topUnits.map((u, i) => {
                  const max = topUnits[0].total;
                  return (
                    <div className="list-row" key={u.unitId}>
                      <div className="rank">{i + 1}</div>
                      <div className="label">
                        <div className="nm">{u.unitName}</div>
                        <div className="sub">{t('dashboard.donationsCount', { count: u.count })}</div>
                      </div>
                      <div className="meter">
                        <div className="fill" style={{ width: `${(u.total / max) * 100}%` }} />
                      </div>
                      <div className="val">{fmtAmount(u.total, u.currency)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="ttl">{t('dashboard.latestDonations')}</h3>
              <div className="sub">{t('dashboard.last10')}</div>
            </div>
            <div className="right">
              <Link to="/donations">
                <Button variant="ghost" size="sm" iconR={<Icon name="arrowRight" size={13} />}>
                  {t('dashboard.seeAllDonations')}
                </Button>
              </Link>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div
              className="activity-row"
              style={{
                borderBottom: '1px solid var(--line)',
                background: 'var(--ivory-raised)',
                fontSize: 11.5,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                color: 'var(--ink-500)',
              }}
            >
              <div>{t('dashboard.colDate')}</div>
              <div>{t('dashboard.colMember')}</div>
              <div>{t('dashboard.colUnit')}</div>
              <div>{t('dashboard.colCategory')}</div>
              <div style={{ textAlign: 'right' }}>{t('dashboard.colAmount')}</div>
            </div>
            {recent.length === 0 && !recentQ.isLoading && (
              <div className="empty">
                <div className="icon-wrap"><Icon name="inbox" size={26} /></div>
                <h4>{t('dashboard.noDonationYet')}</h4>
                <p>{t('dashboard.noDonationYetText')}</p>
              </div>
            )}
            {recent.map((d) => (
              <div className="activity-row" key={d.id}>
                <div className="dt">{fmtDateLabel(d.donationDate)}</div>
                <div className="who">{d.userFullName}</div>
                <div className="where">
                  {d.unitName ?? '—'}
                </div>
                <div>
                  <Badge tone="gray">{t(categoryKey(d.category))}</Badge>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="amount">{fmtAmount(d.amount, d.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: string;
  delta?: number;
  sub?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="kpi">
      <div className="deco" />
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {delta !== undefined ? (
        <div className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
          <Icon name={delta >= 0 ? 'arrowUp' : 'arrowDown'} size={13} />
          {Math.abs(delta).toFixed(1)} %<span className="vs">{t('dashboard.vsLastMonth')}</span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 10 }}>{sub}</div>
      )}
    </div>
  );
}
