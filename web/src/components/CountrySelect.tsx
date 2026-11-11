import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Picker, type PickerOption } from './ui';
import { countryLabel, listPublicCountries, type PublicCountry } from '../services/countriesApi';

/** Valeur interne du choix « Autre pays » (= aucun pays : Shephr standard). */
export const OTHER_COUNTRY = '__other';

/** Liste publique des pays (CMCI, configurés en tête) — partagée par les sélecteurs. */
export function usePublicCountries() {
  return useQuery({ queryKey: ['public-countries'], queryFn: listPublicCountries, staleTime: 3_600_000, retry: 1 });
}

/**
 * RG-PAYS-01 (JP 11/11) — pays proposé sur le web = région de la langue du navigateur (`fr-FR` → `FR`), jamais de
 * géolocalisation. Renvoie le code s'il figure dans la liste, sinon null.
 */
export function suggestedCountry(list: PublicCountry[]): string | null {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const region = l?.split('-')[1];
      if (region && /^[A-Za-z]{2}$/.test(region)) {
        const iso = region.toUpperCase();
        if (list.some((c) => c.code.toUpperCase() === iso)) return iso;
      }
    }
  } catch {
    /* navigator indisponible */
  }
  return null;
}

/**
 * §5.5 (JP 11/11) — sélecteur de pays du web (`/signup`, `/join`, réglages). `value` = ISO, `''` = rien choisi,
 * `OTHER_COUNTRY` = « Autre pays » (seulement si `allowOther`). Le grisé (RG-PAYS-06) est décidé par l'appelant
 * (`disabled` + message `settings.country.lockedByAssembly`).
 */
export function CountrySelect({
  value,
  onChange,
  disabled,
  allowOther = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  allowOther?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const q = usePublicCountries();
  const options: PickerOption[] = (q.data ?? []).map((c) => ({ id: c.code.toUpperCase(), label: countryLabel(c, i18n.language) }));
  // Pays du compte absent de la liste (inactif) : on le garde affiché plutôt qu'un champ vide.
  if (value && value !== OTHER_COUNTRY && !options.some((o) => o.id === value)) options.unshift({ id: value, label: value });
  if (allowOther) options.push({ id: OTHER_COUNTRY, label: t('country.other') });
  return (
    <Picker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={q.isError ? t('country.unavailable') : q.isLoading ? t('common.loading') : t('country.placeholder')}
      disabled={disabled || (q.isLoading && !value)}
      searchPlaceholder={t('country.search')}
    />
  );
}
