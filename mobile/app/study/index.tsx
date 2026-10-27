import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Button from '@/components/Button';
import ErrorBanner from '@/components/ErrorBanner';
import Field from '@/components/Field';
import {
  StudyLanguagePill,
  StudyMemberActions,
  StudyNotesText,
  studyLanguagesToMark,
} from '@/components/StudyQuestionList';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  finishStudySession,
  getStudyCatalog,
  getStudyMe,
  getStudyProgressOverview,
  listStudySessions,
  openStudySession,
  studyErrorCode,
  studyErrorMessage,
  type StudyAssembly,
  type StudyAssemblyOverview,
  type StudyCatchUp,
  type StudyLesson,
  type StudySessionSummary,
  type StudyUnitForAssembly,
} from '@/services/assemblyApi';
import { toLocalDate } from '@/utils/format';
import { fmtIsoDay } from '@/utils/meetingReport';
import { confirmDialog, notify } from '@/utils/dialogs';
import { goBack } from '@/utils/navigation';
import { cityOpen, type CityEntry as CityFollowUpCity } from '@/utils/cityFollowUp';
import { useCityFollowUp } from '@/hooks/useCityFollowUp';

/**
 * Étude de l'assemblée (plan 21/10, §6.3) — ACCUEIL de la tuile « Le Message de Bertoua ».
 *
 * <p>D-ETU-50 (JP 27/10, lève D-ETU-28 pour ces usages) : l'étude est GRATUITE — atteinte depuis
 * l'accueil par tout compte rattaché (`isAttachedAccount`, porté par `hasStudy`), sans abonnement
 * STUDY. Le contenu suit le rôle, tel que le dit `GET /study/me` :
 * <ul>
 *   <li>DIRIGEANT de l'assemblée (`leader`, D-ETU-07) — séance en cours (*Reprendre*) ou
 *       *Commencer* : unité → leçon, leçons faites cochées, unité verrouillée si son prérequis
 *       n'est pas fini dans l'assemblée (D-ETU-19) ; une séance oubliée qui bloque l'ouverture est
 *       proposée à *Terminer* (D-ETU-22) ; séances passées (→ résultats) et avancement ;</li>
 *   <li>RÉPONDANT (`participant`, D-ETU-06) — séance en cours (*Répondre* / *Corriger*) ou « Aucune
 *       étude en cours » ; *Ma progression* (D-ETU-10) ;</li>
 *   <li>sans assemblée (niveaux au-dessus, LEADER, SECRETARIAT) — avancement des assemblées du
 *       périmètre (`/study/progress`, D-ETU-08), jamais le contenu des copies.</li>
 * </ul>
 * Pas de react-query : useState + useFocusEffect.
 *
 * <p>Avenant 05 (lot ETU11, JP 23/10) — une leçon en plusieurs séances :
 * <ul>
 *   <li>D-ETU-38/39 : une leçon commencée (séances TERMINEE de cette leçon dans l'assemblée, sans
 *       être faite) affiche les plages déjà traitées et *Continuer* ; à *Commencer*, la feuille
 *       propose le point de départ : à la suite (défaut du SERVEUR, `startQuestionNumber` omis),
 *       « Reprendre au début » (première question de la plus ancienne séance de la leçon) ou une
 *       question choisie (numéro saisi, validé par le serveur — STUDY_QUESTION_INVALID) ;</li>
 *   <li>D-ETU-44/45 : bloc « À rattraper » (`catchUps` de `/study/me`) → l'écran de séance en mode
 *       rattrapage ;</li>
 *   <li>séances terminées : la plage de chacune (« questions 1 à 20 »).</li>
 * </ul>
 *
 * <p>D-ETU-49 (JP 23/10, avenant 05 §8) : le catalogue `?unitId=` porte `nextQuestionNumber` et
 * `topLevelNumbers` de chaque leçon. Quand ils sont là, la feuille *Commencer* s'ouvre TOUJOURS (dès
 * la première séance) : aperçu « questions 21 à 57 » ou « toute la leçon », puis sélecteur de la
 * question de départ sur `topLevelNumbers` (défaut `nextQuestionNumber`, sinon la première). La
 * question choisie part toujours en `startQuestionNumber`, défaut compris (le serveur ouvre ainsi la
 * plage annoncée par l'aperçu, même après « Terminer l'oubliée »). Sans ces champs (backend
 * antérieur à ETU11b), le contournement du lot ETU11 reste : plages déjà traitées et choix « à la
 * suite / au début / numéro saisi », pour une leçon déjà commencée seulement.
 *
 * <p>Lot « pro-plan » (contrat 27/10 §9.3, §12.2) — entrée « Suivi de la ville » (`app/study/city`)
 * si `GET /study/localities` ∪ `GET /assembly/localities` est non vide (JP 28/10 : même règle que
 * l'écran et le menu web, `hooks/useCityFollowUp`) : la liste est vide pour un membre et pour un
 * dirigeant d'unité (RG-ABO-22), l'entrée ne leur apparaît donc jamais. Cadenas si aucune ville
 * n'ouvre ni l'étude ni le journal. L'entrée existe aussi en tuile d'accueil (`(tabs)/home`).
 */
export default function StudyHomeScreen() {
  const { t } = useLanguage();
  const { me, hasStudy } = useAuth();
  // D-ETU-50 (JP 27/10) : `hasStudy` = compte rattaché (étude gratuite) ; `isAttachedAccount` gardé
  // pour un binaire dont le contexte serait antérieur.
  const active = hasStudy && isAttachedAccount(me);

  const [assemblies, setAssemblies] = useState<StudyAssembly[]>([]);
  const [catalogs, setCatalogs] = useState<Record<string, StudyUnitForAssembly[]>>({});
  const [sessions, setSessions] = useState<Record<string, StudySessionSummary[]>>({});
  const [overview, setOverview] = useState<StudyAssemblyOverview[]>([]);
  // D-ABO-21 / RG-ABO-22 (JP 27/10) : villes dont le compte est responsable (suivi de la ville).
  const { cities: localities } = useCityFollowUp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // D-ETU-35 (JP 23/10) : feuille « À lire avant la leçon » en attente de *Commencer*.
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  const load = useCallback(async () => {
    if (!active) {
      setLoading(false);
      return;
    }
    try {
      const { assemblies: list } = await getStudyMe();
      setAssemblies(list);
      const led = list.filter((a) => a.leader);
      const [cats, sess] = await Promise.all([
        Promise.all(led.map((a) => getStudyCatalog(a.unitId))),
        Promise.all(led.map((a) => listStudySessions(a.unitId))),
      ]);
      setCatalogs(Object.fromEntries(led.map((a, i) => [a.unitId, cats[i]])));
      setSessions(Object.fromEntries(led.map((a, i) => [a.unitId, sess[i]])));
      setOverview(list.length === 0 ? await getStudyProgressOverview() : []);
      setError(null);
    } catch (e: any) {
      setError(studyErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }, [active, t]);

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

  const openSession = (id: string) => router.push({ pathname: '/study/session/[id]', params: { id } });

  /**
   * *Commencer* (D-ETU-07). D-ETU-35 (JP 23/10) : s'il y a quelque chose à lire — recommandations de
   * l'unité (première séance de l'unité dans l'assemblée seulement : aucune leçon de l'unité dans
   * `doneChapterIds`), de la leçon, aperçu des actions des membres — la feuille « À lire avant la
   * leçon » remplace la confirmation ; sans aucun texte, la confirmation est inchangée.
   */
  const onStart = async (unitId: string, u: StudyUnitForAssembly, lesson: StudyLesson) => {
    if (opening) return;
    const firstOfUnit = !u.unit.lessons.some((l) => u.doneChapterIds.includes(l.chapterId));
    // D-ETU-39 (JP 23/10) : séances déjà tenues sur cette leçon (plus récentes d'abord, §4.7).
    const past = pastOfLesson(sessions[unitId] ?? [], lesson.chapterId);
    const next: Briefing = {
      unitId,
      lesson,
      unitNotes: firstOfUnit ? blankToNull(u.unit.leaderNotes) : null,
      lessonNotes: blankToNull(lesson.leaderNotes),
      memberActions: (lesson.memberActions ?? []).filter((a) => a && a.trim()),
      pastRanges: rangesOf(past, t),
      beginning: past.length > 0 ? past[past.length - 1].firstQuestionNumber || null : null,
      lessonDone: u.doneChapterIds.includes(lesson.chapterId),
    };
    // D-ETU-49 (JP 23/10) : avec les numéros de la leçon, la feuille porte l'aperçu et le départ.
    const withPreview = topLevelOf(lesson).length > 0;
    if (
      withPreview ||
      next.unitNotes ||
      next.lessonNotes ||
      next.memberActions.length > 0 ||
      next.pastRanges.length > 0
    ) {
      setBriefing(next);
      return;
    }
    const ok = await confirmDialog(
      t('study.home.startTitle'),
      t('study.home.startConfirm', { lesson: lessonLabelOf(t, lesson.number, lesson.title) }),
      t('study.home.start'),
    );
    if (ok) await doStart(unitId, lesson);
  };

  /**
   * Ouverture ; sur STUDY_SESSION_ALREADY_OPEN, propose de *Terminer* l'oubliée (D-ETU-22).
   * D-ETU-39 (JP 23/10) : `start` absent = point de départ par défaut du serveur.
   */
  const doStart = async (unitId: string, lesson: StudyLesson, start?: string | null) => {
    if (opening) return;
    setOpening(lesson.chapterId);
    try {
      const created = await openStudySession(unitId, lesson.chapterId, start);
      openSession(created.session.id);
    } catch (e: any) {
      if (studyErrorCode(e) !== 'STUDY_SESSION_ALREADY_OPEN') {
        notify(t('study.tile.title'), studyErrorMessage(e, t));
        return;
      }
      try {
        // Contrat §4.3 : relire `/study/me` pour retrouver la séance qui bloque.
        const fresh = await getStudyMe();
        setAssemblies(fresh.assemblies);
        const current = fresh.assemblies.find((a) => a.unitId === unitId)?.currentSession;
        if (!current) {
          notify(t('study.tile.title'), studyErrorMessage(e, t));
          return;
        }
        const forgotten = current.lessonTitle
          ? t('study.lessonTitled', { number: current.lessonNumber, title: current.lessonTitle })
          : t('study.lesson', { number: current.lessonNumber });
        const finish = await confirmDialog(
          t('study.home.forgottenTitle'),
          t('study.home.forgottenBody', { lesson: forgotten }),
          t('study.home.finishAndStart'),
        );
        if (!finish) return;
        await finishStudySession(current.id);
        const created = await openStudySession(unitId, lesson.chapterId, start);
        openSession(created.session.id);
      } catch (e2: any) {
        notify(t('study.tile.title'), studyErrorMessage(e2, t));
        void load();
      }
    } finally {
      setOpening(null);
    }
  };

  const anyParticipant = assemblies.some((a) => a.participant);

  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={
        active ? <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>{t('study.kicker')}</Text>
      <Text style={styles.title}>{t('study.tile.title')}</Text>

      {!active ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          {/* D-ETU-50 (JP 27/10) : l'étude est gratuite — seul le rattachement manque ici. */}
          <Text style={styles.emptyText}>{t('study.home.joinRequired')}</Text>
          <Text style={styles.link} onPress={() => router.push('/(auth)/join')}>
            {t('study.home.join')}
          </Text>
        </Card>
      ) : loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : (
        <>
          {!!error && <ErrorBanner message={error} onRetry={load} />}

          {assemblies.map((a) => (
            <AssemblySection
              key={a.unitId}
              assembly={a}
              showName={assemblies.length > 1}
              catalog={catalogs[a.unitId] ?? []}
              sessions={sessions[a.unitId] ?? []}
              opening={opening}
              onOpenSession={openSession}
              onStart={(u, lesson) => void onStart(a.unitId, u, lesson)}
            />
          ))}

          {briefing && (
            <BriefingSheet
              briefing={briefing}
              onClose={() => setBriefing(null)}
              onConfirm={(start) => {
                const b = briefing;
                setBriefing(null);
                void doStart(b.unitId, b.lesson, start);
              }}
            />
          )}

          {anyParticipant && (
            <Button
              label={t('study.home.myProgress')}
              variant="ghost"
              fullWidth
              height={48}
              style={{ marginTop: 20 }}
              iconLeft={<Ionicons name="trending-up-outline" size={18} color={colors.moss} />}
              onPress={() => router.push({ pathname: '/study/progress', params: { mine: '1' } })}
            />
          )}

          {localities.length > 0 && <CityEntry localities={localities} />}

          {assemblies.length === 0 && !error && <Overview rows={overview} />}
        </>
      )}
    </ScreenShell>
  );
}

/** D-ETU-35 (JP 23/10) — ce que le dirigeant lit avant *Commencer*. */
type Briefing = {
  unitId: string;
  lesson: StudyLesson;
  /** Seulement à la première séance de l'unité dans l'assemblée. */
  unitNotes: string | null;
  lessonNotes: string | null;
  memberActions: string[];
  /** D-ETU-39 (JP 23/10) : plages des séances terminées de cette leçon (« questions 1 à 20 »). */
  pastRanges: string[];
  /** D-ETU-39 : première question de la plus ancienne séance de la leçon (« Reprendre au début »). */
  beginning: string | null;
  /** D-ETU-42 : leçon faite dans l'assemblée — le défaut du serveur repart alors du début. */
  lessonDone: boolean;
};

type StartChoice = 'default' | 'beginning' | 'custom';

/** D-ETU-49 (JP 23/10) — numéros de premier niveau de la leçon (vide : backend antérieur à ETU11b). */
function topLevelOf(lesson: StudyLesson): string[] {
  return (lesson.topLevelNumbers ?? []).filter((n) => !!n);
}

/**
 * D-ETU-49 (JP 23/10) — départ par défaut de la prochaine séance : `nextQuestionNumber` du serveur,
 * sinon (leçon entièrement couverte ou numéro inconnu) la première question ; null sans numéros.
 */
function defaultStartOf(lesson: StudyLesson): string | null {
  const numbers = topLevelOf(lesson);
  if (numbers.length === 0) return null;
  const next = lesson.nextQuestionNumber;
  return next && numbers.includes(next) ? next : numbers[0];
}

/** D-ETU-49 (JP 23/10) — « questions 21 à 57 » à partir de `start`, ou « toute la leçon » au début. */
function previewRangeOf(lesson: StudyLesson, start: string | null, t: (k: string, o?: any) => string): string | null {
  const numbers = topLevelOf(lesson);
  if (numbers.length === 0 || !start) return null;
  return start === numbers[0]
    ? t('study.home.wholeLesson')
    : t('study.range', { first: start, last: numbers[numbers.length - 1] });
}

/** D-ETU-39 (JP 23/10) — séances TERMINEE d'une leçon dans l'assemblée, plus récentes d'abord. */
function pastOfLesson(sessions: StudySessionSummary[], chapterId: string): StudySessionSummary[] {
  return sessions.filter((s) => s.status === 'TERMINEE' && s.chapterId === chapterId);
}

/** D-ETU-38 (JP 23/10) — « questions 1 à 20 » d'une séance, si le serveur porte ses bornes. */
function rangeLabel(
  s: { firstQuestionNumber?: string | null; lastQuestionNumber?: string | null },
  t: (k: string, o?: any) => string,
): string | null {
  return s.firstQuestionNumber && s.lastQuestionNumber
    ? t('study.range', { first: s.firstQuestionNumber, last: s.lastQuestionNumber })
    : null;
}

/** Plages des séances passées, de la plus ancienne à la plus récente, sans doublon. */
function rangesOf(past: StudySessionSummary[], t: (k: string, o?: any) => string): string[] {
  const out: string[] = [];
  for (const s of [...past].reverse()) {
    const r = rangeLabel(s, t);
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

function blankToNull(text: string | null | undefined): string | null {
  return text && text.trim() ? text : null;
}

/**
 * D-ETU-35 (JP 23/10) : « À lire avant la leçon » — recommandations de l'unité, puis de la leçon,
 * puis l'aperçu des actions des membres (texte brut, D-ETU-37) ; *Commencer* ouvre la séance.
 * D-ETU-39 (JP 23/10) : pour une leçon déjà commencée, plages traitées et point de départ.
 */
function BriefingSheet({
  briefing,
  onClose,
  onConfirm,
}: {
  briefing: Briefing;
  onClose: () => void;
  onConfirm: (startQuestionNumber: string | null) => void;
}) {
  const { t } = useLanguage();
  const label = lessonLabelOf(t, briefing.lesson.number, briefing.lesson.title);
  // D-ETU-49 (JP 23/10) : sélecteur sur les numéros de premier niveau, défaut = suite de la leçon.
  const numbers = topLevelOf(briefing.lesson);
  const defaultStart = defaultStartOf(briefing.lesson);
  const [picked, setPicked] = useState<string | null>(defaultStart);
  const [choice, setChoice] = useState<StartChoice>('default');
  const [custom, setCustom] = useState('');
  const resumed = briefing.pastRanges.length > 0;
  // Leçon faite : le défaut du serveur repart déjà du début — « Reprendre au début » ferait doublon.
  const showBeginning = resumed && !briefing.lessonDone && !!briefing.beginning;
  const preview = numbers.length > 0;
  // D-ETU-49 (JP 23/10) : avec l'aperçu, la question affichée et validée part TOUJOURS en
  // `startQuestionNumber` (contrôlée par le serveur) — sinon, après « Terminer l'oubliée » ou sur un
  // catalogue périmé, le serveur recalculerait D-ETU-39 et ouvrirait une autre plage que l'aperçu.
  // Repli sans `topLevelNumbers` : choix par défaut → `startQuestionNumber` omis (défaut du serveur).
  const start = preview
    ? picked
    : choice === 'beginning'
      ? briefing.beginning
      : choice === 'custom'
        ? custom.trim() || null
        : null;
  const ready = preview ? !!picked : choice !== 'custom' || !!custom.trim();
  const choices: { key: StartChoice; label: string }[] = [
    { key: 'default', label: briefing.lessonDone ? t('study.home.startDefaultRedo') : t('study.home.startDefault') },
    ...(showBeginning
      ? [{ key: 'beginning' as const, label: t('study.home.startBeginning', { number: briefing.beginning }) }]
      : []),
    { key: 'custom', label: t('study.home.startCustom') },
  ];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {/* Sans texte à lire (D-ETU-35), seuls la reprise (D-ETU-39) ou l'aperçu (D-ETU-49) ouvrent la feuille. */}
            {briefing.unitNotes || briefing.lessonNotes || briefing.memberActions.length > 0
              ? t('study.briefing.title')
              : t('study.home.startTitle')}
          </Text>
          <Text style={styles.modalHint}>{label}</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={{ gap: 16, paddingBottom: 4 }}>
            <StudyNotesText title={t('study.briefing.unitNotes')} text={briefing.unitNotes} />
            <StudyNotesText title={t('study.briefing.lessonNotes')} text={briefing.lessonNotes} />
            <StudyMemberActions title={t('study.briefing.memberActions')} actions={briefing.memberActions} />
            {preview && (
              <View style={{ gap: 6 }}>
                <Text style={styles.startTitle}>{t('study.home.startPick')}</Text>
                <Text style={styles.previewRange}>
                  {t('study.home.sessionRange', { range: previewRangeOf(briefing.lesson, picked, t) })}
                </Text>
                {resumed && (
                  <Text style={styles.rowMeta}>{t('study.home.covered', { ranges: briefing.pastRanges.join(' · ') })}</Text>
                )}
                <Text style={styles.rowMeta}>
                  {defaultStart && defaultStart !== numbers[0]
                    ? t('study.home.startPickNext', { number: defaultStart })
                    : t('study.home.startPickFirst')}
                </Text>
                <View style={styles.chips}>
                  {numbers.map((n) => {
                    const selected = n === picked;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setPicked(n)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={t('study.question.number', { number: n })}
                        style={({ pressed }) => [
                          styles.chip,
                          n === defaultStart && styles.chipDefault,
                          selected && styles.chipOn,
                          { opacity: pressed ? 0.85 : 1 },
                        ]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {!preview && resumed && (
              <View style={{ gap: 6 }}>
                <Text style={styles.startTitle}>{t('study.home.startFrom')}</Text>
                <Text style={styles.rowMeta}>{t('study.home.covered', { ranges: briefing.pastRanges.join(' · ') })}</Text>
                {choices.map((c) => {
                  const selected = choice === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      onPress={() => setChoice(c.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      style={({ pressed }) => [styles.choiceRow, selected && styles.choiceRowOn, { opacity: pressed ? 0.85 : 1 }]}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={selected ? colors.moss : colors.ink3}
                      />
                      <Text style={styles.choiceText}>{c.label}</Text>
                    </Pressable>
                  );
                })}
                {choice === 'custom' && (
                  <Field
                    value={custom}
                    onChangeText={setCustom}
                    placeholder={t('study.home.startCustomPlaceholder')}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
              </View>
            )}
          </ScrollView>
          <Text style={styles.modalFoot}>{t('study.home.startConfirm', { lesson: label })}</Text>
          <Button
            label={t('study.home.start')}
            onPress={() => onConfirm(start)}
            disabled={!ready}
            fullWidth
            height={48}
            style={{ marginTop: 14 }}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} fullWidth height={44} style={{ marginTop: 8 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function lessonLabelOf(t: (k: string, o?: any) => string, number: number, title: string | null) {
  return title ? t('study.lessonTitled', { number, title }) : t('study.lesson', { number });
}

function fmtInstantDay(iso: string | null, t: (k: string, o?: any) => string): string {
  return iso ? fmtIsoDay(toLocalDate(new Date(iso)), t) : '';
}

function AssemblySection({
  assembly,
  showName,
  catalog,
  sessions,
  opening,
  onOpenSession,
  onStart,
}: {
  assembly: StudyAssembly;
  showName: boolean;
  catalog: StudyUnitForAssembly[];
  sessions: StudySessionSummary[];
  opening: string | null;
  onOpenSession: (id: string) => void;
  onStart: (unit: StudyUnitForAssembly, lesson: StudyLesson) => void;
}) {
  const { t } = useLanguage();
  const [unitOpen, setUnitOpen] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState(false);
  const current = assembly.currentSession;
  const past = sessions.filter((s) => s.status === 'TERMINEE');
  // D-ETU-44/45 (JP 23/10) : séances que l'appelant peut encore rattraper.
  const catchUps = assembly.catchUps ?? [];
  const shownPast = allSessions ? past : past.slice(0, 5);

  const action = !current
    ? null
    : assembly.leader
      ? t('study.home.resume')
      : current.status === 'CORRECTION'
        ? t('study.home.correct')
        : t('study.home.answer');

  return (
    <View style={styles.section}>
      {(showName || assembly.leader) && <Label style={styles.sectionLabel}>{assembly.unitName}</Label>}

      {current ? (
        <Card style={styles.currentCard} onPress={() => onOpenSession(current.id)}>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t(`study.status.${current.status}`)}</Text>
          </View>
          <Text style={styles.currentTitle}>{lessonLabelOf(t, current.lessonNumber, current.lessonTitle)}</Text>
          <Text style={styles.currentSub}>{[current.moduleCode, current.moduleName].filter(Boolean).join(' · ')}</Text>
          {current.moduleLanguage && current.moduleLanguage !== assembly.language && (
            <View style={{ marginTop: 6 }}>
              <StudyLanguagePill language={current.moduleLanguage} />
            </View>
          )}
          <View style={styles.currentCta}>
            <Text style={styles.currentCtaText}>{action}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </View>
        </Card>
      ) : !assembly.leader && catchUps.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="book-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyTitle}>{t('study.home.noCurrent')}</Text>
          <Text style={styles.emptyText}>{t('study.home.noCurrentHint')}</Text>
        </Card>
      ) : null}

      {catchUps.length > 0 && (
        <>
          <Label style={styles.blockLabel}>{t('study.home.catchUpTitle')}</Label>
          <Text style={styles.muted}>{t('study.home.catchUpHint')}</Text>
          {catchUps.map((c) => (
            <CatchUpRow key={c.sessionId} item={c} onPress={() => onOpenSession(c.sessionId)} />
          ))}
        </>
      )}

      {assembly.leader && (
        <>
          <Label style={styles.blockLabel}>{current ? t('study.home.startOther') : t('study.home.startSession')}</Label>
          {catalog.length === 0 ? (
            <Text style={styles.muted}>{t('study.home.noCatalog')}</Text>
          ) : (
            catalog.map((u) => {
              const open = unitOpen === u.unit.moduleId;
              const done = u.unit.lessons.filter((l) => u.doneChapterIds.includes(l.chapterId)).length;
              return (
                <View key={u.unit.moduleId} style={styles.unitBlock}>
                  <Pressable
                    onPress={() => setUnitOpen(open ? null : u.unit.moduleId)}
                    style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                  >
                    <View style={[styles.rowIcon, u.locked && styles.rowIconLocked]}>
                      <Ionicons name={u.locked ? 'lock-closed-outline' : 'school-outline'} size={19} color={u.locked ? colors.ink3 : colors.moss} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {[u.unit.code, u.unit.name].filter(Boolean).join(' · ')}
                      </Text>
                      {/* D-ETU-26 (JP 21/10) : version de l'autre langue, proposée faute de mieux — jamais bloquée. */}
                      {u.unit.language && u.unit.language !== assembly.language && (
                        <View style={styles.pillRow}>
                          <StudyLanguagePill language={u.unit.language} />
                        </View>
                      )}
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {u.locked
                          ? t('study.home.locked')
                          : t('study.home.lessonsDone', { done, total: u.unit.lessons.length })}
                      </Text>
                    </View>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink3} />
                  </Pressable>
                  {open && (
                    <View style={styles.lessons}>
                      {!!u.unit.bookTitle && <Text style={styles.book}>{u.unit.bookTitle}</Text>}
                      {u.unit.lessons.map((l) => {
                        const isDone = u.doneChapterIds.includes(l.chapterId);
                        // D-ETU-38/42 (JP 23/10) : leçon commencée, pas encore entièrement couverte.
                        const covered = isDone ? [] : rangesOf(pastOfLesson(sessions, l.chapterId), t);
                        // D-ETU-49 (JP 23/10) : suite de la leçon (« questions 21 à 57 ») avant *Commencer*.
                        const nextStart = isDone ? null : defaultStartOf(l);
                        const resumeAt = nextStart && nextStart !== topLevelOf(l)[0] ? nextStart : null;
                        const started = covered.length > 0 || !!resumeAt;
                        return (
                          <Pressable
                            key={l.chapterId}
                            disabled={u.locked || !!opening}
                            onPress={() => onStart(u, l)}
                            style={({ pressed }) => [
                              styles.lessonRow,
                              { opacity: u.locked ? 0.5 : pressed ? 0.85 : 1 },
                            ]}
                          >
                            <Ionicons
                              name={isDone ? 'checkmark-circle' : started ? 'time-outline' : 'ellipse-outline'}
                              size={20}
                              color={isDone || started ? colors.moss : colors.ink3}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lessonTitle}>{lessonLabelOf(t, l.number, l.title)}</Text>
                              {!!l.portion && <Text style={styles.rowMeta}>{l.portion}</Text>}
                              {covered.length > 0 && (
                                <Text style={styles.rowMeta}>{t('study.home.covered', { ranges: covered.join(' · ') })}</Text>
                              )}
                              {!!resumeAt && (
                                <Text style={styles.rowMeta}>
                                  {t('study.home.nextRange', { range: previewRangeOf(l, resumeAt, t) })}
                                </Text>
                              )}
                            </View>
                            {opening === l.chapterId ? (
                              <ActivityIndicator color={colors.moss} />
                            ) : (
                              <Text style={styles.lessonAction}>
                                {isDone ? t('study.home.redo') : started ? t('study.home.continue') : t('study.home.start')}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <Label style={styles.blockLabel}>{t('study.home.sessions')}</Label>
          {past.length === 0 ? (
            <Text style={styles.muted}>{t('study.home.noSessions')}</Text>
          ) : (
            <>
              {shownPast.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: '/study/results/[id]', params: { id: s.id } })}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>
                        {lessonLabelOf(t, s.lessonNumber, s.lessonTitle)}
                      </Text>
                      {s.moduleLanguage && s.moduleLanguage !== assembly.language && (
                        <StudyLanguagePill language={s.moduleLanguage} />
                      )}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[
                        s.moduleCode,
                        rangeLabel(s, t),
                        fmtInstantDay(s.finishedAt ?? s.openedAt, t),
                        t('study.home.copies', { count: s.copyCount }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
                </Pressable>
              ))}
              {past.length > shownPast.length && (
                <Text style={styles.link} onPress={() => setAllSessions(true)}>
                  {t('study.home.allSessions', { count: past.length })}
                </Text>
              )}
            </>
          )}

          <Button
            label={t('study.home.unitProgress')}
            variant="soft"
            fullWidth
            height={46}
            style={{ marginTop: 14 }}
            onPress={() =>
              router.push({ pathname: '/study/progress', params: { unitId: assembly.unitId, lang: assembly.language } })
            }
          />
        </>
      )}
    </View>
  );
}

/** D-ETU-44 (JP 23/10) — une séance à rattraper : leçon, plage, date ; ouvre l'écran de séance. */
function CatchUpRow({ item, onPress }: { item: StudyCatchUp; onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.rowIcon}>
        <Ionicons name="home-outline" size={19} color={colors.moss} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {lessonLabelOf(t, item.lessonNumber, item.lessonTitle ?? null)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[item.moduleCode ?? item.moduleName, rangeLabel(item, t), fmtInstantDay(item.finishedAt, t)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text style={styles.lessonAction}>{t('study.home.catchUpAction')}</Text>
    </Pressable>
  );
}

/**
 * Contrat 27/10 §9.3 — entrée « Suivi de la ville » : une ville → `?localityId=` directement ;
 * cadenas si aucune ville n'ouvre droit (`entitled`). Jamais de mention de paiement (D-ABO-13).
 */
function CityEntry({ localities }: { localities: CityFollowUpCity[] }) {
  const { t } = useLanguage();
  const locked = !localities.some(cityOpen);
  const only = localities.length === 1 ? localities[0] : null;
  return (
    <Pressable
      onPress={() =>
        router.push(only ? { pathname: '/study/city', params: { localityId: only.localityId } } : '/study/city')
      }
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { marginTop: 20, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name="business-outline" size={18} color={colors.moss} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{t('study.city.entry')}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {only ? only.localityName : t('study.city.cityCount', { count: localities.length })}
        </Text>
      </View>
      {locked && (
        <Ionicons name="lock-closed" size={16} color={colors.ink3} accessibilityLabel={t('study.city.lockedCity')} />
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </Pressable>
  );
}

/** D-ETU-08 — vue d'ensemble des assemblées du périmètre (géographie), sans contenu de copie. */
function Overview({ rows }: { rows: StudyAssemblyOverview[] }) {
  const { t } = useLanguage();
  return (
    <View style={styles.section}>
      <Label style={styles.blockLabel}>{t('study.home.overviewTitle')}</Label>
      {rows.length === 0 ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="map-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('study.home.overviewEmpty')}</Text>
        </Card>
      ) : (
        rows.map((r) => (
          <Pressable
            key={r.unitId}
            onPress={() => router.push({ pathname: '/study/progress', params: { unitId: r.unitId } })}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {r.cityName ? `${r.unitName} · ${r.cityName}` : r.unitName}
              </Text>
              {r.modules.map((m) => (
                <View key={m.moduleId} style={styles.titleRow}>
                  <Text style={[styles.rowMeta, { flexShrink: 1 }]} numberOfLines={1}>
                    {[m.code ?? m.name, t('study.home.lessonsDone', { done: m.lessonsDone, total: m.totalLessons })].join(' · ')}
                  </Text>
                  {/* D-ETU-27 : la vue d'ensemble ne porte pas la langue de l'assemblée — on ne
                      marque que les unités faites dans plusieurs langues. */}
                  {studyLanguagesToMark(m.languages, null).map((l) => (
                    <StudyLanguagePill key={l} language={l} />
                  ))}
                </View>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
          </Pressable>
        ))
      )}
    </View>
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
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  section: { marginTop: 20, gap: 8 },
  sectionLabel: { color: colors.mossSoft },
  blockLabel: { marginTop: 14 },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  empty: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 8 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  link: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.moss, marginTop: 4 },
  currentCard: { backgroundColor: colors.moss, paddingHorizontal: 18, paddingVertical: 16 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.earth },
  liveText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.parchment,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  currentTitle: { marginTop: 8, fontFamily: fonts.serif, fontSize: 21, color: colors.white, letterSpacing: -0.2 },
  currentSub: { marginTop: 2, fontFamily: fonts.sans, fontSize: 12.5, color: colors.parchment },
  currentCta: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  currentCtaText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: colors.white },
  unitBlock: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  rowIconLocked: { backgroundColor: colors.paper2 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, letterSpacing: -0.1 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillRow: { flexDirection: 'row', marginTop: 4 },
  lessons: { marginLeft: 12, gap: 6 },
  book: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13.5, color: colors.ink2 },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  lessonTitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  lessonAction: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.moss },
  backdrop: { flex: 1, backgroundColor: colors.mossDeep + 'B3', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 48 },
  modalCard: {
    maxHeight: '100%',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  modalTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, letterSpacing: -0.3 },
  modalHint: { marginTop: 4, marginBottom: 14, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalFoot: { marginTop: 14, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
  startTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, letterSpacing: -0.1 },
  choiceRow: {
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
  choiceRowOn: { borderColor: colors.moss, backgroundColor: colors.mossTint },
  choiceText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  previewRange: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.moss, letterSpacing: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.paper2,
    alignItems: 'center',
  },
  chipDefault: { borderColor: colors.mossSoft },
  chipOn: { borderColor: colors.moss, backgroundColor: colors.moss },
  chipText: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.ink2 },
  chipTextOn: { color: colors.white },
});
