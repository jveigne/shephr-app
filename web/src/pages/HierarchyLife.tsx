import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';
import { fetchLeaderHierarchy } from '../services/leadersApi';
import { getAccessibleModules } from '../services/authApi';
import {
  ENTITLEMENT_HIERARCHIE_SUIVI,
  PLAN_DIRIGEANT_HIERARCHIE,
  getPersonalEntitlements,
} from '../services/entitlementsApi';
import { HierarchyLockedFeature, HierarchySubscriptionStatus } from '../components/LockedFeature';
import {
  AssemblyLastReportList,
  AssemblyStatsProvider,
  HierarchyJournalButton,
  PeriodPicker,
} from '../components/AssemblyHierarchyStats';
import { EventHierarchyBlock } from '../components/EventHierarchyBlock';
import { StudyHierarchyBlock } from '../components/StudyHierarchyBlock';
import { useStudyAccess, useStudyMenuVisible } from '../utils/studyAccess';
import { currentPeriod, periodRange, type Period } from '../utils/assemblyJournal';
import { FEATURES } from '../config/features';

// ---------------------------------------------------------------------------------------------
//  Page 3 « Vie de mon leadership » — D-HIE-01 (JP 28/10, lot HIE), route `/hierarchy/vie`.
//  OFFRE CALEB : code PERSONNEL `HIERARCHIE_SUIVI` (D-ABO-36 — chaque dirigeant paie pour lui-même),
//  axe de la CHAÎNE de supervision (supervisor_id récursif, `scopeOf`), jamais la géographie.
//  - Sans droit : UN SEUL verrou (`HierarchyLockedFeature`, souscription web) et rien d'autre ;
//    jamais un toast. Un 403 `HIERARCHIE_SUIVI` d'un bloc (droit expiré) bascule sur ce verrou.
//  - Avec droit : état de l'abonnement, sélecteur de période UNIQUE (Mois / Trimestre / Semestre /
//    Année + ‹ ›, défaut mois courant) passé à tous les blocs : Vie d'assemblée (+ alerte « sans CR
//    depuis 3 semaines »), Évènements de la chaîne (D-HIE-09), Le Message de Bertoua (D-HIE-10),
//    Assemblées et dernier CR (sorti de l'arbre de la page 1), Journal PDF de ma hiérarchie.
//  - Blocs Vie d'assemblée / Évènements masqués si `ASSEMBLY` / `EVENTS` absent d'`accessible-modules`
//    (RG-06) ; Bertoua si l'étude n'est pas visible (D-ETU-54).
//  - Retours Stripe Caleb (composés par le serveur, RG-HIE-41) : annulation `?annule=1`, portail ici.
// ---------------------------------------------------------------------------------------------

export function HierarchyLifePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canceled = searchParams.get('annule') === '1';

  const hierarchyQ = useQuery({ queryKey: ['leaders', 'hierarchy'], queryFn: () => fetchLeaderHierarchy() });
  const personalQ = useQuery({
    queryKey: ['entitlements', 'personal'],
    queryFn: getPersonalEntitlements,
    retry: false,
  });
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const modules = modulesQ.data ?? [];
  const hasAssembly = FEATURES.assembly && modules.includes('ASSEMBLY');
  const hasEvents = FEATURES.events && modules.includes('EVENTS');
  const { hasStudy } = useStudyAccess();
  const studyVisible = useStudyMenuVisible(hasStudy);

  const [lockedByServer, setLockedByServer] = useState(false);
  const onLocked = useCallback(() => {
    // 403 `HIERARCHIE_SUIVI` malgré un droit annoncé (expiré entre-temps) : verrou, jamais un toast.
    setLockedByServer(true);
    void qc.invalidateQueries({ queryKey: ['entitlements', 'personal'] });
  }, [qc]);

  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const { from, to } = periodRange(period);

  const personal = personalQ.data;
  const hierarchyPlan = personal?.plans.find((p) => p.planCode === PLAN_DIRIGEANT_HIERARCHIE) ?? null;
  const entitled = !!personal && personal.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI) && !lockedByServer;
  const data = hierarchyQ.data;
  const roots = data?.roots ?? [];

  let body;
  if (personalQ.isLoading || hierarchyQ.isLoading) {
    body = <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  } else if (personalQ.isError || hierarchyQ.isError || !personal || !data) {
    body = (
      <div className="card empty">
        <div className="icon-wrap"><Icon name="hierarchy" size={26} /></div>
        <h4>{t('hierarchy.life.loadError')}</h4>
      </div>
    );
  } else if (data.mode === 'CHAIN') {
    // Vue d'un membre (sa chaîne de rattachement) : aucune statistique de hiérarchie.
    body = <p className="section-sub">{t('hierarchy.life.notApplicable')}</p>;
  } else if (!entitled) {
    body = <HierarchyLockedFeature plan={hierarchyPlan} />;
  } else {
    body = (
      <>
        <HierarchySubscriptionStatus plan={hierarchyPlan} />
        <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 8 }}>{t('hierarchy.life.period')}</div>
          <PeriodPicker period={period} setPeriod={setPeriod} />
        </div>
        <AssemblyStatsProvider roots={roots} isChain={false} entitled={entitled} onLocked={onLocked} period={period}>
          {hasEvents && <EventHierarchyBlock from={from} to={to} onLocked={onLocked} />}
          {studyVisible && <StudyHierarchyBlock from={from} to={to} onLocked={onLocked} />}
          <AssemblyLastReportList roots={roots} />
          <div style={{ marginTop: 4 }}>
            <HierarchyJournalButton />
          </div>
        </AssemblyStatsProvider>
        {!hasAssembly && !hasEvents && !studyVisible && (
          <p className="section-sub">{t('hierarchy.life.nothing')}</p>
        )}
      </>
    );
  }

  return (
    <>
      <TopBar
        title={t('hierarchy.life.title')}
        crumbs={[t('common.brand'), t('nav.hierarchy'), t('hierarchy.life.title')]}
      />
      <div className="content">
        <Link to="/hierarchy" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5, marginBottom: 14 }}>
          <Icon name="chevLeft" size={14} />
          {t('hierarchy.backToHome')}
        </Link>
        {/* D-ABO-29 (même mécanique que la ville) : l'annulation Stripe revient ici avec `?annule=1`. */}
        {canceled && (
          <div role="status" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="info" size={16} />
            <span style={{ flex: 1 }}>{t('hierarchy.plan.canceledBanner')}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('common.close')}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('annule');
                setSearchParams(next, { replace: true });
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <p className="section-sub">{t('hierarchy.life.intro')}</p>
        {body}
      </div>
    </>
  );
}
