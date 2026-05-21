const SYMBOLS: Record<string, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
};

export const currencySymbol = (currency: string): string =>
  SYMBOLS[currency] ?? currency;

export const fmtAmount = (n: number, currency = 'GBP'): string => {
  const v = Math.abs(n);
  const grouped = v
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−' : '') + currencySymbol(currency) + grouped;
};

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTH_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const fmtDate = (d: Date): string =>
  `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;

export const fmtDateLong = (d: Date): string =>
  `${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;

export const monthLabel = (monthIndex: number, long = false): string =>
  long ? MONTH_LONG[monthIndex] : MONTH_SHORT[monthIndex];

export const toLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
