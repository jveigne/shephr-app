import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Field, Modal } from './ui';
import { Icon } from './Icon';
import {
  fetchReminderScopes,
  sendBulkReminder,
  type BulkReminderResponse,
  type ReminderScope,
  type ReminderScopeOption,
} from '../services/goalsApi';

// ---------------------------------------------------------------------------------------------
//  « Relancer » — rappel GROUPÉ des personnes qui n'ont pas soumis (lot G3, cadrage JP 14/09).
//  Parité mobile → web (JP 27/10, décision n°3 — D-WEB-01) : pendant de
//  `mobile/app/(tabs)/goals/remind.tsx`, en modale.
//
//  LE POINT CAPITAL (J-4 / J-5) : le périmètre est CHOISI EXPLICITEMENT. « Mes disciples » et les
//  périmètres géographiques sont présentés en DEUX SECTIONS SÉPARÉES et la modale n'envoie qu'UN
//  périmètre à la fois — jamais l'union, jamais additionnés.
//
//  Aucun calcul de périmètre ici : les options viennent du serveur (`GET /goals/reminders/scopes`),
//  qui ne propose que ce que l'acteur peut réellement viser. Un viewer ministère-large
//  (LEADER / SECRETARIAT) ne reçoit que « Mes disciples » (Q3 du cadrage non tranchée).
// ---------------------------------------------------------------------------------------------

type ApiErr = { response?: { status?: number; data?: { message?: string; error?: string } } };

const keyOf = (o: ReminderScopeOption) => `${o.scope}:${o.scopeId ?? ''}`;

export function BulkReminderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<BulkReminderResponse | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const scopesQ = useQuery({
    queryKey: ['goals', 'reminder-scopes'],
    queryFn: fetchReminderScopes,
    enabled: open,
    // L'aperçu « n non soumis » doit être frais à chaque ouverture.
    staleTime: 0,
  });
  const options = scopesQ.data ?? [];
  // Deux listes, jamais fondues (J-4/J-5) — la traduction à l'écran de la règle de fond.
  const geographic = options.filter((o) => o.scope !== 'DISCIPLES');
  const disciples = options.filter((o) => o.scope === 'DISCIPLES');
  const current = options.find((o) => keyOf(o) === selected) ?? null;

  const scopeLabel = (scope: ReminderScope) => t(`goals.remind.scope.${scope}`);
  const currentLabel = current ? current.name ?? scopeLabel(current.scope) : '';

  const reset = () => {
    setSelected(null);
    setMessage('');
    setConfirming(false);
    setDone(null);
    setSendError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const sendM = useMutation({
    mutationFn: () =>
      sendBulkReminder({
        scope: current!.scope,
        scopeId: current!.scopeId,
        // Vide → message serveur par défaut, avec la date limite.
        message: message.trim() ? message.trim() : undefined,
      }),
    onSuccess: (res) => {
      setDone(res);
      setConfirming(false);
      setSendError(null);
      // Statuts des membres (soumis / relancés) et aperçus des périmètres.
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: (err) => {
      setConfirming(false);
      const e = err as ApiErr;
      // Les 422 métier portent leur code dans `error` ; le 403 n'en porte pas (garde de périmètre).
      const code = e?.response?.data?.error;
      if (code === 'SCOPE_REQUIRED' || code === 'SCOPE_ID_REQUIRED') {
        setSendError(t(`goals.remind.errors.${code}`));
      } else if (e?.response?.status === 403) {
        setSendError(t('goals.remind.denied'));
      } else {
        setSendError(e?.response?.data?.message ?? t('goals.remind.failed'));
      }
    },
  });

  // ------------------------------------------------------------------------------------------
  //  Compte rendu — « le dirigeant voit ce qui s'est passé » (§3.1)
  // ------------------------------------------------------------------------------------------
  if (done) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={t('goals.remind.doneTitle')}
        sub={done.scopeName ?? scopeLabel(done.scope)}
        footer={
          <Button variant="primary" onClick={close}>
            {t('goals.remind.backCta')}
          </Button>
        }
      >
        <div className="card" style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>
          <ResultRow icon="mail" label={t('goals.remind.resultSent')} value={done.sent} />
          <ResultRow icon="history" label={t('goals.remind.resultSkipped')} value={done.alreadyReminded} />
          <ResultRow icon="check" label={t('goals.remind.resultSubmitted')} value={done.alreadySubmitted} />
        </div>
        {done.alreadyReminded > 0 && <p style={footnote}>{t('goals.remind.skippedHint')}</p>}
        {done.sentToNames.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={sectionTitle}>{t('goals.remind.sentToLabel')}</div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5 }}>
              {done.sentToNames.join(' · ')}
            </p>
          </div>
        )}
      </Modal>
    );
  }

  // ------------------------------------------------------------------------------------------
  //  Sélection du périmètre
  // ------------------------------------------------------------------------------------------
  const footer = confirming && current ? (
    <>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-700)' }}>
        {t('goals.remind.confirmBody', { count: current.pending, scope: currentLabel })}
      </span>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={sendM.isPending}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        iconL={<Icon name="mail" size={14} />}
        onClick={() => sendM.mutate()}
        disabled={sendM.isPending}
      >
        {sendM.isPending ? t('goals.remind.sending') : t('goals.remind.confirmCta')}
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={close}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        iconL={<Icon name="mail" size={14} />}
        disabled={!current || current.pending === 0}
        onClick={() => {
          setSendError(null);
          setConfirming(true);
        }}
      >
        {t('goals.remind.sendCta')}
      </Button>
    </>
  );

  let body: ReactNode;
  if (scopesQ.isLoading) {
    body = <p style={{ color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>;
  } else if (scopesQ.isError) {
    const e = scopesQ.error as ApiErr;
    body = (
      <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
        <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>
          {e?.response?.data?.message ?? t('goals.remind.loadError')}
        </p>
        <Button size="sm" onClick={() => scopesQ.refetch()}>
          {t('goals.remind.retry')}
        </Button>
      </div>
    );
  } else if (options.length === 0) {
    body = <p style={{ color: 'var(--ink-500)', fontSize: 13, margin: 0 }}>{t('goals.remind.empty')}</p>;
  } else {
    body = (
      <>
        {disciples.length > 0 && (
          <section>
            <div style={sectionTitle}>{t('goals.remind.disciplesSection')}</div>
            {/* Le « jamais additionnées » du cadrage, dit en toutes lettres. */}
            <p style={sectionHint}>{t('goals.remind.disciplesHint')}</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {disciples.map((o) => (
                <ScopeRow
                  key={keyOf(o)}
                  option={o}
                  label={t('goals.remind.scope.DISCIPLES')}
                  caption={t('goals.remind.disciplesCaption')}
                  selected={selected === keyOf(o)}
                  onSelect={() => {
                    setSelected(keyOf(o));
                    setConfirming(false);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {geographic.length > 0 && (
          <section style={{ marginTop: disciples.length > 0 ? 20 : 0 }}>
            <div style={sectionTitle}>{t('goals.remind.geoSection')}</div>
            <p style={sectionHint}>{t('goals.remind.geoHint')}</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {geographic.map((o) => (
                <ScopeRow
                  key={keyOf(o)}
                  option={o}
                  label={o.name ?? scopeLabel(o.scope)}
                  caption={scopeLabel(o.scope)}
                  selected={selected === keyOf(o)}
                  onSelect={() => {
                    setSelected(keyOf(o));
                    setConfirming(false);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {current && (
          <>
            <div
              className="card"
              style={{ marginTop: 18, padding: '10px 14px', fontSize: 13, color: 'var(--ink-700)' }}
            >
              {current.pending > 0
                ? t('goals.remind.preview', { count: current.pending, total: current.total })
                : t('goals.remind.previewNone')}
            </div>
            <Field label={t('goals.remind.messageLabel')} hint={t('goals.remind.messageHint')} style={{ marginTop: 14 }}>
              <textarea
                className="input"
                rows={4}
                maxLength={2000}
                value={message}
                placeholder={t('goals.remind.messagePlaceholder')}
                onChange={(e) => setMessage(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
          </>
        )}

        {sendError && <p style={{ margin: '12px 0 0', color: 'var(--err)', fontSize: 13 }}>{sendError}</p>}
        <p style={footnote}>{t('goals.remind.antispamHint')}</p>
      </>
    );
  }

  return (
    <Modal open={open} onClose={close} title={t('goals.remind.title')} sub={t('goals.remind.intro')} footer={footer}>
      {body}
    </Modal>
  );
}

/** Une option de périmètre — une ligne, un choix (radio). */
function ScopeRow({
  option,
  label,
  caption,
  selected,
  onSelect,
}: {
  option: ReminderScopeOption;
  label: string;
  caption: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '11px 14px',
        borderRadius: 'var(--radius)',
        border: `1px solid ${selected ? 'var(--green-700)' : 'var(--line)'}`,
        background: selected ? 'var(--green-50)' : 'var(--ivory-card)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          flex: '0 0 16px',
          borderRadius: '50%',
          border: `2px solid ${selected ? 'var(--green-700)' : 'var(--ink-300)'}`,
          boxShadow: selected ? 'inset 0 0 0 3px var(--green-50)' : undefined,
          background: selected ? 'var(--green-700)' : 'transparent',
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{caption}</span>
      </span>
      <Badge tone={option.pending > 0 ? 'earth' : 'ok'}>
        {t('goals.remind.pendingOfTotal', { pending: option.pending, total: option.total })}
      </Badge>
    </button>
  );
}

function ResultRow({ icon, label, value }: { icon: 'mail' | 'history' | 'check'; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={15} />
      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-700)' }}>{label}</span>
      <strong style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink-900)' }}>{value}</strong>
    </div>
  );
}

const sectionTitle = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '.4px',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-500)',
};
const sectionHint = { margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.45 };
const footnote = { margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-500)', lineHeight: 1.5 };
