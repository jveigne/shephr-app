import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Picker } from './ui';
import type {
  CountryResponse,
  LocalityResponse,
  UnitResponse,
  ZoneResponse,
} from '../services/adminApi';

/**
 * Sélecteur géographique en cascade, commun aux trois rattachements :
 *
 *   level="zone" → Nation                  › liste des RÉGIONS
 *   level="city" → Nation › Région         › liste des VILLES
 *   level="unit" → Nation › Région › Ville › liste des ASSEMBLÉES
 *
 * Les étapes se déverrouillent l'une après l'autre et la liste du niveau visé
 * reste affichée en dessous, filtrée au fur et à mesure (+ recherche par nom).
 * Aucun appel réseau : le référentiel complet est déjà chargé par la page appelante.
 */
export type GeoLevel = 'zone' | 'city' | 'unit';

/** Ligne normalisée de la liste, quel que soit le niveau. */
interface Row {
  id: string;
  name: string;
  sub: string;
  meta: string;
  sortKey: string;
}

export function GeoPicker({
  level,
  value,
  onChange,
  units,
  cities,
  zones,
  countries,
}: {
  level: GeoLevel;
  value: string;
  onChange: (id: string) => void;
  units: UnitResponse[];
  cities: LocalityResponse[];
  zones: ZoneResponse[];
  countries: CountryResponse[];
}) {
  const { t } = useTranslation();
  const [countryId, setCountryId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [cityId, setCityId] = useState('');
  const [search, setSearch] = useState('');

  const cityById = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  // Compteurs affichés à droite de chaque ligne (une région = N villes, une ville = N assemblées).
  const cityCountByZone = useMemo(() => {
    const m = new Map<string, number>();
    cities.forEach((c) => c.zoneId && m.set(c.zoneId, (m.get(c.zoneId) ?? 0) + 1));
    return m;
  }, [cities]);
  const unitCountByCity = useMemo(() => {
    const m = new Map<string, number>();
    units.forEach((u) => m.set(u.localityId, (m.get(u.localityId) ?? 0) + 1));
    return m;
  }, [units]);

  /** Remonte la chaîne géo d'une assemblée : ville → région → nation. */
  const chainOfUnit = (u: UnitResponse) => {
    const city = cityById.get(u.localityId) ?? null;
    const zone = city?.zoneId ? zoneById.get(city.zoneId) ?? null : null;
    return { city, zone, countryId: zone?.countryId ?? null };
  };

  // Édition d'un rattachement existant : on ouvre le sélecteur positionné dessus
  // (les étapes reflètent la chaîne, la ligne retenue est visible).
  useEffect(() => {
    if (!value) return;
    if (level === 'zone') {
      const zone = zoneById.get(value);
      if (zone) setCountryId(zone.countryId);
      return;
    }
    if (level === 'city') {
      const city = cityById.get(value);
      const zone = city?.zoneId ? zoneById.get(city.zoneId) ?? null : null;
      if (zone) {
        setCountryId(zone.countryId);
        setZoneId(zone.id);
      }
      return;
    }
    const unit = units.find((u) => u.id === value);
    if (!unit) return;
    const chain = chainOfUnit(unit);
    if (chain.countryId) setCountryId(chain.countryId);
    if (chain.zone) setZoneId(chain.zone.id);
    if (chain.city) setCityId(chain.city.id);
  }, [value, level, cityById, zoneById, units]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneOptions = useMemo(
    () => (countryId ? zones.filter((z) => z.countryId === countryId) : []),
    [zones, countryId],
  );
  const cityOptions = useMemo(
    () => (zoneId ? cities.filter((c) => c.zoneId === zoneId) : []),
    [cities, zoneId],
  );

  // Un seul choix possible à un niveau → on le pose d'office (un clic de moins).
  useEffect(() => {
    if (!countryId && countries.length === 1) setCountryId(countries[0].id);
  }, [countries, countryId]);
  useEffect(() => {
    if (level === 'zone') return;
    if (countryId && !zoneId && zoneOptions.length === 1) setZoneId(zoneOptions[0].id);
  }, [level, countryId, zoneId, zoneOptions]);
  useEffect(() => {
    if (level !== 'unit') return;
    if (zoneId && !cityId && cityOptions.length === 1) setCityId(cityOptions[0].id);
  }, [level, zoneId, cityId, cityOptions]);

  const rows: Row[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const keep = (haystack: string) => !needle || haystack.toLowerCase().includes(needle);
    let out: Row[];
    if (level === 'zone') {
      out = zones
        .filter((z) => (!countryId || z.countryId === countryId) && keep(`${z.name} ${z.countryName}`))
        .map((z) => ({
          id: z.id,
          name: z.name,
          sub: z.countryName,
          meta: t('geoPicker.metaCities', { count: cityCountByZone.get(z.id) ?? 0 }),
          sortKey: `${z.countryName} ${z.name}`,
        }));
    } else if (level === 'city') {
      out = cities
        .filter((c) => {
          if (zoneId) {
            if (c.zoneId !== zoneId) return false;
          } else if (countryId) {
            if (!c.zoneId || zoneById.get(c.zoneId)?.countryId !== countryId) return false;
          }
          return keep(`${c.name} ${c.zoneName ?? ''}`);
        })
        .map((c) => ({
          id: c.id,
          name: c.name,
          sub: c.zoneName ?? t('geoPicker.noZone'),
          meta: t('geoPicker.metaUnits', { count: unitCountByCity.get(c.id) ?? 0 }),
          sortKey: `${c.zoneName ?? ''} ${c.name}`,
        }));
    } else {
      out = units
        .filter((u) => {
          const chain = chainOfUnit(u);
          if (cityId) {
            if (u.localityId !== cityId) return false;
          } else if (zoneId) {
            if (chain.city?.zoneId !== zoneId) return false;
          } else if (countryId) {
            if (chain.countryId !== countryId) return false;
          }
          return keep(`${u.name} ${chain.city?.name ?? ''} ${u.joinCode}`);
        })
        .map((u) => {
          const chain = chainOfUnit(u);
          return {
            id: u.id,
            name: u.name,
            sub: [chain.city?.name, chain.zone?.name].filter(Boolean).join(' · ') || t('geoPicker.noCity'),
            meta: u.joinCode,
            sortKey: `${chain.city?.name ?? ''} ${u.name}`,
          };
        });
    }
    return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name));
  }, [level, zones, cities, units, countryId, zoneId, cityId, search, cityById, zoneById, cityCountByZone, unitCountByCity, t]);

  // La ligne retenue reste toujours visible, même si la recherche l'exclut.
  const selected = useMemo(() => {
    if (!value) return null;
    const inRows = rows.find((r) => r.id === value);
    if (inRows) return null;
    if (level === 'zone') {
      const z = zoneById.get(value);
      return z ? { id: z.id, name: z.name, sub: z.countryName, meta: '', sortKey: '' } : null;
    }
    if (level === 'city') {
      const c = cityById.get(value);
      return c ? { id: c.id, name: c.name, sub: c.zoneName ?? t('geoPicker.noZone'), meta: '', sortKey: '' } : null;
    }
    const u = units.find((x) => x.id === value);
    if (!u) return null;
    const chain = chainOfUnit(u);
    return {
      id: u.id,
      name: u.name,
      sub: [chain.city?.name, chain.zone?.name].filter(Boolean).join(' · ') || t('geoPicker.noCity'),
      meta: u.joinCode,
      sortKey: '',
    };
  }, [value, rows, level, zoneById, cityById, units, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = selected ? [selected, ...rows] : rows;

  const listRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current || !value) return;
    const el = listRef.current?.querySelector('.upick-row.on');
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      didScroll.current = true;
    }
  }, [value, visible.length]);

  const dirty = countryId !== '' || zoneId !== '' || cityId !== '' || search !== '';
  const reset = () => {
    setCountryId('');
    setZoneId('');
    setCityId('');
    setSearch('');
  };

  // Suffixe des libellés dépendant du niveau visé (recherche / compteur / vide).
  const K = level === 'zone' ? 'Zone' : level === 'city' ? 'City' : 'Unit';
  const steps = level === 'zone' ? 1 : level === 'city' ? 2 : 3;

  return (
    <div className="upick">
      <div className="upick-steps" style={{ ['--upick-cols' as string]: steps }}>
        <Step index={1} label={t('geoPicker.nation')}>
          <Picker
            value={countryId}
            onChange={(id) => {
              setCountryId(id);
              setZoneId('');
              setCityId('');
            }}
            options={countries.map((c) => ({ id: c.id, label: c.name }))}
            placeholder={t('geoPicker.chooseNation')}
            searchPlaceholder={t('geoPicker.nation')}
          />
        </Step>
        {steps >= 2 && (
          <Step index={2} label={t('geoPicker.region')} locked={!countryId}>
            <Picker
              value={zoneId}
              disabled={!countryId}
              onChange={(id) => {
                setZoneId(id);
                setCityId('');
              }}
              options={zoneOptions.map((z) => ({ id: z.id, label: z.name }))}
              placeholder={countryId ? t('geoPicker.chooseRegion') : t('geoPicker.lockedRegion')}
              searchPlaceholder={t('geoPicker.region')}
            />
          </Step>
        )}
        {steps >= 3 && (
          <Step index={3} label={t('geoPicker.city')} locked={!zoneId}>
            <Picker
              value={cityId}
              disabled={!zoneId}
              onChange={setCityId}
              options={cityOptions.map((c) => ({ id: c.id, label: c.name }))}
              placeholder={zoneId ? t('geoPicker.chooseCity') : t('geoPicker.lockedCity')}
              searchPlaceholder={t('geoPicker.city')}
            />
          </Step>
        )}
      </div>

      <div className="upick-bar">
        <div className="input-wrap upick-search">
          <span className="ico-left"><Icon name="search" size={14} /></span>
          <input
            className="input with-icon"
            placeholder={t(`geoPicker.search${K}`)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="upick-count">{t(`geoPicker.count${K}`, { count: rows.length })}</span>
        {dirty && (
          <button type="button" className="upick-reset" onClick={reset}>
            {t('geoPicker.reset')}
          </button>
        )}
      </div>

      <div className="upick-list" ref={listRef}>
        {visible.length === 0 ? (
          <div className="upick-empty">
            <Icon name={level === 'unit' ? 'unit' : 'locality'} size={20} />
            <div>{t(`geoPicker.empty${K}`)}</div>
            <span>{t('geoPicker.emptyHint')}</span>
          </div>
        ) : (
          visible.map((r) => {
            const on = r.id === value;
            return (
              <button
                key={r.id}
                type="button"
                className={`upick-row ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange(on ? '' : r.id)}
              >
                <span className="upick-mark">{on && <Icon name="check" size={11} />}</span>
                <span className="upick-txt">
                  <span className="nm">{r.name}</span>
                  <span className="sub">{r.sub}</span>
                </span>
                <span className={`upick-meta ${level === 'unit' ? 'mono' : ''}`}>{r.meta}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Step({
  index,
  label,
  locked,
  children,
}: {
  index: number;
  label: string;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`upick-step ${locked ? 'locked' : ''}`}>
      <div className="upick-step-hd">
        <span className="n">{index}</span>
        {label}
      </div>
      {children}
    </div>
  );
}
