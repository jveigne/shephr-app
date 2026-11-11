import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Badge, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { EventDetailModal } from '../components/EventDetail';
import { BrandingWelcomeCard } from '../components/PoweredBy';
import { usePublicCountries } from '../components/CountrySelect';
import { countryLabel } from '../services/countriesApi';
import { useAuth } from '../hooks/useAuth';
import { isUnattachedPerson } from '../services/authApi';
import { listMyRegistrations, listOpenEvents, type OpenEventResponse } from '../services/eventsApi';
import { EVENT_KEYS, eventErrorMessage, eventTypeLabel, fmtEventDates, levelKey } from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  « Évènements » ouverts à tous — lot « conf-pays » (D-PAYS-10 / 11, RG-PAYS-22 / 24, JP 11/11 ; contrat
//  11_11_2026/02 §10.3). MemberShell : seule page métier d'un compte SANS assemblée, ouverte aussi aux membres
//  rattachés. Liste = `GET /events/open` (évènements ouverts de MON pays et de MA ville, décidés par le serveur) ;
//  onglet « Mes inscriptions » (`?tab=mine`, `GET /events/me/registrations`). Détail en modale (`EventDetailModal`,
//  vue restreinte : ni compteurs ni prédicateur — E-04) avec « Je participe » / « Je ne participe plus ».
// ---------------------------------------------------------------------------------------------

export function OpenEventsPage() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'open';
  const [opened, setOpened] = useState<string | null>(null);
  const unattached = isUnattachedPerson(me);

  // RG-PAYS-24 (JP 11/11) : « de {ville} · {pays} » — ville = ville déclarée (`cityNodeName`, compte sans assemblée)
  // ou ville de l'assemblée principale (`assemblies[].cityName`, membre rattaché) ; pays = celui du COMPTE
  // (`countryIso`, nommé par `GET /api/public/countries`). `countryNames` ne sert qu'aux coordinateurs : pas ici.
  const countries = usePublicCountries();
  const assemblyCity = (me?.assemblies ?? []).find((a) => a.id === me?.goalUnitId)?.cityName
    ?? me?.assemblies?.[0]?.cityName ?? null;
  const city = me?.cityNodeName ?? assemblyCity;
  const countryRow = me?.countryIso
    ? countries.data?.find((c) => c.code.toUpperCase() === me.countryIso!.toUpperCase())
    : undefined;
  const countryName = countryRow ? countryLabel(countryRow, i18n.language) : null;
  const where = [city, countryName].filter(Boolean).join(' · ');

  return (
    <>
      <TopBar
        title={t('events.open.title')}
        crumbs={[t('common.brand'), t('events.open.title')]}
      />
      <div className="content">
        {unattached && <BrandingWelcomeCard />}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['open', 'mine'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn ${tab === k ? 'primary' : 'secondary'}`}
              onClick={() => setParams(k === 'mine' ? { tab: 'mine' } : {}, { replace: true })}
            >
              {k === 'open' ? t('events.open.tabOpen') : t('events.open.tabMine')}
            </button>
          ))}
        </div>
        {tab === 'open' ? (
          <>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
              {where ? t('events.open.subWhere', { where }) : t('events.open.sub')}
            </p>
            <OpenEventsList onOpen={setOpened} />
          </>
        ) : (
          <MyRegistrationsList onOpen={setOpened} />
        )}
        {unattached && (
          <div className="card" style={{ marginTop: 24, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: 'var(--ink-600)' }}>{t('events.open.joinHint')}</span>
            <Link to="/join" className="btn secondary">{t('settings.joinAssembly')}</Link>
          </div>
        )}
      </div>
      {opened && <EventDetailModal eventId={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

/** Liste des évènements ouverts (aussi dans « Mes actions » d'un membre rattaché, `limit`). */
export function OpenEventsList({ onOpen, limit }: { onOpen: (id: string) => void; limit?: number }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: [...EVENT_KEYS.data, 'open'], queryFn: () => listOpenEvents() });
  if (q.isLoading) return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  if (q.isError) return <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(q.error, t)}</p>;
  const items = limit ? (q.data ?? []).slice(0, limit) : q.data ?? [];
  if (items.length === 0) return <p style={{ color: 'var(--ink-500)', fontStyle: 'italic' }}>{t('events.open.empty')}</p>;
  return <EventCards items={items} onOpen={onOpen} />;
}

function MyRegistrationsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const q = useQuery({ queryKey: [...EVENT_KEYS.data, 'my-registrations', when], queryFn: () => listMyRegistrations(when) });
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['upcoming', 'past'] as const).map((w) => (
          <button key={w} type="button" className={`btn ${when === w ? 'secondary' : 'ghost'}`} onClick={() => setWhen(w)}>
            {t(`events.open.${w}`)}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : q.isError ? (
        <p role="alert" style={{ color: 'var(--err)' }}>{eventErrorMessage(q.error, t)}</p>
      ) : (q.data ?? []).length === 0 ? (
        <p style={{ color: 'var(--ink-500)', fontStyle: 'italic' }}>{t('events.open.mineEmpty')}</p>
      ) : (
        <EventCards items={q.data ?? []} onOpen={onOpen} />
      )}
    </>
  );
}

function EventCards({ items, onOpen }: { items: OpenEventResponse[]; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((e) => {
        const registered = e.myRegistration?.status === 'REGISTERED';
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onOpen(e.id)}
            className="card"
            style={{ textAlign: 'left', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', border: '1px solid var(--line-soft)' }}
          >
            <Icon name="calendar" size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{e.title ?? eventTypeLabel(e, lang)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                {[fmtEventDates(e, lang), e.place, `${e.scopeName} · ${t(levelKey(e.scopeLevel))}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            {e.status === 'CANCELLED' && <Badge tone="err">{t('events.open.cancelled')}</Badge>}
            {registered && <Badge tone="ok" dot>{t('events.registration.youParticipate')}</Badge>}
            {!registered && e.canRegister && <Badge tone="green">{t('events.registration.register')}</Badge>}
            <Icon name="chevRight" size={13} />
          </button>
        );
      })}
    </div>
  );
}
