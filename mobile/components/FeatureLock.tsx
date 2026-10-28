import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { colors, fonts, radii } from '@/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { offersUrl, type OfferKey } from '@/constants/links';
import { createHandoff } from '@/services/handoffApi';

/**
 * Verrou générique d'une fonctionnalité soumise à un code de droit — lot « pro-plan » (JP 27/10).
 * Généralisé depuis `StudyCityLock` (suivi de la ville, ETUDE_SUIVI) pour servir aussi au suivi de
 * la hiérarchie (HIERARCHIE_SUIVI, plan personnel `DIRIGEANT_HIERARCHIE`), puis, lot « Offres
 * Caleb / Néhémie » (plan 27/10 `05_Plan_Offres_Caleb_Nehemie.md`), aux statistiques d'Évènements
 * d'une ville (EVENEMENTS_SUIVI) et aux CR / Member Care d'une autre assemblée (Caleb).
 *
 * <p>Un aperçu FLOUTÉ (`expo-blur`) d'un gabarit FICTIF codé ici — jamais de données réelles
 * derrière le flou — puis un titre facultatif, un texte NEUTRE (D-OFF-09) et, si `offer` est donné,
 * le nom de l'offre (« Offre Caleb » / « Offre Néhémie », O10 — sans prix).
 *
 * <p>D-OFF-11 (JP 27/10, lève D-ABO-13 sur ce seul point) : sous le texte, un lien « En savoir
 * plus » (`learnMore`, vrai par défaut) ouvre `https://<SHARE_DOMAIN>/offres[?offer=…]` dans le
 * navigateur (§8). RIEN D'AUTRE : aucun prix, aucun montant, aucune période, aucun bouton
 * « S'abonner », aucun champ de code, aucune mention de paiement — sur iOS comme sur Android.
 * Ce composant n'accepte volontairement ni `onPress` ni enfant — ne pas en ajouter.
 *
 * <p>D-PAY-05 (JP 28/10, plan 28/10 `03_Plan_Offres_Paiement_Connexion.md` §7.2) : pour un compte
 * connecté, « En savoir plus » demande d'abord un jeton de passage (usage unique, 120 s) et l'ajoute
 * au FRAGMENT (`#handoff=…`, RG-PAY-12) : la page `/offres` s'ouvre alors déjà connectée, pour payer
 * sans ressaisir ses identifiants. Échec de la demande (réseau, 4xx, 5xx, délai > 3 s) → lien simple,
 * sans message. Toujours AUCUN prix ni bouton de paiement ici (D-OFF-09 / 10 inchangées). Ne jamais
 * journaliser l'URL (elle porte le jeton).
 */
export default function FeatureLock({
  title,
  body,
  compact,
  offer,
  learnMore = true,
}: {
  title?: string | null;
  body: string;
  compact?: boolean;
  /** Offre qui ouvre la fonctionnalité : nomme l'offre et cible la carte de `/offres`. */
  offer?: OfferKey | null;
  /** D-OFF-11 — lien « En savoir plus » vers `/offres` (défaut vrai). */
  learnMore?: boolean;
}) {
  const { t } = useLanguage();
  const { token } = useAuth();
  // Un appui pendant la demande du jeton est ignoré (pas deux jetons, pas deux navigateurs).
  const opening = useRef(false);
  const openOffers = async () => {
    if (opening.current) return;
    opening.current = true;
    try {
      let handoff: string | null = null;
      if (token) {
        // D-PAY-05 / RG-PAY-12 (JP 28/10) : délai max 3 s (timeout du client), tout échec → lien simple.
        handoff = await createHandoff(token)
          .then((r) => r.handoffToken || null)
          .catch(() => null);
      }
      const url = offersUrl(offer, handoff);
      // expo-web-browser (déjà dans le binaire, lecteur `/d/*`) ; repli sur le navigateur système.
      await WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
    } finally {
      opening.current = false;
    }
  };
  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <FakePreview rows={compact ? 3 : 5} />
      {/* Revue 27/10 : sur Android, `blurMethod` vaut 'none' par défaut (voile sans flou) ; le flou
          Dimezis n'opère qu'à partir d'Android 12 (SDK 31), en dessous le voile seul reste. */}
      <BlurView intensity={28} tint="light" blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
      <View style={styles.veil} />
      <View style={styles.message}>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={20} color={colors.moss} />
        </View>
        {!!title && (
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        )}
        <Text style={styles.body}>{body}</Text>
        {!!offer && (
          <Text style={styles.offer}>
            {t(`offers.${offer}.name`)} · {t(`offers.${offer}.subtitle`)}
          </Text>
        )}
        {learnMore && (
          <Pressable onPress={() => void openOffers()} accessibilityRole="link" hitSlop={8} style={styles.learnMore}>
            <Text style={styles.learnMoreText}>{t('offers.learnMore')}</Text>
            <Ionicons name="open-outline" size={14} color={colors.moss} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Gabarit fictif (blocs sans texte) : assemblées × leçons, pour suggérer le contenu verrouillé. */
function FakePreview({ rows }: { rows: number }) {
  const lessons = 7;
  return (
    <View style={styles.preview} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.fakeRow}>
          <View style={[styles.fakeName, { width: 70 + ((r * 37) % 50) }]} />
          <View style={styles.fakeCells}>
            {Array.from({ length: lessons }).map((__, c) => (
              <View key={c} style={[styles.fakeCell, (r + c) % 3 !== 0 && c < lessons - r && styles.fakeCellOn]} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 16,
    minHeight: 280,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
    justifyContent: 'center',
  },
  rootCompact: { minHeight: 200 },
  preview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingVertical: 18, gap: 14 },
  fakeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fakeName: { height: 12, borderRadius: 6, backgroundColor: colors.hairStrong },
  fakeCells: { flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' },
  fakeCell: { width: 18, height: 18, borderRadius: 5, backgroundColor: colors.mossTint2 },
  fakeCellOn: { backgroundColor: colors.mossSoft },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.paper2, opacity: 0.55 },
  message: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28, gap: 10 },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.hairStrong,
  },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, textAlign: 'center', letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2, lineHeight: 20, textAlign: 'center' },
  offer: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink3, textAlign: 'center', letterSpacing: 0.2 },
  learnMore: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  learnMoreText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: colors.moss,
    textDecorationLine: 'underline',
  },
});
