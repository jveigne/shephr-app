import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { Badge, Button, Field, Input } from './ui';
import { useToast } from './Toast';
import {
  declareMySupervisor,
  fetchMyDiscipleship,
  searchSupervisorCandidates,
  type DiscipleshipPerson,
} from '../services/leadersApi';

// ---------------------------------------------------------------------------------------------
//  Superviseur (28/07, révisé JP 30/07) — un DIRIGEANT déclare SON superviseur ; ses subordonnés
//  n'apparaissent que par les déclarations des autres (aucune action dans ce sens).
//
//  Réservé aux DIRIGEANTS : un simple membre ne déclare pas de superviseur — son rattachement à
//  une assemblée détermine implicitement son dirigeant. Le rendu est gardé par l'appelant.
//  « Faiseur de disciples » est du jargon interne : l'interface dit « superviseur ».
// ---------------------------------------------------------------------------------------------

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

function personLine(p: DiscipleshipPerson): string {
  return [p.unitName, p.cityName, p.email].filter(Boolean).join(' · ');
}

export function SupervisorCard() {
  const { t } = useTranslation();
  const { push } = useToast();
  const queryClient = useQueryClient();

  const [searchOpen, setSearchOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  const mineQ = useQuery({ queryKey: ['leaders', 'discipleship'], queryFn: fetchMyDiscipleship });

  const candidatesQ = useQuery({
    queryKey: ['leaders', 'supervisor-candidates', debouncedQ],
    queryFn: () => searchSupervisorCandidates(debouncedQ),
    enabled: searchOpen && debouncedQ.length >= 2,
  });

  const declareM = useMutation({
    mutationFn: declareMySupervisor,
    onSuccess: (data) => {
      queryClient.setQueryData(['leaders', 'discipleship'], data);
      // L'organigramme affiché juste en dessous vient de changer de forme.
      queryClient.invalidateQueries({ queryKey: ['leaders', 'hierarchy'] });
      setSearchOpen(false);
      setQuery('');
      push({ kind: 'ok', title: t('supervisor.declared') });
    },
    onError: (err) => {
      const code = errCode(err);
      push({
        kind: 'error',
        title: t('supervisor.declareFailed'),
        msg: code ? t(`supervisor.errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'),
      });
    },
  });

  const supervisor = mineQ.data?.supervisor ?? null;
  const disciples = mineQ.data?.disciples ?? [];
  const results = candidatesQ.data ?? [];
  // On ne renvoie pas vers l'invitation administrée (réservée aux dirigeants) : tout le monde
  // peut partager le lien d'inscription publique, c'est le chemin le plus court qui existe déjà.
  const signupLink = `${window.location.origin}/signup`;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="user" size={16} />
        <h3 style={{ margin: 0, fontSize: 16 }}>{t('supervisor.title')}</h3>
      </div>
      <p className="section-sub" style={{ margin: '6px 0 12px' }}>{t('supervisor.intro')}</p>

      {mineQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)', margin: 0 }}>{t('common.loading')}</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {supervisor ? (
            <>
              <Icon name="users" size={15} />
              <span style={{ fontWeight: 600 }}>{supervisor.fullName}</span>
              <span style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>{personLine(supervisor)}</span>
              {!supervisor.active && <Badge tone="gray">{t('users.statusInactive')}</Badge>}
            </>
          ) : (
            <span style={{ color: 'var(--ink-500)', fontSize: 13.5 }}>{t('supervisor.none')}</span>
          )}
          <Button
            variant="secondary"
            iconL={<Icon name={supervisor ? 'edit' : 'plus'} size={14} />}
            onClick={() => { setSearchOpen((v) => !v); setInviteOpen(false); }}
            style={{ marginLeft: 'auto' }}
          >
            {supervisor ? t('supervisor.change') : t('supervisor.declare')}
          </Button>
        </div>
      )}

      {searchOpen && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--line-soft, rgba(42,38,32,0.08))', paddingTop: 14 }}>
          <Field
            label={t('supervisor.searchLabel')}
            hint={debouncedQ.length > 0 && debouncedQ.length < 2 ? t('supervisor.searchTooShort') : t('supervisor.searchHint')}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('supervisor.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              autoFocus
            />
          </Field>

          {debouncedQ.length >= 2 && (
            <div style={{ marginTop: 6 }}>
              {candidatesQ.isLoading ? (
                <p style={{ color: 'var(--ink-400)', margin: 0 }}>{t('common.loading')}</p>
              ) : results.length === 0 ? (
                <p style={{ color: 'var(--ink-400)', margin: 0, fontStyle: 'italic' }}>{t('supervisor.noResult')}</p>
              ) : (
                <div style={{ border: '1px solid var(--line-soft, rgba(42,38,32,0.08))', borderRadius: 10, overflow: 'hidden' }}>
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={declareM.isPending}
                      onClick={() => declareM.mutate(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                        borderBottom: '1px solid var(--line-soft, rgba(42,38,32,0.06))', fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink-900, #1E1B16)' }}>{p.fullName}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{personLine(p)}</div>
                      </div>
                      {(p.goalRole ?? p.donationRole) && (
                        <Badge tone="gray">{t(`roles.${p.goalRole ?? p.donationRole}`)}</Badge>
                      )}
                      {!p.active && <Badge tone="gray">{t('users.statusInactive')}</Badge>}
                      <Icon name="chevRight" size={13} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setInviteOpen((v) => !v)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                color: 'var(--green-700, #1E3A2F)', fontFamily: 'inherit', fontSize: 13.5,
                fontWeight: 600, textDecoration: 'underline',
              }}
            >
              {t('supervisor.notFound')}
            </button>
            {inviteOpen && (
              <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--ink-600)' }}>
                <p style={{ margin: '0 0 8px' }}>{t('supervisor.inviteHint')}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <code style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{signupLink}</code>
                  <Button
                    variant="secondary"
                    iconL={<Icon name="copy" size={14} />}
                    onClick={() => {
                      navigator.clipboard?.writeText(signupLink);
                      push({ kind: 'ok', title: t('supervisor.linkCopied') });
                    }}
                  >
                    {t('supervisor.copyLink')}
                  </Button>
                  <Button
                    variant="secondary"
                    iconL={<Icon name="mail" size={14} />}
                    onClick={() => {
                      window.location.href = `mailto:?subject=${encodeURIComponent(t('supervisor.mailSubject'))}`
                        + `&body=${encodeURIComponent(t('supervisor.mailBody', { link: signupLink }))}`;
                    }}
                  >
                    {t('supervisor.sendMail')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {disciples.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line-soft, rgba(42,38,32,0.08))', paddingTop: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 8 }}>
            {t('supervisor.superviseesTitle', { count: disciples.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {disciples.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <Icon name="user" size={14} />
                <span style={{ fontWeight: 600 }}>{p.fullName}</span>
                <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>{personLine(p)}</span>
                {!p.active && <Badge tone="gray">{t('users.statusInactive')}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
