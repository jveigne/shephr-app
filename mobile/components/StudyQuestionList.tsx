import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Field from '@/components/Field';
import Button from '@/components/Button';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtPoints } from '@/utils/format';
import type { StudyAnswerView, StudyCopyDetail, StudyQuestionView, StudyVerdict } from '@/services/assemblyApi';
import type { Language } from '@/services/authApi';

/**
 * Étude de l'assemblée (plan 21/10, §6.3) — les questions d'une leçon et une copie, sous les quatre
 * formes dont ont besoin la séance, les résultats et la progression :
 * <ul>
 *   <li>`answer` — *Répondre* : saisie selon le type (contrat §2.3), sous-questions sous leur
 *       parent (RG-ETU-20), `CONSIGNE` en simple texte (RG-ETU-09) ;</li>
 *   <li>`review` — *Correction* sur le téléphone du compte connecté (RG-ETU-10) : fermées affichées
 *       corrigées, ouvertes répondues avec réponse donnée + réponse du manuel + *Juste* / *À
 *       préciser* / *À revoir* (RG-ETU-07) ;</li>
 *   <li>`read` — copie corrigée, en lecture ;</li>
 *   <li>`adjust` — dirigeant (D-ETU-07) : ajustement des points de toute question notée, même sans
 *       réponse, même séance terminée (D-ETU-12, RG-ETU-07b).</li>
 * </ul>
 * `maskPersonal` : RG-ETU-08 — une `PERSONNELLE` n'est JAMAIS montrée pendant l'échange des
 * téléphones (« Question personnelle — répondu ✓ ») ; seuls l'auteur et le dirigeant la lisent
 * ailleurs (RG-ETU-13). Aucune règle de notation n'est recalculée ici : les points viennent du serveur.
 */

/** Saisie d'une question telle que l'écran la tient (brouillon fusionné à la copie du serveur). */
export type StudyAnswerValue = Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'> &
  Partial<Pick<StudyAnswerView, 'points' | 'verdict' | 'auto' | 'adjusted'>>;

export type StudyListMode = 'answer' | 'review' | 'read' | 'adjust';

type Translate = (key: string, options?: any) => string;

/** RG-ETU-09 : une `CONSIGNE` ne se répond pas. */
export const isAnswerable = (q: StudyQuestionView) => q.type !== 'CONSIGNE';

/** Types notés : tous sauf `EXERCICE` et `CONSIGNE` (miroir de `StudyQuestion.graded()`). */
export const isGraded = (q: StudyQuestionView) => q.type !== 'EXERCICE' && q.type !== 'CONSIGNE';

const isPersonalYesNo = (q: StudyQuestionView) => q.type === 'PERSONNELLE' && q.answerFormat === 'YES_NO';
const isTextual = (q: StudyQuestionView) =>
  q.type === 'OUVERTE' || (q.type === 'PERSONNELLE' && !isPersonalYesNo(q));

/** « Répondue » au sens du contrat §2.3. */
export function isStudyAnswered(q: StudyQuestionView, a: StudyAnswerValue | undefined): boolean {
  if (!a || !isAnswerable(q)) return false;
  if (q.type === 'EXERCICE') return !!a.done;
  if (isTextual(q)) return !!a.valueText?.trim();
  return !!a.valueOptions && a.valueOptions.length > 0;
}

/** Choix proposés : Vrai/Faux, Oui/Non, ou les options « a. … » du manuel. */
function choicesOf(q: StudyQuestionView, t: Translate): { key: string; label: string }[] {
  if (q.type === 'VRAI_FAUX') return ['VRAI', 'FAUX'].map((k) => ({ key: k, label: t(`study.values.${k}`) }));
  if (q.type === 'OUI_NON' || isPersonalYesNo(q)) {
    return ['OUI', 'NON'].map((k) => ({ key: k, label: t(`study.values.${k}`) }));
  }
  if (q.type === 'CHOIX_UNIQUE' || q.type === 'CHOIX_MULTIPLE') {
    return (q.options ?? []).map((o) => ({ key: o.key, label: `${o.key}. ${o.label}` }));
  }
  return [];
}

const VERDICTS: StudyVerdict[] = ['JUSTE', 'A_PRECISER', 'A_REVOIR'];
const VERDICT_TONE: Record<StudyVerdict, string> = {
  JUSTE: colors.moss,
  A_PRECISER: colors.earthDeep,
  A_REVOIR: colors.clay,
};

export default function StudyQuestionList({
  questions,
  answers,
  mode,
  maskPersonal = false,
  showKey = false,
  disabled = false,
  busyQuestionId = null,
  onAnswer,
  onReview,
  onAdjust,
}: {
  questions: StudyQuestionView[];
  answers: Record<string, StudyAnswerValue | undefined>;
  mode: StudyListMode;
  maskPersonal?: boolean;
  /** Mode `answer` : réponses du manuel visibles (dirigeant seulement, RG-ETU-12). */
  showKey?: boolean;
  disabled?: boolean;
  busyQuestionId?: string | null;
  onAnswer?: (q: StudyQuestionView, value: Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'>) => void;
  onReview?: (q: StudyQuestionView, verdict: StudyVerdict) => void;
  onAdjust?: (q: StudyQuestionView, points: number) => Promise<boolean>;
}) {
  return (
    <View style={styles.list}>
      {questions.map((q) => (
        <QuestionBlock
          key={q.id}
          q={q}
          a={answers[q.id]}
          mode={mode}
          maskPersonal={maskPersonal}
          showKey={showKey}
          disabled={disabled}
          busy={busyQuestionId === q.id}
          onAnswer={onAnswer}
          onReview={onReview}
          onAdjust={onAdjust}
        />
      ))}
    </View>
  );
}

/**
 * Une copie ouverte en plein écran (résultats, progression) — RG-ETU-13 : seuls son auteur et le
 * dirigeant de l'assemblée la reçoivent du serveur. Hors échange des téléphones, la `PERSONNELLE`
 * s'y lit (RG-ETU-18). `onAdjust` (dirigeant) ouvre l'ajustement des points (RG-ETU-07b).
 *
 * <p>RG-ETU-08 (JP 21/10) : tant que la séance n'est pas `TERMINEE`, un téléphone peut être entre
 * les mains d'un voisin (échange de la correction) — la `PERSONNELLE` y reste masquée, même pour
 * le dirigeant ; elle se lit une fois la séance terminée.
 */
export function StudyCopySheet({
  copy,
  onAdjust,
  onClose,
}: {
  copy: StudyCopyDetail | null;
  onAdjust?: (q: StudyQuestionView, points: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  if (!copy) return null;
  const answers = Object.fromEntries(copy.copy.answers.map((a) => [a.questionId, a]));
  const s = copy.session;
  const maskPersonal = s.status !== 'TERMINEE';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
        >
          <View style={styles.sheetHead}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.back')}>
              <Ionicons name="close" size={24} color={colors.ink2} />
            </Pressable>
          </View>
          <Text style={styles.sheetKicker}>
            {s.lessonTitle
              ? t('study.lessonTitled', { number: s.lessonNumber, title: s.lessonTitle })
              : t('study.lesson', { number: s.lessonNumber })}
          </Text>
          <Text style={styles.sheetTitle}>{copy.copy.displayName}</Text>
          <Text style={styles.sheetScore}>
            {t('study.score', { score: fmtPoints(copy.copy.score, language), max: fmtPoints(copy.copy.maxScore, language) })}
          </Text>
          <View style={{ marginTop: 16 }}>
            <StudyQuestionList
              questions={copy.questions}
              answers={answers}
              mode={onAdjust ? 'adjust' : 'read'}
              maskPersonal={maskPersonal}
              onAdjust={onAdjust}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function QuestionBlock({
  q,
  a,
  mode,
  maskPersonal,
  showKey,
  disabled,
  busy,
  onAnswer,
  onReview,
  onAdjust,
}: {
  q: StudyQuestionView;
  a: StudyAnswerValue | undefined;
  mode: StudyListMode;
  maskPersonal: boolean;
  showKey: boolean;
  disabled: boolean;
  busy: boolean;
  onAnswer?: (q: StudyQuestionView, value: Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'>) => void;
  onReview?: (q: StudyQuestionView, verdict: StudyVerdict) => void;
  onAdjust?: (q: StudyQuestionView, points: number) => Promise<boolean>;
}) {
  const { t, language } = useLanguage();
  const answered = isStudyAnswered(q, a);
  const sub = !!q.parentId;

  // RG-ETU-09 : la consigne introduit les sous-questions, sans réponse ni points.
  if (q.type === 'CONSIGNE') {
    return (
      <View style={[styles.consigne, sub && styles.sub]}>
        {!!q.number && <Text style={styles.number}>{t('study.question.number', { number: q.number })}</Text>}
        <Text style={styles.consigneText}>{q.statement}</Text>
        {!!q.bibleReference && <Text style={styles.bible}>{q.bibleReference}</Text>}
      </View>
    );
  }

  // RG-ETU-08 : jamais affichée pendant l'échange des téléphones.
  if (maskPersonal && q.type === 'PERSONNELLE' && mode !== 'answer') {
    return (
      <View style={[styles.card, sub && styles.sub]}>
        <View style={styles.headRow}>
          <Text style={styles.number}>{t('study.question.number', { number: q.number })}</Text>
          <Ionicons
            name={answered ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={answered ? colors.moss : colors.ink3}
          />
        </View>
        <Text style={styles.masked}>
          {answered ? t('study.question.personalAnswered') : t('study.question.personalNotAnswered')}
        </Text>
      </View>
    );
  }

  const graded = isGraded(q);
  const corrected = mode !== 'answer';
  const keyKnown = q.answerKey != null || q.expectedAnswer != null;

  return (
    <View style={[styles.card, sub && styles.sub]}>
      <View style={styles.headRow}>
        <Text style={styles.number}>{t('study.question.number', { number: q.number })}</Text>
        {q.type === 'PERSONNELLE' && <Text style={styles.tag}>{t('study.types.PERSONNELLE')}</Text>}
        {q.type === 'EXERCICE' && <Text style={styles.tag}>{t('study.types.EXERCICE')}</Text>}
        <View style={{ flex: 1 }} />
        {graded && !corrected && (
          <Text style={styles.pointsMax}>{t('study.points', { count: q.points, value: fmtPoints(q.points, language) })}</Text>
        )}
        {graded && corrected && (
          <ScoreBadge
            points={a?.points ?? null}
            max={q.points}
            adjusted={!!a?.adjusted}
            pendingReview={q.type === 'OUVERTE' && answered && !a?.verdict && a?.points == null}
          />
        )}
      </View>
      <Text style={styles.statement}>{q.statement}</Text>
      {!!q.bibleReference && <Text style={styles.bible}>{q.bibleReference}</Text>}

      {mode === 'answer' ? (
        <AnswerInput q={q} a={a} disabled={disabled} onAnswer={onAnswer} />
      ) : (
        <CorrectedAnswer q={q} a={a} answered={answered} />
      )}

      {/* Réponse du manuel : correction (RG-ETU-12), ou dirigeant qui l'a demandée en séance. */}
      {(corrected || showKey) && keyKnown && <ManualAnswer q={q} corrected={corrected} />}

      {mode === 'review' && q.type === 'OUVERTE' && answered && (
        <View style={styles.verdictRow}>
          {VERDICTS.map((v) => {
            const selected = a?.verdict === v;
            const tone = VERDICT_TONE[v];
            return (
              <Pressable
                key={v}
                disabled={busy || disabled}
                onPress={() => onReview?.(q, v)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.verdictBtn,
                  { borderColor: tone, backgroundColor: selected ? tone : 'transparent' },
                  { opacity: busy || disabled ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.verdictText, { color: selected ? colors.white : tone }]}>
                  {t(`study.verdict.${v}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {mode !== 'review' && mode !== 'answer' && q.type === 'OUVERTE' && answered && (
        <Text style={[styles.verdictLabel, a?.verdict ? { color: VERDICT_TONE[a.verdict] } : null]}>
          {a?.verdict ? t(`study.verdict.${a.verdict}`) : t('study.question.noVerdict')}
        </Text>
      )}

      {mode === 'adjust' && graded && onAdjust && <AdjustRow q={q} a={a} onAdjust={onAdjust} />}
    </View>
  );
}

function AnswerInput({
  q,
  a,
  disabled,
  onAnswer,
}: {
  q: StudyQuestionView;
  a: StudyAnswerValue | undefined;
  disabled: boolean;
  onAnswer?: (q: StudyQuestionView, value: Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'>) => void;
}) {
  const { t } = useLanguage();
  const set = (value: Partial<Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'>>) =>
    onAnswer?.(q, { valueText: null, valueOptions: null, done: false, ...value });

  if (q.type === 'EXERCICE') {
    const done = !!a?.done;
    return (
      <ChoiceRow
        label={t('study.question.exerciseDone')}
        selected={done}
        multi
        disabled={disabled}
        onPress={() => set({ done: !done })}
      />
    );
  }
  if (isTextual(q)) {
    return (
      <Field
        value={a?.valueText ?? ''}
        onChangeText={(v) => set({ valueText: v })}
        placeholder={t('study.question.placeholder')}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        style={styles.textInput}
      />
    );
  }
  const multi = q.type === 'CHOIX_MULTIPLE';
  const chosen = a?.valueOptions ?? [];
  const toggle = (key: string) => {
    if (multi) {
      const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
      set({ valueOptions: next });
    } else {
      // Un second appui sur le choix retenu l'efface (« décocher », contrat §2.3).
      set({ valueOptions: chosen.includes(key) ? [] : [key] });
    }
  };
  return (
    <View style={styles.choices}>
      {choicesOf(q, t).map((c) => (
        <ChoiceRow
          key={c.key}
          label={c.label}
          selected={chosen.includes(c.key)}
          multi={multi}
          disabled={disabled}
          onPress={() => toggle(c.key)}
        />
      ))}
    </View>
  );
}

function ChoiceRow({
  label,
  selected,
  multi,
  disabled,
  onPress,
  tone,
  note,
}: {
  label: string;
  selected: boolean;
  multi: boolean;
  disabled?: boolean;
  onPress?: () => void;
  tone?: string;
  note?: string | null;
}) {
  const color = tone ?? (selected ? colors.moss : colors.ink3);
  const icon = multi
    ? selected
      ? 'checkbox'
      : 'square-outline'
    : selected
      ? 'radio-button-on'
      : 'radio-button-off';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled: disabled || !onPress }}
      style={({ pressed }) => [
        styles.choice,
        selected && { borderColor: color, backgroundColor: colors.mossTint },
        { opacity: disabled && onPress ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.choiceText}>{label}</Text>
      {!!note && <Text style={[styles.choiceNote, { color }]}>{note}</Text>}
    </Pressable>
  );
}

/** Réponse donnée, une fois corrigée : choix marqués juste / faux, texte, exercice fait. */
function CorrectedAnswer({
  q,
  a,
  answered,
}: {
  q: StudyQuestionView;
  a: StudyAnswerValue | undefined;
  answered: boolean;
}) {
  const { t } = useLanguage();
  if (q.type === 'EXERCICE') {
    return <Text style={styles.given}>{a?.done ? t('study.question.exerciseDoneMark') : t('study.question.exerciseNotDone')}</Text>;
  }
  if (isTextual(q)) {
    if (!answered) return <Text style={styles.noAnswer}>{t('study.question.noAnswer')}</Text>;
    return (
      <View style={styles.answerBox}>
        <Text style={styles.answerBoxLabel}>{t('study.question.given')}</Text>
        <Text style={styles.answerBoxText}>{a?.valueText}</Text>
      </View>
    );
  }
  const chosen = a?.valueOptions ?? [];
  const key = q.answerKey;
  const multi = q.type === 'CHOIX_MULTIPLE';
  return (
    <View style={styles.choices}>
      {!answered && <Text style={styles.noAnswer}>{t('study.question.noAnswer')}</Text>}
      {choicesOf(q, t).map((c) => {
        const selected = chosen.includes(c.key);
        const right = key ? key.includes(c.key) : null;
        // RG-ETU-05/06 : la note vient du serveur ; ici on ne fait que marquer les choix.
        const tone = right == null ? undefined : selected ? (right ? colors.moss : colors.clay) : right ? colors.moss : undefined;
        const note =
          right == null ? null : selected && !right ? t('study.question.wrong') : !selected && right ? t('study.question.expected') : null;
        if (!selected && !right) return null;
        return <ChoiceRow key={c.key} label={c.label} selected={selected} multi={multi} tone={tone} note={note} />;
      })}
    </View>
  );
}

/** Réponse du manuel : clé(s) pour les fermées, texte pour les ouvertes / personnelles. */
function ManualAnswer({ q, corrected }: { q: StudyQuestionView; corrected: boolean }) {
  const { t } = useLanguage();
  const closed = !isTextual(q) && q.type !== 'EXERCICE';
  if (closed) {
    // Corrigée, les choix sont déjà marqués juste / faux : la clé ne s'écrit que pour le dirigeant
    // en séance (« Afficher les réponses du manuel », RG-ETU-12).
    if (corrected || !q.answerKey?.length) return null;
    const labels = choicesOf(q, t);
    const text = q.answerKey.map((k) => labels.find((c) => c.key === k)?.label ?? k).join(' · ');
    return (
      <View style={[styles.answerBox, styles.manualBox]}>
        <Text style={[styles.answerBoxLabel, { color: colors.moss }]}>{t('study.question.manual')}</Text>
        <Text style={styles.answerBoxText}>{text}</Text>
      </View>
    );
  }
  if (!q.expectedAnswer) return null;
  return (
    <View style={[styles.answerBox, styles.manualBox]}>
      <Text style={[styles.answerBoxLabel, { color: colors.moss }]}>{t('study.question.manual')}</Text>
      <Text style={styles.answerBoxText}>{q.expectedAnswer}</Text>
    </View>
  );
}

function ScoreBadge({
  points,
  max,
  adjusted,
  pendingReview,
}: {
  points: number | null;
  max: number;
  adjusted: boolean;
  pendingReview: boolean;
}) {
  const { t, language } = useLanguage();
  return (
    <View style={styles.scoreBadgeRow}>
      {adjusted && <Text style={styles.tag}>{t('study.question.adjusted')}</Text>}
      <Text style={[styles.scoreBadge, pendingReview && { color: colors.earthDeep }]}>
        {t('study.score', { score: fmtPoints(points ?? (pendingReview ? null : 0), language), max: fmtPoints(max, language) })}
      </Text>
    </View>
  );
}

function AdjustRow({
  q,
  a,
  onAdjust,
}: {
  q: StudyQuestionView;
  a: StudyAnswerValue | undefined;
  onAdjust: (q: StudyQuestionView, points: number) => Promise<boolean>;
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = Number(value.replace(',', '.'));
  // RG-ETU-07b : points dans [0, points de la question] — le serveur juge aussi (STUDY_POINTS_OUT_OF_RANGE).
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= q.points;

  if (!open) {
    return (
      <Pressable
        onPress={() => {
          setValue(a?.points != null ? fmtPoints(a.points, language) : '');
          setOpen(true);
        }}
        hitSlop={6}
        style={styles.adjustLink}
      >
        <Ionicons name="create-outline" size={14} color={colors.moss} />
        <Text style={styles.adjustLinkText}>{t('study.results.adjust')}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.adjustRow}>
      <Field
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        placeholder={t('study.results.pointsRange', { max: fmtPoints(q.points, language) })}
        style={styles.adjustField}
      />
      <Button
        label={t('common.save')}
        height={44}
        disabled={!valid}
        loading={saving}
        onPress={async () => {
          setSaving(true);
          const ok = await onAdjust(q, Math.round(parsed * 100) / 100);
          setSaving(false);
          if (ok) setOpen(false);
        }}
      />
      <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel={t('common.cancel')}>
        <Ionicons name="close" size={20} color={colors.ink3} />
      </Pressable>
    </View>
  );
}

/**
 * D-ETU-26 (JP 21/10) — langues à marquer d'une pastille `FR` / `EN` : celles qui diffèrent de la
 * langue de référence (l'assemblée, ou l'appelant pour *Ma progression*, contrat §11.4). Sans
 * référence connue (vue d'ensemble, `StudyUnitProgress` ne portant pas la langue de l'assemblée),
 * on ne marque que les lignes faites dans plusieurs langues.
 */
export function studyLanguagesToMark(languages: Language[] | null | undefined, reference: string | null | undefined): Language[] {
  const list = languages ?? [];
  const ref = reference?.toUpperCase();
  if (ref === 'FR' || ref === 'EN') return list.filter((l) => l !== ref);
  return list.length > 1 ? list : [];
}

/** D-ETU-26 (JP 21/10) — pastille `FR` / `EN` d'une unité dont la langue diffère de l'assemblée. */
export function StudyLanguagePill({ language }: { language: Language }) {
  const { t } = useLanguage();
  return (
    <Text
      style={styles.languagePill}
      accessibilityLabel={t('study.language.pillA11y', { language: t(`study.language.names.${language}`) })}
    >
      {t(`study.language.${language}`)}
    </Text>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
    gap: 8,
  },
  // RG-ETU-20 : une sous-question (6.a) se lit sous son parent.
  sub: { marginLeft: 18, borderLeftWidth: 3, borderLeftColor: colors.mossTint2 },
  consigne: { paddingHorizontal: 4, paddingTop: 6, gap: 4 },
  consigneText: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 21, color: colors.ink2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { fontFamily: fonts.mono, fontSize: 12, color: colors.clay, letterSpacing: 0.6 },
  tag: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.ink3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: colors.mossTint,
    overflow: 'hidden',
  },
  pointsMax: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  scoreBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreBadge: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.moss },
  statement: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: colors.ink },
  bible: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13, color: colors.ink3 },
  masked: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2 },
  choices: { gap: 6 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.paper2,
  },
  choiceText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink, lineHeight: 19 },
  choiceNote: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: '600' },
  textInput: { minHeight: 84, fontSize: 15 },
  given: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2 },
  noAnswer: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 14, color: colors.ink3 },
  answerBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
    gap: 4,
  },
  manualBox: { backgroundColor: colors.mossTint, borderColor: colors.mossTint2 },
  answerBoxLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  answerBoxText: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 20, color: colors.ink },
  verdictRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  verdictBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  verdictText: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: '600' },
  verdictLabel: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink3 },
  adjustLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  adjustLinkText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adjustField: { flex: 1, paddingVertical: 10 },
  sheet: { flex: 1, backgroundColor: colors.parchment },
  sheetHead: { flexDirection: 'row', justifyContent: 'flex-end' },
  sheetKicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  sheetScore: { marginTop: 6, fontFamily: fonts.serif, fontSize: 30, color: colors.moss },
  languagePill: {
    alignSelf: 'flex-start',
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.earthDeep,
    backgroundColor: colors.mossTint,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },
});
