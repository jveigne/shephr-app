import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { listMySubscriptions } from '../services/billingApi';

/**
 * Lot ABO4 (§6.1 du plan du 23/10) — entrée « Mes abonnements » du menu utilisateur des deux shells,
 * affichée seulement si le compte a au moins un abonnement payant (D-ABO-07 : le payeur seul). Une
 * erreur (ancien backend) masque simplement le lien.
 */
export function MySubscriptionsLink() {
  const { t } = useTranslation();
  const subsQ = useQuery({ queryKey: ['billing', 'subscriptions'], queryFn: listMySubscriptions, retry: false });
  if ((subsQ.data ?? []).length === 0) return null;
  return (
    <div className="rl" style={{ marginTop: 4 }}>
      <Link to="/abonnements/mes-abonnements" style={{ color: 'inherit', textDecoration: 'underline' }}>
        {t('billing.menu')}
      </Link>
    </div>
  );
}
