const MONTH_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const MONTH_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const CUR_SYMBOL: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };

export const currencySymbol = (c: string) => CUR_SYMBOL[c] ?? c;

export const fmtAmount = (n: number, currency = 'GBP'): string => {
  const grouped = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${currencySymbol(currency)} ${grouped}`;
};

export const fmtAmountShort = (n: number, currency = 'GBP'): string => {
  const grouped = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  return `${currencySymbol(currency)} ${grouped}`;
};

export const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const fmtDateShort = (s: string): string => {
  const d = parseLocalDate(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const fmtDateLong = (s: string): string => {
  const d = parseLocalDate(s);
  return `${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
};

export const fmtDateLabel = (s: string): string => {
  const d = parseLocalDate(s);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]}`;
};

export const monthLong = (m: number) => MONTH_LONG[m];
export const monthShort = (m: number) => MONTH_SHORT[m];

export const todayISO = () => toLocalDate(new Date());

export const startOfMonthISO = (): string => {
  const d = new Date();
  return toLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const startOfYearISO = (): string => {
  const d = new Date();
  return toLocalDate(new Date(d.getFullYear(), 0, 1));
};
