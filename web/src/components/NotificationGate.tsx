import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from './ui';
import { useAuth } from '../hooks/useAuth';
import { FEATURES } from '../config/features';
import { hasGoalsAccess, hasMemberSpace, hasMinistryAccess, type MeResponse } from '../services/authApi';
import {
  getUnreadNotifications,
  markNotificationRead,
  type UserNotification,
} from '../services/notificationsApi';
import { getCampaigns, type CampaignNotification } from '../services/appNotificationsApi';
import {
  SOURCE_SUPERVISION_REQUEST,
  acceptSupervisionRequest,
  fetchSupervisionOverview,
  refuseSupervisionRequest,
} from '../services/leadersApi';
import {
  applySupervisionOverview,
  replacedSupervisorName,
  supervisionErrorCode,
  supervisionErrorMessage,
} from '../utils/supervision';

/**
 * Porte d'entrée des messages à l'ouverture — Parité mobile → web (JP 27/10, décision n°3), D-WEB-06 :
 * équivalent web de `mobile/components/NotificationGate.tsx` ; le push (Expo) reste propre au mobile
 * (D-WEB-01). Montée dans `AppShell` et `MemberShell`, jamais sur une page publique.
 *
 * UNE seule modale à la fois, dans l'ordre :
 * 1) CAMPAGNES serveur (`INFO`, `PROMO`) — `APP_UPDATE` est écartée : elle invite à mettre à jour un
 *    binaire installé, ce que le web n'a pas. Fermer = snooze 3 jours (localStorage, comme le mobile) ;
 *    rechargées quand l'onglet revient au premier plan (`visibilitychange`, équivalent d'AppState).
 * 2) RAPPELS personnels non lus (UC-MBR-09, Lot 4.4) : « OK » = lu puis suivant ; « Plus tard » =
 *    masqués pour cette session (ils reviennent au prochain chargement) ; « Voir » seulement quand la
 *    `source` a une destination POUR CETTE PERSONNE (table locale, jamais une route venue du réseau).
 *
 * 3) D-HIE-06 (JP 28/10, lot HIE) — DEMANDE DE SUPERVISION reçue (`source = SUPERVISION_REQUEST`,
 *    `refEntityId` = la demande) : modale « {demandeur} souhaite vous suivre… » avec Valider / Refuser /
 *    Plus tard (masquée pour la session). Le front ne l'acquitte JAMAIS par `POST /read` : le serveur la
 *    marque lue quand la demande quitte PENDING (RG-HIE-25). Si la demande n'est plus dans `incoming`
 *    de `GET /me/supervision` (déjà traitée, annulée) → `POST /read` silencieux, modale suivante
 *    (RG-HIE-27). Valider REMPLACE le superviseur actuel : confirmation explicite (RG-HIE-28).
 *
 * Tout échec est silencieux : la porte ne bloque jamais l'application. Le cache react-query est vidé
 * au changement de compte (`queryClient.clear()` dans `establishSession` / `logout`).
 */
const CAMPAIGN_STORAGE_KEY = 'shephr.campaigns.state';
const CAMPAIGN_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours

type CampaignState = Record<string, { snoozedUntil: number }>;

/** Lecture tolérante : sans stockage (navigation privée, données bloquées), aucune campagne n'est snoozée. */
function readCampaignState(): CampaignState {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as CampaignState) : {};
  } catch {
    return {};
  }
}

function snoozeCampaignInStorage(id: string) {
  try {
    const state = readCampaignState();
    state[id] = { snoozedUntil: Date.now() + CAMPAIGN_SNOOZE_MS };
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // au pire la campagne réapparaîtra au prochain chargement
  }
}

/** Sources connues (Mirrors com.excellence.back.notification.UserNotification#source). */
const SOURCE_RAPPEL_GOALS = 'GOAL_REMINDER';
const SOURCE_RESUME_TRESORERIE = 'DONATION_DIGEST';
const SOURCE_RELANCE_DONS = 'DONATION_REMINDER';

/**
 * Destination d'un rappel d'après sa `source` (miroir de `mobile/components/push/routagePush.ts`).
 * `null` quand la personne n'y a pas droit : le bouton reste « OK », jamais un 403 provoqué.
 */
function destinationFor(source: string | undefined, me: MeResponse | null): string | null {
  switch (source) {
    // Rappel d'engagement → l'écran des engagements de la personne (N3).
    case SOURCE_RAPPEL_GOALS:
      if (FEATURES.goals && hasMinistryAccess(me) && hasGoalsAccess(me)) return '/goals';
      if (hasMemberSpace(me)) return '/my-goals';
      return null;
    // Dons / Trésorerie : hors lot tant que FEATURES.donations = false (D-WEB-08).
    case SOURCE_RESUME_TRESORERIE:
    case SOURCE_RELANCE_DONS:
      return null;
    default:
      // Source inconnue : le texte suffit. Inventer une destination serait pire que ne pas en avoir.
      return null;
  }
}

const UNREAD_KEY = ['notifications', 'unread'] as const;

export function NotificationGate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ready, isAuthenticated, me } = useAuth();
  const enabled = ready && isAuthenticated && !!me;
  const ministryId = me?.ministryId ?? null;

  const campaignsQ = useQuery({
    queryKey: ['notifications', 'campaigns', ministryId],
    queryFn: () => getCampaigns(ministryId),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const unreadQ = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: getUnreadNotifications,
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });

  /** Campagnes fermées pendant cette session (le snooze persistant peut échouer sans stockage). */
  const [closedCampaigns, setClosedCampaigns] = useState<string[]>([]);
  /** Rappels traités (lus) localement — retirés de la file sans attendre un rechargement. */
  const [handledReminders, setHandledReminders] = useState<string[]>([]);
  /** « Plus tard » : rappels masqués jusqu'au prochain chargement de l'application. */
  const [remindersDismissed, setRemindersDismissed] = useState(false);

  // Re-check des campagnes quand l'onglet revient au premier plan (comme le mobile au retour d'AppState).
  const { refetch: refetchCampaigns } = campaignsQ;
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refetchCampaigns();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, refetchCampaigns]);

  const campaign: CampaignNotification | null = useMemo(() => {
    const list = campaignsQ.data ?? [];
    if (list.length === 0) return null;
    const state = readCampaignState();
    const now = Date.now();
    // Le backend trie par priorité — première non snoozée.
    return (
      list.find(
        (c) =>
          c.type !== 'APP_UPDATE' &&
          !closedCampaigns.includes(c.id) &&
          !(state[c.id] && state[c.id].snoozedUntil > now),
      ) ?? null
    );
    // `dataUpdatedAt` : relire le snooze à chaque rechargement (retour au premier plan).
  }, [campaignsQ.data, campaignsQ.dataUpdatedAt, closedCampaigns]);

  /** D-HIE-06 : demandes de supervision remises à plus tard pour cette session. */
  const [deferredSupervision, setDeferredSupervision] = useState<string[]>([]);
  const [supervisionBusy, setSupervisionBusy] = useState(false);
  const [supervisionError, setSupervisionError] = useState<string | null>(null);
  /** RG-HIE-28 : second clic sur « Valider » quand la validation remplace le superviseur actuel. */
  const [confirmReplace, setConfirmReplace] = useState(false);

  const queue: UserNotification[] = useMemo(
    () =>
      (unreadQ.data ?? []).filter(
        (n) => !handledReminders.includes(n.id) && !deferredSupervision.includes(n.id),
      ),
    [unreadQ.data, handledReminders, deferredSupervision],
  );
  const hasSupervision = queue.some((n) => n.source === SOURCE_SUPERVISION_REQUEST);
  const supervisionQ = useQuery({
    queryKey: ['leaders', 'supervision'],
    queryFn: fetchSupervisionOverview,
    enabled: enabled && hasSupervision,
    retry: false,
  });

  const closeCampaign = useCallback(() => {
    if (!campaign) return;
    snoozeCampaignInStorage(campaign.id);
    setClosedCampaigns((ids) => [...ids, campaign.id]);
  }, [campaign]);

  const current = queue[0] ?? null;
  const destination = current ? destinationFor(current.source, me) : null;
  const isSupervision = current?.source === SOURCE_SUPERVISION_REQUEST;
  const supervisionRequest =
    isSupervision && supervisionQ.data
      ? supervisionQ.data.incoming.find((r) => r.id === current?.refEntityId) ?? null
      : null;

  // Nouvelle notification affichée : on repart d'un état propre.
  const currentId = current?.id ?? null;
  useEffect(() => {
    setSupervisionError(null);
    setConfirmReplace(false);
  }, [currentId]);

  // RG-HIE-27 : demande déjà traitée / annulée (absente de `incoming`) → lue en silence, suivante.
  // Panne de lecture de l'aperçu → remise à plus tard pour la session (la porte ne bloque jamais).
  // L'aperçu peut venir du cache (page « Mon leadership » ouverte avant l'arrivée de la demande) : on
  // ne conclut « déjà traitée » que sur un aperçu lu APRÈS la liste des notifications, sinon on relit.
  const overviewFresh =
    supervisionQ.isSuccess && !supervisionQ.isFetching && supervisionQ.dataUpdatedAt >= unreadQ.dataUpdatedAt;
  const needsOverviewRefresh =
    isSupervision && supervisionQ.isSuccess && !supervisionQ.isFetching && !overviewFresh && !supervisionRequest;
  const { refetch: refetchSupervision } = supervisionQ;
  useEffect(() => {
    if (needsOverviewRefresh) void refetchSupervision();
  }, [needsOverviewRefresh, refetchSupervision]);
  const staleSupervisionId =
    isSupervision && current && overviewFresh && !supervisionRequest ? current.id : null;
  const failedSupervisionId = isSupervision && current && supervisionQ.isError ? current.id : null;
  useEffect(() => {
    if (!staleSupervisionId) return;
    void markNotificationRead(staleSupervisionId).catch(() => undefined);
    setHandledReminders((ids) => (ids.includes(staleSupervisionId) ? ids : [...ids, staleSupervisionId]));
  }, [staleSupervisionId]);
  useEffect(() => {
    if (!failedSupervisionId) return;
    setDeferredSupervision((ids) => (ids.includes(failedSupervisionId) ? ids : [...ids, failedSupervisionId]));
  }, [failedSupervisionId]);

  const decideSupervision = useCallback(
    async (decision: 'accept' | 'refuse') => {
      if (!current || !supervisionRequest) return;
      if (decision === 'accept' && !confirmReplace && replacedSupervisorName(supervisionQ.data, supervisionRequest)) {
        setConfirmReplace(true);
        return;
      }
      setSupervisionBusy(true);
      setSupervisionError(null);
      try {
        const overview =
          decision === 'accept'
            ? await acceptSupervisionRequest(supervisionRequest.id)
            : await refuseSupervisionRequest(supervisionRequest.id);
        // Le serveur a marqué la notification lue (RG-HIE-25) : on passe à la suivante.
        applySupervisionOverview(queryClient, overview);
        setHandledReminders((ids) => [...ids, current.id]);
      } catch (err) {
        // Demande déjà traitée ailleurs : le serveur l'a déjà marquée lue (RG-HIE-25) → suivante.
        if (supervisionErrorCode(err) === 'SUPERVISION_REQUEST_NOT_PENDING') {
          setHandledReminders((ids) => [...ids, current.id]);
          void queryClient.invalidateQueries({ queryKey: ['leaders', 'supervision'] });
          return;
        }
        setSupervisionError(supervisionErrorMessage(err, t));
        // L'état a pu changer ailleurs : relire l'aperçu (une demande disparue sera acquittée).
        void supervisionQ.refetch();
      } finally {
        setSupervisionBusy(false);
      }
    },
    [current, supervisionRequest, confirmReplace, supervisionQ, queryClient, t],
  );

  const deferSupervision = useCallback(() => {
    if (!current) return;
    setDeferredSupervision((ids) => [...ids, current.id]);
  }, [current]);

  const acknowledge = useCallback(async () => {
    if (!current) return;
    try {
      await markNotificationRead(current.id);
    } catch {
      // au pire la notification réapparaîtra au prochain chargement
    }
    setHandledReminders((ids) => [...ids, current.id]);
    queryClient.setQueryData<UserNotification[]>(UNREAD_KEY, (list) =>
      list ? list.filter((n) => n.id !== current.id) : list,
    );
    if (!destination) return;
    // Les rappels restants sont REMIS À PLUS TARD, pas perdus (comme le mobile) : aucune seconde
    // modale ne s'ouvre par-dessus l'écran qu'on vient de demander.
    setRemindersDismissed(true);
    navigate(destination);
  }, [current, destination, navigate, queryClient]);

  const later = useCallback(() => setRemindersDismissed(true), []);

  if (!enabled) return null;

  // ---- 1) Campagne serveur (prioritaire — une seule modale à la fois) ----
  if (campaign) {
    const showImage = !!campaign.imageUrl && campaign.imagePosition !== 'NONE';
    return (
      <Modal
        open
        onClose={closeCampaign}
        title={campaign.title}
        sub={t(campaign.type === 'PROMO' ? 'notifications.campaignPromo' : 'notifications.campaignInfo')}
        footer={
          <>
            <Button variant="ghost" onClick={closeCampaign}>
              {t('notifications.later')}
            </Button>
            <Button variant="primary" onClick={closeCampaign}>
              {t('notifications.ok')}
            </Button>
          </>
        }
      >
        {showImage && campaign.imagePosition === 'BACKGROUND' ? (
          <div
            role="img"
            aria-label={campaign.imageAlt ?? undefined}
            style={{
              height: 160,
              borderRadius: 'var(--radius)',
              marginBottom: 14,
              backgroundImage: `url("${campaign.imageUrl}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : showImage ? (
          <img
            src={campaign.imageUrl ?? undefined}
            alt={campaign.imageAlt ?? ''}
            style={{
              display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover',
              borderRadius: 'var(--radius)', marginBottom: 14,
            }}
          />
        ) : null}
        <p style={{ margin: 0, whiteSpace: 'pre-line', color: 'var(--ink-700)', lineHeight: 1.55 }}>
          {campaign.message}
        </p>
      </Modal>
    );
  }

  // ---- 2) Rappels personnels ----
  if (!current || remindersDismissed) return null;

  // ---- 3) Demande de supervision (D-HIE-06) — attend l'aperçu ; rien tant qu'il n'est pas là. ----
  if (isSupervision) {
    if (!supervisionRequest) return null;
    const replaced = replacedSupervisorName(supervisionQ.data, supervisionRequest);
    const requester = supervisionRequest.requester;
    const place = [requester.unitName, requester.cityName].filter(Boolean).join(' · ');
    return (
      <Modal
        open
        onClose={() => !supervisionBusy && deferSupervision()}
        title={t('notifications.supervision.title')}
        sub={t('notifications.supervision.sub')}
        footer={
          <>
            <Button variant="ghost" disabled={supervisionBusy} onClick={deferSupervision}>
              {t('notifications.supervision.later')}
            </Button>
            <Button variant="secondary" disabled={supervisionBusy} onClick={() => void decideSupervision('refuse')}>
              {t('notifications.supervision.refuse')}
            </Button>
            <Button variant="primary" disabled={supervisionBusy} onClick={() => void decideSupervision('accept')}>
              {confirmReplace ? t('notifications.supervision.confirmAccept') : t('notifications.supervision.accept')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--ink-700)', lineHeight: 1.55 }}>
          {t('notifications.supervision.body', { name: requester.fullName })}
        </p>
        {place && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-500)' }}>{place}</div>}
        {replaced && (
          <p
            role={confirmReplace ? 'alert' : undefined}
            style={{
              margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.5,
              color: confirmReplace ? 'var(--earth-700)' : 'var(--ink-600)',
              fontWeight: confirmReplace ? 600 : 400,
            }}
          >
            {t('notifications.supervision.replaceWarning', { name: replaced })}
          </p>
        )}
        {supervisionError && (
          <p role="alert" style={{ margin: '12px 0 0', color: 'var(--err)', fontSize: 13 }}>{supervisionError}</p>
        )}
        {queue.length > 1 && (
          <div className="mono" style={{ marginTop: 12, color: 'var(--ink-500)' }}>
            {t('notifications.morePending', { count: queue.length - 1 })}
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={later}
      title={current.title}
      sub={t('notifications.reminderTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={later}>
            {t('notifications.later')}
          </Button>
          <Button variant="primary" onClick={() => void acknowledge()}>
            {destination ? t('notifications.view') : t('notifications.ok')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, whiteSpace: 'pre-line', color: 'var(--ink-700)', lineHeight: 1.55 }}>
        {current.message}
      </p>
      {queue.length > 1 && (
        <div className="mono" style={{ marginTop: 12, color: 'var(--ink-500)' }}>
          {t('notifications.morePending', { count: queue.length - 1 })}
        </div>
      )}
    </Modal>
  );
}
