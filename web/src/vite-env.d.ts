/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Contrat Documents §7.3 (P1) — domaine des liens universels `/d/{slug}` ; absent → origine courante. */
  readonly VITE_SHARE_BASE_URL?: string;
  /** D-PAY-06 (JP 28/10) — client ID Google « Web » (REMPLACER_… tant que non fourni) ; absent → bouton masqué. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  /** D-PAY-06 — Services ID Apple (REMPLACER_…) ; avec VITE_APPLE_REDIRECT_URI, sinon bouton masqué. */
  readonly VITE_APPLE_SERVICES_ID?: string;
  /** D-PAY-06 — Return URL déclarée chez Apple (= APPLE_WEB_REDIRECT_URI du backend). */
  readonly VITE_APPLE_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
