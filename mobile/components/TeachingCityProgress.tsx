import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Chip from '@/components/Chip';
import ErrorBanner from '@/components/ErrorBanner';
import StudyCityLock from '@/components/StudyCityLock';
import TeachingMemberRow from '@/components/teaching/TeachingMemberRow';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getTeachingLocality,
  type TeachingCourseSummary,
  type TeachingLocalityMember,
  type TeachingLocalityProgress,
} from '@/services/assemblyApi';
import { cityTeachingAccessDenied } from '@/services/entitlementsApi';

/**
 * Onglet « Enseignement » du Suivi de la ville — D-FIN-08 (JP 06/11), offre Néhémie, code de VILLE `ENSEIGNEMENT_SUIVI`. Contrat
 * 06/11 §5.11. Axe GÉOGRAPHIE (`getAllVisibleLocalityIds`), jamais la chaîne Caleb : membres nommés de la ville, par assemblée,
 * avancement cumulé. Tri et totaux : le serveur.
 *
 * <p>Sans le droit (liste `entitled = false`, sans appel, ou 403 `MODULE_ACCESS_DENIED` / ENSEIGNEMENT_SUIVI) : l'onglet ENTIER
 * est remplacé par `StudyCityLock`, jamais un toast, aucun prix ni bouton (D-OFF-09). Ce verrou ne ferme que cet onglet : chaque
 * onglet décide selon son code (JP 28/10).
 */
export default function TeachingCityProgress({
  localityId,
  entitled,
  courses,
}: {
  localityId: string;
  entitled: boolean;
  courses: TeachingCourseSummary[];
}) {
  const { t } = useLanguage();
  const [chosen, setChosen] = useState<string | null>(null);
  const courseId = courses.some((c) => c.id === chosen) ? (chosen as string) : (courses[0]?.id ?? null);
  const [loaded, setLoaded] = useState<{ courseId: string; data: TeachingLocalityProgress } | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!entitled || !courseId) return;
    let active = true;
    getTeachingLocality(courseId, localityId)
      .then((data) => {
        if (!active) return;
        setLoaded({ courseId, data });
        setError(false);
      })
      .catch((e) => {
        if (!active) return;
        if (cityTeachingAccessDenied(e)) setDenied(true);
        else setError(true);
      });
    return () => {
      active = false;
    };
  }, [entitled, courseId, localityId, retryKey]);

  const data = loaded?.courseId === courseId ? loaded.data : null;
  const groups = useMemo(() => {
    const out: { key: string; name: string; members: TeachingLocalityMember[] }[] = [];
    for (const m of data?.members ?? []) {
      const key = m.unitId ?? 'none';
      const group = out.find((g) => g.key === key);
      if (group) group.members.push(m);
      else out.push({ key, name: m.unitName ?? t('teaching.follow.noUnit'), members: [m] });
    }
    return out;
  }, [data, t]);

  if (!entitled || denied) return <StudyCityLock />;

  return (
    <View style={styles.root}>
      <Text style={styles.note}>{t('teaching.city.cumulative')}</Text>
      {courses.length > 1 && (
        <View style={styles.chips}>
          {courses.map((c) => (
            <Chip key={c.id} label={c.name} selected={c.id === courseId} onPress={() => setChosen(c.id)} />
          ))}
        </View>
      )}

      {error && <ErrorBanner message={t('teaching.errors.loadFailed')} onRetry={() => setRetryKey((k) => k + 1)} />}

      {!data ? (
        !error && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )
      ) : groups.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="book-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('teaching.follow.none')}</Text>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.key} style={styles.group}>
            <Text style={styles.groupName} numberOfLines={1}>
              {g.name}
            </Text>
            <Text style={styles.groupMeta}>
              {t('teaching.follow.started', {
                count: g.members.filter((m) => m.lastActivityAt != null).length,
                members: g.members.length,
              })}
            </Text>
            {g.members.map((m) => (
              <TeachingMemberRow key={m.userId} member={m} />
            ))}
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 16, gap: 10 },
  note: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  loading: { marginTop: 24, alignItems: 'center' },
  empty: { paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  group: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radii.md },
  groupName: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  groupMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
});
