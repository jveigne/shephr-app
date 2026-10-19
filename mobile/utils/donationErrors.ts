/**
 * Lot T7 (décision J-1, JP 14/09) — refus métier de la déclaration, traduits.
 *
 * Le backend porte le CODE dans `response.data.error` et un message technique dans
 * `response.data.message`. On préfère la traduction quand le code est connu, et on retombe sur le
 * message serveur sinon — jamais sur un générique muet, qui laisserait la personne sans recours.
 */
const KNOWN_CODES = [
  'DECLARATION_VERIFIED',
  'DECLARED_TOTAL_MISMATCH',
  'DECLARATION_SINGLE_CURRENCY',
  'INVALID_DECLARATION',
  'INVALID_CURRENCY',
  'USER_NO_UNIT',
];

export function declarationErrorMessage(
  e: any,
  t: (key: string, options?: any) => string,
  fallback: string,
): string {
  const code = e?.response?.data?.error;
  if (code && KNOWN_CODES.includes(code)) return t(`errors.donations.${code}`);
  return e?.response?.data?.message ?? fallback;
}
