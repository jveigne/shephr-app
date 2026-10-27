import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Field, Input, Picker, Table, TopBar, type Column } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { LockedFeature } from '../components/LockedFeature';
import { VoucherRedeemModal } from '../components/VoucherRedeemModal';
import { PeriodPicker } from '../components/AssemblyHierarchyStats';
import { EventPeriodFilter } from '../components/EventPeriodFilter';
import { EventStatsDrill } from '../components/EventStatsDrill';
import { FEATURES } from '../config/features';
import { getAccessibleModules } from '../services/authApi';
import {
  downloadStudyLocalityExport,
  getLocalityMeetingStats,
  getStudyLocalityOverview,
  getStudyLocalityStats,
  listAssemblyLocalities,
  listLocalityMeetings,
  listStudyLocalities,
  listStudyLocalityMembers,
  type StudyLocalityMember,
  type StudyLocalityModule,
  type StudyLocalityOverview,
  type StudyMemberStatus,
  type UnitMeetingStats,
} from '../services/assemblyApi';
import {
  ENTITLEMENT_ETUDE_SUIVI,
  ENTITLEMENT_EVENEMENTS_SUIVI,
  ENTITLEMENT_JOURNAL,
  cityJournalAccessDenied,
  getEntitlements,
  studyCityAccessDenied,
  type LocalityPlanSubscription,
  type ModuleAccessDeniedDetails,
} from '../services/entitlementsApi';
import { openBillingPortal, type BillingSubscriptionStatus } from '../services/billingApi';
import { billingErrMsg, fmtDay } from './Billing';
import { EmptyState, ProgressBar, errMsg } from './Assembly';
import { saveBlob } from '../utils/download';
import { startOfYearISO, todayISO } from '../utils/format';
import { useStudyAccess } from '../utils/studyAccess';
import { ALERT_DAYS, aggregate, averageAttendance, isAlert, todayIso } from '../utils/assemblyHierarchyStats';
import { buildConsolidatedJournalHtml, currentPeriod, periodRange, type Period as JournalPeriod } from '../utils/assemblyJournal';
import { defaultPeriod, periodBounds, type Period as EventPeriod } from '../utils/events';
import { formatMeetingDate, type Translate } from '../utils/meetingReport';
import { printHtml } from '../utils/printHtml';

// ---------------------------------------------------------------------------------------------
//  Suivi de l'étude à l'échelle de la VILLE — lot « pro-plan » PP-W1 (D-WEB-07, JP 27/10 ; contrat
//  02_Contrat_API_Abonnement_Ville.md §7.2 → §7.7, §9, §12.1). Route `/study/city?localityId=&tab=`
//  (AppShell, garde `FEATURES.study`). Onglets Assemblées · Membres · Statistiques · Abonnement,
//  exports CSV / PDF.
//  - Lecteurs (RG-ABO-21 / D-ABO-21) : la liste vient de `GET /study/localities` — vide pour un membre
//    ou un dirigeant d'unité (RG-ABO-22), qui n'ont donc ni entrée de menu ni contenu ici.
//  - Code de droit `ETUDE_SUIVI` vérifié PAR VILLE par le serveur (RG-ABO-23) : `entitled = false`
//    → cadenas (RG-ABO-22) et `LockedFeature` d'avance ; tout 403 `ETUDE_SUIVI` → `LockedFeature`,
//    jamais un toast.
//  - D-ETU-55 : ces routes ne portent aucun texte de réponse (jamais de PERSONNELLE).
//  - Paiement web seulement (JP-4, RG-ABO-24) ; « Gérer l'abonnement » au payeur seul (D-ABO-22).
//  - D-ABO-29 : l'annulation Stripe revient ici avec `&annule=1` (bandeau).
//
//  P-08 (JP 27/10, plan 05_Plan_Offres_Caleb_Nehemie.md — tickets O4 / O5) : la page devient « Suivi
//  de la ville », la vue unique de l'offre Néhémie (axe GÉOGRAPHIQUE, plan `EGLISE_VILLE`) :
//  - Le Message de Bertoua (`ETUDE_SUIVI`) : Assemblées · Membres · Statistiques (inchangés) ;
//  - Journal de la ville (`JOURNAL`, D-OFF-05) : statistiques des CR et journal PDF consolidé des
//    assemblées de la ville, SANS AUCUN NOM de personne (`GET /assembly/locality/{id}/stats|meetings`) ;
//  - Évènements (`EVENEMENTS_SUIVI`, D-OFF-12) : statistiques d'Évènements À L'INTÉRIEUR de la ville
//    (le total reste gratuit ; la descente par assemblée est verrouillée sans droit) ;
//  - Abonnement (inchangé). Une seule entrée de menu Néhémie (`nav.studyCity`).
//  Villes = `GET /study/localities` ∪ `GET /assembly/localities` (même règle de visibilité D-ABO-21) ;
//  chaque onglet garde son propre code de droit (un accord de ministère peut n'en couvrir qu'un).
//  La route et ses paramètres (`tab=subscription`, `annule=1`) sont composés par le serveur : inchangés.
// ---------------------------------------------------------------------------------------------

type Tab = 'overview' | 'members' | 'stats' | 'journal' | 'events' | 'subscription';
const TABS: Tab[] = ['overview', 'members', 'stats', 'journal', 'events', 'subscription'];
const STUDY_TABS: Tab[] = ['overview', 'members', 'stats'];
const TAB_ICON: Record<Tab, string> = {
  overview: 'building',
  members: 'users',
  stats: 'dashboard',
  journal: 'fileText',
  events: 'megaphone',
  subscription: 'currency',
};

type TFn = ReturnType<typeof useTranslation>['t'];

/**
 * P-08 (JP 27/10) : une ville de la page — fusion des deux listes de villes. `studyEntitled` /
 * `journalEntitled` = null quand la ville n'est pas dans la liste correspondante (onglet absent).
 */
interface CityEntry {
  localityId: string;
  localityName: string;
  assemblyCount: number;
  studyEntitled: boolean | null;
  journalEntitled: boolean | null;
  canSubscribe: boolean;
}

function fmtNum(n: number | null | undefined, lang: string, digits = 1): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { maximumFractionDigits: digits }).format(n);
}

function fmtMonth(ym: string, lang: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { month: 'short', year: 'numeric' });
}

/**
 * D-ABO-20 (JP 27/10) : `manualEndDate` est une LocalDate (« AAAA-MM-JJ », incluse, Europe/Paris).
 * Lue en heure LOCALE (jamais `new Date(iso)`, minuit UTC) pour ne pas reculer d'un jour à l'ouest d'UTC.
 */
function fmtLocalDate(ymd: string | null, lang: string): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Contrat 27/10 §7.6 : `/stats` refuse un écart de plus de 731 jours (400 `INVALID_PARAMETER`). */
const MAX_STATS_DAYS = 731;

/** Écart en jours entre deux dates « AAAA-MM-JJ » (calcul en UTC : indépendant du fuseau). */
function daysBetween(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Avec `responseType: 'blob'`, le corps d'erreur arrive en Blob : on le relit en JSON. */
async function readBlobError(err: unknown): Promise<unknown> {
  const res = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (res?.data instanceof Blob) {
    try {
      return { response: { status: res.status, data: JSON.parse(await res.data.text()) } };
    } catch {
      return err;
    }
  }
  return err;
}

function lockOf(city: CityEntry, moduleCode: string = ENTITLEMENT_ETUDE_SUIVI): ModuleAccessDeniedDetails {
  return { moduleCode, nodeId: city.localityId, canSubscribe: city.canSubscribe };
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon name={icon} size={15} />
      {children}
    </button>
  );
}

function Kpi({ label, value, warn = false }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: 14, ...(warn ? { background: 'var(--earth-50)' } : null) }}>
      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: warn ? 'var(--earth-700)' : 'var(--green-700)' }}>{value}</div>
    </div>
  );
}

/**
 * Rendu commun d'une requête de ville : chargement, verrou (403 du code de droit de l'onglet —
 * `ETUDE_SUIVI` par défaut, `JOURNAL` pour le journal), erreur, contenu.
 */
function QueryBody<T>({
  q,
  t,
  deny = studyCityAccessDenied,
  children,
}: {
  q: { isLoading: boolean; error: unknown; data: T | undefined };
  t: TFn;
  deny?: (err: unknown) => ModuleAccessDeniedDetails | null;
  children: (data: T) => ReactNode;
}) {
  if (q.isLoading) return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  const denied = deny(q.error);
  if (denied) return <LockedFeature denied={denied} />;
  if (q.error || q.data === undefined) return <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(q.error, t('common.error'))}</p>;
  return <>{children(q.data)}</>;
}

export function CityStudyPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const { hasStudy, isLoading: accessLoading } = useStudyAccess();
  const [moduleId, setModuleId] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  // P-08 : Journal (module ASSEMBLY, gratuit et désactivable par ministère — D-OFF-01) et
  // Évènements (module EVENTS) suivent les mêmes gardes que leurs menus (Sidebar.tsx).
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasAssembly = FEATURES.assembly && (modulesQ.data ?? []).includes('ASSEMBLY');
  const hasEvents = FEATURES.events && (modulesQ.data ?? []).includes('EVENTS');

  const studyCitiesQ = useQuery({
    queryKey: ['assembly', 'study', 'localities'],
    queryFn: listStudyLocalities,
    enabled: hasStudy,
  });
  const journalCitiesQ = useQuery({
    queryKey: ['assembly', 'localities'],
    queryFn: listAssemblyLocalities,
    enabled: hasAssembly,
    retry: false,
  });

  const localities = useMemo<CityEntry[]>(() => {
    const byId = new Map<string, CityEntry>();
    for (const l of hasStudy ? studyCitiesQ.data ?? [] : []) {
      byId.set(l.localityId, {
        localityId: l.localityId,
        localityName: l.localityName,
        assemblyCount: l.assemblyCount,
        studyEntitled: l.entitled,
        journalEntitled: null,
        canSubscribe: l.canSubscribe,
      });
    }
    for (const l of hasAssembly ? journalCitiesQ.data ?? [] : []) {
      const prev = byId.get(l.localityId);
      byId.set(l.localityId, {
        localityId: l.localityId,
        localityName: prev?.localityName ?? l.localityName,
        assemblyCount: prev?.assemblyCount ?? l.assemblyCount,
        studyEntitled: prev?.studyEntitled ?? null,
        journalEntitled: l.entitled,
        canSubscribe: (prev?.canSubscribe ?? false) || l.canSubscribe,
      });
    }
    return Array.from(byId.values());
  }, [hasStudy, hasAssembly, studyCitiesQ.data, journalCitiesQ.data]);

  const paramId = params.get('localityId') ?? '';
  const rawTab = params.get('tab') as Tab | null;
  const canceled = params.get('annule') === '1';
  const city = localities.find((l) => l.localityId === paramId) ?? localities[0] ?? null;

  // Onglets de la ville : Bertoua si elle est dans `/study/localities`, Journal si elle est dans
  // `/assembly/localities`, Évènements si le module est accessible ; Abonnement toujours.
  const available = TABS.filter((k) =>
    STUDY_TABS.includes(k)
      ? city?.studyEntitled != null
      : k === 'journal'
        ? city?.journalEntitled != null
        : k === 'events'
          ? hasEvents
          : true,
  );
  const tab: Tab = rawTab && available.includes(rawTab) ? rawTab : available[0] ?? 'subscription';
  const isStudyTab = STUDY_TABS.includes(tab);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  // Ville absente ou inconnue de l'URL : on retient la première (sans perdre `tab` ni `annule`).
  useEffect(() => {
    if (city && city.localityId !== paramId) setParam({ localityId: city.localityId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.localityId, paramId]);

  // L'unité d'étude filtrée n'a de sens que dans sa ville.
  useEffect(() => setModuleId(''), [city?.localityId]);

  const studyEntitled = city?.studyEntitled === true;

  // Liste des unités (sélecteur) : vue d'ensemble SANS filtre, partagée avec l'onglet Assemblées.
  const baseOverviewQ = useQuery({
    queryKey: ['assembly', 'study', 'locality-overview', city?.localityId ?? '', ''],
    queryFn: () => getStudyLocalityOverview(city!.localityId),
    enabled: hasStudy && !!city && studyEntitled,
    retry: false,
  });
  const modules = baseOverviewQ.data?.modules ?? [];

  const exportM = async (format: 'csv' | 'pdf') => {
    if (!city) return;
    setExporting(format);
    try {
      const blob = await downloadStudyLocalityExport(city.localityId, format, moduleId || undefined);
      // §7.7 : `Content-Disposition` n'est pas exposé en CORS — le front nomme le fichier.
      saveBlob(blob, `suivi-etude-${todayISO()}.${format}`);
    } catch (e) {
      const err = await readBlobError(e);
      push({
        kind: 'error',
        title: t('cityStudy.export.failed'),
        msg: studyCityAccessDenied(err) ? t('cityStudy.lock.title') : errMsg(err, t('common.error')),
      });
    } finally {
      setExporting(null);
    }
  };

  const tabLocked = (k: Tab) =>
    STUDY_TABS.includes(k) ? city?.studyEntitled === false : k === 'journal' ? city?.journalEntitled === false : false;

  const body = (() => {
    if (
      accessLoading ||
      modulesQ.isLoading ||
      (hasStudy && studyCitiesQ.isLoading) ||
      (hasAssembly && journalCitiesQ.isLoading)
    ) {
      return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!hasStudy && !hasAssembly) return <EmptyState title={t('cityStudy.unavailable')} text={t('cityStudy.unavailableHint')} />;
    if (localities.length === 0 && (studyCitiesQ.isError || journalCitiesQ.isError)) {
      return <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(studyCitiesQ.error ?? journalCitiesQ.error, t('common.error'))}</p>;
    }
    // RG-ABO-22 : un membre ou un dirigeant d'unité n'a aucune ville (et pas d'entrée de menu).
    if (!city) return <EmptyState title={t('cityStudy.noCity')} text={t('cityStudy.noCityHint')} />;

    return (
      <>
        {canceled && (
          <div role="status" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="info" size={16} />
            <span style={{ flex: 1 }}>{t('cityStudy.canceledBanner')}</span>
            <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={() => setParam({ annule: null })}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {localities.length > 1 && (
            <Field label={t('cityStudy.filters.city')} style={{ minWidth: 240, margin: 0 }}>
              <Picker
                value={city.localityId}
                onChange={(id) => setParam({ localityId: id, annule: null })}
                // §9.3 : cadenas par ville dans le sélecteur (aucun code de ville de l'offre Néhémie ouvert).
                options={localities.map((l) => ({
                  id: l.localityId,
                  label: l.localityName,
                  sub:
                    l.studyEntitled || l.journalEntitled
                      ? t('cityStudy.assemblyCount', { count: l.assemblyCount })
                      : t('cityStudy.lockedCity'),
                }))}
                placeholder={t('cityStudy.filters.city')}
              />
            </Field>
          )}
          {studyEntitled && isStudyTab && modules.length > 1 && (
            <Field label={t('cityStudy.filters.module')} style={{ minWidth: 240, margin: 0 }}>
              <Picker
                value={moduleId || 'all'}
                onChange={(id) => setModuleId(id === 'all' ? '' : id)}
                options={[
                  { id: 'all', label: t('assembly.study.allUnits') },
                  ...modules.map((m) => ({ id: m.moduleId, label: [m.code, m.name].filter(Boolean).join(' · ') })),
                ]}
                placeholder={t('assembly.study.allUnits')}
              />
            </Field>
          )}
          {studyEntitled && isStudyTab && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Button size="sm" iconL={<Icon name="download" size={13} />} disabled={exporting != null} onClick={() => exportM('csv')}>
                {t('cityStudy.export.csv')}
              </Button>
              <Button size="sm" iconL={<Icon name="download" size={13} />} disabled={exporting != null} onClick={() => exportM('pdf')}>
                {t('cityStudy.export.pdf')}
              </Button>
            </div>
          )}
        </div>

        <div className="tabs" role="tablist">
          {available.map((k) => (
            <TabButton key={k} active={tab === k} onClick={() => setParam({ tab: k })} icon={TAB_ICON[k]}>
              {STUDY_TABS.includes(k) ? t('cityStudy.tabs.studyPrefixed', { tab: t(`cityStudy.tabs.${k}`) }) : t(`cityStudy.tabs.${k}`)}
              {tabLocked(k) && <Icon name="lock" size={12} />}
            </TabButton>
          ))}
        </div>

        {tab === 'subscription' ? (
          <SubscriptionTab city={city} />
        ) : tab === 'journal' ? (
          city.journalEntitled ? (
            <CityJournalTab city={city} />
          ) : (
            // D-OFF-05 : ville sans `JOURNAL` → verrou d'avance, sans appeler `/locality/{id}/stats`.
            <LockedFeature denied={lockOf(city, ENTITLEMENT_JOURNAL)} />
          )
        ) : tab === 'events' ? (
          <CityEventsTab city={city} />
        ) : !studyEntitled ? (
          // RG-ABO-22 : ville sans droit → verrou d'avance, sans attendre le 403.
          <LockedFeature denied={lockOf(city)} />
        ) : tab === 'overview' ? (
          <OverviewTab localityId={city.localityId} moduleId={moduleId} />
        ) : tab === 'members' ? (
          <MembersTab localityId={city.localityId} moduleId={moduleId} assemblies={baseOverviewQ.data?.assemblies ?? []} />
        ) : (
          <StatsTab localityId={city.localityId} moduleId={moduleId} />
        )}
      </>
    );
  })();

  return (
    <>
      <TopBar
        title={city ? t('cityStudy.titleCity', { city: city.localityName }) : t('cityStudy.title')}
        crumbs={[t('common.brand'), t('cityStudy.title')]}
      />
      <div className="content">{body}</div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Journal de la ville — offre Néhémie, code `JOURNAL` (D-OFF-05, JP 27/10 ; plan 05 §3.3, ticket O4).
//  Statistiques des CR des assemblées de la VILLE (axe géographique) sur une période (mois, trimestre,
//  semestre, année — mêmes périodes que le journal de la Hiérarchie), tableau par assemblée avec
//  l'alerte « sans CR depuis 3 semaines » (affichage seul), puis journal PDF consolidé
//  (`buildConsolidatedJournalHtml`, le même document que celui de l'offre Caleb). AUCUN nom de
//  personne : le serveur ne renvoie que des nombres (`attendeeCount`) et des noms d'assemblée.
// ---------------------------------------------------------------------------------------------

function CityJournalTab({ city }: { city: CityEntry }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language;
  const tr = t as unknown as Translate;
  const [period, setPeriod] = useState<JournalPeriod>(() => currentPeriod('month'));
  const [printing, setPrinting] = useState(false);
  const { from, to } = periodRange(period);
  const today = todayIso();

  const q = useQuery({
    queryKey: ['assembly', 'locality-stats', city.localityId, from, to],
    queryFn: () => getLocalityMeetingStats(city.localityId, from, to),
    retry: false,
  });

  const printJournal = async (rows: UnitMeetingStats[]) => {
    const agg = aggregate(rows.map((r) => r.unitId), new Map(rows.map((r) => [r.unitId, r] as const)), today);
    if (agg.meetings === 0) return;
    setPrinting(true);
    try {
      const meetings = await listLocalityMeetings(city.localityId, from, to);
      await printHtml(
        buildConsolidatedJournalHtml(
          {
            // D-OFF-05 : libellé de ville, jamais un nom de personne.
            scopeLabel: t('cityStudy.journal.scope', { city: city.localityName }),
            period,
            aggregate: agg,
            meetings,
            today,
            locale: lang,
          },
          tr,
        ),
      );
    } catch (err) {
      const denied = cityJournalAccessDenied(err);
      push({ kind: 'error', title: t('assembly.journal.failed'), msg: denied ? t('cityStudy.lock.title') : errMsg(err, '') || undefined });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <PeriodPicker period={period} setPeriod={setPeriod} />
        {q.data && (
          <Button
            size="sm"
            iconL={<Icon name="download" size={13} />}
            style={{ marginLeft: 'auto' }}
            disabled={printing || q.data.every((r) => r.meetingCount === 0)}
            title={q.data.every((r) => r.meetingCount === 0) ? t('hierarchy.stats.journalEmpty') : undefined}
            onClick={() => printJournal(q.data!)}
          >
            {printing ? t('hierarchy.stats.journalBusy') : t('cityStudy.journal.pdf')}
          </Button>
        )}
      </div>
      <QueryBody q={q} t={t} deny={cityJournalAccessDenied}>
        {(rows: UnitMeetingStats[]) => {
          const agg = aggregate(rows.map((r) => r.unitId), new Map(rows.map((r) => [r.unitId, r] as const)), today);
          if (agg.total === 0) return <EmptyState title={t('cityStudy.journal.empty')} text={t('cityStudy.journal.emptyHint')} />;
          type Row = UnitMeetingStats & { id: string };
          const cols: Column<Row>[] = [
            { label: t('assembly.journal.colUnit'), render: (r) => <span style={{ fontWeight: 500 }}>{r.unitName}</span> },
            { label: t('assembly.journal.colMeetings'), cellClass: 'num', render: (r) => r.meetingCount },
            {
              label: t('assembly.journal.colAverage'),
              cellClass: 'num',
              render: (r) => {
                const avg = averageAttendance(r.meetingCount, r.attendanceTotal);
                return avg == null ? '—' : fmtNum(avg, lang);
              },
            },
            { label: t('assembly.journal.colBreadCount'), cellClass: 'num', render: (r) => r.breadBreakingCount },
            {
              label: t('assembly.journal.colLastReport'),
              render: (r) => {
                const alert = isAlert(r, today);
                return (
                  <span style={{ color: alert ? 'var(--earth-700)' : 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                    {alert && <Icon name="warning" size={12} />}{' '}
                    {r.lastMeetingDate ? formatMeetingDate(r.lastMeetingDate) : t('assembly.journal.neverReported')}
                  </span>
                );
              },
            },
          ];
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Kpi label={t('assembly.journal.statMeetings')} value={agg.meetings} />
                <Kpi label={t('assembly.journal.statActive')} value={`${agg.active}/${agg.total}`} />
                <Kpi label={t('hierarchy.stats.alert', { days: ALERT_DAYS })} value={agg.alertRows.length} warn={agg.alertRows.length > 0} />
                <Kpi label={t('assembly.journal.statAverage')} value={agg.average == null ? '—' : fmtNum(agg.average, lang)} />
                <Kpi label={t('assembly.journal.statDistinct')} value={agg.distinctAttendees} />
                <Kpi label={t('assembly.journal.statBread')} value={agg.breadBreaking} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <Table columns={cols} rows={agg.rows.map((r) => ({ ...r, id: r.unitId }))} zebra />
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>
                {t('assembly.journal.distinctHint')} {t('cityStudy.journal.noNames')}
              </p>
            </>
          );
        }}
      </QueryBody>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Évènements de la ville — offre Néhémie, code `EVENEMENTS_SUIVI` (D-OFF-12, JP 27/10 ; ticket O5).
//  Statistiques d'Évènements ANCRÉES sur la ville : le total de la ville reste gratuit, la descente
//  par assemblée (et une assemblée d'autrui) exige le droit — verrou complet (caisse) sinon.
// ---------------------------------------------------------------------------------------------

function CityEventsTab({ city }: { city: CityEntry }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<EventPeriod>(() => defaultPeriod('year'));
  const bounds = periodBounds(period);
  return (
    <>
      <div className="filters">
        <EventPeriodFilter value={period} onChange={setPeriod} />
      </div>
      {bounds ? (
        <EventStatsDrill from={bounds.from} to={bounds.to} root={{ level: 'LOCALITY', id: city.localityId }} lock="full" />
      ) : (
        <p style={{ color: 'var(--ink-500)' }}>{t('events.period.chooseValid')}</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Assemblées — §7.4 : avancement des assemblées de la ville, unité × leçon (✓ / –), D-ETU-42.
// ---------------------------------------------------------------------------------------------

function OverviewTab({ localityId, moduleId }: { localityId: string; moduleId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useQuery({
    queryKey: ['assembly', 'study', 'locality-overview', localityId, moduleId],
    queryFn: () => getStudyLocalityOverview(localityId, moduleId || undefined),
    retry: false,
  });
  return (
    <QueryBody q={q} t={t}>
      {(o: StudyLocalityOverview) =>
        o.assemblies.length === 0 || o.modules.length === 0 ? (
          <EmptyState title={t('cityStudy.overview.empty')} text={t('cityStudy.overview.emptyHint')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {o.modules.map((m) => (
              <ModuleGrid key={m.moduleId} module={m} overview={o} lang={lang} />
            ))}
          </div>
        )
      }
    </QueryBody>
  );
}

function ModuleGrid({ module: m, overview, lang }: { module: StudyLocalityModule; overview: StudyLocalityOverview; lang: string }) {
  const { t } = useTranslation();
  type Row = { id: string; name: string; members: number; done: number; numbers: Set<number>; last: string | null };
  const rows: Row[] = overview.assemblies.map((a) => {
    const am = a.modules.find((x) => x.moduleId === m.moduleId);
    return {
      id: a.unitId,
      name: a.unitName,
      members: a.memberCount,
      done: am?.lessonsDone ?? 0,
      numbers: new Set(am?.doneLessonNumbers ?? []),
      last: am?.lastSessionAt ?? null,
    };
  });
  const cols: Column<Row>[] = [
    {
      label: t('cityStudy.overview.assembly'),
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{t('cityStudy.overview.members', { count: r.members })}</div>
        </div>
      ),
    },
    {
      label: t('cityStudy.overview.progress'),
      style: { minWidth: 150 },
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <ProgressBar percent={m.totalLessons > 0 ? (100 * r.done) / m.totalLessons : 0} height={6} />
          </div>
          <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.done}/{m.totalLessons}</span>
        </div>
      ),
    },
    ...m.lessons.map(
      (l): Column<Row> => ({
        label: <span title={l.title}>{l.number}</span>,
        style: { textAlign: 'center', width: 34 },
        cellStyle: { textAlign: 'center' },
        render: (r) =>
          r.numbers.has(l.number) ? (
            <span style={{ color: 'var(--ok)', fontWeight: 700 }} aria-label={t('cityStudy.overview.done')}>✓</span>
          ) : (
            <span style={{ color: 'var(--ink-300, var(--ink-400))' }} aria-label={t('cityStudy.overview.notDone')}>–</span>
          ),
      }),
    ),
    {
      label: t('cityStudy.overview.lastSession'),
      render: (r) => <span style={{ color: 'var(--ink-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDay(r.last, lang)}</span>,
    },
  ];
  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontFamily: 'var(--font-serif)', color: 'var(--green-800)', fontWeight: 500 }}>
        {[m.code, m.name].filter(Boolean).join(' · ')}{' '}
        <span style={{ fontSize: 12.5, color: 'var(--ink-500)', fontFamily: 'var(--font-sans)' }}>
          {t('cityStudy.overview.lessons', { count: m.totalLessons })}
        </span>
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <Table columns={cols} rows={rows} zebra />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Membres — §7.5 : enseignés / non enseignés / leçons manquées ; notes calculées par le serveur.
// ---------------------------------------------------------------------------------------------

function MembersTab({
  localityId,
  moduleId,
  assemblies,
}: {
  localityId: string;
  moduleId: string;
  assemblies: StudyLocalityOverview['assemblies'];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [status, setStatus] = useState<StudyMemberStatus | ''>('');
  const [unitId, setUnitId] = useState('');
  const q = useQuery({
    queryKey: ['assembly', 'study', 'locality-members', localityId, status, moduleId, unitId],
    queryFn: () =>
      listStudyLocalityMembers(localityId, {
        status: status || undefined,
        moduleId: moduleId || undefined,
        unitId: unitId || undefined,
      }),
    retry: false,
  });

  const cols: Column<StudyLocalityMember & { id: string }>[] = [
    { label: t('cityStudy.members.name'), render: (m) => <span style={{ fontWeight: 500 }}>{m.fullName}</span> },
    { label: t('cityStudy.members.assembly'), render: (m) => <span>{m.unitName}</span> },
    {
      label: t('cityStudy.members.taught'),
      render: (m) => <Badge tone={m.taught ? 'ok' : 'gray'} dot>{t(m.taught ? 'cityStudy.status.TAUGHT' : 'cityStudy.status.NOT_TAUGHT')}</Badge>,
    },
    { label: t('cityStudy.members.lessons'), render: (m) => <span>{m.lessonsDone}/{m.totalLessons}</span> },
    {
      label: t('cityStudy.members.missed'),
      render: (m) =>
        m.missedLessons.length === 0 ? (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ) : (
          <span title={m.missedLessons.map((l) => `${l.number}. ${l.title}`).join('\n')} style={{ color: 'var(--warn)' }}>
            {m.missedLessons.map((l) => l.number).join(', ')}
          </span>
        ),
    },
    {
      label: t('cityStudy.members.score'),
      render: (m) =>
        m.score == null ? (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ) : (
          <span>{t('assembly.study.scoreOf', { score: fmtNum(m.score, lang), max: fmtNum(m.maxScore, lang) })}</span>
        ),
    },
    {
      label: t('cityStudy.members.lastDone'),
      render: (m) => <span style={{ color: 'var(--ink-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDay(m.lastDoneAt, lang)}</span>,
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <Field label={t('cityStudy.filters.status')} style={{ minWidth: 200, margin: 0 }}>
          <Picker
            value={status || 'all'}
            onChange={(v) => setStatus(v === 'all' ? '' : (v as StudyMemberStatus))}
            options={[
              { id: 'all', label: t('cityStudy.filters.allStatuses') },
              ...(['TAUGHT', 'NOT_TAUGHT', 'MISSED'] as const).map((s) => ({ id: s, label: t(`cityStudy.status.${s}`) })),
            ]}
            placeholder={t('cityStudy.filters.allStatuses')}
          />
        </Field>
        {assemblies.length > 1 && (
          <Field label={t('cityStudy.filters.assembly')} style={{ minWidth: 220, margin: 0 }}>
            <Picker
              value={unitId || 'all'}
              onChange={(v) => setUnitId(v === 'all' ? '' : v)}
              options={[
                { id: 'all', label: t('cityStudy.filters.allAssemblies') },
                ...assemblies.map((a) => ({ id: a.unitId, label: a.unitName })),
              ]}
              placeholder={t('cityStudy.filters.allAssemblies')}
            />
          </Field>
        )}
      </div>
      <QueryBody q={q} t={t}>
        {(rows: StudyLocalityMember[]) => (
          <>
            <p style={{ color: 'var(--ink-500)', fontSize: 13, margin: '0 0 10px' }}>{t('cityStudy.members.count', { count: rows.length })}</p>
            <div style={{ overflowX: 'auto' }}>
              <Table
                columns={cols}
                rows={rows.map((r) => ({ ...r, id: r.userId }))}
                zebra
                empty={<EmptyState title={t('cityStudy.members.empty')} text={t('cityStudy.members.emptyHint')} />}
              />
            </div>
          </>
        )}
      </QueryBody>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Statistiques — §7.6 : séances TERMINEE dont la fin tombe dans la période (Europe/Paris).
// ---------------------------------------------------------------------------------------------

function StatsTab({ localityId, moduleId }: { localityId: string; moduleId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [from, setFrom] = useState(startOfYearISO());
  const [to, setTo] = useState(todayISO());
  const ordered = !!from && !!to && from <= to;
  const tooLong = ordered && daysBetween(from, to) > MAX_STATS_DAYS;
  const valid = ordered && !tooLong;
  const q = useQuery({
    queryKey: ['assembly', 'study', 'locality-stats', localityId, from, to, moduleId],
    queryFn: () => getStudyLocalityStats(localityId, { from, to, moduleId: moduleId || undefined }),
    enabled: valid,
    retry: false,
  });
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Field label={t('cityStudy.stats.from')} style={{ margin: 0 }}>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('cityStudy.stats.to')} style={{ margin: 0 }}>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {!valid ? (
        <p style={{ color: 'var(--err)' }}>
          {tooLong ? t('cityStudy.stats.periodTooLong', { days: MAX_STATS_DAYS }) : t('cityStudy.stats.invalidPeriod')}
        </p>
      ) : (
        <QueryBody q={q} t={t}>
          {(s) => {
            const maxSessions = Math.max(1, ...s.months.map((m) => m.sessionCount));
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <Kpi label={t('cityStudy.stats.assemblies')} value={`${s.activeAssemblyCount}/${s.assemblyCount}`} />
                  <Kpi label={t('cityStudy.stats.taughtMembers')} value={`${s.taughtMemberCount}/${s.memberCount}`} />
                  <Kpi label={t('cityStudy.stats.sessions')} value={s.sessionCount} />
                  <Kpi label={t('cityStudy.stats.lessonsDone')} value={s.lessonsDoneCount} />
                  <Kpi label={t('cityStudy.stats.copies')} value={s.copyCount} />
                  <Kpi label={t('cityStudy.stats.average')} value={s.averagePercent == null ? '—' : `${fmtNum(s.averagePercent, lang)} %`} />
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontFamily: 'var(--font-serif)', color: 'var(--green-800)', fontWeight: 500 }}>
                  {t('cityStudy.stats.monthly')}
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <Table
                    columns={[
                      { label: t('cityStudy.stats.month'), render: (m) => <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtMonth(m.month, lang)}</span> },
                      {
                        label: t('cityStudy.stats.sessions'),
                        style: { minWidth: 160 },
                        render: (m) => (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1 }}><ProgressBar percent={(100 * m.sessionCount) / maxSessions} height={6} /></div>
                            <span style={{ fontSize: 12.5 }}>{m.sessionCount}</span>
                          </div>
                        ),
                      },
                      { label: t('cityStudy.stats.copies'), render: (m) => <span>{m.copyCount}</span> },
                      { label: t('cityStudy.stats.taughtMembers'), render: (m) => <span>{m.taughtMemberCount}</span> },
                      {
                        label: t('cityStudy.stats.average'),
                        render: (m) => <span>{m.averagePercent == null ? '—' : `${fmtNum(m.averagePercent, lang)} %`}</span>,
                      },
                    ]}
                    rows={s.months.map((m) => ({ ...m, id: m.month }))}
                    zebra
                  />
                </div>
              </>
            );
          }}
        </QueryBody>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Abonnement — §4.2 / §12.1 : statut, échéance, grâce ; « Gérer l'abonnement » au payeur seul
//  (D-ABO-22), sinon « géré par {payerName} ». Sans abonnement ouvrant droit : la caisse.
// ---------------------------------------------------------------------------------------------

const SUB_TONE: Record<BillingSubscriptionStatus, 'ok' | 'warn' | 'gray' | 'err' | 'earth'> = {
  PENDING: 'earth',
  ACTIVE: 'ok',
  PAST_DUE: 'err',
  CANCELED: 'gray',
  EXPIRED: 'gray',
};

function SubscriptionTab({ city }: { city: CityEntry }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['entitlements', city.localityId],
    queryFn: () => getEntitlements(city.localityId),
    retry: false,
  });
  if (q.isLoading) return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  if (q.isError || !q.data) return <p role="alert" style={{ color: 'var(--err)' }}>{errMsg(q.error, t('common.error'))}</p>;
  const ent = q.data;
  // P-08 (JP 27/10) : la page couvre les trois codes de ville de l'offre Néhémie.
  const suivi = [ENTITLEMENT_ETUDE_SUIVI, ENTITLEMENT_JOURNAL, ENTITLEMENT_EVENEMENTS_SUIVI].some((c) => ent.codes.includes(c));
  const subs = ent.subscriptions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Icon name={suivi ? 'check' : 'lock'} size={16} style={{ color: suivi ? 'var(--ok)' : 'var(--earth-700)' }} />
        <span style={{ fontWeight: 600, color: 'var(--green-800)' }}>
          {suivi ? t('cityStudy.subscription.open', { city: ent.localityName ?? city.localityName }) : t('cityStudy.subscription.closed', { city: ent.localityName ?? city.localityName })}
        </span>
      </div>
      {subs.map((s) => (
        <SubscriptionCard key={s.reference} sub={s} city={city} localPriceLabel={ent.plans[0]?.localPriceLabel ?? null} />
      ))}
      {subs.length === 0 && suivi && (
        // D-ABO-28 : droit ouvert sans plan de ville = « accord de ministère » (couverture sub_subscription).
        <p style={{ color: 'var(--ink-600)', fontSize: 14, margin: 0 }}>{t('cityStudy.subscription.agreement')}</p>
      )}
      {/* Sans droit et sans caisse / impayé en cours (déjà présentés par leur carte) : la caisse. */}
      {!suivi && !subs.some((s) => s.status === 'PENDING' || s.status === 'PAST_DUE') && (
        <LockedFeature denied={lockOf({ ...city, canSubscribe: ent.canSubscribe })} />
      )}
    </div>
  );
}

function SubscriptionCard({
  sub,
  city,
  localPriceLabel,
}: {
  sub: LocalityPlanSubscription;
  city: CityEntry;
  localPriceLabel: string | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [voucherOpen, setVoucherOpen] = useState(false);
  const portalM = useMutation({
    mutationFn: () => openBillingPortal(sub.reference),
    onSuccess: (res) => window.location.assign(res.url),
  });
  // D-OFF-08 (JP 27/10, plan 05) : un VOUCHER (code d'activation) suit les règles d'un MANUEL — droit
  // jusqu'à `manualEndDate` incluse, ni portail Stripe ni facture.
  const voucher = sub.source === 'VOUCHER';
  const manual = sub.source === 'MANUEL' || voucher;
  // §4.4 du 23/10 : pas de client Stripe tant que PENDING / EXPIRED.
  const portal = sub.paidByMe && !manual && sub.status !== 'PENDING' && sub.status !== 'EXPIRED';

  let due: string | null = null;
  if (manual) due = t('cityStudy.subscription.manualUntil', { date: fmtLocalDate(sub.manualEndDate, lang) });
  else if (sub.cancelAtPeriodEnd || sub.status === 'CANCELED') due = t('cityStudy.subscription.endsOn', { date: fmtDay(sub.currentPeriodEnd, lang) });
  else if (sub.currentPeriodEnd && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE'))
    due = t('cityStudy.subscription.renewsOn', { date: fmtDay(sub.currentPeriodEnd, lang) });

  return (
    <div className="card" style={{ padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 17, color: 'var(--green-800)' }}>
            {t(`cityStudy.subscription.plans.${sub.planCode}`, { defaultValue: sub.planCode })}
          </strong>
          <Badge tone={SUB_TONE[sub.status]} dot>{t(`billing.status.${sub.status}`)}</Badge>
          <Badge tone={sub.entitled ? 'ok' : 'gray'}>{t(sub.entitled ? 'cityStudy.subscription.entitled' : 'cityStudy.subscription.notEntitled')}</Badge>
        </div>
        <div style={{ color: 'var(--ink-500)', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>{sub.reference}</div>
        <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>
          {t(`cityStudy.subscription.period.${sub.billingPeriod}`)} · {t(`cityStudy.subscription.source.${sub.source}`)}
        </div>
        {due && <div style={{ color: sub.cancelAtPeriodEnd ? 'var(--warn)' : 'var(--ink-600)', fontSize: 13 }}>{due}</div>}
        {sub.status === 'PAST_DUE' && sub.graceEndsAt && (
          <div style={{ color: 'var(--err)', fontSize: 13 }}>{t('cityStudy.subscription.grace', { date: fmtDay(sub.graceEndsAt, lang) })}</div>
        )}
        {sub.status === 'PENDING' && <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>{t('cityStudy.lock.pending')}</div>}
        {!sub.paidByMe && (
          <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>
            {sub.source === 'MANUEL'
              ? t('cityStudy.subscription.manual')
              : t('cityStudy.lock.managedBy', { name: sub.payerName ?? t('cityStudy.subscription.unknownPayer') })}
          </div>
        )}
        {sub.paidByMe && !manual && (
          <Link to="/abonnements/mes-abonnements" style={{ color: 'var(--green-700)', fontWeight: 600, fontSize: 13 }}>
            {t('cityStudy.subscription.invoices')}
          </Link>
        )}
        {portalM.isError && <div style={{ color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(portalM.error, t)}</div>}
      </div>
      {portal && (
        <Button variant={sub.status === 'PAST_DUE' ? 'primary' : 'secondary'} disabled={portalM.isPending} onClick={() => portalM.mutate()}>
          {sub.status === 'PAST_DUE' ? t('cityStudy.lock.updateCard') : t('cityStudy.subscription.manage')}
        </Button>
      )}
      {/* §3.6 (plan 05) : un nouveau code PROLONGE l'abonnement VOUCHER de la ville (le serveur juge). */}
      {voucher && sub.paidByMe && (
        <>
          <Button variant="secondary" iconL={<Icon name="tag" size={13} />} onClick={() => setVoucherOpen(true)}>
            {t('offers.voucher.extend')}
          </Button>
          <VoucherRedeemModal
            open={voucherOpen}
            onClose={() => setVoucherOpen(false)}
            plan="nehemie"
            cities={[{ localityId: city.localityId, localityName: city.localityName }]}
            localPriceLabel={localPriceLabel}
          />
        </>
      )}
    </div>
  );
}
