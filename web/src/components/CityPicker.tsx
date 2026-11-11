import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Picker, type PickerOption } from './ui';
import { listMyCities } from '../services/countriesApi';

/** Valeur interne de « Je ne sais pas / plus tard » (= aucune ville). */
export const NO_CITY = '__none';

/**
 * RG-PAYS-20 / RG-PAYS-21 (JP 11/11) — ville d'un compte sans assemblée, parmi les villes ACTIVES de son pays
 * (`GET /me/cities`, triées par nom, 500 max). Facultative : `NO_CITY` = « Je ne sais pas / plus tard ».
 */
export function CityPicker({
  countryIso,
  value,
  onChange,
  disabled,
}: {
  countryIso: string | null;
  value: string;
  onChange: (cityId: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['me-cities', countryIso],
    queryFn: () => listMyCities(countryIso ? { countryIso } : {}),
    enabled: !!countryIso,
    staleTime: 600_000,
  });
  const options: PickerOption[] = [
    { id: NO_CITY, label: t('settings.city.none') },
    ...(q.data ?? []).map((c) => ({ id: c.id, label: c.name, sub: c.regionName ?? undefined })),
  ];
  return (
    <Picker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={!countryIso ? t('settings.city.chooseCountryFirst') : q.isLoading ? t('common.loading') : t('settings.city.placeholder')}
      disabled={disabled || !countryIso}
      searchPlaceholder={t('settings.city.search')}
      searchFrom={6}
    />
  );
}
