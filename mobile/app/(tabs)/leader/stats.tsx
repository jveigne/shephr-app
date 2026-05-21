import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText, G, Line, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Amount from '../../../components/Amount';
import Chip from '../../../components/Chip';
import { colors, fonts } from '../../../theme';
import {
  getByCategory,
  getByMonth,
  type DonationByCategoryStat,
  type DonationByMonthStat,
} from '../../../services/statsApi';
import { CATEGORIES, type DonationCategory } from '../../../constants/categories';
import { monthLabel } from '../../../utils/format';

type Period = '3m' | '6m' | 'year';
const PRIMARY = 'GBP';

const PERIODS: { key: Period; label: string }[] = [
  { key: '3m', label: '3 mois' },
  { key: '6m', label: '6 mois' },
  { key: 'year', label: 'Année' },
];

export default function StatsScreen() {
  const [period, setPeriod] = useState<Period>('6m');
  const [monthStats, setMonthStats] = useState<DonationByMonthStat[]>([]);
  const [catStats, setCatStats] = useState<DonationByCategoryStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [m, c] = await Promise.all([getByMonth(), getByCategory({})]);
        setMonthStats(m);
        setCatStats(c);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const windowSize = period === '3m' ? 3 : period === '6m' ? 6 : 12;

  const months = useMemo(() => {
    return monthStats
      .filter((m) => m.currency === PRIMARY)
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .slice(-windowSize)
      .map((m) => ({ label: monthLabel(m.month - 1), value: m.total }));
  }, [monthStats, windowSize]);

  const totalWindow = months.reduce((s, m) => s + m.value, 0);
  const max = Math.max(...months.map((m) => m.value), 1);

  const categoryTotal = catStats
    .filter((c) => c.currency === PRIMARY)
    .reduce((s, c) => s + c.total, 0);
  const splits = catStats
    .filter((c) => c.currency === PRIMARY)
    .sort((a, b) => b.total - a.total)
    .map((c) => ({
      key: c.category,
      pct: categoryTotal > 0 ? Math.round((c.total / categoryTotal) * 100) : 0,
    }));

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <Text style={styles.headerTitle}>Statistiques</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.title}>Vue d'ensemble</Text>
      <Text style={styles.subtitle}>Tendances de générosité sur votre périmètre.</Text>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 18 }}>
        {PERIODS.map((p) => (
          <Chip
            key={p.key}
            label={p.label}
            selected={period === p.key}
            onPress={() => setPeriod(p.key)}
          />
        ))}
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : (
        <>
          <Card style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Label style={{ color: colors.mossSoft }}>Dons reçus</Label>
                <Amount value={totalWindow} currency={PRIMARY} size={28} />
                <Text style={styles.chartHint}>cumul sur {months.length} mois</Text>
              </View>
            </View>
            <BarChart months={months} max={max} />
          </Card>

          <Card style={styles.donutCard}>
            <Label style={{ color: colors.mossSoft }}>Répartition par catégorie</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14 }}>
              <Donut segments={splits} />
              <View style={{ flex: 1, gap: 9 }}>
                {splits.map((s) => {
                  const cat =
                    CATEGORIES[s.key as DonationCategory] ?? CATEGORIES.autre;
                  return (
                    <View key={s.key} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: cat.tone }]} />
                      <Text style={styles.legendLabel}>{cat.fr}</Text>
                      <Text style={styles.legendPct}>{s.pct}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </Card>
        </>
      )}
    </ScreenShell>
  );
}

function BarChart({ months, max }: { months: { label: string; value: number }[]; max: number }) {
  const W = 320, H = 160, padL = 6, padR = 0, padT = 20, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const gap = 10;
  const barW = months.length > 0 ? (innerW - gap * (months.length - 1)) / months.length : 0;
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={170} style={{ marginTop: 8 }}>
      <Defs>
        <LinearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#2E5142" />
          <Stop offset="1" stopColor="#1E3A2F" />
        </LinearGradient>
      </Defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <Line
          key={i}
          x1={padL}
          y1={padT + innerH * (1 - p)}
          x2={W - padR}
          y2={padT + innerH * (1 - p)}
          stroke="rgba(42,38,32,0.07)"
          strokeWidth={1}
          strokeDasharray={i === 0 ? undefined : '2 3'}
        />
      ))}
      {months.map((mo, i) => {
        const x = padL + i * (barW + gap);
        const h = (mo.value / max) * innerH;
        const y = padT + innerH - h;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={h} rx={6} fill="url(#barGrad)" />
            <SvgText
              x={x + barW / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize={10}
              fill={colors.ink3}
              fontFamily={fonts.sans}
            >
              {mo.label}
            </SvgText>
            <SvgText
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize={10}
              fill={colors.mossSoft}
              fontFamily={fonts.mono}
              fontWeight="600"
            >
              £{(mo.value / 1000).toFixed(1)}k
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function Donut({ segments, size = 120 }: { segments: { key: string; pct: number }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const ir = r - 18;

  const polar = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius];
  };

  let acc = 0;
  const paths = segments.map((s) => {
    const start = acc;
    acc += s.pct;
    const end = acc;
    const a1 = start * 3.6;
    const a2 = end * 3.6;
    const [x1, y1] = polar(a1, r);
    const [x2, y2] = polar(a2, r);
    const [x3, y3] = polar(a2, ir);
    const [x4, y4] = polar(a1, ir);
    const large = end - start > 50 ? 1 : 0;
    const cat = CATEGORIES[s.key as DonationCategory] ?? CATEGORIES.autre;
    return (
      <Path
        key={s.key + start}
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${large} 0 ${x4} ${y4} Z`}
        fill={cat.tone}
      />
    );
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <Circle cx={cx} cy={cy} r={ir - 2} fill={colors.paper} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink2 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.4,
    marginTop: 6,
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 4 },
  chartCard: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 18 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartHint: { fontFamily: fonts.sans, fontSize: 11, color: colors.ink3, marginTop: 4 },
  donutCard: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 14 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  legendPct: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink3 },
});
