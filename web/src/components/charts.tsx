import { useRef, useState } from 'react';
import { monthShort } from '../utils/format';

const fmtMoney = (v: number) => new Intl.NumberFormat('fr-FR').format(Math.round(v));
const fmtShort = (v: number) =>
  v >= 1000 ? `£ ${Math.round(v / 1000)}k` : `£ ${Math.round(v)}`;

// Smooth area chart with hover tooltip — visual identity ported from
// shephr-webapp (Lot 1.1), kept on the app/web real-data signature {label,value}.
export function AreaChart({
  data,
  height = 260,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const w = 800;
  const h = height;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1) * 1.1;
  const min = 0;

  const x = (i: number) => padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const pts = data.map((d, i) => [x(i), y(d.value)] as [number, number]);
  const pathD = pts.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p[0]} ${p[1]}`;
    const prev = arr[i - 1];
    const cx = (prev[0] + p[0]) / 2;
    return `${acc} C ${cx} ${prev[1]}, ${cx} ${p[1]}, ${p[0]} ${p[1]}`;
  }, '');
  const areaD =
    pts.length > 0
      ? `${pathD} L ${pts[pts.length - 1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`
      : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleMove = (e: React.MouseEvent) => {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * w;
    if (localX < padL || localX > w - padR) {
      setHover(null);
      return;
    }
    const ratio = (localX - padL) / innerW;
    const idx = Math.round(ratio * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div className="chart-wrap" style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        style={{ overflow: 'visible', display: 'block' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="areaGreen" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E3A2F" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#1E3A2F" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#1E3A2F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="#BFAB85"
              strokeOpacity="0.25"
              strokeDasharray={i === 0 ? '0' : '3 5'}
            />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7A6B55" fontFamily="Inter">
              {fmtShort(v)}
            </text>
          </g>
        ))}
        {areaD && <path d={areaD} fill="url(#areaGreen)" />}
        {pathD && <path d={pathD} fill="none" stroke="#1E3A2F" strokeWidth="2" strokeLinecap="round" />}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={i === hover ? 5 : 3}
            fill={i === hover ? '#C9956B' : '#1E3A2F'}
            stroke={i === hover ? '#FBF5E4' : 'transparent'}
            strokeWidth="2"
          />
        ))}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="11" fill="#7A6B55" fontFamily="Inter">
            {d.label}
          </text>
        ))}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke="#1E3A2F"
            strokeOpacity="0.18"
            strokeDasharray="3 4"
          />
        )}
      </svg>
      {hover != null && (
        <div
          style={{
            position: 'absolute',
            left: `${(x(hover) / w) * 100}%`,
            top: 4,
            transform: 'translateX(-50%)',
            background: 'var(--green-800)',
            color: '#FBF5E4',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 11 }}>{data[hover].label}</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>£ {fmtMoney(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

export function HorizontalBars({ data }: { data: { name: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 4px' }}>
      {data.map((d) => {
        const pct = (d.total / max) * 100;
        return (
          <div key={d.name}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
                fontSize: 13,
                color: 'var(--ink-800)',
              }}
            >
              <span style={{ fontWeight: 500 }}>{d.name}</span>
              <span
                style={{
                  color: 'var(--green-800)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                £ {fmtMoney(d.total)}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: 'var(--parchment-deep)',
                borderRadius: 999,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, var(--green-700), var(--green-600))',
                  borderRadius: 999,
                  transition: 'width .6s cubic-bezier(.22,.9,.33,1)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function monthIndexToLabel(year: number, monthOneBased: number): string {
  const m = (((monthOneBased - 1) % 12) + 12) % 12;
  const shortYear = String(year).slice(-2);
  return `${capitalize(monthShort(m))} ${shortYear}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
