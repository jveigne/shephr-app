import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import { UnitStatusBadge } from '../../../components/GoalAggregates';
import { UnitGoalsScreen } from './index';
import { colors, fonts } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getActiveGoal, getMyUnits, type ZoneUnitStatus } from '../../../services/goalsApi';

/**
 * Palier A3 (JP 14/08) — « Mes assemblées » : drill-down du dirigeant qui en tient PLUSIEURS.
 *
 * <p>Jusqu'ici ce profil retombait sur son assemblée « home » et n'avait aucun moyen d'atteindre
 * les autres. Ici il les voit toutes (statut de soumission, ville), entre dans celle qu'il veut,
 * et y déclare / soumet en tant que dirigeant de CETTE assemblée — l'écran d'engagements est le
 * même que pour un dirigeant mono-assemblée, simplement paramétré par `unitId`.
 *
 * <p>Le statut vient de `GET /goals/me/units` (déjà utilisé par le drill-down du dirigeant de
 * ville). Si cet appel ne renvoie rien, on retombe sur les assemblées portées par le compte
 * (`me.assemblies`, palier A2) : mieux vaut une liste sans badge qu'un écran vide.
 */
export default function MyUnitsScreen() {
  const { t } = useLanguage();
  const { me } = useAuth();
  const [units, setUnits] = useState<ZoneUnitStatus[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  /** Assemblées portées par le compte, dans l'ordre du backend (principale en tête). */
  const myAssemblies = me?.assemblies ?? [];
  const myUnitIds = new Set(
    myAssemblies.length > 0
      ? myAssemblies.map((a) => a.id)
      : [me?.goalUnitId, ...(me?.goalUnitIds ?? [])].filter(Boolean) as string[],
  );

  const load = async () => {
    try {
      const goal = await getActiveGoal();
      setYear(goal.currentYear);
      const all = await getMyUnits(goal.currentYear).catch(() => [] as ZoneUnitStatus[]);
      setUnits(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // Une assemblée ouverte : l'écran d'engagements paramétré, qui affiche lui-même le retour à la
  // liste en tête de page (un bouton flottant en bas passait sous la barre d'onglets).
  if (selected) {
    return (
      <UnitGoalsScreen
        unitId={selected.id}
        unitName={selected.name}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  // Les assemblées du compte d'abord (celles qu'il dirige en propre), puis celles de son sous-arbre.
  const mine = units.filter((u) => myUnitIds.has(u.unitId));
  const others = units.filter((u) => !myUnitIds.has(u.unitId));
  const rows: { unitId: string; unitName: string; localityName: string | null; status?: ZoneUnitStatus }[] =
    units.length > 0
      ? [...mine, ...others].map((u) => ({
          unitId: u.unitId,
          unitName: u.unitName,
          localityName: u.localityName,
          status: u,
        }))
      : myAssemblies.map((a) => ({ unitId: a.id, unitName: a.name, localityName: a.cityName }));

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.titleRow}>
        <Ionicons name="flag-outline" size={22} color={colors.mossSoft} />
        <Text style={styles.title}>{t('goals.title')}</Text>
      </View>
      <View style={styles.viewChip}>
        <Text style={styles.viewChipText}>
          {t('views.badge')} : {t('views.myUnits')}
        </Text>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('goals.myUnits.title')}</Text>
      </View>
      <Text style={styles.hint}>{t('goals.myUnits.hint')}</Text>

      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('goals.myUnits.empty')}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 12 }}>
          {rows.map((row) => (
            <Pressable
              key={row.unitId}
              onPress={() => setSelected({ id: row.unitId, name: row.unitName })}
            >
              <Card variant="paper2" style={styles.unitCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitName}>{row.unitName}</Text>
                  {!!row.localityName && <Text style={styles.unitCity}>{row.localityName}</Text>}
                </View>
                {row.status && <UnitStatusBadge unit={row.status} />}
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {year != null && <Text style={styles.footnote}>{t('goals.myUnits.yearNote', { year })}</Text>}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  viewChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.mossTint,
  },
  viewChipText: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: '600', color: colors.mossSoft },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 6, lineHeight: 18 },
  empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 16, lineHeight: 19 },
  unitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  unitName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  unitCity: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 18,
  },
  centerBox: { alignItems: 'center', paddingTop: 80 },
});
