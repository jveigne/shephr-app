import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { flagEmoji, sortedDialCountries } from '../constants/dialCodes';
import { Picker } from './ui';

/**
 * Choix du pays pour l'indicatif (inscription, activation de compte).
 *
 * Le référentiel fait ~170 entrées : la liste native d'un `<select>` les rendait sur une
 * poignée de lignes minuscules, souvent tronquées. On passe par le `Picker` de la page —
 * lignes tactiles, nom entier, indicatif aligné à droite et recherche (sans accents, par
 * nom ou par indicatif).
 */
export function CountryDialPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'en' ? 'en' : 'fr';

  const options = useMemo(
    () =>
      sortedDialCountries(lang).map((c) => ({
        id: c.iso,
        label: `${flagEmoji(c.iso)}  ${lang === 'en' ? c.nameEn : c.name}`,
        meta: c.dial,
      })),
    [lang],
  );

  return (
    <Picker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={t('invitation.countryPlaceholder')}
      searchPlaceholder={t('invitation.countrySearch')}
    />
  );
}
