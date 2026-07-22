import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, TopBar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import {
  fetchLeaderHierarchy,
  type HierarchyUnitView,
  type LeaderHierarchyNode,
} from '../services/leadersApi';
import type { ModuleRole } from '../services/authApi';
import { FEATURES } from '../config/features';

// Hiérarchie des dirigeants (21/07) — arbre du leadership renvoyé par le backend, déjà scopé
// par rôle (SUBTREE dirigeant / CHAIN membre / MINISTRY leader-secrétariat-superadmin).

const ROLE_TONE: Partial<Record<ModuleRole, 'green' | 'earth' | 'gray'>> = {
  DIRIGEANT_COORDINATEUR: 'green',
  DIRIGEANT_SENIOR: 'green',
  DIRIGEANT: 'earth',
  DIRIGEANT_UNITE: 'earth',
};

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
          </div>
        ))}
    </div>
  );
}
