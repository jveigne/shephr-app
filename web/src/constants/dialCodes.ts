/**
 * Référentiel pays → indicatif téléphonique (A1 — activation de compte, décision JP 23/07 :
 * l'utilisateur choisit son PAYS, l'app stocke le vrai indicatif dans `country_code`).
 * Statique et embarqué (pas d'appel réseau). Drapeau dérivé du code ISO (emoji régional).
 */
export interface DialCountry {
  /** Code ISO 3166-1 alpha-2. */
  iso: string;
  /** Nom français (langue par défaut de l'app). */
  name: string;
  nameEn: string;
  /** Indicatif E.164, préfixé « + ». */
  dial: string;
}

/** Drapeau emoji à partir du code ISO (symboles indicateurs régionaux). */
export function flagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export const DIAL_COUNTRIES: DialCountry[] = [
  // --- Afrique (complète) ---
  { iso: 'DZ', name: 'Algérie', nameEn: 'Algeria', dial: '+213' },
  { iso: 'AO', name: 'Angola', nameEn: 'Angola', dial: '+244' },
  { iso: 'BJ', name: 'Bénin', nameEn: 'Benin', dial: '+229' },
  { iso: 'BW', name: 'Botswana', nameEn: 'Botswana', dial: '+267' },
  { iso: 'BF', name: 'Burkina Faso', nameEn: 'Burkina Faso', dial: '+226' },
  { iso: 'BI', name: 'Burundi', nameEn: 'Burundi', dial: '+257' },
  { iso: 'CM', name: 'Cameroun', nameEn: 'Cameroon', dial: '+237' },
  { iso: 'CV', name: 'Cap-Vert', nameEn: 'Cape Verde', dial: '+238' },
  { iso: 'CF', name: 'République centrafricaine', nameEn: 'Central African Republic', dial: '+236' },
  { iso: 'KM', name: 'Comores', nameEn: 'Comoros', dial: '+269' },
  { iso: 'CG', name: 'Congo-Brazzaville', nameEn: 'Congo', dial: '+242' },
  { iso: 'CD', name: 'RD Congo', nameEn: 'DR Congo', dial: '+243' },
  { iso: 'CI', name: "Côte d'Ivoire", nameEn: 'Ivory Coast', dial: '+225' },
  { iso: 'DJ', name: 'Djibouti', nameEn: 'Djibouti', dial: '+253' },
  { iso: 'EG', name: 'Égypte', nameEn: 'Egypt', dial: '+20' },
  { iso: 'ER', name: 'Érythrée', nameEn: 'Eritrea', dial: '+291' },
  { iso: 'SZ', name: 'Eswatini', nameEn: 'Eswatini', dial: '+268' },
  { iso: 'ET', name: 'Éthiopie', nameEn: 'Ethiopia', dial: '+251' },
  { iso: 'GA', name: 'Gabon', nameEn: 'Gabon', dial: '+241' },
  { iso: 'GM', name: 'Gambie', nameEn: 'Gambia', dial: '+220' },
  { iso: 'GH', name: 'Ghana', nameEn: 'Ghana', dial: '+233' },
  { iso: 'GN', name: 'Guinée', nameEn: 'Guinea', dial: '+224' },
  { iso: 'GW', name: 'Guinée-Bissau', nameEn: 'Guinea-Bissau', dial: '+245' },
  { iso: 'GQ', name: 'Guinée équatoriale', nameEn: 'Equatorial Guinea', dial: '+240' },
  { iso: 'KE', name: 'Kenya', nameEn: 'Kenya', dial: '+254' },
  { iso: 'LS', name: 'Lesotho', nameEn: 'Lesotho', dial: '+266' },
  { iso: 'LR', name: 'Liberia', nameEn: 'Liberia', dial: '+231' },
  { iso: 'LY', name: 'Libye', nameEn: 'Libya', dial: '+218' },
  { iso: 'MG', name: 'Madagascar', nameEn: 'Madagascar', dial: '+261' },
  { iso: 'MW', name: 'Malawi', nameEn: 'Malawi', dial: '+265' },
  { iso: 'ML', name: 'Mali', nameEn: 'Mali', dial: '+223' },
  { iso: 'MA', name: 'Maroc', nameEn: 'Morocco', dial: '+212' },
  { iso: 'MU', name: 'Maurice', nameEn: 'Mauritius', dial: '+230' },
  { iso: 'MR', name: 'Mauritanie', nameEn: 'Mauritania', dial: '+222' },
  { iso: 'MZ', name: 'Mozambique', nameEn: 'Mozambique', dial: '+258' },
  { iso: 'NA', name: 'Namibie', nameEn: 'Namibia', dial: '+264' },
  { iso: 'NE', name: 'Niger', nameEn: 'Niger', dial: '+227' },
  { iso: 'NG', name: 'Nigeria', nameEn: 'Nigeria', dial: '+234' },
  { iso: 'RW', name: 'Rwanda', nameEn: 'Rwanda', dial: '+250' },
  { iso: 'ST', name: 'Sao Tomé-et-Principe', nameEn: 'Sao Tome and Principe', dial: '+239' },
  { iso: 'SN', name: 'Sénégal', nameEn: 'Senegal', dial: '+221' },
  { iso: 'SC', name: 'Seychelles', nameEn: 'Seychelles', dial: '+248' },
  { iso: 'SL', name: 'Sierra Leone', nameEn: 'Sierra Leone', dial: '+232' },
  { iso: 'SO', name: 'Somalie', nameEn: 'Somalia', dial: '+252' },
  { iso: 'ZA', name: 'Afrique du Sud', nameEn: 'South Africa', dial: '+27' },
  { iso: 'SS', name: 'Soudan du Sud', nameEn: 'South Sudan', dial: '+211' },
  { iso: 'SD', name: 'Soudan', nameEn: 'Sudan', dial: '+249' },
  { iso: 'TZ', name: 'Tanzanie', nameEn: 'Tanzania', dial: '+255' },
  { iso: 'TD', name: 'Tchad', nameEn: 'Chad', dial: '+235' },
  { iso: 'TG', name: 'Togo', nameEn: 'Togo', dial: '+228' },
  { iso: 'TN', name: 'Tunisie', nameEn: 'Tunisia', dial: '+216' },
  { iso: 'UG', name: 'Ouganda', nameEn: 'Uganda', dial: '+256' },
  { iso: 'ZM', name: 'Zambie', nameEn: 'Zambia', dial: '+260' },
  { iso: 'ZW', name: 'Zimbabwe', nameEn: 'Zimbabwe', dial: '+263' },
  // --- Europe ---
  { iso: 'DE', name: 'Allemagne', nameEn: 'Germany', dial: '+49' },
  { iso: 'AT', name: 'Autriche', nameEn: 'Austria', dial: '+43' },
  { iso: 'BE', name: 'Belgique', nameEn: 'Belgium', dial: '+32' },
  { iso: 'BG', name: 'Bulgarie', nameEn: 'Bulgaria', dial: '+359' },
  { iso: 'CY', name: 'Chypre', nameEn: 'Cyprus', dial: '+357' },
  { iso: 'HR', name: 'Croatie', nameEn: 'Croatia', dial: '+385' },
  { iso: 'DK', name: 'Danemark', nameEn: 'Denmark', dial: '+45' },
  { iso: 'ES', name: 'Espagne', nameEn: 'Spain', dial: '+34' },
  { iso: 'EE', name: 'Estonie', nameEn: 'Estonia', dial: '+372' },
  { iso: 'FI', name: 'Finlande', nameEn: 'Finland', dial: '+358' },
  { iso: 'FR', name: 'France', nameEn: 'France', dial: '+33' },
  { iso: 'GR', name: 'Grèce', nameEn: 'Greece', dial: '+30' },
  { iso: 'HU', name: 'Hongrie', nameEn: 'Hungary', dial: '+36' },
  { iso: 'IE', name: 'Irlande', nameEn: 'Ireland', dial: '+353' },
  { iso: 'IS', name: 'Islande', nameEn: 'Iceland', dial: '+354' },
  { iso: 'IT', name: 'Italie', nameEn: 'Italy', dial: '+39' },
  { iso: 'LV', name: 'Lettonie', nameEn: 'Latvia', dial: '+371' },
  { iso: 'LT', name: 'Lituanie', nameEn: 'Lithuania', dial: '+370' },
  { iso: 'LU', name: 'Luxembourg', nameEn: 'Luxembourg', dial: '+352' },
  { iso: 'MT', name: 'Malte', nameEn: 'Malta', dial: '+356' },
  { iso: 'MD', name: 'Moldavie', nameEn: 'Moldova', dial: '+373' },
  { iso: 'MC', name: 'Monaco', nameEn: 'Monaco', dial: '+377' },
  { iso: 'NO', name: 'Norvège', nameEn: 'Norway', dial: '+47' },
  { iso: 'NL', name: 'Pays-Bas', nameEn: 'Netherlands', dial: '+31' },
  { iso: 'PL', name: 'Pologne', nameEn: 'Poland', dial: '+48' },
  { iso: 'PT', name: 'Portugal', nameEn: 'Portugal', dial: '+351' },
  { iso: 'CZ', name: 'République tchèque', nameEn: 'Czechia', dial: '+420' },
  { iso: 'RO', name: 'Roumanie', nameEn: 'Romania', dial: '+40' },
  { iso: 'GB', name: 'Royaume-Uni', nameEn: 'United Kingdom', dial: '+44' },
  { iso: 'RS', name: 'Serbie', nameEn: 'Serbia', dial: '+381' },
  { iso: 'SK', name: 'Slovaquie', nameEn: 'Slovakia', dial: '+421' },
  { iso: 'SI', name: 'Slovénie', nameEn: 'Slovenia', dial: '+386' },
  { iso: 'SE', name: 'Suède', nameEn: 'Sweden', dial: '+46' },
  { iso: 'CH', name: 'Suisse', nameEn: 'Switzerland', dial: '+41' },
  { iso: 'UA', name: 'Ukraine', nameEn: 'Ukraine', dial: '+380' },
  // --- Amériques ---
  { iso: 'AR', name: 'Argentine', nameEn: 'Argentina', dial: '+54' },
  { iso: 'BO', name: 'Bolivie', nameEn: 'Bolivia', dial: '+591' },
  { iso: 'BR', name: 'Brésil', nameEn: 'Brazil', dial: '+55' },
  { iso: 'CA', name: 'Canada', nameEn: 'Canada', dial: '+1' },
  { iso: 'CL', name: 'Chili', nameEn: 'Chile', dial: '+56' },
  { iso: 'CO', name: 'Colombie', nameEn: 'Colombia', dial: '+57' },
  { iso: 'CR', name: 'Costa Rica', nameEn: 'Costa Rica', dial: '+506' },
  { iso: 'CU', name: 'Cuba', nameEn: 'Cuba', dial: '+53' },
  { iso: 'DO', name: 'République dominicaine', nameEn: 'Dominican Republic', dial: '+1' },
  { iso: 'EC', name: 'Équateur', nameEn: 'Ecuador', dial: '+593' },
  { iso: 'US', name: 'États-Unis', nameEn: 'United States', dial: '+1' },
  { iso: 'GT', name: 'Guatemala', nameEn: 'Guatemala', dial: '+502' },
  { iso: 'HT', name: 'Haïti', nameEn: 'Haiti', dial: '+509' },
  { iso: 'HN', name: 'Honduras', nameEn: 'Honduras', dial: '+504' },
  { iso: 'JM', name: 'Jamaïque', nameEn: 'Jamaica', dial: '+1' },
  { iso: 'MX', name: 'Mexique', nameEn: 'Mexico', dial: '+52' },
  { iso: 'NI', name: 'Nicaragua', nameEn: 'Nicaragua', dial: '+505' },
  { iso: 'PA', name: 'Panama', nameEn: 'Panama', dial: '+507' },
  { iso: 'PY', name: 'Paraguay', nameEn: 'Paraguay', dial: '+595' },
  { iso: 'PE', name: 'Pérou', nameEn: 'Peru', dial: '+51' },
  { iso: 'SV', name: 'Salvador', nameEn: 'El Salvador', dial: '+503' },
  { iso: 'UY', name: 'Uruguay', nameEn: 'Uruguay', dial: '+598' },
  { iso: 'VE', name: 'Venezuela', nameEn: 'Venezuela', dial: '+58' },
  // --- Asie & Moyen-Orient ---
  { iso: 'SA', name: 'Arabie saoudite', nameEn: 'Saudi Arabia', dial: '+966' },
  { iso: 'BD', name: 'Bangladesh', nameEn: 'Bangladesh', dial: '+880' },
  { iso: 'CN', name: 'Chine', nameEn: 'China', dial: '+86' },
  { iso: 'KR', name: 'Corée du Sud', nameEn: 'South Korea', dial: '+82' },
  { iso: 'AE', name: 'Émirats arabes unis', nameEn: 'United Arab Emirates', dial: '+971' },
  { iso: 'IN', name: 'Inde', nameEn: 'India', dial: '+91' },
  { iso: 'ID', name: 'Indonésie', nameEn: 'Indonesia', dial: '+62' },
  { iso: 'IL', name: 'Israël', nameEn: 'Israel', dial: '+972' },
  { iso: 'JP', name: 'Japon', nameEn: 'Japan', dial: '+81' },
  { iso: 'JO', name: 'Jordanie', nameEn: 'Jordan', dial: '+962' },
  { iso: 'LB', name: 'Liban', nameEn: 'Lebanon', dial: '+961' },
  { iso: 'MY', name: 'Malaisie', nameEn: 'Malaysia', dial: '+60' },
  { iso: 'NP', name: 'Népal', nameEn: 'Nepal', dial: '+977' },
  { iso: 'PK', name: 'Pakistan', nameEn: 'Pakistan', dial: '+92' },
  { iso: 'PH', name: 'Philippines', nameEn: 'Philippines', dial: '+63' },
  { iso: 'QA', name: 'Qatar', nameEn: 'Qatar', dial: '+974' },
  { iso: 'SG', name: 'Singapour', nameEn: 'Singapore', dial: '+65' },
  { iso: 'LK', name: 'Sri Lanka', nameEn: 'Sri Lanka', dial: '+94' },
  { iso: 'TH', name: 'Thaïlande', nameEn: 'Thailand', dial: '+66' },
  { iso: 'TR', name: 'Turquie', nameEn: 'Turkey', dial: '+90' },
  { iso: 'VN', name: 'Vietnam', nameEn: 'Vietnam', dial: '+84' },
  // --- Océanie ---
  { iso: 'AU', name: 'Australie', nameEn: 'Australia', dial: '+61' },
  { iso: 'FJ', name: 'Fidji', nameEn: 'Fiji', dial: '+679' },
  { iso: 'NZ', name: 'Nouvelle-Zélande', nameEn: 'New Zealand', dial: '+64' },
  { iso: 'PG', name: 'Papouasie-Nouvelle-Guinée', nameEn: 'Papua New Guinea', dial: '+675' },
];

/** Liste triée pour l'affichage (par nom, selon la langue). */
export function sortedDialCountries(lang: 'fr' | 'en'): DialCountry[] {
  const key = lang === 'en' ? 'nameEn' : 'name';
  return [...DIAL_COUNTRIES].sort((a, b) => a[key].localeCompare(b[key]));
}
