import { monthShort } from '../utils/format';

export function AreaChart({
  data,
  height = 260,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const W = 800;
  const H = height;
  const padL = 56;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = 0;
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const points = data.map((d, i) => {
    const x = padL + i * step;
    const y = padT + innerH - ((d.value - min) / (max - min || 1)) * innerH;
    return { x, y, value: d.value, label: d.label };
  });
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${padL + innerW} ${padT + innerH} L ${padL} ${padT + innerH} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height}>
      <defs>
        <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2A5142" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2A5142" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yTicks.map((t, i) => {
        const y = padT + innerH - (t / max) * innerH;
        return (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="rgba(122,107,85,.18)" strokeDasharray="2 4" />
            <text x={padL - 8} y={y + 3} fontSize="10" textAnchor="end" fill="#7A6B55" fontFamily="JetBrains Mono">
              £ {Math.round(t / 1000)}k
            </text>
          </g>
        );
      })}

      <path d={area} fill="url(#area-fill)" />
      <path d={line} stroke="#2A5142" strokeWidth="2" fill="none" />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#2A5142" />
          <text
            x={p.x}
            y={H - 14}
            fontSize="10.5"
            textAnchor="middle"
            fill="#7A6B55"
            fontFamily="Inter"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HorizontalBars({ data }: { data: { name: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d) => (
        <div key={d.name}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12.5,
              marginBottom: 4,
              color: 'var(--ink-700)',
            }}
          >
            <span>{d.name}</span>
            <span
              style={{
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                color: 'var(--green-800)',
              }}
            >
              £ {new Intl.NumberFormat('fr-FR').format(d.total)}
            </span>
          </div>
          <div
            style={{
              height: 8,
              background: 'var(--parchment-deep)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(d.total / max) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--green-700), var(--earth-500))',
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function monthIndexToLabel(year: number, monthOneBased: number): string {
  const m = ((monthOneBased - 1) % 12 + 12) % 12;
  const shortYear = String(year).slice(-2);
  return `${capitalize(monthShort(m))} ${shortYear}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
