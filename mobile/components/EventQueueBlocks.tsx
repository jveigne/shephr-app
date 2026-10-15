import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Card from '@/components/Card';
import Label from '@/components/Label';
import { EventFigures, EventPill, EventPreacherLine, eventMetaLine, eventRowStyles } from '@/components/EventRow';
import { colors, fonts } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  dismissRejectedEvent,
  flushEventQueue,
  type EventQueueSnapshot,
  type QueuedEvent,
  type RejectedEvent,
} from '@/services/eventQueue';
import { eventFailureMessage } from '@/utils/eventErrors';
import { fmtIsoDay } from '@/utils/meetingReport';
import { isEnglishLang, typeLabel } from '@/utils/events';

/**
 * Plan 14/10 (§6.3, lot E6) — la FILE HORS-LIGNE vue par son auteur, en tête de « Mes actions »
 * (dirigeant : ses évènements ; simple membre : la vue de son assemblée, D-EVT-14 JP 14/10) :
 * <ul>
 *   <li>les déclarations REFUSÉES pendant un envoi en arrière-plan, avec leur raison — un refus
 *       ne doit jamais être silencieux (§3.3 du contrat) ; la personne les retire après lecture ;</li>
 *   <li>les déclarations EN ATTENTE DE SYNCHRO (RG-ACT-08) : déjà visibles pour leur auteur,
 *       avec la raison de l'attente quand le serveur en a donné une (session expirée…). Une
 *       déclaration que le serveur a en fait déjà enregistrée (réponse perdue après un délai
 *       dépassé) n'est montrée qu'une fois : sa ligne enregistrée, reconnue à son `clientId`
 *       (RG-EVT-07, `savedClientIds`) — le prochain vidage la retirera de la file sans doublon.</li>
 * </ul>
 */
export default function EventQueueBlocks({
  queue,
  savedClientIds,
}: {
  queue: EventQueueSnapshot;
  /** `clientId` des évènements déjà affichés depuis le serveur. */
  savedClientIds: ReadonlySet<string>;
}) {
  const { t, language } = useLanguage();
  const isEnglish = isEnglishLang(language);
  const labelOf = (item: QueuedEvent) =>
    item.request.customLabel || typeLabel({ name: item.typeName, nameEn: item.typeNameEn }, isEnglish);
  const pending = queue.pending.filter((p) => !savedClientIds.has(p.request.clientId));

  return (
    <>
      {queue.rejected.length > 0 && (
        <View style={styles.block}>
          <Label>{t('events.mine.rejectedTitle')}</Label>
          {queue.rejected.map((item) => (
            <RejectedRow
              key={item.request.clientId}
              item={item}
              label={labelOf(item)}
              onDismiss={() => void dismissRejectedEvent(item.request.clientId)}
            />
          ))}
        </View>
      )}

      {pending.length > 0 && (
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Label>{t('events.mine.pendingTitle', { count: pending.length })}</Label>
            {queue.syncing ? (
              <ActivityIndicator size="small" color={colors.moss} />
            ) : (
              <Pressable onPress={() => void flushEventQueue()} hitSlop={8}>
                <Text style={styles.link}>{t('events.mine.syncNow')}</Text>
              </Pressable>
            )}
          </View>
          {pending.map((item) => (
            <PendingRow key={item.request.clientId} item={item} label={labelOf(item)} />
          ))}
        </View>
      )}
    </>
  );
}

/**
 * Pourquoi l'élément attend encore, d'après son dernier échec (`QueuedEvent.lastFailure`) : rien
 * hors ligne (la personne le voit), sinon une phrase — une session expirée (401) ne se résout
 * qu'en se reconnectant, mobile n'interceptant pas les 401 (CLAUDE.md, point n°5).
 */
function pendingReasonKey(item: QueuedEvent): string | null {
  const failure = item.lastFailure;
  if (!failure) return null;
  if (failure.status === 401) return 'events.mine.pendingSessionExpired';
  if (failure.status === 403 && failure.code === 'MODULE_ACCESS_DENIED') {
    return 'events.mine.pendingModuleDenied';
  }
  return 'events.mine.pendingRetrying';
}

function PendingRow({ item, label }: { item: QueuedEvent; label: string }) {
  const { t } = useLanguage();
  const r = item.request;
  const reasonKey = pendingReasonKey(item);
  return (
    <Card variant="paper2" style={[styles.row, styles.rowPending]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {label}
        </Text>
        <EventPill tone={colors.earthDeep} icon="cloud-upload-outline" text={t('events.mine.pending')} />
      </View>
      <Text style={styles.rowMeta}>{eventMetaLine(fmtIsoDay(r.eventDate, t), r.place, item.scopeName)}</Text>
      {/* D-EVT-16 (JP 14/10) : `preacher` n'est mis en file que pour un type évangélique ; absent
          d'un élément plus ancien, la ligne n'en dit rien. */}
      <EventPreacherLine preacher={r.preacher} />
      {/* D-EVT-15 (JP 14/10) : compteurs évangéliques seulement si le type l'était à la saisie.
          D-EVT-17 (JP 14/10) : invités pour tout type ; absents d'un élément plus ancien. */}
      <EventFigures counters={item.evangelism ? r : { participants: r.participants, guests: r.guests }} />
      {reasonKey && <Text style={styles.pendingReason}>{t(reasonKey)}</Text>}
    </Card>
  );
}

function RejectedRow({
  item,
  label,
  onDismiss,
}: {
  item: RejectedEvent;
  label: string;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  const r = item.request;
  return (
    <Card variant="paper2" style={[styles.row, styles.rowRejected]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {label}
        </Text>
        <EventPill tone={colors.clay} icon="alert-circle-outline" text={t('events.mine.rejected')} />
      </View>
      <Text style={styles.rowMeta}>{eventMetaLine(fmtIsoDay(r.eventDate, t), r.place, item.scopeName)}</Text>
      <Text style={styles.rejectReason}>
        {eventFailureMessage(item.failure, t, t('errors.saveFailed'))}
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
        <Text style={[styles.link, { color: colors.clay }]}>{t('events.mine.dismiss')}</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 20, gap: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: '600', color: colors.moss },
  ...eventRowStyles,
  rowPending: { borderStyle: 'dashed', borderColor: colors.hairStrong },
  // Argile à 35 % d'opacité (0x59), même procédé que `EventPill` : la palette, sans couleur en dur.
  rowRejected: { borderColor: colors.clay + '59' },
  pendingReason: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: colors.earthDeep, lineHeight: 17 },
  rejectReason: { marginTop: 6, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
});
