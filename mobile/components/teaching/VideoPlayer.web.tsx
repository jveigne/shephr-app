import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
 * D-FIN-16 (JP 06/11) — Expo web (démos) : pas d'`expo-video`, une balise `<video>` sur le lien signé (contrat §11.2 : sans
 * `crossorigin`, `preload="none"`, `controlsList="nodownload"`). Renouvellement du lien et reprise à la seconde comme
 * `VideoPlayer.tsx` de The Deal Way ; voir le lecteur natif pour la règle.
 */

export function isVideoPlayerAvailable(): boolean {
  return true;
}

export default function VideoPlayer({ video, label, autoStart }: VideoPlayerProps) {
  const { link, loading, failed, start } = useFirstVideoLink(video.id, autoStart);
  if (!link) {
    return <VideoPoster video={video} label={label} loading={loading} failed={failed} onPress={() => void start()} />;
  }
  return <WebPlayer video={video} initialLink={link} />;
}

function WebPlayer({ video, initialLink }: { video: TeachingVideoRef; initialLink: TeachingVideoPlay }) {
  const { t } = useLanguage();
  const [link, setLink] = useState(initialLink);
  const [broken, setBroken] = useState(false);
  const element = useRef<any>(null);
  const position = useRef(0);
  const resumeAt = useRef<number | null>(null);
  const renewing = useRef(false);
  const awaitingLink = useRef(false);

  const renew = async () => {
    renewing.current = true;
    awaitingLink.current = true;
    resumeAt.current = position.current;
    setBroken(false);
    try {
      const fresh = await playTeachingVideo(video.id);
      awaitingLink.current = false;
      setLink(fresh);
    } catch {
      awaitingLink.current = false;
      renewing.current = false;
      setBroken(true);
    }
  };

  const onError = () => {
    if (awaitingLink.current) return;
    if (renewing.current) {
      renewing.current = false;
      setBroken(true);
      return;
    }
    void renew();
  };

  return (
    <View>
      <View style={styles.frame}>
        {React.createElement('video', {
          ref: element,
          src: link.url,
          poster: video.posterUrl ?? undefined,
          controls: true,
          preload: 'none',
          controlsList: 'nodownload',
          playsInline: true,
          autoPlay: true,
          'aria-label': video.title,
          style: { width: '100%', aspectRatio: '16 / 9', display: 'block' },
          onTimeUpdate: (e: any) => {
            position.current = e.currentTarget.currentTime;
          },
          onPlay: () => {
            if (!renewing.current && isLinkExpired(link.expiresAt)) void renew();
          },
          onPlaying: () => {
            renewing.current = false;
            setBroken(false);
          },
          onLoadedMetadata: () => {
            setBroken(false);
            if (element.current && resumeAt.current != null) {
              element.current.currentTime = resumeAt.current;
              resumeAt.current = null;
            }
          },
          onError,
        })}
      </View>
      {broken && <VideoMessage message={t('teaching.video.unavailable')} onRetry={() => void renew()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.mossDeep },
});
