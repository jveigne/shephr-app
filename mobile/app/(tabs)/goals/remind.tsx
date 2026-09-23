import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';

import { goBack } from '../../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '../../../components/ScreenShell';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Field from '../../../components/Field';
import Label from '../../../components/Label';
import ErrorBanner from '../../../components/ErrorBanner';
import { colors, fonts, radii } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { confirmDialog, notify } from '../../../utils/dialogs';
import {
  fetchReminderScopes,
  sendBulkReminder,
  type BulkReminderResponse,
  type ReminderScope,
  type ReminderScopeOption,
} from '../../../services/goalsApi';

/**
 * « Relancer » — rappel GROUPÉ des personnes qui n'ont pas soumis (lot G3, cadrage JP 14/09,
 * `docs/goals-hierarchie-et-rappels.md` §3).
 *
 * <p>Ce que cet écran remplace : 25 gestes pour 25 fidèles non soumis. C'est la raison pour
 * laquelle le rappel unitaire (toujours en service depuis la fiche d'une personne) ne servait pas.
 *
 * <p><b>LE POINT CAPITAL (décisions J-4 et J-5)</b> : le périmètre est <b>CHOISI EXPLICITEMENT</b>.
 * « Mes disciples » et les périmètres géographiques sont présentés en <b>deux sections séparées</b>,
 * et l'écran n'envoie qu'UN périmètre à la fois — jamais l'union. On ne mélange pas leadership
 * géographique et supervision : le premier vient du rôle et du rattachement, le second d'une
 * déclaration personnelle.
 *
 * <p>Aucun calcul de périmètre ici : la liste des options vient du serveur
 * (`GET /goals/reminders/scopes`), qui ne propose que ce que l'acteur peut réellement viser — donc
 * aucun choix ne finit en 403. Un viewer ministère-large (LEADER / SECRETARIAT) ne reçoit que
 * « Mes disciples » : la relance de masse ministère-large n'est pas tranchée (Q3 du cadrage).
 */
export default function RemindScreen() {
  const { t } = useLanguage();
  const [options, setOptions] = useState<ReminderScopeOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BulkReminderResponse | null>(null);

  const load = async () => {
    try {
      const data = await fetchReminderScopes();
      setOptions(data);
      setError(null);
    } catch (e: any) {
      setOptions([]);
      setError(e?.response?.data?.message ?? t('goals.remind.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const keyOf = (o: ReminderScopeOption) => `${o.scope}:${o.scopeId ?? ''}`;
  const current = options.find((o) => keyOf(o) === selected) ?? null;
  // Deux listes, jamais fondues (J-4/J-5) — c'est la traduction à l'écran de la règle de fond.
  const geographic = options.filter((o) => o.scope !== 'DISCIPLES');
  const disciples = options.filter((o) => o.scope === 'DISCIPLES');

  const scopeLabel = (scope: ReminderScope) =>
    t(`goals.remind.scope.${scope}`);

  const send = async () => {
    if (!current) return;
    const ok = await confirmDialog(
      t('goals.remind.confirmTitle'),
      t('goals.remind.confirmBody', {
        count: current.pending,
        scope: current.name ?? scopeLabel(current.scope),
      }),
      t('goals.remind.confirmCta'),
    );
    if (!ok) return;
    setSending(true);
    try {
      const res = await sendBulkReminder({
        scope: current.scope,
        scopeId: current.scopeId,
        message: message.trim() ? message.trim() : undefined,
      });
      setDone(res);
    } catch (e: any) {
      // Les 422 métier portent leur code dans `error` ; le 403 n'en porte pas (garde de périmètre).
      const code = e?.response?.data?.error;
      const known: Record<string, string> = {
        SCOPE_REQUIRED: t('errors.goals.SCOPE_REQUIRED'),
        SCOPE_ID_REQUIRED: t('errors.goals.SCOPE_ID_REQUIRED'),
      };
      const fallback =
        e?.response?.status === 403
          ? t('goals.remind.denied')
          : e?.response?.data?.message ?? t('goals.remind.failed');
      notify(t('common.appName'), known[code] ?? fallback);
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------------------------------------------------
  //  Compte rendu — « le dirigeant voit ce qui s'est passé » (§3.1)
  // ------------------------------------------------------------------------------------------
  if (done) {
    return (
      <ScreenShell withTabBar={false}>
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <View style={styles.checkBubble}>
            <Ionicons name="paper-plane-outline" size={32} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>{t('goals.remind.doneTitle')}</Text>
          <Text style={styles.successHint}>
            {done.scopeName ?? scopeLabel(done.scope)}
          </Text>
        </View>

        <Card variant="paper2" style={styles.recap}>
          <ResultRow
            icon="paper-plane-outline"
            tone={colors.moss}
            label={t('goals.remind.resultSent')}
            value={done.sent}
          />
          <ResultRow
            icon="time-outline"
            tone={colors.earthDeep}
            label={t('goals.remind.resultSkipped')}
            value={done.alreadyReminded}
          />
          <ResultRow
            icon="checkmark-circle-outline"
            tone={colors.mossSoft}
            label={t('goals.remind.resultSubmitted')}
            value={done.alreadySubmitted}
          />
        </Card>

        {done.alreadyReminded > 0 && (
          <Text style={styles.footnote}>{t('goals.remind.skippedHint')}</Text>
        )}

        {done.sentToNames.length > 0 && (
          <Card variant="tinted" style={styles.namesCard}>
            <Label>{t('goals.remind.sentToLabel')}</Label>
            <Text style={styles.names}>{done.sentToNames.join(' · ')}</Text>
          </Card>
        )}

        <Button
          label={t('goals.remind.backCta')}
          onPress={() => goBack()}
          fullWidth
          style={{ marginTop: 24 }}
        />
      </ScreenShell>
    );
  }

  // ------------------------------------------------------------------------------------------
  //  Sélection du périmètre
  // ------------------------------------------------------------------------------------------
  return (
    <ScreenShell
      withTabBar={false}
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.ink2} />
        </Pressable>
      </View>

      <Text style={styles.title}>{t('goals.remind.title')}</Text>
      <Text style={styles.intro}>{t('goals.remind.intro')}</Text>

      {loading ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 40 }} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={onRefresh} />
      ) : (
        <>
          {geographic.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Label>{t('goals.remind.geoSection')}</Label>
              <Text style={styles.sectionHint}>{t('goals.remind.geoHint')}</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {geographic.map((option) => (
                  <ScopeRow
                    key={keyOf(option)}
                    option={option}
                    label={option.name ?? scopeLabel(option.scope)}
                    caption={scopeLabel(option.scope)}
                    selected={selected === keyOf(option)}
                    onPress={() => setSelected(keyOf(option))}
                  />
                ))}
              </View>
            </View>
          )}

          {disciples.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Label>{t('goals.remind.disciplesSection')}</Label>
              {/* Le « jamais additionnées » du cadrage, dit à l'utilisateur en toutes lettres. */}
              <Text style={styles.sectionHint}>{t('goals.remind.disciplesHint')}</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {disciples.map((option) => (
                  <ScopeRow
                    key={keyOf(option)}
                    option={option}
                    label={t('goals.remind.scope.DISCIPLES')}
                    caption={t('goals.remind.disciplesCaption')}
                    selected={selected === keyOf(option)}
                    onPress={() => setSelected(keyOf(option))}
                  />
                ))}
              </View>
            </View>
          )}

          {current && (
            <>
              <Card variant="paper2" style={styles.previewCard}>
                <Ionicons
                  name={current.pending > 0 ? 'people-outline' : 'checkmark-done-outline'}
                  size={18}
                  color={colors.mossSoft}
                />
                <Text style={styles.previewText}>
                  {current.pending > 0
                    ? t('goals.remind.preview', { count: current.pending, total: current.total })
                    : t('goals.remind.previewNone')}
                </Text>
              </Card>

              <View style={{ marginTop: 18 }}>
                <Label>{t('goals.remind.messageLabel')}</Label>
                <Field
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={2000}
                  placeholder={t('goals.remind.messagePlaceholder')}
                  style={styles.messageField}
                />
                <Text style={styles.footnote}>{t('goals.remind.messageHint')}</Text>
              </View>

              <Button
                label={t('goals.remind.sendCta')}
                onPress={send}
                loading={sending}
                disabled={current.pending === 0}
                fullWidth
                height={58}
                style={{ marginTop: 18 }}
                iconLeft={<Ionicons name="paper-plane-outline" size={18} color={colors.white} />}
              />
            </>
          )}

          <Text style={styles.footnote}>{t('goals.remind.antispamHint')}</Text>
        </>
      )}
    </ScreenShell>
  );
}

/** Une option de périmètre — une ligne, un choix. */
function ScopeRow({
  option,
  label,
  caption,
  selected,
  onPress,
}: {
  option: ReminderScopeOption;
  label: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Pressable onPress={onPress} style={[styles.scopeRow, selected && styles.scopeRowOn]}>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? colors.moss : colors.ink3}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.scopeLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.scopeCaption} numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <View style={styles.pendingPill}>
        <Text style={styles.pendingText}>
          {t('goals.remind.pendingBadge', { count: option.pending })}
        </Text>
      </View>
    </Pressable>
  );
}

function ResultRow({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.resultRow}>
      <Ionicons name={icon} size={16} color={tone} />
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    lineHeight: 20,
  },
  sectionHint: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink3,
    marginTop: 6,
    lineHeight: 18,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.paper2,
  },
  scopeRowOn: { borderColor: colors.moss, backgroundColor: colors.mossTint },
  scopeLabel: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  scopeCaption: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, marginTop: 2 },
  pendingPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.mossTint2,
  },
  pendingText: { fontFamily: fonts.mono, fontSize: 11, color: colors.mossDeep },
  previewCard: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 19 },
  messageField: { marginTop: 8, minHeight: 96, textAlignVertical: 'top' },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
    marginTop: 10,
    lineHeight: 17,
  },
  checkBubble: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 25,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  successHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    textAlign: 'center',
  },
  recap: { marginTop: 22, paddingHorizontal: 18, paddingVertical: 16 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  resultLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2 },
  resultValue: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  namesCard: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  names: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, marginTop: 6, lineHeight: 19 },
});
