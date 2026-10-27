import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Modal, Picker } from './ui';
import { Icon } from './Icon';
import { normalizeVoucherCode, redeemVoucher, type VoucherRedemption } from '../services/billingApi';
import { billingErrMsg } from '../pages/Billing';

// ---------------------------------------------------------------------------------------------
//  « J'ai un code » — saisie d'un code d'activation (voucher), plan 05 §3.6, D-OFF-08 (JP 27/10).
//  Afrique / Mobile Money : le relais encaisse, le SUPER_ADMIN génère des codes liés à un ministère,
//  le dirigeant saisit son code ICI — sur le web uniquement (jamais sur le mobile, D-OFF-11).
//  - Caleb (`DIRIGEANT_HIERARCHIE`, droit personnel) : aucun `localityId`.
//  - Néhémie (`EGLISE_VILLE`, droit de ville) : `localityId` requis — ville imposée (verrou d'une
//    ville) ou choisie parmi celles où le compte peut souscrire (page /offres).
//  - Reçu « très simple » = cet écran (offre, ville, date de fin) + un email texte envoyé par le
//    serveur ; aucune facture, aucun PDF.
//  Le SERVEUR décide de tout (ministère du code, droit de souscrire, abonnement Stripe déjà actif →
//  `SUBSCRIPTION_ALREADY_ACTIVE`, prolongation d'un VOUCHER / MANUEL) : rien n'est recalculé ici.
// ---------------------------------------------------------------------------------------------

export type VoucherPlanKind = 'caleb' | 'nehemie';

export interface VoucherCity {
  localityId: string;
  localityName: string;
}

/** « 12 décembre 2026 » depuis une date `AAAA-MM-JJ` (date locale, pas d'UTC — la fin est incluse). */
function fmtLocalDay(iso: string | null | undefined, lang: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Affichage `XXXX-XXXX-XXXX` pendant la saisie (§3.6) ; la forme envoyée reste sans tiret. */
function formatVoucherInput(raw: string): string {
  const clean = normalizeVoucherCode(raw).slice(0, 12);
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}

/** Ligne « Mobile Money auprès de votre relais — {prix local} » (D-OFF-08), réutilisée par les verrous. */
export function LocalPriceLine({ label, style }: { label: string | null | undefined; style?: CSSProperties }) {
  const { t } = useTranslation();
  return (
    <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 12.5, lineHeight: 1.5, ...style }}>
      {label ? t('offers.voucher.localPrice', { price: label }) : t('offers.voucher.localPriceNoLabel')}
    </p>
  );
}

/**
 * Message d'erreur de la saisie : codes `billing.errors.*` (dont `VOUCHER_*`), sauf
 * `SUBSCRIPTION_ALREADY_ACTIVE` qui, ici, veut dire « vous payez déjà par carte : aucun code n'est
 * nécessaire » (D-OFF-08).
 */
function voucherErrMsg(err: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (code === 'SUBSCRIPTION_ALREADY_ACTIVE') return t('offers.voucher.alreadyPaid');
  return billingErrMsg(err, t);
}

export function VoucherRedeemModal({
  open,
  onClose,
  plan,
  cities = [],
  localPriceLabel,
}: {
  open: boolean;
  onClose: () => void;
  plan: VoucherPlanKind;
  /**
   * Néhémie : villes où le compte peut souscrire (`canSubscribe` du serveur). Une seule = imposée,
   * plusieurs = sélecteur. Ignoré pour Caleb.
   */
  cities?: VoucherCity[];
  localPriceLabel?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [cityId, setCityId] = useState('');
  const [receipt, setReceipt] = useState<VoucherRedemption | null>(null);

  const needsCity = plan === 'nehemie';
  const singleCity = needsCity && cities.length === 1 ? cities[0] : null;
  const chosenCity = singleCity?.localityId ?? cityId;
  const normalized = normalizeVoucherCode(code);

  // Réouverture : formulaire vierge (un reçu précédent ne doit pas réapparaître).
  useEffect(() => {
    if (open) {
      setCode('');
      setCityId('');
      setReceipt(null);
    }
  }, [open]);

  const redeemM = useMutation({
    mutationFn: () => redeemVoucher({ code: normalized, localityId: needsCity ? chosenCity : null }),
    onSuccess: (res) => {
      setReceipt(res);
      // Le droit vient d'être ouvert (ou prolongé) PAR LE SERVEUR : on relit tout ce qui l'affiche.
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
      void qc.invalidateQueries({ queryKey: ['assembly', 'study', 'localities'] });
      void qc.invalidateQueries({ queryKey: ['assembly', 'localities'] });
      void qc.invalidateQueries({ queryKey: ['billing', 'subscriptions'] });
      void qc.invalidateQueries({ queryKey: ['accessible-modules'] });
    },
  });

  const title = t(plan === 'caleb' ? 'offers.voucher.titleCaleb' : 'offers.voucher.titleNehemie');

  if (receipt) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t('offers.voucher.receiptTitle')}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ok-bg)', color: 'var(--ok)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="check" size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 18, color: 'var(--green-800)' }}>
              {receipt.localityName ? `${receipt.offerName} — ${receipt.localityName}` : receipt.offerName}
            </strong>
            <span style={{ color: 'var(--ink-700)', fontSize: 14 }}>
              {t('offers.voucher.receiptUntil', { date: fmtLocalDay(receipt.endDate, i18n.language) })}
            </span>
            <span style={{ color: 'var(--ink-500)', fontSize: 13, lineHeight: 1.5 }}>{t('offers.voucher.receiptNote')}</span>
          </div>
        </div>
      </Modal>
    );
  }

  const canSend = normalized.length > 0 && (!needsCity || !!chosenCity) && !redeemM.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      sub={t('offers.voucher.sub')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="voucher-redeem-form" disabled={!canSend}>
            {redeemM.isPending ? t('offers.voucher.checking') : t('offers.voucher.submit')}
          </Button>
        </>
      }
    >
      <form
        id="voucher-redeem-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) redeemM.mutate();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {needsCity &&
          (singleCity ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-700)' }}>
              {t('offers.voucher.forCity', { city: singleCity.localityName })}
            </p>
          ) : cities.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-600)' }}>{t('offers.voucher.noCity')}</p>
          ) : (
            <Field label={t('offers.voucher.city')} style={{ margin: 0 }}>
              <Picker
                value={cityId}
                onChange={setCityId}
                options={cities.map((c) => ({ id: c.localityId, label: c.localityName }))}
                placeholder={t('offers.voucher.cityPlaceholder')}
              />
            </Field>
          ))}
        <Field label={t('offers.voucher.code')} hint={t('offers.voucher.codeHint')} style={{ margin: 0 }}>
          <Input
            value={code}
            onChange={(e) => {
              setCode(formatVoucherInput(e.target.value));
              redeemM.reset();
            }}
            placeholder="XXXX-XXXX-XXXX"
            icon={<Icon name="tag" size={15} />}
            autoComplete="off"
            autoFocus
            spellCheck={false}
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}
          />
        </Field>
        <LocalPriceLine label={localPriceLabel} />
        {redeemM.isError && (
          <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: 13.5 }}>
            {voucherErrMsg(redeemM.error, t)}
          </p>
        )}
      </form>
    </Modal>
  );
}
