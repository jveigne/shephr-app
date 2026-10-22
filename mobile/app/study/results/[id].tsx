import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import Field from '@/components/Field';
import SelectField from '@/components/SelectField';
import ErrorBanner from '@/components/ErrorBanner';
import { StudyCopySheet } from '@/components/StudyQuestionList';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  addStudyPaperCopy,
  adjustStudyAnswer,
  deleteStudyPaperCopy,
  getStudyCopy,
  getStudyResults,
  studyErrorMessage,
  updateStudyPaperCopy,
  type StudyCopyDetail,
  type StudyCopyResult,
  type StudyQuestionView,
  type StudySessionResults,
} from '@/services/assemblyApi';
import { fmtPoints, toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { confirmDialog, notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';

/**
 * Étude de l'assemblée (plan 21/10, §6.3) — RÉSULTATS d'une séance.
 *
 * <p>RG-ETU-14 : liste des copies (nom, source, note) pour tout lecteur de l'assemblée
 * (`canView`), jamais leur contenu. Pour le DIRIGEANT (`leader`, D-ETU-07) :
 * <ul>
 *   <li>*Ajouter une copie papier* (D-ETU-13) — un répondant sans copie (`withoutCopy`) et sa note,
 *       même séance terminée (rattrapage d'un absent) ; note ≤ max (STUDY_SCORE_OUT_OF_RANGE) ;</li>
 *   <li>modifier / supprimer une note papier ;</li>
 *   <li>ouvrir une copie APP (RG-ETU-13, réponses personnelles comprises — RG-ETU-18) et ajuster les
 *       points de toute question notée, à tout moment (D-ETU-12, RG-ETU-07b).</li>
 * </ul>
 * L'auteur d'une copie peut aussi ouvrir la sienne (RG-ETU-13), en lecture.
 */
export default function StudyResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === 'string' ? id : '';
  const { t, language } = useLanguage();
  const { me } = useAuth();

  const [results, setResults] = useState<StudySessionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copy, setCopy] = useState<StudyCopyDetail | null>(null);
  const [copyLoading, setCopyLoading] = useState<string | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  const [editing, setEditing] = useState<StudyCopyResult | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setResults(await getStudyResults(sessionId));
      setError(null);
    } catch (e: any) {
      setError(studyErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }, [sessionId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const openCopy = async (c: StudyCopyResult) => {
    if (copyLoading) return;
    setCopyLoading(c.id);
    try {
      setCopy(await getStudyCopy(c.id));
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
    } finally {
      setCopyLoading(null);
    }
  };

  const onAdjust = async (q: StudyQuestionView, points: number): Promise<boolean> => {
    if (!copy) return false;
    try {
      setCopy(await adjustStudyAnswer(copy.copy.id, q.id, points));
      void load();
      return true;
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
      return false;
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
    </View>
  );

  if (loading && !results) {
    return (
      <ScreenShell withTabBar={false}>
        {header}
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  if (!results) {
    return (
      <ScreenShell withTabBar={false}>
        {header}
        <ErrorBanner message={error ?? t('study.errors.generic')} onRetry={load} />
      </ScreenShell>
    );
  }

  const s = results.session;
  const leader = results.leader;
  const lesson = s.lessonTitle
    ? t('study.lessonTitled', { number: s.lessonNumber, title: s.lessonTitle })
    : t('study.lesson', { number: s.lessonNumber });
  const day = fmtIsoDay(toLocalDate(new Date(s.finishedAt ?? s.openedAt)), t);

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={<RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {header}
      <Text style={styles.kicker}>{t('study.results.kicker')}</Text>
      <Text style={styles.title}>{lesson}</Text>
      <Text style={styles.subtitle}>
        {[s.unitName, day, t(`study.status.${s.status}`)].filter(Boolean).join(' · ')}
      </Text>
      <Text style={styles.meta}>
        {[s.moduleCode, s.moduleName].filter(Boolean).join(' · ')} — {t('study.results.outOf', { max: fmtPoints(s.maxScore, language) })}
      </Text>

      {!!error && <ErrorBanner message={error} onRetry={load} />}

      {leader && (
        <Button
          label={t('study.results.addPaper')}
          variant="soft"
          fullWidth
          height={46}
          style={{ marginTop: 16 }}
          disabled={results.withoutCopy.length === 0}
          iconLeft={<Ionicons name="document-text-outline" size={18} color={colors.mossDeep} />}
          onPress={() => setPaperOpen(true)}
        />
      )}
      {leader && results.withoutCopy.length === 0 && (
        <Text style={styles.muted}>{t('study.results.noneWithout')}</Text>
      )}

      <Label style={styles.blockLabel}>{t('study.results.copies', { count: results.copies.length })}</Label>
      {results.copies.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="people-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('study.results.noCopies')}</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {results.copies.map((c) => {
            const paper = c.source === 'PAPIER';
            const mine = c.userId === me?.id;
            // RG-ETU-13 : le contenu d'une copie APP n'est lisible que par son auteur et le dirigeant.
            const onPress = leader
              ? paper
                ? () => setEditing(c)
                : () => void openCopy(c)
              : mine && !paper
                ? () => void openCopy(c)
                : undefined;
            return (
              <Pressable
                key={c.id}
                onPress={onPress}
                disabled={!onPress}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.displayName}
                    </Text>
                    {paper && <Text style={styles.paperPill}>{t('study.results.paper')}</Text>}
                  </View>
                  {!paper && (
                    <Text style={styles.rowMeta}>{t('study.results.answeredCount', { count: c.answeredCount })}</Text>
                  )}
                </View>
                {copyLoading === c.id ? (
                  <ActivityIndicator color={colors.moss} />
                ) : (
                  <Text style={styles.score}>
                    {t('study.score', { score: fmtPoints(c.score, language), max: fmtPoints(c.maxScore, language) })}
                  </Text>
                )}
                {onPress && <Ionicons name="chevron-forward" size={18} color={colors.ink3} />}
              </Pressable>
            );
          })}
        </View>
      )}

      <StudyCopySheet
        copy={copy}
        onAdjust={leader ? onAdjust : undefined}
        onClose={() => setCopy(null)}
      />
      {leader && (
        <PaperModal
          visible={paperOpen}
          results={results}
          onClose={() => setPaperOpen(false)}
          onSaved={() => {
            setPaperOpen(false);
            void load();
          }}
        />
      )}
      {leader && (
        <EditPaperModal
          key={editing?.id ?? 'none'}
          copy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </ScreenShell>
  );
}

/** Note saisie : nombre ≥ 0 et ≤ max (STUDY_SCORE_OUT_OF_RANGE), 2 décimales au plus. */
function parseScore(value: string, max: number): number | null {
  const n = Number(value.replace(',', '.'));
  if (value.trim() === '' || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

/** D-ETU-13 — copie papier d'un répondant sans copie (note seule). */
function PaperModal({
  visible,
  results,
  onClose,
  onSaved,
}: {
  visible: boolean;
  results: StudySessionResults;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const options = results.withoutCopy.map((m) => ({ id: m.userId, name: m.fullName }));
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [score, setScore] = useState('');
  const [saving, setSaving] = useState(false);
  const max = results.session.maxScore;
  const parsed = parseScore(score, max);

  const close = () => {
    setPick(null);
    setScore('');
    onClose();
  };

  const save = async () => {
    if (!pick || parsed == null) return;
    setSaving(true);
    try {
      await addStudyPaperCopy(results.session.id, { userId: pick.id, score: parsed });
      setPick(null);
      setScore('');
      onSaved();
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('study.results.addPaper')}</Text>
          <Text style={styles.modalHint}>{t('study.results.addPaperHint')}</Text>
          {/* `inline` : une liste déroulante en modale DANS une modale bloquerait l'écran (SelectField). */}
          <SelectField label={t('study.results.member')} options={options} pick={pick} onChange={setPick} inline />
          <Label style={{ marginTop: 12, marginBottom: 6 }}>{t('study.results.scoreOutOf', { max: fmtPoints(max, language) })}</Label>
          <Field value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="0" />
          {score.trim() !== '' && parsed == null && (
            <Text style={styles.invalid}>{t('study.results.invalidScore', { max: fmtPoints(max, language) })}</Text>
          )}
          <Button
            label={t('common.save')}
            onPress={save}
            loading={saving}
            disabled={!pick || parsed == null}
            fullWidth
            height={48}
            style={{ marginTop: 16 }}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={close} fullWidth height={44} style={{ marginTop: 8 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Modifier / supprimer la note d'une copie PAPIER (une copie APP se règle question par question). */
function EditPaperModal({
  copy,
  onClose,
  onSaved,
}: {
  copy: StudyCopyResult | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  // Monté avec `key = copy.id` : la note initiale est reprise à chaque ouverture.
  const [score, setScore] = useState(copy ? fmtPoints(copy.score, language) : '');
  const [busy, setBusy] = useState(false);
  if (!copy) return null;
  const parsed = parseScore(score, copy.maxScore);

  const save = async () => {
    if (parsed == null) return;
    setBusy(true);
    try {
      await updateStudyPaperCopy(copy.id, parsed);
      onSaved();
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog(
      t('study.results.deletePaper'),
      t('study.results.deletePaperConfirm', { name: copy.displayName }),
      t('common.delete'),
      true,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteStudyPaperCopy(copy.id);
      onSaved();
    } catch (e: any) {
      notify(t('study.tile.title'), studyErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{copy.displayName}</Text>
          <Text style={styles.modalHint}>{t('study.results.editPaper')}</Text>
          <Label style={{ marginTop: 12, marginBottom: 6 }}>
            {t('study.results.scoreOutOf', { max: fmtPoints(copy.maxScore, language) })}
          </Label>
          <Field value={score} onChangeText={setScore} keyboardType="decimal-pad" />
          {parsed == null && (
            <Text style={styles.invalid}>{t('study.results.invalidScore', { max: fmtPoints(copy.maxScore, language) })}</Text>
          )}
          <Button
            label={t('common.save')}
            onPress={save}
            loading={busy}
            disabled={parsed == null}
            fullWidth
            height={48}
            style={{ marginTop: 16 }}
          />
          <Button label={t('study.results.deletePaper')} variant="danger" onPress={remove} disabled={busy} fullWidth height={44} style={{ marginTop: 8 }} />
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} fullWidth height={44} style={{ marginTop: 8 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, marginTop: 6 },
  meta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  blockLabel: { marginTop: 22, marginBottom: 8 },
  muted: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3 },
  empty: { paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flexShrink: 1, fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  paperPill: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.earthDeep,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.earth,
    overflow: 'hidden',
  },
  score: { fontFamily: fonts.mono, fontSize: 14, color: colors.moss },
  backdrop: { flex: 1, backgroundColor: colors.mossDeep + 'B3', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, letterSpacing: -0.3 },
  modalHint: { marginTop: 4, marginBottom: 12, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  invalid: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12.5, color: colors.clay },
});
