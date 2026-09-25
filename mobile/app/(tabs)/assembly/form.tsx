import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Switch } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Label from '../../../components/Label';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import ErrorBanner from '../../../components/ErrorBanner';
import MeetingReportCard from '../../../components/MeetingReportCard';
import { DatePickerModal } from '../../../components/DeclarationForm';
import { colors, fonts, radii } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  ASSEMBLY_ERROR_CODES,
  createMeeting,
  getMeeting,
  getRoster,
  getUnitProgress,
  listTeachingModules,
  updateMeeting,
  type MeetingDetail,
  type RosterEntry,
  type TeachingChapter,
  type TeachingModule,
  type TeachingPart,
} from '../../../services/assemblyApi';
import { fmtIsoDay, type MeetingReportInput } from '../../../utils/meetingReport';

/** Parties portées par des chapitres (module désactivé reconstitué à partir d'un CR), dans l'ordre. */
function partsOf(chapters: TeachingChapter[]): TeachingPart[] {
  const byId = new Map<string, TeachingPart>();
  for (const c of [...chapters].sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (c.partId && c.partNumber != null && !byId.has(c.partId)) {
      byId.set(c.partId, { id: c.partId, number: c.partNumber, title: c.partTitle, orderIndex: byId.size });
    }
  }
  return Array.from(byId.values());
}
import { parseLocalDate, toLocalDate } from '../../../utils/format';
import { notify } from '../../../utils/dialogs';

interface Person {
  userId: string;
  name: string;
  leader: boolean;
}

/** Traduit un refus 422 du lot L3 (code dans `response.data.error`), sinon message serveur. */
function assemblyErrorMessage(e: any, t: (k: string) => string, fallback: string): string {
  const code = e?.response?.data?.error;
  if (code && ASSEMBLY_ERROR_CODES.includes(code)) return t(`assemblyLife.errors.${code}`);
  return e?.response?.data?.message ?? fallback;
}

/**
 * Formulaire de compte rendu — création (`unitId` + `unitName`) ou modification (`id`).
 * §6.3 plan 23/09 (lot L5), mêmes champs que le web : date, présents (roster, tout cocher /
 * décocher), fraction de pain, module + chapitres (chapitres déjà lus signalés), aperçu du texte
 * §5.4 avec Copier / Partager.
 * - RG-ASM-03 : les présents viennent du roster (MEMBRE + DIRIGEANT_UNITE) ; chapitres d'un seul module.
 * - RG-ASM-07 : en modification, un présent déjà enregistré qui a quitté l'assemblée reste
 *   cochable, sous son nom d'origine (le serveur l'accepte, lot L3).
 * - RG-ASM-02 : seuls les modules actifs sont proposés ; le module (désactivé) d'un CR existant
 *   reste affiché pour ne pas perdre la lecture saisie.
 */
export default function MeetingFormScreen() {
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ id?: string; unitId?: string; unitName?: string }>();
  const editId = params.id || null;

  const [existing, setExisting] = useState<MeetingDetail | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [modules, setModules] = useState<TeachingModule[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const [date, setDate] = useState<Date>(() => new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set());
  const [breadBreaking, setBreadBreaking] = useState(false);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [chapterIds, setChapterIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unitId = existing?.unitId ?? params.unitId ?? null;
  const unitName = existing?.unitName ?? params.unitName ?? '';

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      let detail: MeetingDetail | null = null;
      if (editId) {
        detail = await getMeeting(editId);
        setExisting(detail);
        setDate(parseLocalDate(detail.meetingDate));
        setAttendeeIds(new Set(detail.attendees.map((a) => a.userId)));
        setBreadBreaking(detail.breadBreaking);
        setModuleId(detail.moduleId);
        setChapterIds(new Set(detail.chapters.map((c) => c.id)));
      }
      const uid = detail?.unitId ?? params.unitId;
      if (!uid) return;
      const [r, m, p] = await Promise.all([getRoster(uid), listTeachingModules(), getUnitProgress(uid)]);
      setRoster(r);
      setModules(m);
      setReadIds(new Set(p.modules.flatMap((mp) => mp.readChapterIds)));
    } catch (e: any) {
      setLoadError(e?.response?.data?.message ?? t('assemblyLife.loadFailed'));
    }
  }, [editId, params.unitId, t]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Roster + présents historiques absents du roster (RG-ASM-07) ; nom instantané prioritaire.
  const people: Person[] = useMemo(() => {
    const byId = new Map<string, Person>();
    for (const r of roster) {
      byId.set(r.userId, { userId: r.userId, name: r.fullName, leader: r.role === 'DIRIGEANT_UNITE' });
    }
    for (const a of existing?.attendees ?? []) {
      const cur = byId.get(a.userId);
      byId.set(a.userId, { userId: a.userId, name: a.displayName, leader: cur?.leader ?? false });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [roster, existing]);

  // Modules proposés : actifs + (en modification) celui du CR s'il a été désactivé depuis.
  const moduleOptions: TeachingModule[] = useMemo(() => {
    if (!existing?.moduleId || modules.some((m) => m.id === existing.moduleId)) return modules;
    return [
      ...modules,
      {
        id: existing.moduleId,
        name: existing.moduleName ?? '',
        bookTitle: existing.bookTitle ?? '',
        orderIndex: Number.MAX_SAFE_INTEGER,
        parts: partsOf(existing.chapters),
        chapters: existing.chapters,
      },
    ];
  }, [modules, existing]);

  const selectedModule = moduleOptions.find((m) => m.id === moduleId) ?? null;
  const sortedChapters = useMemo(
    () => [...(selectedModule?.chapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [selectedModule],
  );

  const reportInput: MeetingReportInput = useMemo(
    () => ({
      meetingDate: toLocalDate(date),
      unitName,
      attendeeNames: people.filter((p) => attendeeIds.has(p.userId)).map((p) => p.name),
      breadBreaking,
      bookTitle: selectedModule ? selectedModule.bookTitle || selectedModule.name : null,
      chapters: sortedChapters.filter((c) => chapterIds.has(c.id)),
    }),
    [date, unitName, people, attendeeIds, breadBreaking, selectedModule, sortedChapters, chapterIds],
  );

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const allChecked = people.length > 0 && people.every((p) => attendeeIds.has(p.userId));

  const onPickModule = (id: string | null) => {
    if (id === moduleId) return;
    setModuleId(id);
    setChapterIds(new Set()); // RG-ASM-03 : chapitres d'un seul module
  };

  const onSave = async () => {
    if (!unitId) return;
    const payload = {
      meetingDate: toLocalDate(date),
      breadBreaking,
      attendeeIds: [...attendeeIds],
      moduleId: chapterIds.size > 0 ? moduleId : null,
      chapterIds: sortedChapters.filter((c) => chapterIds.has(c.id)).map((c) => c.id),
    };
    setSaving(true);
    try {
      if (existing) {
        await updateMeeting(existing.id, payload);
        router.back();
      } else {
        const created = await createMeeting(unitId, payload);
        // Arrivée sur le CR enregistré : c'est là qu'on le copie ou le partage.
        router.replace(`/(tabs)/assembly/meeting/${created.id}` as Href);
      }
    } catch (e: any) {
      notify(t('common.appName'), assemblyErrorMessage(e, t, t('errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.moss} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.title}>
        {existing ? t('assemblyLife.form.titleEdit') : t('assemblyLife.form.titleNew')}
      </Text>
      {!!unitName && <Text style={styles.subtitle}>{unitName}</Text>}

      {!!loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {/* Date */}
      <Card style={styles.card}>
        <Label style={{ marginBottom: 10 }}>{t('assemblyLife.form.date')}</Label>
        <Pressable style={styles.dateBtn} onPress={() => setDateOpen(true)}>
          <Ionicons name="calendar-outline" size={18} color={colors.mossSoft} />
          <Text style={styles.dateText}>{fmtIsoDay(toLocalDate(date), t)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.ink3} />
        </Pressable>
      </Card>

      {/* Présents */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Label>
            {t('assemblyLife.form.attendees')} · {attendeeIds.size}
          </Label>
          {people.length > 0 && (
            <Pressable
              hitSlop={8}
              onPress={() =>
                setAttendeeIds(allChecked ? new Set() : new Set(people.map((p) => p.userId)))
              }
            >
              <Text style={styles.link}>
                {allChecked ? t('assemblyLife.form.uncheckAll') : t('assemblyLife.form.checkAll')}
              </Text>
            </Pressable>
          )}
        </View>
        {people.length === 0 ? (
          <Text style={styles.hint}>{t('assemblyLife.form.rosterEmpty')}</Text>
        ) : (
          people.map((p) => {
            const on = attendeeIds.has(p.userId);
            return (
              <Pressable
                key={p.userId}
                style={styles.personRow}
                onPress={() => setAttendeeIds((s) => toggle(s, p.userId))}
              >
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={on ? colors.moss : colors.ink3}
                />
                <Text style={styles.personName} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.leader && <Text style={styles.leaderTag}>{t('assemblyLife.form.leaderTag')}</Text>}
              </Pressable>
            );
          })
        )}
      </Card>

      {/* Fraction de pain */}
      <Card style={styles.card}>
        <Pressable style={styles.switchRow} onPress={() => setBreadBreaking((v) => !v)}>
          <Text style={styles.switchLabel}>{t('assemblyLife.breadBreaking')}</Text>
          <Switch
            value={breadBreaking}
            onValueChange={setBreadBreaking}
            trackColor={{ true: colors.moss, false: colors.hairStrong }}
            thumbColor={colors.paper2}
          />
        </Pressable>
      </Card>

      {/* Lecture */}
      <Card style={styles.card}>
        <Label style={{ marginBottom: 10 }}>{t('assemblyLife.form.reading')}</Label>
        {moduleOptions.length === 0 ? (
          <Text style={styles.hint}>{t('assemblyLife.form.noModulesHint')}</Text>
        ) : (
          <View style={styles.chipWrap}>
            <Chip
              label={t('assemblyLife.form.noModule')}
              selected={!moduleId}
              onPress={() => onPickModule(null)}
            />
            {moduleOptions.map((m) => (
              <Chip
                key={m.id}
                label={m.bookTitle || m.name}
                selected={moduleId === m.id}
                onPress={() => onPickModule(m.id)}
              />
            ))}
          </View>
        )}
        {selectedModule && (
          <>
            <Label style={{ marginTop: 16, marginBottom: 10 }}>{t('assemblyLife.form.chapters')}</Label>
            {/* JP 24/09 — module à parties : chapitres (numérotés à partir de 1 dans chaque
                partie) regroupés sous leur partie. */}
            {(selectedModule.parts.length > 0
              ? [...selectedModule.parts]
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((part) => ({ part, chapters: sortedChapters.filter((c) => c.partId === part.id) }))
              : [{ part: null, chapters: sortedChapters }]
            ).map(({ part, chapters }) => (
              <View key={part?.id ?? 'all'} style={part ? { marginBottom: 12 } : undefined}>
                {part && (
                  <Text style={styles.partHeading}>
                    {t('assemblyLife.form.partHeading', { n: part.number })}
                    {part.title ? ` · ${part.title}` : ''}
                  </Text>
                )}
                <View style={styles.chapterGrid}>
                  {chapters.map((c) => {
                    const on = chapterIds.has(c.id);
                    const read = readIds.has(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setChapterIds((s) => toggle(s, c.id))}
                        style={[styles.chapterCell, on && styles.chapterCellOn]}
                      >
                        <Text style={[styles.chapterText, on && styles.chapterTextOn]}>{c.number}</Text>
                        {read && <View style={[styles.readDot, on && styles.readDotOn]} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Text style={[styles.hint, { marginTop: 10 }]}>{t('assemblyLife.form.alreadyReadHint')}</Text>
          </>
        )}
      </Card>

      <MeetingReportCard input={reportInput} />

      <Button
        label={t('assemblyLife.form.save')}
        onPress={onSave}
        loading={saving}
        disabled={!unitId || !!loadError}
        fullWidth
        height={52}
        style={{ marginTop: 18 }}
      />

      <DatePickerModal
        visible={dateOpen}
        value={date}
        onClose={() => setDateOpen(false)}
        onChange={(d) => {
          setDate(d);
          setDateOpen(false);
        }}
        title={t('assemblyLife.form.date')}
        hint={t('assemblyLife.form.pickDateHint')}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 8 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4 },
  card: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  link: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.moss },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.paper2,
    borderColor: colors.hair,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dateText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  personName: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink },
  leaderTag: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.earthDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chapterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  partHeading: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: 8 },
  chapterCell: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chapterCellOn: { backgroundColor: colors.moss, borderColor: colors.mossDeep },
  chapterText: { fontFamily: fonts.mono, fontSize: 14, color: colors.ink2 },
  chapterTextOn: { color: colors.white },
  readDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.earth,
  },
  readDotOn: { backgroundColor: colors.white },
});
