import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui';
import { playTeachingVideo, type TeachingVideoPlay } from '../services/assemblyApi';

// ---------------------------------------------------------------------------------------------
//  Lecteur d'une vidéo d'enseignement — D-FIN-07 / D-FIN-16 (JP 06/11, contrat §5.12, §11.2). Une
//  balise `<video>` posée sur l'URL signée de `/videos/{id}/play` et son renouvellement, sur le modèle
//  de `components/videos/VideoPlayer.tsx` de The Deal Way.
//  - Les octets viennent du stockage (R2) : `src` est l'URL signée telle quelle, le navigateur y envoie
//    ses requêtes `Range`. Pas d'attribut `crossorigin`.
//  - Le lien vit 15 minutes : sur `error` (plage refusée) ou au clic « Lecture » si le lien est à son
//    terme, on en redemande un et on reprend À LA SECONDE retenue. Une seule tentative par panne : si le
//    lien neuf échoue aussi avant d'avoir rejoué, on le dit au lieu de boucler contre le stockage.
//  - `controlsList="nodownload"` retire le bouton du menu, ce n'est pas une protection : la vraie limite
//    est la durée courte du lien (limite acceptée, §5.7 du plan). `preload="none"` : aucun mégaoctet tiré
//    pour un lecteur que personne n'a démarré, réseaux lents compris.
//  - Ce lecteur n'existe que si le chapitre a une vidéo publiée (`video` non nul) : sans vidéo, ni bouton
//    ni lecteur. Échec : message dans le lecteur, jamais un toast.
// ---------------------------------------------------------------------------------------------

/** « À l'approche de `expiresAt` » (§5.12) : marge pour qu'un lien presque mort ne parte pas au stockage. */
const EXPIRY_MARGIN_MS = 10_000;

function isLinkExpired(expiresAt: string): boolean {
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) || at - Date.now() <= EXPIRY_MARGIN_MS;
}

export function TeachingVideoPlayer({
  videoId,
  title,
  posterUrl,
  autoPlay = true,
}: {
  videoId: string;
  /** Nom accessible du lecteur. */
  title: string;
  posterUrl?: string | null;
  autoPlay?: boolean;
}) {
  const { t } = useTranslation();
  const [link, setLink] = useState<TeachingVideoPlay | null>(null);
  const [failed, setFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  /** Dernière position connue : `currentTime` n'est plus fiable une fois la balise en erreur. */
  const position = useRef(0);
  /** Position à rétablir après la pose d'un lien neuf. */
  const resumeAt = useRef<number | null>(null);
  /** Vrai entre un renouvellement et la reprise effective : une seconde erreur n'en relance pas. */
  const renewing = useRef(false);
  /** Vrai entre la demande d'un lien neuf et sa pose : l'erreur de l'ancien lien est alors attendue. */
  const awaitingLink = useRef(false);
  /** La lecture est demandée : un lien neuf posé doit reprendre, pas seulement se charger. */
  const playRequested = useRef(false);
  const alive = useRef(true);

  const loadLink = useCallback(async () => {
    setFailed(false);
    try {
      const next = await playTeachingVideo(videoId);
      if (alive.current) setLink(next);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, [videoId]);

  useEffect(() => {
    alive.current = true;
    void loadLink();
    return () => {
      alive.current = false;
    };
  }, [loadLink]);

  const renew = async () => {
    renewing.current = true;
    awaitingLink.current = true;
    playRequested.current = true;
    resumeAt.current = position.current;
    setFailed(false);
    try {
      const next = await playTeachingVideo(videoId);
      awaitingLink.current = false;
      if (alive.current) setLink(next);
    } catch {
      awaitingLink.current = false;
      renewing.current = false;
      playRequested.current = false;
      if (alive.current) setFailed(true);
    }
  };

  // Changer `src` remet la balise à l'arrêt : la reprise est demandée dès que le lien neuf est posé, la
  // position est rétablie à `loadedmetadata`.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playRequested.current) return;
    video.load();
    void video.play()?.catch(() => undefined);
  }, [link]);

  const onError = () => {
    if (awaitingLink.current) return;
    if (renewing.current) {
      renewing.current = false;
      playRequested.current = false;
      setFailed(true);
      return;
    }
    void renew();
  };

  const onLoadedMetadata = () => {
    setFailed(false);
    const video = videoRef.current;
    if (!video || resumeAt.current === null) return;
    video.currentTime = resumeAt.current;
    resumeAt.current = null;
  };

  return (
    <div>
      <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--green-900)', aspectRatio: '16 / 9', display: 'grid', placeItems: 'center' }}>
        {link ? (
          <video
            ref={videoRef}
            src={link.url}
            poster={posterUrl ?? undefined}
            controls
            preload="none"
            controlsList="nodownload"
            playsInline
            autoPlay={autoPlay}
            aria-label={title}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onTimeUpdate={(e) => {
              position.current = e.currentTarget.currentTime;
            }}
            onPlay={() => {
              if (!renewing.current && isLinkExpired(link.expiresAt)) void renew();
            }}
            onPlaying={() => {
              renewing.current = false;
              playRequested.current = false;
              setFailed(false);
            }}
            onLoadedMetadata={onLoadedMetadata}
            onError={onError}
          />
        ) : (
          !failed && <span style={{ color: 'var(--ivory)', fontSize: 13.5 }}>{t('common.loading')}</span>
        )}
      </div>
      {failed && (
        <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--err)', fontSize: 13.5 }}>{t('teaching.video.unavailable')}</span>
          <Button size="sm" onClick={() => void (link ? renew() : loadLink())}>
            {t('teaching.video.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
