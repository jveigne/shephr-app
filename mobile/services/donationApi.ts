import { apiClient } from './apiClient';

/**
 * Lot T6/T7 (décision J-1, JP 14/09) — DEUX statuts, pas davantage.
 *
 * Il n'existe volontairement ni « écart » ni « rejeté » : quand le montant ne correspond pas à ce
 * que le trésorier constate, il NE VALIDE PAS — la déclaration reste `DECLARE` et le membre la
 * corrige lui-même. Ne pas enrichir ce type sans décision explicite.
 *
 * Mirrors com.excellence.back.donation.declaration.DeclarationStatus
 */
export type DeclarationStatus = 'DECLARE' | 'VERIFIE';

/** Mirrors com.excellence.back.donation.donation.dto.DonationResponse */
export interface DonationResponse {
  id: string;
  userId: string;
  userFullName: string;
  unitId: string | null;
  unitName: string | null;
  amount: number;
  currency: string;
  category: string;
  /**
   * Lot T5 — id de la rubrique du référentiel, `null` si le code déclaré n'y correspond pas
   * (historique). L'affichage se fait sur `category` : cet id ne sert qu'au rapprochement.
   */
  categoryId: string | null;
  donationDate: string;
  note: string | null;
  /**
   * Lot T6 — l'ACTE qui a produit cette ligne comptable : c'est par lui qu'on remonte à la
   * ventilation et au statut (`GET /api/church/declarations/{id}`). `null` pour un don orphelin
   * (seed, import), alors réputé DÉCLARÉ. Le statut n'est pas recopié ici, par choix serveur.
   */
  declarationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface ListDonationsParams {
  from?: string;
  to?: string;
  category?: string;
  unitId?: string;
  userId?: string;
  /** Lot T6 — filtre par statut de la déclaration d'origine ; omis, la vue rend l'existant. */
  status?: DeclarationStatus;
  page?: number;
  size?: number;
}

export async function listDonations(
  params: ListDonationsParams = {},
): Promise<PageResponse<DonationResponse>> {
  const { data } = await apiClient.get<PageResponse<DonationResponse>>(
    '/api/church/donations',
    { params },
  );
  return data;
}

export async function getDonation(id: string): Promise<DonationResponse> {
  const { data } = await apiClient.get<DonationResponse>(
    `/api/church/donations/${id}`,
  );
  return data;
}

/*
 * Lot T7 (J-1, 14/09) — LA DÉCLARATION EST DÉSORMAIS LE SEUL GESTE D'ÉCRITURE DU MEMBRE.
 *
 * `createDonation` / `updateDonation` / `deleteDonation` ont été RETIRÉS : le membre ne saisit
 * plus un don isolé mais un versement (une date, une devise, N rubriques), et le corrige tant
 * qu'il n'est pas vérifié. `don_donation` reste la ligne comptable, produite par le serveur à
 * partir des lignes de déclaration — d'où les deux lectures conservées ci-dessus, qui alimentent
 * encore l'accueil et les vues de trésorerie.
 *
 * L'ancien `POST /api/church/donations` existe toujours côté backend (il produit lui-même une
 * déclaration mono-ligne) ; il n'a simplement plus d'appelant mobile.
 */

// ---------------------------------------------------------------- déclarations (lot T6/T7)

/** Mirrors com.excellence.back.donation.declaration.dto.DeclarationLineResponse */
export interface DeclarationLineResponse {
  id: string;
  /** Rubrique du référentiel, ou `null` si le code déclaré n'y correspond plus. */
  categoryId: string | null;
  /** Code de la rubrique, tel que déclaré. C'est lui que les clients affichent. */
  category: string;
  amount: number;
  note: string | null;
  /** Id de la LIGNE COMPTABLE (`don_donation`) produite par cette ligne. */
  donationId: string;
}

/** Mirrors com.excellence.back.donation.declaration.dto.DeclarationResponse */
export interface DeclarationResponse {
  id: string;
  userId: string;
  userFullName: string;
  unitId: string | null;
  unitName: string | null;
  donationDate: string;
  declaredTotal: number;
  currency: string;
  status: DeclarationStatus;
  verifiedById: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  /** Le validateur EST le donateur — exposé en clair, jamais déduit en comparant deux ids. */
  selfVerified: boolean;
  /**
   * Server-driven, comme `editable` côté Goals : vrai tant que le statut est `DECLARE`. Le client
   * grise ses boutons d'après ce champ — **il ne rejoue pas la règle**, et surtout il ne calcule
   * plus aucune fenêtre de 24 h (supprimée au lot T6).
   */
  editable: boolean;
  lines: DeclarationLineResponse[];
  createdAt: string;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.donation.declaration.dto.DeclarationLineRequest */
export interface DeclarationLineRequest {
  /** Renseigné en MODIFICATION pour actualiser une ligne existante ; absent, la ligne est créée. */
  id?: string;
  categoryId?: string;
  /** Code de rubrique, accepté en repli de `categoryId` et conservé tel quel. */
  category?: string;
  amount: number;
  note?: string;
}

/** Mirrors com.excellence.back.donation.declaration.dto.DeclarationCreateRequest */
export interface DeclarationCreateRequest {
  donationDate: string;
  /** Une seule devise pour toute la déclaration (J-1) : elle est portée ici, pas par la ligne. */
  currency: string;
  /** Doit égaler la somme des lignes — 422 `DECLARED_TOTAL_MISMATCH` sinon. */
  declaredTotal: number;
  lines: DeclarationLineRequest[];
}

/**
 * Mirrors com.excellence.back.donation.declaration.dto.DeclarationUpdateRequest
 *
 * `lines` décrit la ventilation COMPLÈTE : une ligne existante absente du corps est supprimée.
 */
export interface DeclarationUpdateRequest {
  donationDate?: string;
  currency?: string;
  declaredTotal?: number;
  lines?: DeclarationLineRequest[];
}

export interface ListDeclarationsParams {
  /**
   * `true` restreint aux déclarations de l'appelant **même s'il est trésorier** — c'est ce que
   * demande l'écran « Mes déclarations », sinon un trésorier y verrait tout son périmètre.
   */
  mine?: boolean;
  status?: DeclarationStatus;
  from?: string;
  to?: string;
  unitId?: string;
  page?: number;
  size?: number;
  /**
   * Lot T8 — format Spring (`donationDate,asc`). La file « À vérifier » du trésorier se prend par
   * le plus ANCIEN : sans ce paramètre, le tri serveur par défaut est décroissant et une
   * déclaration de juillet resterait indéfiniment sous celles du mois courant.
   */
  sort?: string;
}

export async function listDeclarations(
  params: ListDeclarationsParams = {},
): Promise<PageResponse<DeclarationResponse>> {
  const { data } = await apiClient.get<PageResponse<DeclarationResponse>>(
    '/api/church/declarations',
    { params },
  );
  return data;
}

export async function getDeclaration(id: string): Promise<DeclarationResponse> {
  const { data } = await apiClient.get<DeclarationResponse>(
    `/api/church/declarations/${id}`,
  );
  return data;
}

export async function createDeclaration(
  payload: DeclarationCreateRequest,
): Promise<DeclarationResponse> {
  const { data } = await apiClient.post<DeclarationResponse>(
    '/api/church/declarations',
    payload,
  );
  return data;
}

export async function updateDeclaration(
  id: string,
  payload: DeclarationUpdateRequest,
): Promise<DeclarationResponse> {
  const { data } = await apiClient.patch<DeclarationResponse>(
    `/api/church/declarations/${id}`,
    payload,
  );
  return data;
}

export async function deleteDeclaration(id: string): Promise<void> {
  await apiClient.delete(`/api/church/declarations/${id}`);
}

/** Vérifier et valider — réservé au trésorier du périmètre (403 sinon). Écran du lot T8. */
export async function verifyDeclaration(id: string): Promise<DeclarationResponse> {
  const { data } = await apiClient.post<DeclarationResponse>(
    `/api/church/declarations/${id}/verify`,
  );
  return data;
}

/** Dévalider — le rattrapage du trésorier qui s'est trompé, jamais un geste du membre (J-1). */
export async function unverifyDeclaration(id: string): Promise<DeclarationResponse> {
  const { data } = await apiClient.post<DeclarationResponse>(
    `/api/church/declarations/${id}/unverify`,
  );
  return data;
}
