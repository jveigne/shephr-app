import React from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenShell from '../../components/ScreenShell';
import Card from '../../components/Card';
import ErrorBanner from '../../components/ErrorBanner';
import EventForm from '../../components/EventForm';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useEventCatalog } from '../../hooks/useEventCatalog';
import { goBack } from '../../utils/navigation';

/**
 * Plan 14/10 (§6.3, lot E7) — PROGRAMMER UN ÉVÈNEMENT (`PLANNED`).
 *
 * <p>D-EVT-08 : un dirigeant (`DIRIGEANT_UNITE` → `DIRIGEANT_COORDINATEUR`) programme à son niveau
 * ou en dessous ; [HYPOTHÈSE] RG-EVT-03 : le SECRETARIAT aussi, à tous niveaux ; le LEADER non.
 * Rien n'est recalculé ici : l'écran suit `canPlan` de `GET /me/scopes` (contrat §3.2) et ne
 * propose que les nœuds `canPlan`. Un MEMBRE ne programme pas, il déclare (`app/events/declare`).
 *
 * <p>Enregistré, l'évènement s'ouvre en détail : c'est là qu'on le modifiera, le marquera comme
 * réalisé une fois sa date passée (RG-EVT-05) ou l'annulera.
 */
export default function PlanEventScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { me, hasEvents } = useAuth();
  // RG-06 : sans l'abonnement EVENTS, aucune route du module n'est appelée.
  const catalog = useEventCatalog(hasEvents ? me?.id : null);
  const scopes = catalog.scopes;

  let blocker: React.ReactNode = null;
  if (!hasEvents) {
    blocker = <EmptyState icon="lock-closed-outline" text={t('events.declare.moduleUnavailable')} />;
  } else if (catalog.loading) {
    blocker = <ActivityIndicator color={colors.moss} style={{ marginTop: 48 }} />;
  } else if (catalog.error || !scopes) {
    blocker = <ErrorBanner message={t('events.declare.loadFailed')} onRetry={catalog.reload} />;
  } else if (!scopes.canPlan || !scopes.scopes.some((s) => s.canPlan)) {
    blocker = <EmptyState icon="calendar-outline" text={t('events.plan.notAllowed')} />;
  } else if (catalog.types.length === 0) {
    blocker = <EmptyState icon="pricetags-outline" text={t('events.declare.noTypes')} />;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScreenShell withTabBar={false} paddingTop={insets.top ? 4 : 16}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => goBack()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink2} />
          </Pressable>
        </View>
        <Text style={styles.kicker}>{t('events.tab.kicker')}</Text>
        <Text style={styles.title}>{t('events.plan.title')}</Text>
        <Text style={styles.intro}>{t('events.plan.intro')}</Text>

        {catalog.stale && (
          <View style={styles.staleRow}>
            <Ionicons name="cloud-offline-outline" size={15} color={colors.ink3} />
            <Text style={styles.staleText}>{t('events.plan.offline')}</Text>
          </View>
        )}

        {blocker ??
          (scopes && (
            <EventForm
              mode="plan"
              types={catalog.types}
              scopes={scopes}
              onSaved={(saved) => router.replace(`/events/${saved.id}`)}
            />
          ))}
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

function EmptyState({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <Card variant="paper2" style={styles.empty}>
      <Ionicons name={icon} size={26} color={colors.ink3} />
      <Text style={styles.emptyText}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 },
  kicker: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.clay,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink, letterSpacing: -0.5, marginTop: 4 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, marginTop: 6, lineHeight: 20, maxWidth: 330 },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  staleText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.ink3 },
  empty: { marginTop: 24, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
});
