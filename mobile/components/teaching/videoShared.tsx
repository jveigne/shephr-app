import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { playTeachingVideo, type TeachingVideoPlay, type TeachingVideoRef } from '@/services/assemblyApi';

/** Props communes au lecteur natif (`VideoPlayer.tsx`) et à celui d'Expo web (`VideoPlayer.web.tsx`). */
export interface VideoPlayerProps {
  video: TeachingVideoRef;
  /** Libellé sous la vignette : « Revoir en vidéo · 4 min » (maquette Enseignement, écran 5). */
  label: string;
  /** Lance la lecture sans passer par la vignette (« Regarder la vidéo » de l'ouverture). */
  autoStart?: boolean;
}

/** Marge : un lien qui expire dans les 30 secondes est déjà tenu pour mort. */
export function isLinkExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() < 30_000;
}

/** Premier lien de lecture : demandé à l'appui, jamais avant (aucun lien signé pour un lecteur que personne ne démarre). */
export function useFirstVideoLink(videoId: string, autoStart?: boolean) {
  const [link, setLink] = useState<TeachingVideoPlay | null>(null);
  // `autoStart` : déjà en chargement au premier rendu, l'effet ne fait que lancer la demande.
  const [loading, setLoading] = useState(!!autoStart);
  const [failed, setFailed] = useState(false);

  // Tout changement d'état arrive après la réponse du serveur, jamais pendant l'effet qui la demande.
  const fetchLink = useCallback(
    () =>
      playTeachingVideo(videoId)
        .then(setLink, () => setFailed(true))
        .finally(() => setLoading(false)),
    [videoId],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    await fetchLink();
  }, [fetchLink]);

  useEffect(() => {
    if (autoStart) void fetchLink();
    // Une seule fois à l'ouverture : la vidéo ne change pas pour un même écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { link, loading, failed, start };
}

/** Vignette et bouton de lecture (maquette Enseignement, écran 5). */
export function VideoPoster({
  video,
  label,
  loading,
  failed,
  onPress,
}: {
  video: TeachingVideoRef;
  label: string;
  loading: boolean;
  failed: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.card}
      >
        <View style={styles.stage}>
          {!!video.posterUrl && <Image source={{ uri: video.posterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          <View style={styles.playBadge}>
            {loading ? (
              <ActivityIndicator color={colors.moss} />
            ) : (
              <Ionicons name="play" size={22} color={colors.moss} style={{ marginLeft: 3 }} />
            )}
          </View>
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {failed && <VideoMessage message={t('teaching.video.unavailable')} onRetry={onPress} />}
    </View>
  );
}

/** Lien de lecture refusé ou lecture impossible : on le dit, avec un nouvel essai. */
export function VideoMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={styles.message}>
      <Text style={styles.messageText}>{message}</Text>
      {!!onRetry && (
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
          <Text style={styles.retry}>{t('common.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.moss },
  stage: { height: 190, alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  label: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.white,
    backgroundColor: colors.mossDeep,
  },
  message: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  messageText: { flexShrink: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.clay, lineHeight: 18 },
  retry: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss, textDecorationLine: 'underline' },
});
