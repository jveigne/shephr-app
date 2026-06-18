import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryTimeline } from '../services/goalsApi';
import { monthShort } from '../utils/format';

/**
 * Courbe d'évolution dans le temps (versé CUMULÉ par mois) d'une catégorie, à un niveau.
 * Trace l'aire cumulée + une ligne de cible (engagé effectif) en pointillés.
 */
function CategoryCurve({
  timeline,
  format,
  height = 180,
}: {
  timeline: CategoryTimeline;
  /** Formate une valeur (montant ou nombre) selon la catégorie. */
  format: (v: number) => string;
  height?: number;
}) {
  const { t } = useTranslation();
  const currency = timeline.unitType === 'CURRENCY';
  const pts = timeline.points.map((p) => ({
    label: p.period,
    value: (currency ? p.cumulativeAmount : p.cumulativeCount) ?? 0,
  }));
  const target = (currency ? timeline.targetAmount : timeline.targetCount) ?? 0;

  const padL = 52;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const w = 760;
  const h = height;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...pts.map((d) => d.value), target, 1) * 1.1;

  const x = (i: number) => padL + (pts.length <= 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const monthLabel = (period: string) => {
    const m = parseInt(period.split('-')[1] ?? '1', 10);
    return monthShort(Math.max(0, Math.min(11, m - 1)));
  };

  const coords = pts.map((d, i) => [x(i), y(d.value)] as [number, number]);
  const pathD = coords.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p[0]} ${p[1]}`;
    const prev = arr[i - 1];
    const cx = (prev[0] + p[0]) / 2;
    return `${acc} C ${cx} ${prev[1]}, ${cx} ${p[1]}, ${p[0]} ${p[1]}`;
  }, '');
  const areaD =
    coords.length > 0
      ? `${pathD} L ${coords[coords.length - 1][0]} ${padT + innerH} L ${coords[0][0]} ${padT + innerH} Z`
      : '';

  const yTicks = [0, 0.5, 1].map((t) => max * t);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="tlGreen" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1E3A2F" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#1E3A2F" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#BFAB85" strokeOpacity="0.25" strokeDasharray={i === 0 ? '0' : '3 5'} />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7A6B55" fontFamily="Inter">
            {format(v)}
          </text>
        </g>
      ))}
      {/* Ligne de cible (engagé effectif) */}
      {target > 0 && (
        <g>
          <line x1={padL} x2={w - padR} y1={y(target)} y2={y(target)} stroke="#C9956B" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={w - padR} y={y(target) - 5} textAnchor="end" fontSize="11" fill="#C9956B" fontFamily="Inter">
            {t('goals.targetLabel', { value: format(target) })}
          </text>
        </g>
      )}
      {areaD && <path d={areaD} fill="url(#tlGreen)" />}
      {pathD && <path d={pathD} fill="none" stroke="#1E3A2F" strokeWidth="2" strokeLinecap="round" />}
      {coords.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={3} fill="#1E3A2F" />
          <text x={p[0]} y={h - 8} textAnchor="middle" fontSize="10" fill="#7A6B55" fontFamily="Inter">
            {monthLabel(pts[i].label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Sélecteur de catégorie + courbe d'évolution cumulée pour le niveau courant. */
export function GoalTimeline({
  data,
  format,
}: {
  data: CategoryTimeline[];
  /** Formate une valeur pour une catégorie donnée (id → fonction). */
  format: (categoryId: string, unitType: string) => (v: number) => string;
}) {
  const { t } = useTranslation();
  const withPoints = data.filter((d) => d.points.length > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const current = withPoints.find((d) => d.categoryId === selected) ?? withPoints[0] ?? null;

  if (withPoints.length === 0) {
    return (
      <p style={{ color: 'var(--ink-400)', fontSize: 13, fontStyle: 'italic' }}>
        {t('goals.noEvolution')}
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {withPoints.map((d) => {
          const active = current?.categoryId === d.categoryId;
          return (
            <button
              key={d.categoryId}
              type="button"
              onClick={() => setSelected(d.categoryId)}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 13,
                cursor: 'pointer',
                border: active ? '1px solid var(--green-700, #1E3A2F)' : '1px solid var(--line, #E0D6C2)',
                background: active ? 'var(--green-700, #1E3A2F)' : 'transparent',
                color: active ? '#FBF5E4' : 'var(--ink-600, #5A4B3A)',
              }}
            >
              {d.categoryCode}
            </button>
          );
        })}
      </div>
      {current && (
        <CategoryCurve timeline={current} format={format(current.categoryId, current.unitType)} />
      )}
    </div>
  );
}
