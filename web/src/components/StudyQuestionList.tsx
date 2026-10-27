import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import type {
  StudyAnswerView,
  StudyQuestionView,
  StudySessionSummary,
  StudyVerdict,
} from '../services/assemblyApi';

// ---------------------------------------------------------------------------------------------
//  Étude de l'assemblée — les questions d'une leçon et une copie (port web de
//  `mobile/components/StudyQuestionList.tsx`, D-WEB-02, JP 27/10 : D-ETU-14 levée).
//  Trois modes (l'ajustement des points du dirigeant reste dans `StudyCopyModal` de Study.tsx) :
//   - `answer` — *Répondre* : saisie selon le type (contrat §2.3), sous-questions sous leur parent
//     (RG-ETU-20), `CONSIGNE` en simple texte (RG-ETU-09) ;
//   - `review` — *Correction* sur l'écran du compte connecté (RG-ETU-10) : fermées affichées
//     corrigées (points / verdict DU SERVEUR), ouvertes répondues avec réponse donnée + réponse du
//     manuel + *Juste* / *À préciser* / *À revoir* (RG-ETU-07) ;
//   - `read` — copie corrigée, en lecture.
//  `maskPersonal` : RG-ETU-08 — une `PERSONNELLE` n'est JAMAIS montrée pendant l'échange des écrans
//  (« Question personnelle — répondu ✓ »). RG-ETU-12 : la réponse du manuel n'est affichée que si le
//  serveur l'a envoyée (`answerKey` / `expectedAnswer` non null). Aucune note n'est calculée ici.
// ---------------------------------------------------------------------------------------------

/** Saisie d'une question telle que la page la tient (brouillon fusionné à la copie du serveur). */
export type StudyAnswerValue = Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'> &
  Partial<Pick<StudyAnswerView, 'points' | 'verdict' | 'auto' | 'adjusted'>>;

export type StudyAnswerChange = Pick<StudyAnswerView, 'valueText' | 'valueOptions' | 'done'>;

export type StudyListMode = 'answer' | 'review' | 'read';

type TFn = ReturnType<typeof useTranslation>['t'];

/** RG-ETU-09 : une `CONSIGNE` ne se répond pas. */
export const isAnswerable = (q: StudyQuestionView) => q.type !== 'CONSIGNE';

/** Types notés : tous sauf `EXERCICE` et `CONSIGNE` (miroir de `StudyQuestion.graded()`). */
export const isGraded = (q: StudyQuestionView) => q.type !== 'EXERCICE' && q.type !== 'CONSIGNE';

const isPersonalYesNo = (q: StudyQuestionView) => q.type === 'PERSONNELLE' && q.answerFormat === 'YES_NO';
const isTextual = (q: StudyQuestionView) => q.type === 'OUVERTE' || (q.type === 'PERSONNELLE' && !isPersonalYesNo(q));

/** « Répondue » au sens du contrat §2.3 (même règle que le mobile). */
export function isStudyAnswered(q: StudyQuestionView, a: StudyAnswerValue | undefined): boolean {
  if (!a || !isAnswerable(q)) return false;
  if (q.type === 'EXERCICE') return !!a.done;
  if (isTextual(q)) return !!a.valueText?.trim();
  return !!a.valueOptions && a.valueOptions.length > 0;
}

/** D-ETU-38 (JP 23/10) : questions de premier niveau (bornes possibles d'une plage). */
export function topLevelOf(questions: StudyQuestionView[]): StudyQuestionView[] {
  return questions.filter((q) => !q.parentId && !!q.number);
}

/**
 * D-ETU-38/40 (JP 23/10) — plage affichée : bornes du serveur, sinon première / dernière question de
 * premier niveau reçue (avant la correction, la fin de la leçon). Null si rien n'est connu.
 */
export function studyRangeOf(
  s: Pick<StudySessionSummary, 'firstQuestionNumber' | 'lastQuestionNumber'>,
  questions: StudyQuestionView[],
): { first: string; last: string } | null {
  const top = topLevelOf(questions);
  const first = s.firstQuestionNumber || top[0]?.number;
  const last = s.lastQuestionNumber || top[top.length - 1]?.number;
  return first && last ? { first, last } : null;
}

/** Points : 2 décimales au plus, sans zéro inutile (contrat §1.1). */
export function fmtStudyPoints(n: number | null | undefined, lang: string): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n);
}

/** Choix proposés : Vrai/Faux, Oui/Non, ou les options « a. … » du manuel. */
function choicesOf(q: StudyQuestionView, t: TFn): { key: string; label: string }[] {
  if (q.type === 'VRAI_FAUX') return ['VRAI', 'FAUX'].map((k) => ({ key: k, label: t(`assembly.study.answer.${k}`) }));
  if (q.type === 'OUI_NON' || isPersonalYesNo(q)) {
    return ['OUI', 'NON'].map((k) => ({ key: k, label: t(`assembly.study.answer.${k}`) }));
  }
  if (q.type === 'CHOIX_UNIQUE' || q.type === 'CHOIX_MULTIPLE') {
    return (q.options ?? []).map((o) => ({ key: o.key, label: `${o.key}. ${o.label}` }));
  }
  return [];
}

const VERDICTS: StudyVerdict[] = ['JUSTE', 'A_PRECISER', 'A_REVOIR'];
const VERDICT_TONE: Record<StudyVerdict, string> = {
  JUSTE: 'var(--ok)',
  A_PRECISER: 'var(--warn)',
  A_REVOIR: 'var(--err)',
};

const card: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 'var(--radius)',
  background: 'var(--ivory-card)',
  border: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
// RG-ETU-20 : une sous-question (6.a) se lit sous son parent.
const sub: CSSProperties = { marginLeft: 22, borderLeft: '3px solid var(--green-100)' };
const numberStyle: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--earth-700)', letterSpacing: 0.6 };
const tagStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: 'var(--ink-500)',
  padding: '1px 6px',
  borderRadius: 99,
  background: 'var(--green-50)',
};
const boxLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'var(--ink-500)',
};
const answerBox: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--ivory)',
  border: '1px solid var(--line-soft)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const manualBox: CSSProperties = { ...answerBox, background: 'var(--green-50)', borderColor: 'var(--green-100)' };

export function StudyQuestionList({
  questions,
  answers,
  mode,
  maskPersonal = false,
  showKey = false,
  disabled = false,
  busyQuestionId = null,
  onAnswer,
  onReview,
}: {
  questions: StudyQuestionView[];
  answers: Record<string, StudyAnswerValue | undefined>;
  mode: StudyListMode;
  maskPersonal?: boolean;
  /** Mode `answer` : réponses du manuel visibles (dirigeant seulement, RG-ETU-12 — si le serveur les envoie). */
  showKey?: boolean;
  disabled?: boolean;
  busyQuestionId?: string | null;
  onAnswer?: (q: StudyQuestionView, value: StudyAnswerChange) => void;
  onReview?: (q: StudyQuestionView, verdict: StudyVerdict) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
        />
      ))}
    </div>
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
}: {
  q: StudyQuestionView;
  a: StudyAnswerValue | undefined;
  mode: StudyListMode;
  maskPersonal: boolean;
  showKey: boolean;
  disabled: boolean;
  busy: boolean;
  onAnswer?: (q: StudyQuestionView, value: StudyAnswerChange) => void;
  onReview?: (q: StudyQuestionView, verdict: StudyVerdict) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const answered = isStudyAnswered(q, a);
  const isSub = !!q.parentId;

  // RG-ETU-09 : la consigne introduit les sous-questions, sans réponse ni points.
  if (q.type === 'CONSIGNE') {
    return (
      <div style={{ padding: '6px 4px 0', display: 'flex', flexDirection: 'column', gap: 4, ...(isSub ? { marginLeft: 22 } : {}) }}>
        {q.number && <span style={numberStyle}>{t('assembly.study.answer.number', { number: q.number })}</span>}
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink-700)', whiteSpace: 'pre-wrap' }}>
          {q.statement}
        </span>
        {q.bibleReference && <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-500)' }}>{q.bibleReference}</span>}
      </div>
    );
  }

  // RG-ETU-08 : jamais affichée pendant l'échange des écrans ni dans la lecture de séance.
  if (maskPersonal && q.type === 'PERSONNELLE' && mode !== 'answer') {
    return (
      <div style={{ ...card, ...(isSub ? sub : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={numberStyle}>{t('assembly.study.answer.number', { number: q.number })}</span>
          <span style={{ color: answered ? 'var(--ok)' : 'var(--ink-400)', display: 'inline-flex' }}>
            <Icon name={answered ? 'check' : 'x'} size={13} />
          </span>
        </div>
        <span style={{ fontSize: 14, color: 'var(--ink-700)' }}>
          {answered ? t('assembly.study.answer.personalAnswered') : t('assembly.study.answer.personalNotAnswered')}
        </span>
      </div>
    );
  }

  const graded = isGraded(q);
  const corrected = mode !== 'answer';
  const keyKnown = q.answerKey != null || q.expectedAnswer != null;
  // RG-ETU-07 : avis en correction sur une ouverte répondue.
  const verdictButtons = mode === 'review' && q.type === 'OUVERTE' && answered;
  const pendingReview = q.type === 'OUVERTE' && answered && !a?.verdict && a?.points == null;

  return (
    <div style={{ ...card, ...(isSub ? sub : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={numberStyle}>{t('assembly.study.answer.number', { number: q.number })}</span>
        {q.type === 'PERSONNELLE' && <span style={tagStyle}>{t('assembly.study.type.PERSONNELLE')}</span>}
        {q.type === 'EXERCICE' && <span style={tagStyle}>{t('assembly.study.type.EXERCICE')}</span>}
        <span style={{ flex: 1 }} />
        {graded && !corrected && (
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
            {t('assembly.study.answer.points', { count: q.points, value: fmtStudyPoints(q.points, lang) })}
          </span>
        )}
        {graded && corrected && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {a?.adjusted && <span style={tagStyle}>{t('assembly.study.answer.adjusted')}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: pendingReview ? 'var(--warn)' : 'var(--green-700)' }}>
              {t('assembly.study.scoreOf', {
                score: pendingReview && a?.points == null ? '—' : fmtStudyPoints(a?.points ?? 0, lang),
                max: fmtStudyPoints(q.points, lang),
              })}
            </span>
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-900)', whiteSpace: 'pre-wrap' }}>{q.statement}</div>
      {q.bibleReference && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-500)' }}>{q.bibleReference}</div>
      )}

      {mode === 'answer' ? (
        <AnswerInput q={q} a={a} disabled={disabled} onAnswer={onAnswer} />
      ) : (
        <CorrectedAnswer q={q} a={a} answered={answered} />
      )}

      {/* Réponse du manuel : correction (RG-ETU-12), ou dirigeant qui l'a demandée en séance. */}
      {(corrected || showKey) && keyKnown && <ManualAnswer q={q} corrected={corrected} />}

      {verdictButtons && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          {VERDICTS.map((v) => {
            const selected = a?.verdict === v;
            const tone = VERDICT_TONE[v];
            return (
              <button
                key={v}
                type="button"
                disabled={busy || disabled}
                aria-pressed={selected}
                onClick={() => onReview?.(q, v)}
                style={{
                  flex: '1 1 110px',
                  padding: '9px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1.5px solid ${tone}`,
                  background: selected ? tone : 'transparent',
                  color: selected ? 'var(--ivory-raised)' : tone,
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: busy || disabled ? 'default' : 'pointer',
                  opacity: busy || disabled ? 0.55 : 1,
                }}
              >
                {t(`assembly.study.verdict.${v}`)}
              </button>
            );
          })}
        </div>
      )}
      {!verdictButtons && corrected && q.type === 'OUVERTE' && answered && (
        <span style={{ fontSize: 13, fontWeight: 600, color: a?.verdict ? VERDICT_TONE[a.verdict] : 'var(--ink-500)' }}>
          {a?.verdict ? t(`assembly.study.verdict.${a.verdict}`) : t('assembly.study.answer.noVerdict')}
        </span>
      )}
    </div>
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
  onAnswer?: (q: StudyQuestionView, value: StudyAnswerChange) => void;
}) {
  const { t } = useTranslation();
  const set = (value: Partial<StudyAnswerChange>) => onAnswer?.(q, { valueText: null, valueOptions: null, done: false, ...value });

  if (q.type === 'EXERCICE') {
    const done = !!a?.done;
    return <ChoiceRow label={t('assembly.study.answer.done')} selected={done} multi disabled={disabled} onClick={() => set({ done: !done })} />;
  }
  if (isTextual(q)) {
    return (
      <textarea
        className="textarea"
        value={a?.valueText ?? ''}
        onChange={(e) => set({ valueText: e.target.value })}
        placeholder={t('assembly.study.answer.placeholder')}
        disabled={disabled}
        rows={4}
        style={{ width: '100%', minHeight: 90, resize: 'vertical' }}
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
      // Un second clic sur le choix retenu l'efface (« décocher », contrat §2.3).
      set({ valueOptions: chosen.includes(key) ? [] : [key] });
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role={multi ? 'group' : 'radiogroup'}>
      {choicesOf(q, t).map((c) => (
        <ChoiceRow key={c.key} label={c.label} selected={chosen.includes(c.key)} multi={multi} disabled={disabled} onClick={() => toggle(c.key)} />
      ))}
    </div>
  );
}

function ChoiceRow({
  label,
  selected,
  multi,
  disabled,
  onClick,
  tone,
  note,
}: {
  label: ReactNode;
  selected: boolean;
  multi: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tone?: string;
  note?: string | null;
}) {
  const color = tone ?? (selected ? 'var(--green-700)' : 'var(--ink-400)');
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      disabled={!interactive}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${selected ? color : 'var(--line)'}`,
        background: selected ? 'var(--green-50)' : 'var(--ivory)',
        color: 'var(--ink-900)',
        fontSize: 14,
        cursor: interactive ? 'pointer' : 'default',
        opacity: disabled && onClick ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          flex: '0 0 18px',
          borderRadius: multi ? 4 : '50%',
          border: `2px solid ${color}`,
          background: selected ? color : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ivory-raised)',
        }}
      >
        {selected && multi && <Icon name="check" size={11} />}
        {selected && !multi && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ivory-raised)' }} />}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {note && <span style={{ fontSize: 11.5, fontWeight: 600, color }}>{note}</span>}
    </button>
  );
}

/** Réponse donnée, une fois corrigée : choix marqués juste / faux, texte, exercice fait. */
function CorrectedAnswer({ q, a, answered }: { q: StudyQuestionView; a: StudyAnswerValue | undefined; answered: boolean }) {
  const { t } = useTranslation();
  const none = <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-500)' }}>{t('assembly.study.answer.noAnswer')}</span>;
  if (q.type === 'EXERCICE') {
    return <span style={{ fontSize: 14, color: 'var(--ink-700)' }}>{a?.done ? t('assembly.study.answer.doneMark') : t('assembly.study.answer.notDone')}</span>;
  }
  if (isTextual(q)) {
    if (!answered) return none;
    return (
      <div style={answerBox}>
        <span style={boxLabel}>{t('assembly.study.answer.given')}</span>
        <span style={{ fontSize: 14.5, whiteSpace: 'pre-wrap' }}>{a?.valueText}</span>
      </div>
    );
  }
  const chosen = a?.valueOptions ?? [];
  const key = q.answerKey;
  const multi = q.type === 'CHOIX_MULTIPLE';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {!answered && none}
      {choicesOf(q, t).map((c) => {
        const selected = chosen.includes(c.key);
        const right = key ? key.includes(c.key) : null;
        // RG-ETU-05/06 : la note vient du serveur ; ici on ne fait que marquer les choix.
        const tone = right == null ? undefined : selected ? (right ? 'var(--ok)' : 'var(--err)') : right ? 'var(--ok)' : undefined;
        const note =
          right == null ? null : selected && !right ? t('assembly.study.answer.wrong') : !selected && right ? t('assembly.study.answer.expected') : null;
        if (!selected && !right) return null;
        return <ChoiceRow key={c.key} label={c.label} selected={selected} multi={multi} tone={tone} note={note} />;
      })}
    </div>
  );
}

/** Réponse du manuel : clé(s) pour les fermées, texte pour les ouvertes / personnelles. */
function ManualAnswer({ q, corrected }: { q: StudyQuestionView; corrected: boolean }) {
  const { t } = useTranslation();
  const closed = !isTextual(q) && q.type !== 'EXERCICE';
  if (closed) {
    // Corrigée, les choix sont déjà marqués juste / faux : la clé ne s'écrit que pour le dirigeant
    // en séance (« Afficher les réponses du manuel », RG-ETU-12).
    if (corrected || !q.answerKey?.length) return null;
    const labels = choicesOf(q, t);
    const text = q.answerKey.map((k) => labels.find((c) => c.key === k)?.label ?? k).join(' · ');
    return (
      <div style={manualBox}>
        <span style={{ ...boxLabel, color: 'var(--green-700)' }}>{t('assembly.study.answer.manual')}</span>
        <span style={{ fontSize: 14.5 }}>{text}</span>
      </div>
    );
  }
  if (!q.expectedAnswer) return null;
  return (
    <div style={manualBox}>
      <span style={{ ...boxLabel, color: 'var(--green-700)' }}>{t('assembly.study.answer.manual')}</span>
      <span style={{ fontSize: 14.5, whiteSpace: 'pre-wrap' }}>{q.expectedAnswer}</span>
    </div>
  );
}

/**
 * D-ETU-37 (JP 23/10) : recommandations au dirigeant en TEXTE BRUT — pas de Markdown, retours à la
 * ligne conservés (`white-space: pre-wrap`). Rien si le texte est vide.
 */
export function StudyNotesText({ title, text }: { title?: string; text: string | null | undefined }) {
  if (!text || !text.trim()) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {title && <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 15.5, color: 'var(--green-800)' }}>{title}</strong>}
      <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-700)', whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
}

/**
 * D-ETU-36 (JP 23/10) : « Cette semaine, chaque membre doit : » — liste des `memberActions` (texte
 * brut, D-ETU-37). Rien si la liste est vide.
 */
export function StudyMemberActions({ actions, title }: { actions: string[] | null | undefined; title?: string }) {
  const { t } = useTranslation();
  const list = (actions ?? []).filter((a) => a && a.trim());
  if (list.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 15.5, color: 'var(--green-800)' }}>
        {title ?? t('assembly.study.memberActionsTitle')}
      </strong>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--ink-700)' }}>
        {list.map((a, i) => (
          <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{a}</li>
        ))}
      </ul>
    </div>
  );
}
