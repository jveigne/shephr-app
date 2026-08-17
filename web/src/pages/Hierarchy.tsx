import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, TopBar } from '../components/ui';
import { SupervisorCard } from '../components/SupervisorCard';
import { useAuth } from '../hooks/useAuth';
import {
  fetchLeaderHierarchy,
  type HierarchyUnitView,
  type LeaderHierarchyNode,
} from '../services/leadersApi';
import { canManageUsers, type ModuleRole } from '../services/authApi';
import { getActiveGoal, getMyPerimeterAggregate } from '../services/goalsApi';
import { goalName } from '../utils/goalName';
import { fmtAmount } from '../utils/format';
import { FEATURES } from '../config/features';

// Hiérarchie des dirigeants (21/07) — arbre du leadership renvoyé par le backend, déjà scopé
// par rôle (SUBTREE dirigeant / CHAIN membre / MINISTRY leader-secrétariat-superadmin).

const ROLE_TONE: Partial<Record<ModuleRole, 'green' | 'earth' | 'gray'>> = {
  DIRIGEANT_COORDINATEUR: 'green',
  DIRIGEANT_SENIOR: 'green',
  DIRIGEANT: 'earth',
  DIRIGEANT_UNITE: 'earth',
};

/**
 * « Ce que porte mon leadership » — Σ des engagements des membres de mon sous-arbre, par catégorie.
 *
 * <p>Aucune addition côté client : le total vient de `GET /goals/me/aggregate`, que le backend
 * calcule sur les assemblées dont je suis le superviseur (directement ou par la chaîne de
 * dirigeants). Sommer l'arbre affiché donnerait autre chose : il porte des personnes, pas des
 * montants.
 *
 * <p>Garde identique à `Goals.tsx` (`showPerimeter`), miroir de `requireSubCoordinatorLeader`
 * côté serveur. En cas de refus ou de panne, le bloc ne s'affiche PAS : un total à zéro se lirait
 * comme « mon leadership n'a rien engagé », ce qui serait faux.
 */
function LeadershipTotals({ unitCount, memberCount }: { unitCount: number; memberCount: number }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const canRead =
    !!me
    && !me.superAdmin
    && (me.goalRole === 'DIRIGEANT_UNITE'
      || me.goalRole === 'DIRIGEANT'
      || me.goalRole === 'DIRIGEANT_SENIOR');

  const goalQ = useQuery({ queryKey: ['goals', 'active'], queryFn: getActiveGoal, enabled: canRead });
  const year = goalQ.data?.currentYear ?? null;
  const aggQ = useQuery({
    queryKey: ['goals', 'me', 'aggregate', year],
    queryFn: () => getMyPerimeterAggregate(year ?? undefined),
    enabled: canRead && year != null,
  });

  if (!canRead || !goalQ.data || !aggQ.data) return null;

  const goal = goalQ.data;
  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const valueOf = (categoryId: string) => {
    const line = aggQ.data.find((l) => l.categoryId === categoryId);
    return line?.effectiveAmount ?? line?.effectiveCount ?? 0;
  };
  const nothing = categories.every((c) => valueOf(c.id) === 0);

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{t('hierarchy.leadershipTitle', { year: goal.currentYear })}</strong>
        <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
          {t('hierarchy.unitsCount', { count: unitCount })} · {t('hierarchy.membersCount', { count: memberCount })}
        </span>
      </div>

      {nothing ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>
          {t('hierarchy.leadershipEmpty')}
        </p>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {categories.map((category) => (
            <div
              key={category.id}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
                paddingTop: 6, borderTop: '1px solid var(--line-soft, rgba(42,38,32,0.08))',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{goalName(category)}</span>
              <strong style={{ fontSize: 15 }}>
                {category.unitType === 'CURRENCY'
                  ? fmtAmount(valueOf(category.id), goal.defaultCurrency)
                  : `${valueOf(category.id)} ${category.unitLabel ?? ''}`.trim()}
              </strong>
            </div>
          ))}
        </div>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>
        {t('hierarchy.leadershipHint')}
      </p>
    </div>
  );
}

/**
 * Pastille « où en est cette personne sur le But Quinquennal » (RG-BQ-11 — un dirigeant déclare
 * comme tout le monde). C'est ici que se lit la campagne de redéclaration.
 *
 * <p>⚠ `null` sur les trois champs = aucun Goal actif, ou personne non rattachée → AUCUNE pastille,
 * surtout pas un faux « rien déclaré ».
 */
function GoalPastille({
  hasPledges, submitted, late,
}: {
  hasPledges: boolean | null;
  submitted: boolean | null;
  late: boolean | null;
}) {
  const { t } = useTranslation();
  if (hasPledges == null && submitted == null && late == null) return null;
  if (submitted === true) return <Badge tone="ok" dot>{t('hierarchy.goalSubmitted')}</Badge>;
  if (late === true) return <Badge tone="err" dot>{t('hierarchy.goalLate')}</Badge>;
  if (hasPledges === true) return <Badge tone="warn" dot>{t('hierarchy.goalDraft')}</Badge>;
  return <Badge tone="gray" dot>{t('hierarchy.goalNoPledges')}</Badge>;
}

const countLeaders = (n: LeaderHierarchyNode): number =>
  1 + n.children.reduce((acc, c) => acc + countLeaders(c), 0);
const countUnits = (n: LeaderHierarchyNode): number =>
  n.units.length + n.children.reduce((acc, c) => acc + countUnits(c), 0);
const countMembers = (n: LeaderHierarchyNode): number =>
  n.units.reduce((acc, u) => acc + u.members.length, 0)
  + n.children.reduce((acc, c) => acc + countMembers(c), 0);

export function HierarchyPage() {
  const { t } = useTranslation();
  const { me } = useAuth();

  const hierarchyQ = useQuery({
    queryKey: ['leaders', 'hierarchy'],
    queryFn: () => fetchLeaderHierarchy(),
  });

  const data = hierarchyQ.data;
  const roots = data?.roots ?? [];
  const totals = roots.reduce(
    (acc, r) => ({
      leaders: acc.leaders + countLeaders(r),
      units: acc.units + countUnits(r),
      members: acc.members + countMembers(r),
    }),
    { leaders: 0, units: 0, members: 0 },
  );

  const intro =
    data?.mode === 'CHAIN'
      ? t('hierarchy.introChain')
      : data?.mode === 'MINISTRY'
        ? t('hierarchy.introMinistry')
        : t('hierarchy.introSubtree');

  return (
    <>
      <TopBar title={t('hierarchy.title')} crumbs={[t('common.brand'), t('nav.hierarchy')]} />
      <div className="content">
        {/* JP 30/07 : SEUL un dirigeant déclare son superviseur. Un membre ne le voit jamais —
            son rattachement à une assemblée détermine implicitement son dirigeant. */}
        {canManageUsers(me) && <SupervisorCard />}

        {/* « À qui je rends compte » : une mention AU-DESSUS de la vue — l'arbre, lui, ne
            contient que ce qui est en dessous du dirigeant (JP 30/07). */}
        {data?.supervisor && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              padding: '10px 14px', borderRadius: 'var(--radius-md, 10px)',
              background: 'var(--sand-50, rgba(201,149,107,0.10))',
              border: '1px solid var(--line-soft, rgba(42,38,32,0.10))',
              fontSize: 13.5, color: 'var(--ink-700)',
            }}
          >
            <Icon name="arrowUp" size={14} />
            <span>
              {t('hierarchy.reportsTo')} <strong>{data.supervisor.fullName}</strong>
            </span>
          </div>
        )}

        {/* Ce que porte mon leadership (JP 17/08) : la Σ des engagements des membres des
            assemblées de mon sous-arbre, en face de l'arbre qui la produit. Même source que
            « Mon périmètre » — le serveur scope l'agrégat au sous-arbre de personnes. */}
        <LeadershipTotals unitCount={totals.units} memberCount={totals.members} />

        <p className="section-sub">{intro}</p>

        {data && roots.length > 0 && (
          <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
            {t('hierarchy.leadersCount', { count: totals.leaders })}
            {' · '}
            {t('hierarchy.unitsCount', { count: totals.units })}
            {data.mode !== 'CHAIN' && (
              <>
                {' · '}
                {t('hierarchy.membersCount', { count: totals.members })}
              </>
            )}
          </div>
        )}

        <div className="card" style={{ padding: roots.length > 0 ? '6px 0' : 0 }}>
          {hierarchyQ.isLoading ? (
            <div className="empty">
              <p>{t('common.loading')}</p>
            </div>
          ) : hierarchyQ.isError ? (
            <div className="empty">
              <div className="icon-wrap"><Icon name="hierarchy" size={26} /></div>
              <h4>{t('hierarchy.loadError')}</h4>
            </div>
          ) : roots.length === 0 ? (
            <div className="empty">
              <div className="icon-wrap"><Icon name="hierarchy" size={26} /></div>
              <h4>{t('hierarchy.empty')}</h4>
              <p>{t('hierarchy.emptyHint')}</p>
            </div>
          ) : (
            roots.map((root) => (
              <LeaderNode key={root.id} node={root} depth={0} meId={me?.id ?? null} />
            ))
          )}
        </div>

        {(data?.unassignedUnits.length ?? 0) > 0 && (
          <>
            <h3 style={{ margin: '22px 0 10px' }}>{t('hierarchy.unassignedTitle')}</h3>
            <p className="section-sub">{t('hierarchy.unassignedHint')}</p>
            <div className="card" style={{ padding: '6px 0' }}>
              {data!.unassignedUnits.map((unit) => (
                <div key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px' }}>
                  <Icon name="unit" size={15} />
                  <span style={{ fontWeight: 600 }}>{unit.name ?? t('hierarchy.unnamedUnit')}</span>
                  {(unit.localityName || unit.countryName) && (
                    <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>
                      · {[unit.localityName, unit.zoneName, unit.countryName].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  <Badge tone="warn">{t('hierarchy.needsLeader')}</Badge>
                  <span style={{ marginLeft: 'auto', color: 'var(--ink-500)', fontSize: 12 }}>
                    {unit.members.length > 0
                      ? t('hierarchy.membersCount', { count: unit.members.length })
                      : t('hierarchy.unitNoMembers')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function LeaderNode({ node, depth, meId }: { node: LeaderHierarchyNode; depth: number; meId: string | null }) {
  const { t } = useTranslation();
  // Les deux premiers niveaux sont dépliés par défaut ; le reste à la demande.
  const [open, setOpen] = useState(depth < 2);
  const hasContent = node.children.length > 0 || node.units.length > 0;
  const role = node.goalRole ?? node.donationRole;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasContent && setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '9px 14px', paddingLeft: 14 + depth * 22,
          background: 'none', border: 'none', cursor: hasContent ? 'pointer' : 'default',
          textAlign: 'left', font: 'inherit',
        }}
      >
        <span style={{ width: 16, display: 'inline-flex', color: 'var(--ink-500)' }}>
          {hasContent && <Icon name={open ? 'chevDown' : 'chevRight'} size={14} />}
        </span>
        <Icon name="users" size={15} />
        <span style={{ fontWeight: 600 }}>{node.fullName}</span>
        {role && <Badge tone={ROLE_TONE[role] ?? 'gray'}>{t(`roles.${role}`)}</Badge>}
        {FEATURES.donations && node.donationRole && node.donationRole !== node.goalRole && (
          <Badge tone="gray">{t(`roles.${node.donationRole}`)}</Badge>
        )}
        {meId === node.id && <Badge tone="ok">{t('hierarchy.you')}</Badge>}
        <GoalPastille hasPledges={node.goalHasPledges} submitted={node.goalSubmitted} late={node.goalLate} />
        <span style={{ marginLeft: 'auto', color: 'var(--ink-500)', fontSize: 12 }}>
          {node.units.length > 0 && t('hierarchy.unitsCount', { count: node.units.length })}
        </span>
      </button>

      {open && (
        <>
          {node.units.map((unit) => (
            <UnitRow key={unit.id} unit={unit} depth={depth + 1} />
          ))}
          {node.children.map((child) => (
            <LeaderNode key={child.id} node={child} depth={depth + 1} meId={meId} />
          ))}
        </>
      )}
    </div>
  );
}

function UnitRow({ unit, depth }: { unit: HierarchyUnitView; depth: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasMembers = unit.members.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasMembers && setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 14px', paddingLeft: 14 + depth * 22,
          background: 'none', border: 'none', cursor: hasMembers ? 'pointer' : 'default',
          textAlign: 'left', font: 'inherit', color: 'var(--ink-700, inherit)',
        }}
      >
        <span style={{ width: 16, display: 'inline-flex', color: 'var(--ink-500)' }}>
          {hasMembers && <Icon name={open ? 'chevDown' : 'chevRight'} size={14} />}
        </span>
        <Icon name="unit" size={15} />
        <span>{unit.name ?? t('hierarchy.unnamedUnit')}</span>
        {unit.localityName && (
          <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>· {unit.localityName}</span>
        )}
        {unit.needsLeader && <Badge tone="warn">{t('hierarchy.needsLeader')}</Badge>}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-500)', fontSize: 12 }}>
          {hasMembers
            ? t('hierarchy.membersCount', { count: unit.members.length })
            : t('hierarchy.unitNoMembers')}
        </span>
      </button>

      {open &&
        unit.members.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 14px', paddingLeft: 14 + (depth + 1) * 22 + 16,
              fontSize: 13.5,
            }}
          >
            <span>{m.fullName}</span>
            <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>{m.email}</span>
            {!m.active && <Badge tone="gray">{t('users.statusInactive')}</Badge>}
            <GoalPastille hasPledges={m.goalHasPledges} submitted={m.goalSubmitted} late={m.goalLate} />
          </div>
        ))}
    </div>
  );
}
