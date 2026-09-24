import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Label from './Label';
import Button from './Button';
import { colors, fonts, radii } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { buildMeetingReport, type MeetingReportInput } from '../utils/meetingReport';
import { notify } from '../utils/dialogs';

/**
 * Aperçu du compte rendu + Copier / Partager — §6.3 plan 23/09 (lot L5).
 *
 * Le texte vient de `buildMeetingReport` (format §5.4, identique au web). D-ASM-14 (JP 23/09) :
 * case « inclure la liste des présents », cochée par défaut. « Partager » passe par `Share` de
 * React Native, qui propose directement WhatsApp.
 */
export default function MeetingReportCard({ input }: { input: MeetingReportInput }) {
  const { t } = useLanguage();
  const [includeAttendees, setIncludeAttendees] = useState(true);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `t` change avec la langue de l'app : le texte la suit (§5.4).
  const text = useMemo(() => buildMeetingReport(input, includeAttendees, t), [input, includeAttendees, t]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      notify(t('common.appName'), t('assemblyLife.reportUi.copyFailed'));
    }
  };

  const onShare = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      // Partage annulé ou indisponible : rien à signaler.
    }
  };

  return (
    <Card style={styles.card}>
      <Label style={{ marginBottom: 10 }}>{t('assemblyLife.reportUi.preview')}</Label>
      <Pressable style={styles.toggleRow} onPress={() => setIncludeAttendees((v) => !v)}>
        <Text style={styles.toggleText}>{t('assemblyLife.reportUi.includeAttendees')}</Text>
        <Switch
          value={includeAttendees}
          onValueChange={setIncludeAttendees}
          trackColor={{ true: colors.moss, false: colors.hairStrong }}
          thumbColor={colors.paper2}
        />
      </Pressable>
      <View style={styles.preview}>
        <Text style={styles.previewText} selectable>
          {text}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          label={t('assemblyLife.reportUi.copy')}
          variant="ghost"
          onPress={onCopy}
          height={46}
          style={{ flex: 1 }}
          iconLeft={<Ionicons name="copy-outline" size={17} color={colors.moss} />}
        />
        <Button
          label={t('assemblyLife.reportUi.share')}
          onPress={onShare}
          height={46}
          style={{ flex: 1 }}
          iconLeft={<Ionicons name="share-social-outline" size={17} color={colors.white} />}
        />
      </View>
      {copied && (
        <View style={styles.copiedRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.mossSoft} />
          <Text style={styles.copiedText}>{t('assemblyLife.reportUi.copied')}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toggleText: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2 },
  preview: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  previewText: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 18, color: colors.ink },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  copiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  copiedText: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.mossSoft },
});
