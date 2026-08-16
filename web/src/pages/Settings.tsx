import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Button, Field, Input, Modal, TopBar } from '../components/ui';
import { GeoPicker } from '../components/GeoPicker';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { deleteMyAccount, primaryRoleKey } from '../services/authApi';
import {
  changeMyAssembly,
  createUnit,
  listCountries,
  listLocalities,
  listUnits,
  listZones,
} from '../services/adminApi';
import { contactMailto, useContactSettings } from '../services/contactApi';

// Feature C — vraie page Réglages : carte identité + « Mon assemblée » + « Zone dangereuse ».
// Montée sur /settings (AppShell) ET /member-settings (MemberShell) : une seule intervention
// couvre donc les dirigeants ET les simples membres (RG-BQ-13).

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

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

        {/* RG-BQ-13 — changer d'assemblée soi-même, sans demande ni valideur. */}
        <MyAssemblyCard />

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

/**
 * « Mon assemblée » (RG-BQ-13, JP 16/08) — une personne change d'assemblée ELLE-MÊME, sans demande
 * ni valideur : `PUT /api/church/units/me/assembly`.
 *
 * <p>Conséquence assumée à ÉCRIRE À L'ÉCRAN : les engagements suivent la personne, années passées
 * comprises. Le total de l'ancienne assemblée baisse, celui de la nouvelle monte.
 *
 * <p>Ce qui bouge : `goalUnitId` ET `donationUnitId`. Ce qui ne bouge pas : les assemblées qu'on
 * DIRIGE (`goalUnitIds`) — déménager ne fait pas démissionner.
 *
 * <p>La carte porte AUSSI la création d'une assemblée (RG-BQ-12, JP 16/08) : « web et mobile »,
 * or sur le web la création vit dans /structure/unites, écran d'`AppShell` hors de portée d'un
 * MEMBRE. On l'offre donc ici, là où la personne cherche déjà son assemblée — une fois la ville
 * choisie, si la sienne n'est pas dans la liste, elle la crée et enchaîne sur le rattachement.
 */
function MyAssemblyCard() {
  const { t } = useTranslation();
  const { me, refreshMe } = useAuth();
  const { push } = useToast();
  const queryClient = useQueryClient();
  useContactSettings();
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState('');
  // Ville retenue à l'étape 3 du GeoPicker (remontée par `onCityChange`) : c'est elle qui
  // conditionne l'offre de création — on ne crée pas une assemblée « nulle part ».
  const [cityId, setCityId] = useState('');
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const ministryId = me?.ministryId ?? null;

  // Le GeoPicker ne fait aucun appel réseau : le référentiel est chargé ici, sur les mêmes
  // queryKey ['admin', …] que les autres écrans (cache partagé, pas de requête en double).
  const unitsQ = useQuery({ queryKey: ['admin', 'units'], queryFn: () => listUnits(), enabled: open });
  const citiesQ = useQuery({ queryKey: ['admin', 'localities'], queryFn: () => listLocalities(), enabled: open });
  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones(), enabled: open });
  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries, enabled: open });

  const changeM = useMutation({
    mutationFn: () => changeMyAssembly(unitId),
    onSuccess: async (res) => {
      // `goalUnitId` change : TOUT le cache Goals est périmé (mes engagements, les agrégats, les
      // compteurs 7/12 des deux assemblées concernées).
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      await refreshMe();
      setOpen(false);
      push({ kind: 'ok', title: t('settings.myAssemblyChanged', { name: res.unitName }) });
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: t('settings.myAssemblyRefused'),
        msg:
          errCode(err) === 'ASSEMBLY_MINISTRY_MISMATCH'
            ? t('settings.myAssemblyMinistryMismatch')
            : errMsg(err, t('settings.myAssemblyFailed')),
      }),
  });

  const cityName = citiesQ.data?.find((c) => c.id === cityId)?.name ?? '';

  /**
   * Création d'une assemblée depuis l'espace membre (RG-BQ-12) — POST /api/church/admin/units,
   * sans contrainte de rôle ni de géographie côté serveur.
   *
   * <p>On NE rafraîchit PAS `me` ici, volontairement : créer une assemblée fait passer un MEMBRE
   * à DIRIGEANT_UNITE (il en devient responsable), ce qui change de coquille — un `refreshMe`
   * immédiat démonterait `MemberShell` et la modale avec elle. Le rafraîchissement a lieu à
   * l'étape suivante, dans `changeM.onSuccess`, une fois la modale fermée.
   */
  const createM = useMutation({
    mutationFn: () =>
      createUnit({ ministryId: ministryId ?? '', localityId: cityId, name: newName.trim() }),
    onSuccess: async (unit) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'units'] });
      setCreatingOpen(false);
      setNewName('');
      // Pré-sélectionnée : « Changer d'assemblée » enchaîne directement sur le rattachement.
      setUnitId(unit.id);
      push({ kind: 'ok', title: t('settings.myAssemblyCreated', { name: unit.name }) });
    },
    onError: (err) => {
      // STRUCTURE_NAME_EXISTS : anti-doublon (même nom, même ville). On le dit nous-mêmes plutôt
      // que de relayer le message serveur — il faut que la ville concernée soit nommée.
      const code = errCode(err);
      push({
        kind: 'error',
        title:
          code === 'STRUCTURE_NAME_EXISTS'
            ? t('settings.myAssemblyNameExists')
            : t('settings.myAssemblyCreateRefused'),
        msg:
          code === 'STRUCTURE_NAME_EXISTS'
            ? t('settings.myAssemblyNameExistsHint', { city: cityName })
            : errMsg(err, t('settings.myAssemblyCreateFailed')),
      });
    },
  });

  // `assemblies` porte l'id et la ville (« Béthel » existe dans plusieurs villes) ; `unitNames`
  // reste le repli des comptes plus anciens.
  const current =
    me?.assemblies?.find((a) => a.id === me?.goalUnitId)
    ?? me?.assemblies?.[0]
    ?? null;
  const currentLabel = current
    ? [current.name, current.cityName].filter(Boolean).join(' · ')
    : me?.unitNames?.[0] ?? null;

  const units = unitsQ.data ?? [];
  const noUnitListed = open && !unitsQ.isLoading && units.length === 0;

  return (
    <>
      <h3 style={{ margin: '0 0 10px' }}>{t('settings.myAssembly')}</h3>
      <div className="card" style={{ padding: '18px 20px', marginBottom: 28, maxWidth: 560 }}>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', gap: 16,
            padding: '0 0 10px', fontSize: 14,
          }}
        >
          <span style={{ color: 'var(--ink-500)' }}>{t('settings.myAssemblyCurrent')}</span>
          <strong style={{ textAlign: 'right', wordBreak: 'break-word' }}>
            {currentLabel ?? t('settings.myAssemblyNone')}
          </strong>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-600)' }}>
          {t('settings.myAssemblyHint')}
        </p>
        <Button
          iconL={<Icon name="unit" size={15} />}
          onClick={() => {
            setUnitId('');
            setCityId('');
            setCreatingOpen(false);
            setNewName('');
            setOpen(true);
          }}
        >
          {t('settings.myAssemblyChange')}
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('settings.myAssemblyModalTitle')}
        sub={t('settings.myAssemblyModalSub')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={unitId === '' || changeM.isPending}
              onClick={() => changeM.mutate()}
            >
              {changeM.isPending ? t('common.saving') : t('settings.myAssemblyConfirm')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p
            style={{
              margin: 0, padding: '10px 14px', borderRadius: 10,
              background: 'var(--parchment-deep, #F2EDE2)', fontSize: 13.5,
              color: 'var(--ink-600)', lineHeight: 1.55,
            }}
          >
            {t('settings.myAssemblyWarning')}
          </p>
          <Field label={t('settings.myAssemblyPick')}>
            <GeoPicker
              level="unit"
              value={unitId}
              onChange={setUnitId}
              onCityChange={setCityId}
              units={units}
              cities={citiesQ.data ?? []}
              zones={zonesQ.data ?? []}
              countries={countriesQ.data ?? []}
            />
          </Field>

          {/* RG-BQ-12 — « cette assemblée n'existe pas ? créez-la ici ». Proposé dès qu'une ville
              est retenue : c'est le seul moment où la création a un lieu où se poser. */}
          {cityId !== '' && ministryId != null && (
            <div
              style={{
                border: '1px dashed var(--line)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {creatingOpen ? (
                <>
                  <Field
                    label={t('settings.myAssemblyNewName')}
                    hint={t('settings.myAssemblyCreateHint', { city: cityName })}
                  >
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('settings.myAssemblyNewNamePlaceholder')}
                      autoFocus
                    />
                  </Field>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={newName.trim() === '' || createM.isPending}
                      onClick={() => createM.mutate()}
                    >
                      {createM.isPending ? t('common.saving') : t('settings.myAssemblyCreateConfirm')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCreatingOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-600)' }}>
                    {t('settings.myAssemblyMissing', { city: cityName })}
                  </p>
                  <div>
                    <Button
                      size="sm"
                      iconL={<Icon name="plus" size={14} />}
                      onClick={() => { setNewName(''); setCreatingOpen(true); }}
                    >
                      {t('settings.myAssemblyCreate')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Repli : si le périmètre serveur ne renvoie aucune assemblée à ce compte, le sélecteur
              serait vide et muet — on renvoie explicitement vers le support. */}
          {noUnitListed && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
              {t('settings.myAssemblyNoneListed')}{' '}
              <a href={contactMailto(t('settings.myAssemblySupportSubject'))} style={{ color: 'var(--green-700, #1E3A2F)' }}>
                {t('settings.myAssemblyContactSupport')}
              </a>
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
