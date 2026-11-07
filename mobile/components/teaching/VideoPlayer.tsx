import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { colors, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { playTeachingVideo, type TeachingVideoPlay, type TeachingVideoRef } from '@/services/assemblyApi';
import {
  VideoMessage,
  VideoPoster,
  isLinkExpired,
  useFirstVideoLink,
  type VideoPlayerProps,
} from '@/components/teaching/videoShared';

/**
 * Lecteur vidéo natif d'un chapitre — D-FIN-16 (JP 06/11), contrat 06/11 §5.12 et §11.1 : `expo-video` sur un lien signé de
 * 15 min (`GET /videos/{id}/play`), MP4 sur R2.
 *
 * <p>Chargé PARESSEUSEMENT et SEULEMENT si le module natif est dans le binaire, même précaution que `PdfReader` et
 * `expo-crypto` (`services/eventQueue.ts`) : expo-router charge tous les écrans au démarrage, un `import` direct ferait
 * tomber TOUTE l'application dans un binaire construit avant l'ajout du module. Sans module : `isVideoPlayerAvailable()`
 * est faux, ni lecteur ni bouton, et l'écran le dit (`teaching.video.updateRequired`). ⚠ Un nouveau build EAS est
 * nécessaire pour que la vidéo se lise sur appareil. Sur Expo web, `VideoPlayer.web.tsx` le remplace.
 *
 * <p>Renouvellement du lien, comme `VideoPlayer.tsx` de The Deal Way : le lien vit quinze minutes, une pause peut durer plus
 * longtemps. On réagit à l'échec plutôt qu'à l'échéance : changer de source en pleine lecture coupe le tampon. Sur `error`
 * (ou à la reprise après une longue pause), un lien neuf est demandé, posé, et la lecture reprend à la seconde retenue. Une
 * seule tentative par panne : si le lien neuf échoue aussi avant d'avoir rejoué, c'est une vraie erreur, on la dit au lieu
 * de boucler contre le stockage.
 */

type ExpoVideo = typeof import('expo-video');

/** Résolu UNE fois, au chargement du module (jamais pendant un rendu). */
const expoVideo: ExpoVideo | null = (() => {
  try {
    // `requireOptional…` ne lève jamais : null dans un binaire sans le module.
    if (!requireOptionalNativeModule('ExpoVideo')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-video') as ExpoVideo;
  } catch {
    return null;
  }
})();

/** Le lecteur natif est-il utilisable dans ce binaire ? */
export function isVideoPlayerAvailable(): boolean {
  return expoVideo != null;
}

export default function VideoPlayer({ video, label, autoStart }: VideoPlayerProps) {
  const { link, loading, failed, start } = useFirstVideoLink(video.id, autoStart);
  if (!expoVideo) return null;
  if (!link) {
    return <VideoPoster video={video} label={label} loading={loading} failed={failed} onPress={() => void start()} />;
  }
  return <NativePlayer mod={expoVideo} video={video} initialLink={link} />;
}

function NativePlayer({
  mod,
  video,
  initialLink,
}: {
  mod: ExpoVideo;
  video: TeachingVideoRef;
  initialLink: TeachingVideoPlay;
}) {
  const { t } = useLanguage();
  const [broken, setBroken] = useState(false);
  const link = useRef(initialLink);
  /** Dernière position connue : `currentTime` n'est plus fiable une fois le lecteur en erreur. */
  const position = useRef(0);
  /** Position à rétablir après la pose d'un lien neuf ; null quand il n'y a rien à reprendre. */
  const resumeAt = useRef<number | null>(null);
  /** Vrai entre un renouvellement et la reprise effective : une seconde erreur n'en relance pas. */
  const renewing = useRef(false);
  /** Vrai entre la demande d'un lien et sa pose : l'échec de l'ancien lien est alors attendu. */
  const awaitingLink = useRef(false);

  const player = mod.useVideoPlayer({ uri: initialLink.url, metadata: { title: video.title } }, (p) => {
    p.timeUpdateEventInterval = 1;
    p.staysActiveInBackground = false;
    p.play();
  });

  const renew = useCallback(async () => {
    renewing.current = true;
    awaitingLink.current = true;
    resumeAt.current = position.current;
    setBroken(false);
    try {
      const fresh = await playTeachingVideo(video.id);
      awaitingLink.current = false;
      link.current = fresh;
      await player.replaceAsync({ uri: fresh.url, metadata: { title: video.title } });
    } catch {
      awaitingLink.current = false;
      renewing.current = false;
      setBroken(true);
    }
  }, [player, video.id, video.title]);

  useEffect(() => {
    const subscriptions = [
      player.addListener('timeUpdate', ({ currentTime }) => {
        position.current = currentTime;
      }),
      player.addListener('statusChange', ({ status }) => {
        if (status === 'error') {
          if (awaitingLink.current) return;
          if (renewing.current) {
            // Le lien neuf a échoué lui aussi, avant toute reprise : ce n'est plus une échéance.
            renewing.current = false;
            setBroken(true);
            return;
          }
          void renew();
        } else if (status === 'readyToPlay' && resumeAt.current != null) {
          player.currentTime = resumeAt.current;
          resumeAt.current = null;
          player.play();
        }
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (!isPlaying) return;
        // Reprise après une longue pause : le lien est mort, le renouveler évite l'aller-retour en erreur.
        if (!renewing.current && isLinkExpired(link.current.expiresAt)) {
          void renew();
          return;
        }
        renewing.current = false;
        setBroken(false);
      }),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, [player, renew]);

  return (
    <View>
      <View style={styles.frame}>
        <mod.VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
          allowsPictureInPicture={false}
          fullscreenOptions={{ enable: true }}
        />
      </View>
      {broken && <VideoMessage message={t('teaching.video.unavailable')} onRetry={() => void renew()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.mossDeep },
  video: { width: '100%', aspectRatio: 16 / 9 },
});
