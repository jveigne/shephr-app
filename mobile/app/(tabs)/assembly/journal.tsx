import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Chip from '../../../components/Chip';
import Label from '../../../components/Label';
import Button from '../../../components/Button';
import ErrorBanner from '../../../components/ErrorBanner';
import { colors, fonts } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getMeeting, listMeetings, type MeetingDetail, type MeetingSummary } from '../../../services/assemblyApi';
import { toLocalDate } from '../../../utils/format';
import { notify } from '../../../utils/dialogs';
import {
  PERIODICITIES,
  buildJournalHtml,
  currentPeriod,
  isFuturePeriod,
  journalFileName,
  periodLabel,
  periodRange,
  shiftPeriod,
  type Period,
  type Periodicity,
} from '../../../utils/assemblyJournal';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Détails chargés par paquets : un journal annuel compte ~50 réunions, inutile de tout lancer d'un coup. */
const DETAIL_BATCH = 4;

async function loadDetails(ids: string[]): Promise<MeetingDetail[]> {
  const out: MeetingDetail[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    out.push(...(await Promise.all(ids.slice(i, i + DETAIL_BATCH).map(getMeeting))));
  }
  return out;
}

/**
 * Journal PDF de l'assemblée (JP 08/10) — voir `utils/assemblyJournal.ts`.
 *
 * On choisit une périodicité (mois, trimestre, semestre, année) et la période, puis le PDF est
 * composé sur l'appareil (expo-print) et remis à la feuille de partage : enregistrer dans
 * Fichiers, envoyer par WhatsApp ou e-mail. Sur le web, `printAsync` ouvre la boîte d'impression
 * du navigateur (« Enregistrer en PDF »).
 * Lecture seule : mêmes données et mêmes gardes que la liste des réunions (RG-ASM-05).
 */
export default function AssemblyJournalScreen() {
  const { t, language } = useLanguage();
  const { unitId, unitName, cityName } = useLocalSearchParams<{
    unitId: string;
    unitName?: string;
    cityName?: string;
  }>();

  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const [includeAttendees, setIncludeAttendees] = useState(true);
  const [loaded, setLoaded] = useState<{ year: number; meetings: MeetingSummary[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Une période tient toujours dans une année : la liste de l'année suffit, filtrée ici.
  // Tant que l'année affichée n'est pas celle chargée, on considère la liste en cours.
  useEffect(() => {
    if (!unitId) return;
    let active = true;
    listMeetings(unitId, period.year)
      .then((meetings) => {
        if (!active) return;
        setLoaded({ year: period.year, meetings });
        setError(null);
      })
      .catch((e: any) => {
        if (active) setError(e?.response?.data?.message ?? t('assemblyLife.loadFailed'));
      });
    return () => {
      active = false;
    };
  }, [unitId, period.year, reloadKey, t]);

  const yearMeetings = loaded?.year === period.year ? loaded.meetings : null;
  const retry = () => {
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const inPeriod = useMemo(() => {
    if (!yearMeetings) return [];
    const { from, to } = periodRange(period);
    return yearMeetings.filter((m) => m.meetingDate >= from && m.meetingDate <= to);
  }, [yearMeetings, period]);

  const next = shiftPeriod(period, 1);
  const canGoNext = !isFuturePeriod(next);

  const changeKind = (kind: Periodicity) => setPeriod(currentPeriod(kind));

  const onGenerate = async () => {
    if (!unitId || inPeriod.length === 0) return;
    setGenerating(true);
    try {
      const details = await loadDetails(inPeriod.map((m) => m.id));
      const html = buildJournalHtml(
        {
          unitName: unitName || details[0]?.unitName || '',
          cityName: cityName || null,
          period,
          meetings: details,
          includeAttendees,
          generatedOn: toLocalDate(new Date()),
          locale: language,
        },
        t,
      );

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }

      // A4 en points ; renommé avant le partage pour que le destinataire reçoive un nom lisible.
      const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
      // ⚠ SDK 57 : `File.move` est ASYNCHRONE (l'ancien comportement s'appelle `moveSync`). Sans
      // `await`, le partage partait pendant le déplacement et livrait un PDF illisible (JP 08/10).
      // On partage la destination elle-même plutôt que de compter sur la mise à jour de `uri`.
      const target = new File(Paths.cache, journalFileName(unitName || 'assemblee', period));
      await new File(uri).move(target, { overwrite: true });
      if (!target.exists || target.size === 0) throw new Error('JOURNAL_FILE_MISSING');
      if (!(await Sharing.isAvailableAsync())) {
        notify(t('common.appName'), t('assemblyLife.journal.shareUnavailable'));
        return;
      }
      await Sharing.shareAsync(target.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: t('assemblyLife.journal.title'),
      });
    } catch (e: any) {
      notify(t('common.appName'), e?.response?.data?.message ?? t('assemblyLife.journal.failed'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
      </View>
      <Text style={styles.title}>{t('assemblyLife.journal.title')}</Text>
      {!!unitName && (
        <Text style={styles.subtitle}>
          {unitName}
          {cityName ? ` · ${cityName}` : ''}
        </Text>
      )}

      {!!error && <ErrorBanner message={error} onRetry={retry} />}

      <Card style={styles.card}>
        <Label style={{ marginBottom: 10 }}>{t('assemblyLife.journal.periodicity')}</Label>
        <View style={styles.chipWrap}>
          {PERIODICITIES.map((k) => (
            <Chip
              key={k}
              label={t(`assemblyLife.journal.kind.${k}`)}
              selected={period.kind === k}
              onPress={() => changeKind(k)}
            />
          ))}
        </View>

        <View style={styles.periodRow}>
          <Pressable onPress={() => setPeriod(shiftPeriod(period, -1))} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.ink2} />
          </Pressable>
          <Text style={styles.periodText}>{capitalize(periodLabel(period, t))}</Text>
          <Pressable
            onPress={() => canGoNext && setPeriod(next)}
            disabled={!canGoNext}
            hitSlop={8}
            style={[styles.navBtn, !canGoNext && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
          </Pressable>
        </View>

        <View style={styles.countRow}>
          {yearMeetings === null && !error ? (
            <ActivityIndicator color={colors.moss} />
          ) : (
            <Text style={styles.countText}>
              {t('assemblyLife.journal.reportCount', { count: inPeriod.length })}
            </Text>
          )}
        </View>
      </Card>

      <Card style={styles.card}>
        <Pressable style={styles.switchRow} onPress={() => setIncludeAttendees((v) => !v)}>
          <Text style={styles.switchLabel}>{t('assemblyLife.reportUi.includeAttendees')}</Text>
          <Switch
            value={includeAttendees}
            onValueChange={setIncludeAttendees}
            trackColor={{ true: colors.moss, false: colors.hairStrong }}
            thumbColor={colors.paper2}
          />
        </Pressable>
        <Text style={styles.hint}>{t('assemblyLife.journal.contentHint')}</Text>
      </Card>

      <Button
        label={t('assemblyLife.journal.generate')}
        onPress={onGenerate}
        loading={generating}
        disabled={inPeriod.length === 0}
        style={{ marginTop: 18 }}
        iconLeft={<Ionicons name="document-text-outline" size={18} color={colors.white} />}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, letterSpacing: -0.4, marginTop: 8 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 4 },
  card: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 18,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  periodText: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    minWidth: 170,
    textAlign: 'center',
  },
  countRow: { marginTop: 14, alignItems: 'center', minHeight: 20 },
  countText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, lineHeight: 18, marginTop: 10 },
});
