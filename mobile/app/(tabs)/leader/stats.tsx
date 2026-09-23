import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal } from 'react-native';

import { goBack } from '../../../utils/navigation';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText, G, Line, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Amount from '../../../components/Amount';
import Chip from '../../../components/Chip';
import ErrorBanner from '../../../components/ErrorBanner';
import Button from '../../../components/Button';
import { colors, fonts } from '../../../theme';
import {
  downloadExport,
  getByCategory,
  getByMonth,
  getByUnit,
  type DonationByCategoryStat,
  type DonationByMonthStat,
  type DonationByUnitStat,
  type ExportFormat,
} from '../../../services/statsApi';
import type { DeclarationStatus } from '../../../services/donationApi';
import { donationCategoryMeta } from '../../../constants/categories';
import { useDonationCategories } from '../../../hooks/useDonationCategories';
import { useLanguage } from '../../../contexts/LanguageContext';
import { notify } from '../../../utils/dialogs';
import { currencySymbol, fmtAmount, monthLabel } from '../../../utils/format';
import { sumByCurrency } from '../../../utils/currencyTotals';

// Recette 15/09 (JP) — « 1m » = LE MOIS EN COURS, ajouté en tête : la vue d'ensemble ne savait
// regarder qu'à partir de trois mois, alors que la question quotidienne du trésorier est
// « qu'a-t-on reçu CE mois-ci ». Placé en premier parce que c'est la lecture la plus fréquente.
type Period = '1m' | '3m' | '6m' | 'year';

const PERIODS: Period[] = ['1m', '3m', '6m', 'year'];

/**
 * Lot T8 (J-1, 14/09) — filtre de STATUT du tableau de bord. `ALL` n'est pas un statut : c'est
 * l'absence de filtre, et c'est ce que rendaient ces vues avant le lot T6 (aucune régression).
 * `VERIFIE` donne les totaux OFFICIELS — les seuls présentables devant un conseil d'assemblée.
 */
type StatusFilter = DeclarationStatus | 'ALL';

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'DECLARE', 'VERIFIE'];

/**
 * Statistiques de TRÉSORERIE — Lot T4 (14/09).
 *
 * `/donations/stats/by-month` et `/by-category` exigent depuis T2 une affectation de trésorier
 * active : un échec (403, réseau) est affiché tel quel, il ne se maquille plus en graphique vide.
 * La devise n'est plus figée à GBP : on lit celles réellement présentes et on en montre UNE à la
 * fois — additionner £, € et $ sur un même axe n'aurait aucun sens.
 */
export default function StatsScreen() {
  const { t } = useLanguage();
  // Lot T5 — la légende nomme les rubriques d'après le référentiel du ministère ; l'apparence
  // (ton du secteur) reste locale, via `donationCategoryMeta`.
  const { labelOf } = useDonationCategories();
  const periodLabel = (k: Period) => t('stats.periods.' + k);
  // Recette 15/09 (JP) — l'écran s'ouvre sur LE MOIS EN COURS (et non plus sur six mois) :
  // la première question du trésorier est « qu'a-t-on reçu ce mois-ci », l'historique se
  // consulte ensuite. Les autres périodes restent à un clic.
  const [period, setPeriod] = useState<Period>('1m');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [monthStats, setMonthStats] = useState<DonationByMonthStat[]>([]);
  const [catStats, setCatStats] = useState<DonationByCategoryStat[]>([]);
  const [unitStats, setUnitStats] = useState<DonationByUnitStat[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Lot T9 — l'export était livré côté serveur (csv · xlsx · pdf) mais n'avait AUCUN point
  // d'entrée dans l'app (réserve 0t.12 du cahier de recette) : `buildExportUrl` existait sans
  // être appelée nulle part. Le voici, branché sur la période et le statut DÉJÀ à l'écran —
  // on exporte ce qu'on regarde, il n'y a pas un deuxième jeu de filtres à tenir à jour.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    // `undefined` (et non la chaîne « ALL ») est omis par axios : la requête part alors telle
    // qu'elle partait avant le lot T6.
    const filter = status === 'ALL' ? undefined : status;
    try {
      const [m, c, u] = await Promise.all([
        getByMonth(undefined, filter),
        getByCategory({ status: filter }),
        getByUnit({ status: filter }),
      ]);
      setMonthStats(m);
      setCatStats(c);
      setUnitStats(u);
    } catch {
      setMonthStats([]);
      setCatStats([]);
      setUnitStats([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // Devises réellement présentes, de la plus grosse à la plus petite ; la première sert de défaut.
  const currencies = useMemo(
    () => sumByCurrency([...monthStats, ...catStats, ...unitStats]).map((l) => l.currency),
    [monthStats, catStats, unitStats],
  );
  const active = currency && currencies.includes(currency) ? currency : currencies[0] ?? null;

  const windowSize = period === '1m' ? 1 : period === '3m' ? 3 : period === '6m' ? 6 : 12;

  /**
   * Bornes de l'export = la fenêtre affichée. `from` au 1er du mois le plus ancien, `to` à
   * aujourd'hui — le serveur attend des dates ISO (`@DateTimeFormat(ISO.DATE)`).
   */
  const exportRange = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - (windowSize - 1), 1);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(first), to: iso(now) };
  }, [windowSize]);

  const runExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await downloadExport(format, {
        ...exportRange,
        status: status === 'ALL' ? undefined : status,
      });
      setExportOpen(false);
    } catch (e: any) {
      // `SHARING_UNAVAILABLE` : l'appareil n'offre pas de feuille de partage (rare, le fichier
      // est bien produit) — on le dit, plutôt que d'échouer en silence.
      notify(
        t('stats.exportFailedTitle'),
        e?.message === 'SHARING_UNAVAILABLE'
          ? t('stats.exportNoSharing')
          : e?.response?.data?.message ?? t('stats.exportFailedBody'),
      );
    } finally {
      setExporting(null);
    }
  };

  const months = useMemo(() => {
    if (!active) return [];
    return monthStats
      .filter((m) => m.currency === active)
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .slice(-windowSize)
      .map((m) => ({ label: monthLabel(m.month - 1), value: m.total }));
  }, [monthStats, windowSize, active]);

  const unitLines = unitStats
    .filter((u) => u.currency === active)
    .sort((a, b) => b.total - a.total);

  const totalWindow = months.reduce((s, m) => s + m.value, 0);
  const max = Math.max(...months.map((m) => m.value), 1);

  const categoryTotal = catStats
    .filter((c) => c.currency === active)
    .reduce((s, c) => s + c.total, 0);
  const splits = catStats
    .filter((c) => c.currency === active)
    .sort((a, b) => b.total - a.total)
    .map((c) => ({
      key: c.category,
      pct: categoryTotal > 0 ? Math.round((c.total / categoryTotal) * 100) : 0,
    }));

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('stats.headerTitle')}</Text>
        <Pressable
          onPress={() => setExportOpen(true)}
          hitSlop={10}
          accessibilityLabel={t('stats.export')}
        >
          <Ionicons name="download-outline" size={21} color={colors.mossDeep} />
        </Pressable>
      </View>

      <Text style={styles.title}>{t('stats.title')}</Text>
      <Text style={styles.subtitle}>{t('stats.subtitle')}</Text>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 18 }}>
        {PERIODS.map((p) => (
          <Chip
            key={p}
            label={periodLabel(p)}
            selected={period === p}
            onPress={() => setPeriod(p)}
          />
        ))}
      </View>

      {/* Lot T8 — le STATUT en filtre (§8b.15 de docs/donations-recette.md). */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={t(`treasury.filter.${s}`)}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
      <Text style={styles.statusHint}>
        {status === 'VERIFIE' ? t('stats.officialHint') : t('stats.allStatusHint')}
      </Text>

      {/* Sélecteur de devise : n'apparaît que s'il y a réellement plusieurs devises déclarées. */}
      {currencies.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {currencies.map((c) => (
            <Chip
              key={c}
              label={`${currencySymbol(c)} ${c}`}
              selected={active === c}
              onPress={() => setCurrency(c)}
            />
          ))}
        </View>
      )}

      {failed && <ErrorBanner message={t('stats.loadError')} onRetry={load} />}

      {loading ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : (
        <>
          <Card style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Label style={{ color: colors.mossSoft }}>{t('stats.donationsReceived')}</Label>
                {active ? (
                  <Amount value={totalWindow} currency={active} size={28} />
                ) : (
                  <Text style={styles.chartHint}>{t('leader.noDataPeriod')}</Text>
                )}
                <Text style={styles.chartHint}>{t('stats.rolling', { count: months.length })}</Text>
              </View>
            </View>
            <BarChart months={months} max={max} currency={active} />
          </Card>

          <Card style={styles.donutCard}>
            <Label style={{ color: colors.mossSoft }}>{t('stats.categorySplit')}</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14 }}>
              <Donut segments={splits} />
              <View style={{ flex: 1, gap: 9 }}>
                {splits.map((s) => {
                  const cat = donationCategoryMeta(s.key);
                  return (
                    <View key={s.key} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: cat.tone }]} />
                      <Text style={styles.legendLabel}>{labelOf(s.key)}</Text>
                      <Text style={styles.legendPct}>{s.pct}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </Card>

          {/* Lot T8 — totaux PAR ASSEMBLÉE, dans la devise affichée. Le trésorier d'une ville ou
              d'une région en a besoin pour rendre compte nœud par nœud ; celui d'une assemblée n'y
              voit qu'une ligne, et c'est normal. */}
          <Card style={styles.donutCard}>
            <Label style={{ color: colors.mossSoft }}>{t('stats.byUnit')}</Label>
            <View style={{ marginTop: 12, gap: 10 }}>
              {unitLines.length === 0 ? (
                <Text style={styles.chartHint}>{t('leader.noDataPeriod')}</Text>
              ) : (
                unitLines.map((u) => (
                  <View key={u.unitId} style={styles.unitRow}>
                    <Text style={styles.unitName} numberOfLines={1}>
                      {u.unitName}
                    </Text>
                    <Text style={styles.unitAmount}>
                      {active ? fmtAmount(u.total, active) : '—'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </Card>
        </>
      )}

      {/* Choix du format. Les trois que sert `DonationExportController` — un format inconnu y
          vaut 400, on ne propose donc que ceux-là. La période et le statut ne sont PAS
          redemandés : ce sont ceux de l'écran, affichés en rappel sous le titre. */}
      <Modal
        visible={exportOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setExportOpen(false)}
      >
        <Pressable style={styles.exportBackdrop} onPress={() => setExportOpen(false)}>
          <Pressable style={styles.exportSheet} onPress={() => {}}>
            <Text style={styles.exportTitle}>{t('stats.exportTitle')}</Text>
            <Text style={styles.exportHint}>
              {t('stats.exportScope', {
                period: periodLabel(period),
                status: t(`treasury.filter.${status}`),
              })}
            </Text>
            {(['xlsx', 'pdf', 'csv'] as ExportFormat[]).map((f) => (
              <Button
                key={f}
                label={t(`stats.exportFormat.${f}`)}
                variant={f === 'xlsx' ? 'primary' : 'soft'}
                fullWidth
                loading={exporting === f}
                disabled={exporting !== null}
                style={{ marginTop: 10 }}
                onPress={() => runExport(f)}
              />
            ))}
            <Pressable
              onPress={() => setExportOpen(false)}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={styles.exportCancel}>{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function BarChart({
  months,
  max,
  currency,
}: {
  months: { label: string; value: number }[];
  max: number;
  currency: string | null;
}) {
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
              {compactAmount(mo.value, currency)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Étiquette courte d'axe : le symbole vient de la devise affichée, jamais d'un « £ » en dur. */
function compactAmount(value: number, currency: string | null): string {
  const symbol = currency ? currencySymbol(currency) : '';
  return value >= 1000
    ? `${symbol}${(value / 1000).toFixed(1)}k`
    : `${symbol}${Math.round(value)}`;
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
    const cat = donationCategoryMeta(s.key);
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
  exportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,18,14,0.55)',
    justifyContent: 'flex-end',
  },
  exportSheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  exportTitle: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink, letterSpacing: -0.3 },
  exportHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 6 },
  exportCancel: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink3 },
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
  statusHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 8, lineHeight: 17 },
  unitRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  unitName: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2 },
  unitAmount: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.ink },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  legendPct: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink3 },
});
