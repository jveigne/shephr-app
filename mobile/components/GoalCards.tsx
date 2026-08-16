import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from './ScreenShell';
import Card from './Card';
import Label from './Label';
import Button from './Button';
import HandDivider from './HandDivider';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { goalCategoryMeta } from '../constants/goalCategories';
import { fmtAmount } from '../utils/format';
import type { GoalLine } from '../hooks/useGoalsData';

/**
 * Primitives partagées des écrans Objectifs.
 *
 * <p>Extraites de `app/(tabs)/goals/index.tsx` au chantier « objectifs individuels » (JP 16/08) :
 * l'écran d'engagement d'assemblée qui les hébergeait a disparu (RG-BQ-11), et les laisser dans un
 * `index.tsx` réduit à du routage aurait obligé chaque écran à importer depuis une route.
 */

/**
 * Titre d'un écran Objectifs, avec flèche de retour (JP 16/08).
 *
 * <p>Les vues de LECTURE (« Mon périmètre », « Mes assemblées ») s'atteignent depuis « Mes
 * objectifs » : sans flèche on y restait bloqué — la barre d'onglets ramène sur l'onglet, pas sur
 * l'écran précédent. La flèche n'apparaît que s'il y a quelque chose à dépiler : ces mêmes écrans
 * servent aussi d'écran d'ENTRÉE de l'onglet pour un compte sans assemblée.
 */
export function GoalScreenTitle({ title }: { title: string }) {
  return (
    <View style={styles.titleRow}>
      {router.canGoBack() && (
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
      )}
      <Ionicons name="flag-outline" size={22} color={colors.mossSoft} />
      <Text style={styles.screenTitle}>{title}</Text>
    </View>
  );
}

/** Sélecteur d'année (Lot 4.6, révisé G1.c) — chips des années VISIBLES. */
export function YearSelector({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (y: number) => void;
}) {
  return (
    <View style={styles.yearRow}>
      {years.map((y) => {
        const active = y === value;
        return (
          <Pressable
            key={y}
            onPress={() => onChange(y)}
            style={[styles.yearChip, active && styles.yearChipActive]}
          >
            <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>
              {y}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Carte d'une catégorie d'objectif personnel. {@code showProgress=false} masque le couple
 * « Engagé / Versé » et la barre.
 */
export function GoalLineCard({
  line,
  currency,
  onPress,
  showProgress = true,
}: {
  line: GoalLine;
  currency: string;
  onPress: () => void;
  showProgress?: boolean;
}) {
  const { t } = useLanguage();
  const meta = goalCategoryMeta(line.category.code);
  const { pledge, achieved, target } = line;
  const isCurrency = line.category.unitType === 'CURRENCY';
  // #5 : si le versé dépasse l'engagé, la barre DÉBORDE au-delà de 100% (vert jusqu'à l'objectif, earth au-delà).
  const rawPct = target != null && target > 0 ? Math.round((achieved / target) * 100) : 0;
  const over = rawPct > 100;
  const denom = Math.max(100, rawPct);
  const basePct = (Math.min(rawPct, 100) / denom) * 100;
  const overPct = over ? ((rawPct - 100) / denom) * 100 : 0;
  const goalLinePct = (100 / denom) * 100;

  const fmtValue = (v: number) =>
    isCurrency ? fmtAmount(v, currency) : `${v} ${line.category.unitLabel ?? ''}`.trim();

  return (
    <Card onPress={onPress} style={styles.lineCard}>
      <View style={styles.lineHead}>
        <View style={[styles.lineIcon, { backgroundColor: meta.tone + '1F' }]}>
          <Ionicons name={meta.icon} size={18} color={meta.tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lineName}>{line.category.name}</Text>
          <Text style={styles.lineMeta}>
            {pledge == null
              ? t('goals.lineToComplete')
              : pledge.locked
              ? t('goals.lineSubmitted')
              : t('goals.lineDraft')}
          </Text>
        </View>
        {pledge?.locked && <Ionicons name="lock-closed" size={14} color={colors.ink3} />}
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </View>
      {pledge != null && !showProgress && (
        <>
          <HandDivider style={{ marginVertical: 10 }} />
          <View style={styles.lineFooter}>
            <View>
              <Label>{t('goals.pledged')}</Label>
              <Text style={styles.lineValue}>{target != null ? fmtValue(target) : '—'}</Text>
            </View>
          </View>
        </>
      )}
      {pledge != null && showProgress && (
        <>
          <HandDivider style={{ marginVertical: 10 }} />
          <View style={styles.lineFooter}>
            <View>
              <Label>{t('goals.pledged')}</Label>
              <Text style={styles.lineValue}>{target != null ? fmtValue(target) : '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Label>{t('goals.given')}</Label>
              <Text style={styles.lineValue}>{fmtValue(achieved)}</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${basePct}%`, backgroundColor: meta.tone }]} />
            {over && (
              <View style={[styles.barFill, { width: `${overPct}%`, backgroundColor: colors.earthDeep }]} />
            )}
            {over && <View style={[styles.goalMark, { left: `${goalLinePct}%` }]} />}
          </View>
          <Text style={[styles.pctText, over && styles.pctOver]}>{rawPct}%</Text>
        </>
      )}
    </Card>
  );
}

/** État vide plein écran, avec une action facultative. */
export function GoalEmptyState({
  icon,
  title,
  hint,
  onRetry,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  onRetry?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <ScreenShell>
      <View style={styles.centerBox}>
        <View style={styles.emptyBubble}>
          <Ionicons name={icon} size={30} color={colors.mossSoft} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyHint}>{hint}</Text>
        {actionLabel && onAction && (
          <Button label={actionLabel} onPress={onAction} style={{ marginTop: 20 }} />
        )}
        {onRetry && (
          <Button label={t('common.retry')} variant="ghost" onPress={onRetry} style={{ marginTop: 18 }} />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  screenTitle: { flex: 1, fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  yearChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.06)',
  },
  yearChipActive: { backgroundColor: colors.moss },
  yearChipText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  yearChipTextActive: { color: colors.white },
  lineCard: { paddingHorizontal: 16, paddingVertical: 14 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineName: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  lineMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  lineValue: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 2 },
  barTrack: {
    height: 6,
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 10,
  },
  barFill: { height: '100%' },
  goalMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  pctText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    marginTop: 4,
    textAlign: 'right',
  },
  pctOver: { color: colors.earthDeep },
  centerBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.mossTint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
  },
});
