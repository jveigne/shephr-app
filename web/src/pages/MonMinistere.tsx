import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';
import { listMinistries, type MinistryResponse } from '../services/adminApi';

/**
 * « Mon ministère » — vue LECTURE SEULE du ministère de l'utilisateur (Espace ministère).
 * Le backend scope déjà la liste au ministère du dirigeant (getEffectiveMinistryFilter).
 * La gestion multi-tenant des ministères reste au back-office SUPER_ADMIN (shephr-webapp).
 */
export function MonMinisterePage() {
  const ministriesQ = useQuery({ queryKey: ['admin', 'ministries'], queryFn: listMinistries });
  const ministries = ministriesQ.data ?? [];

  return (
    <>
      <TopBar title="Mon ministère" crumbs={['shephr', 'Structure', 'Mon ministère']} />

      <div className="content">
        <p className="section-sub">
          Le ministère auquel vous êtes rattaché. Sa gestion (création, abonnements) relève du back-office.
        </p>

        {ministriesQ.isLoading ? (
          <div className="card"><p style={{ color: 'var(--ink-500)' }}>Chargement…</p></div>
        ) : ministries.length === 0 ? (
          <div className="card" style={{ padding: 0 }}>
            <div className="empty">
              <div className="icon-wrap"><Icon name="building" size={26} /></div>
              <h4>Aucun ministère</h4>
              <p>Votre compte n'est rattaché à aucun ministère.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ministries.map((m) => (
              <MinistryCard key={m.id} ministry={m} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function MinistryCard({ ministry }: { ministry: MinistryResponse }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div
        className="icon-wrap"
        style={{ background: 'var(--green-700)', color: '#FBF5E4', width: 44, height: 44, borderRadius: 12 }}
      >
        <Icon name="building" size={22} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{ministry.name}</div>
        <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: 13, color: 'var(--ink-500)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="globe" size={13} /> {ministry.country || '—'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="currency" size={13} /> {ministry.defaultCurrency}
          </span>
        </div>
      </div>
    </div>
  );
}
