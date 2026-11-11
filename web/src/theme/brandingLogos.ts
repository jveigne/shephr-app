/**
 * D-PAYS-03 (JP 11/11) — logos INTÉGRÉS au web, un par code pays (imports Vite), jamais téléversés : un nouveau logo
 * demande un déploiement web. Sans logo pour un pays actif : logo Shephr, couleurs du pays (recette 8).
 * FR = logo CMCI provisoire (`logo-cmci-provisoire.jpg`, JPEG fond blanc converti en PNG 256 px avec `sips`), posé
 * dans une pastille blanche ronde par `components/BrandLogo.tsx` (spec §4.6).
 */
import FR from '../assets/branding/FR.png';

export const BRANDING_LOGOS: Partial<Record<string, string>> = { FR };
