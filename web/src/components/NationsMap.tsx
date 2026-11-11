import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import type { Nation } from '../services/goalsApi';
import { ALPHA2_TO_NUMERIC } from '../utils/isoNumeric';

// world-atlas (countries-110m) : géométries dont l'id = code ISO numérique.
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Lot conf-pays P1 (JP 11/11) : couleurs de marque par variables CSS (thème du pays). L'échelle rouge → vert de
// `rateColor` est une couleur d'ÉTAT, jamais réécrite (RG-PAYS-09).
const OUTSIDE = 'var(--parchment-soft)'; // pays hors ministère (pas de données)
const STROKE = 'var(--ivory-card)';

/** Échelle rouge → ambre → vert selon le taux de soumission [0..1]. */
function rateColor(rate: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [192, 73, 47]], // rouge brique
    [0.5, [217, 164, 65]], // ambre
    [1, [47, 143, 91]], // vert
  ];
  const clamped = Math.max(0, Math.min(1, rate));
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = (clamped - lo[0]) / span;
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function NationsMap({
  nations,
  deadlinePast,
  onSelectCountry,
}: {
  nations: Nation[];
  deadlinePast: boolean;
  onSelectCountry?: (countryId: string, name: string) => void;
}) {
  const { t } = useTranslation();
  // Index par code numérique (correspondance avec les géométries).
  const byNumeric = useMemo(() => {
    const m = new Map<string, Nation>();
    nations.forEach((n) => {
      const num = ALPHA2_TO_NUMERIC[(n.code ?? '').toUpperCase()];
      if (num) m.set(num, n);
    });
    return m;
  }, [nations]);

  const [hover, setHover] = useState<{ nation: Nation; x: number; y: number } | null>(null);
  const [filter, setFilter] = useState('');
  const lateNations = nations.filter((n) => n.late).sort((a, b) => a.submissionRate - b.submissionRate);

  const sortedNations = useMemo(
    () => [...nations].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [nations],
  );
  const q = filter.trim().toLowerCase();
  const filteredNations = q
    ? sortedNations.filter((n) => n.name.toLowerCase().includes(q) || (n.code ?? '').toLowerCase().includes(q))
    : sortedNations;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div
        style={{ position: 'relative', flex: '1 1 680px', maxWidth: 880, background: 'var(--ivory-card)', borderRadius: 12, overflow: 'hidden' }}
        onMouseLeave={() => setHover(null)}
      >
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 150 }}
          style={{ width: '100%', height: 'auto' }}
        >
          <ZoomableGroup center={[10, 5]} zoom={1}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const numeric = String(geo.id).padStart(3, '0');
                  const nation = byNumeric.get(numeric);
                  const fill = nation ? rateColor(nation.submissionRate) : OUTSIDE;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={(e) =>
                        nation && setHover({ nation, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e) =>
                        nation && setHover({ nation, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setHover(null)}
                      onClick={() => nation && onSelectCountry?.(nation.countryId, nation.name)}
                      style={{
                        default: {
                          fill,
                          stroke: STROKE,
                          strokeWidth: 0.4,
                          outline: 'none',
                          cursor: nation ? 'pointer' : 'default',
                        },
                        hover: {
                          fill: nation ? 'var(--green-800)' : OUTSIDE,
                          stroke: STROKE,
                          strokeWidth: 0.5,
                          outline: 'none',
                        },
                        pressed: { fill: 'var(--green-800)', outline: 'none' },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {hover && (
          <div
            style={{
              position: 'fixed',
              left: hover.x + 12,
              top: hover.y + 12,
              background: 'var(--green-800)',
              color: 'var(--on-primary)',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: 'nowrap',
              boxShadow: 'var(--shadow-md)',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            <div style={{ fontWeight: 600 }}>{hover.nation.name}</div>
            <div style={{ opacity: 0.85, marginTop: 2 }}>
              {/* RG-BQ-06 : maille PERSONNE — « 7/12 membres », plus « 7/12 assemblées ». */}
              {t('map.membersSubmittedPercent', {
                submitted: hover.nation.submittedMembers,
                total: hover.nation.totalMembers,
                percent: Math.round(hover.nation.submissionRate * 100),
              })}
            </div>
            {hover.nation.late && (
              <div style={{ color: 'var(--err-on-dark)', marginTop: 2 }}>
                {t('map.lateMembers', { count: hover.nation.lateMembers })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Liste cliquable des pays (sélection rapide) */}
      <div style={{ flex: '1 1 240px', minWidth: 220 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('map.searchCountry')}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '7px 12px',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid var(--line)',
            marginBottom: 8,
          }}
        />
        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid var(--line)',
            borderRadius: 10,
          }}
        >
          {filteredNations.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 14px', fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>
              {t('map.noCountry')}
            </p>
          ) : (
            filteredNations.map((n, i) => (
              <button
                key={n.countryId}
                type="button"
                onClick={() => onSelectCountry?.(n.countryId, n.name)}
                onMouseEnter={(e) => setHover({ nation: n, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ nation: n, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                  color: 'var(--ink-700)',
                }}
              >
                <i
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: rateColor(n.submissionRate),
                  }}
                />
                <span style={{ flex: 1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.name}
                </span>
                {n.late && (
                  <span style={{ fontSize: 11, color: 'var(--err)', flexShrink: 0 }}>{t('map.lateShort')}</span>
                )}
                <span style={{ color: 'var(--ink-400)', flexShrink: 0 }}>
                  {Math.round(n.submissionRate * 100)} %
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      </div>

      {/* Légende */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--ink-400)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 60, height: 10, borderRadius: 5, display: 'inline-block', background: 'linear-gradient(90deg, rgb(192,73,47), rgb(217,164,65), rgb(47,143,91))' }} />
          {t('map.legendRate')}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 14, height: 10, borderRadius: 3, display: 'inline-block', background: OUTSIDE }} />
          {t('map.legendOutside')}
        </span>
      </div>

      {/* Nations en retard */}
      {deadlinePast && lateNations.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--err)' }}>
            {t('map.lateNations', { count: lateNations.length })}
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {lateNations.map((n) => (
              <button
                key={n.countryId}
                type="button"
                onClick={() => onSelectCountry?.(n.countryId, n.name)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--err-soft-bg)',
                  border: '1px solid var(--err-soft-line)',
                  borderRadius: 999,
                  padding: '5px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                  color: 'var(--ink-700)',
                }}
              >
                <strong>{n.name}</strong>
                <span style={{ color: 'var(--err)' }}>
                  {t('map.notSubmittedRatio', { late: n.lateMembers, total: n.totalMembers })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {deadlinePast && lateNations.length === 0 && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ok)' }}>
          {t('map.noLateNation')}
        </p>
      )}
    </div>
  );
}
