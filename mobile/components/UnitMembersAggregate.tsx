import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Label from './Label';
import { colors, fonts } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { fmtAmount } from '../utils/format';
import { notify } from '../utils/dialogs';
import {
  fetchMembersAggregate,
  sendMemberReminder,
  type ActiveGoal,
  type MembersAggregateResponse,
} from '../services/goalsApi';

/**
 * Détail NOMINATIF d'une assemblée (RG-BQ-05/06) — réservé aux dirigeants dont le périmètre Goals
 * couvre l'assemblée. ⚠ Un simple membre reçoit 403 même sur la sienne : ne monter ce bloc que
 * derrière un garde de rôle (côté membre, c'est `MyAssemblyBlock`, anonyme, qui s'affiche).
 *
 * <p>Ce que le chantier du 16/08 a retiré : le badge de source, la colonne « Cumul des membres »,
 * la colonne « Engagement du dirigeant » et le « Retenu (MAX) ». Il ne reste qu'UNE valeur par
 * catégorie — la somme des engagements des membres.
 *
 * <p>Ce qu'il a ajouté : le compteur « 7/12 membres ont soumis » et la liste des personnes en
 * retard, lues sur `roster` (parti des PERSONNES) et jamais sur `lines[].members` (parti des
 * ENGAGEMENTS, donc aveugle aux non-déclarants — précisément ceux qu'il faut relancer).
 */
export default function UnitMembersAggregate({
  unitId,
  year,
  goal,
  defaultExpanded = false,
}: {
  unitId: string;
  year: number;
  goal: ActiveGoal;
  defaultExpanded?: boolean;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [data, setData] = useState<MembersAggregateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  /** Une tentative a eu lieu — succès OU échec. Sans ce drapeau, un échec autre qu'un 403
   *  relancerait l'appel EN BOUCLE : `denied` reste false, `data` reste null, `loading` repasse à
   *  false, et l'effet se rejoue. Même remède que `MyAssemblyBlock` (goals/member.tsx). */
  const [loaded, setLoaded] = useState(false);
  const [reminding, setReminding] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Record<string, true>>({});

  useEffect(() => {
    setData(null);
    setDenied(false);
    setLoaded(false);
    setReminded({});
  }, [unitId, year]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchMembersAggregate(unitId, year));
      setDenied(false);
    } catch (e: any) {
      setData(null);
      setDenied(e?.response?.status === 403);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [unitId, year]);

  useEffect(() => {
    if (!expanded || loaded || loading) return;
    load();
  }, [expanded, loaded, loading, load]);

  const catById = new Map(goal.categories.map((c) => [c.id, c]));
  const fmtFor = (categoryId: string, v: number | null) => {
    if (v == null) return '—';
    const cat = catById.get(categoryId);
    return cat?.unitType === 'CURRENCY'
      ? fmtAmount(v, goal.defaultCurrency)
      : `${v} ${cat?.unitLabel ?? ''}`.trim();
  };

  /** Relance nominative — anti-spam 24 h côté serveur (REMINDER_ALREADY_SENT). */
  const onRemind = async (userId: string, fullName: string) => {
    setReminding(userId);
    try {
      await sendMemberReminder(userId);
      setReminded((r) => ({ ...r, [userId]: true }));
      notify(t('goals.members.reminderSentTitle'), t('goals.members.reminderSentBody', { name: fullName }));
    } catch (e: any) {
      const code = e?.response?.data?.error;
      notify(
        t('goals.members.reminderRefused'),
        code === 'MEMBER_ALREADY_SUBMITTED'
          ? t('errors.goals.MEMBER_ALREADY_SUBMITTED')
          : code === 'REMINDER_ALREADY_SENT'
            ? t('errors.goals.REMINDER_ALREADY_SENT')
            : e?.response?.data?.message ?? t('errors.tryAgain'),
      );
    } finally {
      setReminding(null);
    }
  };

  const pending = (data?.roster ?? []).filter((m) => !m.submitted);

  return (
    <Card variant="paper2" style={styles.card}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.header} hitSlop={6}>
        <Ionicons name="people-outline" size={18} color={colors.mossSoft} />
        <Text style={styles.title}>
          {expanded ? t('goals.members.hide') : t('goals.members.show')}
        </Text>
        {data != null && data.totalMembers > 0 && (
          <View style={[styles.counterPill, data.lateMembers > 0 && styles.counterPillLate]}>
            <Text style={[styles.counterPillText, data.lateMembers > 0 && styles.counterPillTextLate]}>
              {t('goals.members.submittedRatio', {
                submitted: data.submittedMembers,
                total: data.totalMembers,
              })}
            </Text>
          </View>
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 10 }}>
          {loading && <ActivityIndicator color={colors.moss} />}
          {!loading && denied && <Text style={styles.empty}>{t('goals.members.forbidden')}</Text>}
          {/* Échec autre qu'un refus : le dire. Sans ça, le bloc se dépliait sur du vide — l'appel
              avait échoué et rien ne le signalait. */}
          {!loading && !denied && loaded && data == null && (
            <Text style={styles.empty}>{t('goals.members.loadFailed')}</Text>
          )}
          {!loading && !denied && data != null && (
            <>
              <Text style={styles.counters}>
                {t('goals.members.counters', {
                  submitted: data.submittedMembers,
                  declared: data.membersWithPledges,
                  total: data.totalMembers,
                })}
              </Text>
              {data.lateMembers > 0 && (
                <Text style={styles.lateSummary}>
                  {t('goals.members.lateCount', { count: data.lateMembers })}
                </Text>
              )}

              {/* Qui n'a pas encore soumis — la liste part du ROSTER : elle contient donc aussi
                  les personnes qui n'ont RIEN déclaré, absentes de `lines[].members`. */}
              {pending.length > 0 && (
                <View style={styles.block}>
                  <Label style={{ marginBottom: 6 }}>{t('goals.members.pendingHeading')}</Label>
                  {pending.map((m) => (
                    <View key={m.userId} style={styles.rosterRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rosterName} numberOfLines={1}>{m.fullName}</Text>
                        <Text style={styles.rosterMeta}>
                          {m.hasPledges
                            ? t('goals.members.stateDeclared')
                            : t('goals.members.stateNothing')}
                        </Text>
                      </View>
                      {m.late && <Text style={styles.latePill}>{t('goals.members.latePill')}</Text>}
                      <Pressable
                        onPress={() => onRemind(m.userId, m.fullName)}
                        disabled={reminding === m.userId || reminded[m.userId] === true}
                        hitSlop={6}
                        style={styles.remindBtn}
                      >
                        <Text style={styles.remindText}>
                          {reminded[m.userId]
                            ? t('goals.members.reminded')
                            : t('goals.members.remind')}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {pending.length === 0 && data.totalMembers > 0 && (
                <Text style={styles.allSubmitted}>{t('goals.members.allSubmitted')}</Text>
              )}

              {/* Une ligne = UNE valeur : la somme des engagements des membres (RG-BQ-02). */}
              {data.lines.length === 0 && (
                <Text style={styles.empty}>{t('goals.members.noPledge')}</Text>
              )}
              {data.lines.map((line) => (
                <View key={line.categoryId} style={styles.line}>
                  <View style={styles.lineHead}>
                    <Text style={styles.lineCat}>
                      {catById.get(line.categoryId)?.name ?? line.categoryCode}
                    </Text>
                    <Text style={styles.lineValue}>
                      {fmtFor(line.categoryId, line.effectiveAmount ?? line.effectiveCount)}
                    </Text>
                  </View>
                  {line.members.map((m) => (
                    <View key={m.userId} style={styles.memberRow}>
                      <Text style={styles.memberName} numberOfLines={1}>{m.fullName}</Text>
                      {m.late && <Text style={styles.latePill}>{t('goals.members.latePill')}</Text>}
                      <Text style={styles.memberValue}>
                        {fmtFor(line.categoryId, m.amount ?? m.count)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 14, marginTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  counterPill: {
    backgroundColor: colors.mossTint,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
  },
  counterPillLate: { backgroundColor: 'rgba(201,149,107,0.22)' },
  counterPillText: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', color: colors.mossDeep },
  counterPillTextLate: { color: colors.earthDeep },
  counters: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  lateSummary: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.clay, marginTop: 3 },
  allSubmitted: {
    fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.mossSoft, marginTop: 8,
  },
  empty: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18, marginTop: 8 },
  block: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  rosterName: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink },
  rosterMeta: { fontFamily: fonts.sans, fontSize: 11, color: colors.ink3, marginTop: 1 },
  remindBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: colors.mossTint2,
  },
  remindText: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: '700', color: colors.mossDeep },
  latePill: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.clay, letterSpacing: 0.6,
    textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
    backgroundColor: 'rgba(176,90,62,0.13)', overflow: 'hidden',
  },
  line: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,38,32,0.06)',
  },
  lineHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  lineCat: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600', color: colors.ink },
  lineValue: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  memberName: { flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3 },
  memberValue: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink2, fontWeight: '600' },
});
