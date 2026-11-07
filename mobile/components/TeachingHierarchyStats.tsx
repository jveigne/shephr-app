import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '@/components/Card';
import Chip from '@/components/Chip';
import ErrorBanner from '@/components/ErrorBanner';
import TeachingMemberRow from '@/components/teaching/TeachingMemberRow';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getTeachingHierarchy,
  type TeachingCourseSummary,
  type TeachingHierarchyProgress,
  type TeachingHierarchyUnit,
} from '@/services/assemblyApi';
import { hierarchyAccessDenied } from '@/services/entitlementsApi';

/**
 * « Avancement dans les enseignements » — D-FIN-03 (JP 06/11), offre Caleb (code personnel HIERARCHIE_SUIVI), page 3 « Vie de
 * mon leadership ». Contrat 06/11 §5.9.
 *
 * <p>Axe de la CHAÎNE de supervision (`scopeOf`), jamais la géographie : membres NOMMÉS par assemblée, assemblée dirigée par
 * l'appelant comprise (la règle de l'« assemblée gratuite » ne donne aucun nom). Avancement CUMULÉ : le sélecteur de période de la
 * page ne s'y applique pas. Tout est calculé par le serveur.
 *
 * <p>Un 403 `MODULE_ACCESS_DENIED` / HIERARCHIE_SUIVI appelle `onDenied` (verrou UNIQUE de la page, jamais un toast).
 * Pas de react-query : useState + useEffect, rechargé par `refreshKey` et par l'enseignement choisi.
 */
export default function TeachingHierarchyStatsBlock({
  courses,
  refreshKey,
  onDenied,
}: {
  courses: TeachingCourseSummary[];
  refreshKey: number;
  onDenied: () => void;
}) {
  const { t } = useLanguage();
  const [chosen, setChosen] = useState<string | null>(null);
  const courseId = courses.some((c) => c.id === chosen) ? (chosen as string) : courses[0].id;
  const [loaded, setLoaded] = useState<{ courseId: string; data: TeachingHierarchyProgress } | null>(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    getTeachingHierarchy(courseId)
      .then((data) => {
        if (!active) return;
        setLoaded({ courseId, data });
        setError(false);
      })
      .catch((e) => {
        if (!active) return;
        if (hierarchyAccessDenied(e)) onDenied();
        else setError(true);
      });
    return () => {
      active = false;
    };
    // `onDenied` change à chaque rendu : l'enseignement et les clés de rechargement suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, refreshKey, retryKey]);

  const data = loaded?.courseId === courseId ? loaded.data : null;

  return (
    <Card style={styles.block}>
      <View style={styles.header}>
        <Ionicons name="book-outline" size={18} color={colors.mossDeep} />
        <Text style={styles.title}>{t('teaching.hierarchy.title')}</Text>
      </View>
      <Text style={styles.note}>{t('teaching.hierarchy.cumulative')}</Text>

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
      ) : data.units.length === 0 ? (
        <Text style={styles.empty}>{t('teaching.follow.none')}</Text>
      ) : (
        data.units.map((u) => <UnitBlock key={u.unitId} unit={u} />)
      )}
    </Card>
  );
}

/** Une assemblée, repliée : en mode MINISTRY, la liste de tous les membres serait trop longue pour un téléphone. */
function UnitBlock({ unit }: { unit: TeachingHierarchyUnit }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const started = unit.members.filter((m) => m.lastActivityAt != null).length;
  return (
    <View style={styles.unit}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.unitHead}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.unitName} numberOfLines={1}>
            {unit.unitName}
            {unit.cityName ? `  ·  ${unit.cityName}` : ''}
          </Text>
          {!!unit.leaderName && (
            <Text style={styles.meta} numberOfLines={1}>
              {t('hierarchy.leaderPrefix', { name: unit.leaderName })}
            </Text>
          )}
          <Text style={styles.meta}>
            {t('teaching.follow.started', { count: started, members: unit.members.length })}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </Pressable>
      {open &&
        (unit.members.length === 0 ? (
          <Text style={styles.empty}>{t('teaching.follow.noMember')}</Text>
        ) : (
          unit.members.map((m) => <TeachingMemberRow key={m.userId} member={m} />)
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  title: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: colors.ink },
  note: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  loading: { paddingVertical: 18, alignItems: 'center' },
  empty: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink3, textAlign: 'center', paddingVertical: 14 },
  unit: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hair },
  unitHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.earthDeep },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
});
