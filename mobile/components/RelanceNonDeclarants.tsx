import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Chip from './Chip';
import Field from './Field';
import Label from './Label';
import Button from './Button';
import ErrorBanner from './ErrorBanner';
import { colors, fonts, radii } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { confirmDialog } from '../utils/dialogs';
import {
  listReminderScopes,
  sendBulkReminder,
  type BulkReminderResponse,
  type ReminderScopeResponse,
} from '../services/donationRemindersApi';

/**
 * Lot T11 (docs/notifications.md §2.3) — « RELANCER » : le trésorier écrit d'un coup aux personnes
 * de son périmètre qui n'ont rien déclaré sur la période.
 *
 * ⚠️ **Composant volontairement autonome, posé hors de `app/(tabs)/leader/**`** : cet écran
 * appartient au lot T8 (file « À vérifier »), livré en parallèle. Le brancher directement aurait
 * fait se marcher dessus deux lots sur le même fichier. Il suffit de l'importer et de le rendre —
 * il va chercher lui-même les périmètres de l'appelant et se masque tout seul quand il n'y en a pas.
 *
 * Pas de react-query côté mobile (convention du dépôt) : `useState` + `useFocusEffect`, comme
 * `hooks/useGoalsData.ts`. Le rechargement au focus compte ici : une nomination de trésorier prend
 * effet immédiatement côté serveur, sans nouveau login.
 */
export default function RelanceNonDeclarants({ nodeId }: { nodeId?: string }) {
  const { t } = useLanguage();
  const { isTreasurer } = useAuth();

  const [scopes, setScopes] = useState<ReminderScopeResponse[]>([]);
  const [selected, setSelected] = useState<string | null>(nodeId ?? null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkReminderResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listReminderScopes();
      setScopes(list);
      setSelected((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        return list.length > 0 ? list[0].id : null;
      });
    } catch {
      setError(t('donationReminder.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      if (isTreasurer) load();
      else setLoading(false);
    }, [isTreasurer, load]),
  );

  // Le gating d'écran ne remplace pas la garde serveur (403) : il évite seulement d'afficher un
  // bouton qui ne mènerait nulle part.
  if (!isTreasurer) return null;

  if (loading) {
    return (
      <Card style={styles.card}>
        <ActivityIndicator color={colors.moss} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={styles.card}>
        <ErrorBanner message={error} onRetry={load} />
      </Card>
    );
  }

  if (scopes.length === 0) return null;

  const current = scopes.find((s) => s.id === selected) ?? null;

  const send = async () => {
    if (!current) return;
    const ok = await confirmDialog(
      t('donationReminder.confirmTitle'),
      t('donationReminder.confirmBody', { scope: current.name }),
      t('donationReminder.send'),
    );
    if (!ok) return;
    setSending(true);
    setError(null);
    try {
      const response = await sendBulkReminder({
        scopeId: current.id,
        message: message.trim() || undefined,
      });
      setResult(response);
      setMessage('');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? t('donationReminder.sendError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="megaphone-outline" size={18} color={colors.moss} />
        <Text style={styles.title}>{t('donationReminder.title')}</Text>
      </View>
      <Text style={styles.subtitle}>{t('donationReminder.subtitle')}</Text>

      {scopes.length > 1 && (
        <>
          <Label style={styles.label}>{t('donationReminder.scope')}</Label>
          <View style={styles.chips}>
            {scopes.map((scope) => (
              <Chip
                key={scope.id}
                label={scope.name}
                selected={scope.id === selected}
                onPress={() => {
                  setSelected(scope.id);
                  setResult(null);
                }}
              />
            ))}
          </View>
        </>
      )}

      {current && (
        <Text style={styles.scopeHint}>
          {t('donationReminder.scopeHint', {
            scope: current.name,
            count: current.assemblyCount,
          })}
        </Text>
      )}

      <Label style={styles.label}>{t('donationReminder.message')}</Label>
      <Field
        value={message}
        onChangeText={setMessage}
        placeholder={t('donationReminder.messagePlaceholder')}
        multiline
        maxLength={2000}
        style={styles.message}
      />

      <Button
        label={t('donationReminder.send')}
        onPress={send}
        loading={sending}
        disabled={!current}
        fullWidth
        height={48}
        style={{ marginTop: 14 }}
      />

      {/* Les trois compteurs, toujours affichés ensemble : « personne relancé » ne veut pas dire
          la même chose selon qu'ils ont tous donné ou qu'on vient de les relancer. */}
      {result && (
        <View style={styles.result}>
          <Text style={styles.resultLine}>
            {t('donationReminder.resultSent', { count: result.envoyes })}
          </Text>
          <Text style={styles.resultMuted}>
            {t('donationReminder.resultSkipped', { count: result.dejaRelances })}
          </Text>
          <Text style={styles.resultMuted}>
            {t('donationReminder.resultDeclared', { count: result.dejaDeclares })}
          </Text>
          <Text style={styles.resultPeriod}>
            {t('donationReminder.resultPeriod', { from: result.from, to: result.to })}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.mossDeep },
  subtitle: {
    marginTop: 6,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.ink2,
  },
  label: { marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scopeHint: {
    marginTop: 10,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.ink3,
  },
  message: { minHeight: 80, textAlignVertical: 'top' },
  result: {
    marginTop: 16,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.mossTint,
    gap: 4,
  },
  resultLine: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: colors.mossDeep },
  resultMuted: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  resultPeriod: { marginTop: 4, fontFamily: fonts.sans, fontSize: 11.5, color: colors.ink3 },
});
