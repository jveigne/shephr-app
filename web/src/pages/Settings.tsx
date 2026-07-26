import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Button, Field, Input, Modal, TopBar } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { deleteMyAccount, primaryRoleKey } from '../services/authApi';

// Feature C — vraie page Réglages : carte identité + « Zone dangereuse » (suppression de compte).
// Montée sur /settings (AppShell) ET /member-settings (MemberShell).

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function SettingsPage() {
  const { t } = useTranslation();
  const { me, logout } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const confirmWord = t('settings.deleteConfirmWord');
  const confirmed = confirmText.trim().toUpperCase() === confirmWord.toUpperCase();

  const deleteM = useMutation({
    mutationFn: deleteMyAccount,
    onSuccess: async (res) => {
      setConfirmOpen(false);
      push({
        kind: 'ok',
        title: res.mode === 'ANONYMIZED' ? t('settings.anonymized') : t('settings.deleted'),
      });
      await logout();
      navigate('/', { replace: true });
    },
    onError: (err) => {
      // USER_LEADS_ORPHAN_NODES / SUPER_ADMIN_SELF_DELETE : le message backend est affiché tel quel.
      push({ kind: 'error', title: t('settings.deleteRefused'), msg: errMsg(err, t('common.error')) });
    },
  });

  const roleKey = primaryRoleKey(me);

  const rows: { label: string; value: string }[] = [
    { label: t('settings.nameLabel'), value: me?.fullName ?? '—' },
    { label: t('settings.emailLabel'), value: me?.email ?? me?.username ?? '—' },
    { label: t('settings.roleLabel'), value: roleKey ? t(`roles.${roleKey}`) : '—' },
  ];

  return (
    <>
      <TopBar title={t('settings.title')} crumbs={[t('common.brand'), t('settings.title')]} />

      <div className="content">
        {/* Carte identité */}
        <h3 style={{ margin: '0 0 10px' }}>{t('settings.identity')}</h3>
        <div className="card" style={{ padding: '18px 20px', marginBottom: 28, maxWidth: 560 }}>
          {rows.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                padding: '8px 0',
                borderBottom: '1px solid var(--line-soft, rgba(42,38,32,0.06))',
                fontSize: 14,
              }}
            >
              <span style={{ color: 'var(--ink-500)' }}>{r.label}</span>
              <strong style={{ textAlign: 'right', wordBreak: 'break-word' }}>{r.value}</strong>
            </div>
          ))}
          {me?.unitNames && me.unitNames.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                padding: '8px 0',
                fontSize: 14,
              }}
            >
              <span style={{ color: 'var(--ink-500)' }}>
                {t('sidebar.units', { count: me.unitNames.length })}
              </span>
              <strong style={{ textAlign: 'right' }}>{me.unitNames.join(', ')}</strong>
            </div>
          )}
        </div>

        {/* Zone dangereuse */}
        <h3 style={{ margin: '0 0 10px', color: 'var(--err, #B86A4A)' }}>{t('settings.dangerZone')}</h3>
        <div
          className="card"
          style={{
            padding: '18px 20px',
            maxWidth: 560,
            border: '1px solid var(--err, #B86A4A)',
          }}
        >
          <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-600)' }}>
            {t('settings.dangerZoneHint')}
          </p>
          <Button
            variant="danger"
            iconL={<Icon name="trash" size={15} />}
            onClick={() => {
              setConfirmText('');
              setConfirmOpen(true);
            }}
          >
            {t('settings.deleteAccount')}
          </Button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('settings.deleteConfirmTitle')}
        sub={t('settings.deleteConfirmBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={!confirmed || deleteM.isPending}
              onClick={() => deleteM.mutate()}
            >
              {deleteM.isPending ? t('settings.deleting') : t('settings.deleteAccount')}
            </Button>
          </>
        }
      >
        <Field label={t('settings.deleteConfirmHint', { word: confirmWord })}>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmWord}
            autoFocus
          />
        </Field>
      </Modal>
    </>
  );
}
