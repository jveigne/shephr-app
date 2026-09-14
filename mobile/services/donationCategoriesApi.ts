import { apiClient } from './apiClient';

/**
 * Lot T5 (JP 14/09) — référentiel des RUBRIQUES DE DON, servi par le ministère.
 *
 * Décision D0-5 : **une liste par ministère**, valable dans toutes ses assemblées. Le mobile ne
 * passe donc aucun `ministryId` : le serveur répond toujours la liste du ministère de l'appelant
 * (un id deviné est refusé — §5.8 de docs/donations-recette.md).
 *
 * Lecture ouverte à tout membre du ministère ; l'écriture est réservée au SECRETARIAT et se fait
 * au back-office — l'app mobile ne crée jamais de rubrique.
 */

/** Mirrors com.excellence.back.donation.category.dto.DonationCategoryResponse */
export interface DonationCategoryResponse {
  id: string;
  ministryId: string;
  /** Clé stable et immuable : c'est ce que porte `Donation.category`. */
  code: string;
  /** Libellé français. */
  name: string;
  /** Libellé anglais ; `null` → retomber sur `name`. */
  nameEn: string | null;
  active: boolean;
  displayOrder: number;
  inUse: boolean;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Rubriques ACTIVES du ministère, déjà triées par le serveur (`displayOrder`, puis libellé).
 * Les rubriques désactivées ne sont pas demandées : elles ne doivent plus être proposées à la
 * saisie, alors que les dons déjà déclarés dessus restent affichés (§5.5-5.6 de la recette).
 */
export async function listDonationCategories(): Promise<DonationCategoryResponse[]> {
  const { data } = await apiClient.get<DonationCategoryResponse[]>(
    '/api/church/donations/categories',
  );
  return data;
}
