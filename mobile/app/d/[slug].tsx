import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import Button from '@/components/Button';
import Card from '@/components/Card';
import PdfReader, { isPdfReaderAvailable, type PdfSource } from '@/components/documents/PdfReader';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  categoryLabel,
  documentErrorCode,
  getDocumentFile,
  getDocumentPreview,
  getPublicDocument,
  isDocumentGone,
  logDocumentEvent,
  type PublicDocument,
} from '@/services/documentsApi';
import {
  forgetFullCache,
  fullCacheFileName,
  getReadDocument,
  markFullyCached,
  rememberDocument,
} from '@/services/documentReadCache';
import { clearReturnTarget, rememberReturnTarget } from '@/services/returnTarget';
import { webReaderUrl } from '@/constants/links';
import { goBack } from '@/utils/navigation';

/**
 * Plan 18/10 (§6.3, lot D5) — LECTEUR d'un document partagé par lien universel
 * `https://<SHARE_DOMAIN>/d/{slug}[?r={ref}]` : expo-router fait correspondre ce chemin (Universal
 * Link iOS / App Link Android, `app.json`) ; on y vient aussi de l'espace Documents.
 *
 * <p>Qui lit quoi (RG-DOC-01, D-DOC-04 JP 18/10) :
 * - compte connecté ET rattaché (`isAttachedAccount`, tout ministère — D-DOC-12) → document
 *   COMPLET (`/api/church/documents/{slug}/file`), mis en cache disque sous `${slug}-v${version}`
 *   et relisible hors ligne (D-DOC-13, RG-DOC-08) ;
 * - non connecté → aperçu (`/preview`) + mur « Se connecter / Créer un compte » ;
 * - connecté non rattaché (ou 403 `DOCUMENT_JOIN_REQUIRED` : le serveur reste juge) → aperçu + mur
 *   « Rejoindre mon assemblée » (`/(auth)/join`) ;
 * - document `open` (D-DOC-06) → complet pour tous, sans mur.
 * 404 et 410 → « Ce document n'est plus disponible » (RG-DOC-02 : jamais de lien mort).
 *
 * <p>Retour après connexion : la cible (`/d/{slug}?r=…`) est mémorisée dès qu'on arrive sans
 * session, et à chaque bouton du mur ; connexion, inscription et `/join` la rouvrent
 * (`services/returnTarget`, `utils/authRouting`). L'écran resté sous la pile se recharge alors avec
 * la nouvelle session.
 *
 * <p>Journal (RG-DOC-10, contrat §4.4) : `OPEN` une fois par ouverture, `WALL` une fois quand le mur
 * s'affiche, `SHARE` avant la feuille de partage — tous en `surface = APP`, avec le `?r=` reçu.
 *
 * <p>Expo web (démos, D-DOC-13) : pas de lecteur natif → la page web du lecteur en `iframe`.
 */
export default function DocumentLinkScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[]; r?: string | string[] }>();
  const slug = first(params.slug) ?? '';
  const ref = first(params.r) || null;
  if (Platform.OS === 'web') return <DocumentWebFrame slug={slug} refParam={ref} />;
  return <DocumentReader slug={slug} refParam={ref} />;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Chemin à rouvrir après connexion — le `?r=` suit, pour relier l'ouverture au partage (D-DOC-11). */
function linkPath(slug: string, ref: string | null): string {
  return ref ? `/d/${slug}?r=${ref}` : `/d/${slug}`;
}

type WallKind = 'login' | 'join';

type Phase =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error'; offline: boolean }
  | {
      kind: 'ready';
      /** `full` : document complet (rattaché ou `open`) ; `preview` : aperçu seul. */
      mode: 'full' | 'preview';
      source: PdfSource;
      /** Relu depuis le cache disque sans URL : un échec doit redemander `/file`. */
      fromCacheOnly: boolean;
      /** Version du PDF complet chargé (à marquer « en cache » une fois affiché). */
      fullVersion: number | null;
      /** Mur à afficher en fin d'aperçu ; null = aucun (RG-DOC-01c). */
      wall: WallKind | null;
    };

function DocumentReader({ slug, refParam }: { slug: string; refParam: string | null }) {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { ready, isAuthenticated, me, hasDocuments } = useAuth();
  const attached = isAuthenticated && isAttachedAccount(me);

  const [doc, setDoc] = useState<PublicDocument | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Journal : une fois par OUVERTURE de l'écran (et par slug), pas à chaque rechargement dû à un
  // changement de session.
  const openLogged = useRef<string | null>(null);
  const wallLogged = useRef<string | null>(null);
  // Le chargement le plus récent seul a le droit d'écrire l'état.
  const loadSeq = useRef(0);

  // Arrivée sans session : on retient le lien pour y revenir après connexion / inscription.
  useEffect(() => {
    if (ready && !isAuthenticated && slug) void rememberReturnTarget(linkPath(slug, refParam));
  }, [ready, isAuthenticated, slug, refParam]);

  // …et on l'oublie si la personne quitte le lecteur SANS s'être connectée : sinon une connexion
  // ultérieure (dans le TTL) la ramènerait sur un document abandonné. Aller vers login / signup / join
  // empile un écran sans démonter le lecteur ; après connexion, la session est déjà ouverte au
  // démontage et `takeReturnTarget` a lui-même vidé la cible.
  const authRef = useRef(isAuthenticated);
  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);
  useEffect(
    () => () => {
      if (!authRef.current) void clearReturnTarget();
    },
    [],
  );

  /** Aperçu (ou document complet si `open`) via l'URL signée publique. */
  const previewPhase = useCallback(
    async (d: PublicDocument, wall: WallKind | null): Promise<Phase> => {
      const p = await getDocumentPreview(d.slug);
      const hasWall = !d.open && d.freePages < d.pageCount;
      return {
        kind: 'ready',
        mode: d.open ? 'full' : 'preview',
        // Pas de cache disque pour l'aperçu : changer `freePages` le réécrit SOUS LA MÊME version
        // (contrat §3.5) — un fichier gardé par version serait périmé.
        source: { uri: p.url, cache: false },
        fromCacheOnly: false,
        fullVersion: null,
        wall: hasWall ? wall : null,
      };
    },
    [],
  );

  /** Document complet d'un compte rattaché : cache disque d'abord, `/file` sinon. */
  const fullPhase = useCallback(
    async (d: PublicDocument, skipCache: boolean): Promise<Phase> => {
      const entry = skipCache ? null : await getReadDocument(d.slug);
      if (entry?.fullVersion === d.version && isPdfReaderAvailable()) {
        // Contrat §5.1 : version en cache = version serveur → relue sans rappeler `/file`.
        return {
          kind: 'ready',
          mode: 'full',
          source: { uri: '', cache: true, cacheFileName: fullCacheFileName(d.slug, d.version) },
          fromCacheOnly: true,
          fullVersion: d.version,
          wall: null,
        };
      }
      const f = await getDocumentFile(d.slug);
      return {
        kind: 'ready',
        mode: 'full',
        source: { uri: f.url, cache: true, cacheFileName: fullCacheFileName(d.slug, f.version) },
        fromCacheOnly: false,
        fullVersion: f.version,
        wall: null,
      };
    },
    [],
  );

  const load = useCallback(
    async (opts?: { skipCache?: boolean }) => {
      if (!ready || !slug) return;
      const seq = ++loadSeq.current;
      const apply = (p: Phase) => {
        if (seq === loadSeq.current) setPhase(p);
      };
      setPhase({ kind: 'loading' });
      setWallOpen(false);
      setPage(1);
      setPages(null);

      let d: PublicDocument;
      try {
        d = await getPublicDocument(slug);
      } catch (e: any) {
        if (seq !== loadSeq.current) return;
        if (isDocumentGone(e)) return apply({ kind: 'gone' });
        if (!e?.response) {
          // Hors ligne : un document déjà lu EN ENTIER sur cet appareil se relit (D-DOC-13).
          const entry = await getReadDocument(slug);
          if (
            entry &&
            attached &&
            entry.fullVersion === entry.doc.version &&
            isPdfReaderAvailable()
          ) {
            setDoc(entry.doc);
            return apply({
              kind: 'ready',
              mode: 'full',
              source: {
                uri: '',
                cache: true,
                cacheFileName: fullCacheFileName(slug, entry.doc.version),
              },
              fromCacheOnly: true,
              fullVersion: entry.doc.version,
              wall: null,
            });
          }
          if (entry) setDoc(entry.doc);
          return apply({ kind: 'error', offline: true });
        }
        return apply({ kind: 'error', offline: false });
      }
      if (seq !== loadSeq.current) return;
      setDoc(d);
      void rememberDocument(d);
      if (openLogged.current !== slug) {
        openLogged.current = slug;
        void logDocumentEvent(slug, 'OPEN', refParam);
      }

      try {
        if (d.open) return apply(await previewPhase(d, null));
        if (attached) {
          try {
            return apply(await fullPhase(d, !!opts?.skipCache));
          } catch (e: any) {
            // Le serveur reste juge du rattachement (contrat §2.3).
            if (documentErrorCode(e) !== 'DOCUMENT_JOIN_REQUIRED') throw e;
            return apply(await previewPhase(d, 'join'));
          }
        }
        return apply(await previewPhase(d, isAuthenticated ? 'join' : 'login'));
      } catch (e: any) {
        if (isDocumentGone(e)) return apply({ kind: 'gone' });
        return apply({ kind: 'error', offline: !e?.response });
      }
    },
    [ready, slug, attached, isAuthenticated, refParam, previewPhase, fullPhase],
  );

  // Rechargé quand la session change : retour de la connexion ou du rattachement sur cet écran.
  useEffect(() => {
    void load();
  }, [load]);

  const onLoadComplete = (n: number) => {
    setPages(n);
    if (phase.kind === 'ready' && phase.mode === 'full' && phase.fullVersion != null && !doc?.open) {
      void markFullyCached(slug, phase.fullVersion);
    }
    if (n <= 1) reachEnd();
  };

  const onPageChanged = (p: number, n: number) => {
    setPage(p);
    setPages(n);
    if (p >= n) reachEnd();
  };

  /** Dernière page de l'aperçu atteinte : le mur s'ouvre (journal `WALL`, une fois). */
  const reachEnd = () => {
    if (phase.kind !== 'ready' || !phase.wall) return;
    setWallOpen(true);
    if (wallLogged.current !== slug) {
      wallLogged.current = slug;
      void logDocumentEvent(slug, 'WALL', refParam);
    }
  };

  const onPdfError = () => {
    // Cache disque purgé par le système : on ne le promet plus et on redemande le fichier.
    if (phase.kind === 'ready' && phase.fromCacheOnly) {
      void forgetFullCache(slug).then(() => load({ skipCache: true }));
      return;
    }
    setPhase({ kind: 'error', offline: false });
  };

  /** RG-SHARE-01/03 : journal `SHARE` d'abord (→ lien `?r=`), repli sur le lien sans `r`. */
  const onShare = async () => {
    if (!doc || sharing) return;
    setSharing(true);
    try {
      const res = await logDocumentEvent(slug, 'SHARE', refParam);
      const url = res?.shareUrl ?? doc.shareUrl;
      await Share.share(
        Platform.OS === 'ios'
          ? { message: doc.title, url }
          : { message: `${doc.title}\n${url}`, title: doc.title },
        { dialogTitle: t('documents.reader.share') },
      );
    } catch {
      // Feuille fermée ou indisponible : rien à signaler.
    } finally {
      setSharing(false);
    }
  };

  const goToAuth = (target: '/(auth)/login' | '/(auth)/signup' | '/(auth)/join') => {
    void rememberReturnTarget(linkPath(slug, refParam)).then(() => router.push(target));
  };

  const showMore = hasDocuments && attached;
  const back = () => goBack(isAuthenticated ? '/(tabs)/home' : '/(auth)/login');

  // ─── Rendu ─────────────────────────────────────────────────────────────────────────────────

  if (phase.kind === 'gone') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <HeaderBack onPress={back} />
        <View style={styles.centered}>
          <Card variant="paper2" style={styles.stateCard}>
            <Ionicons name="document-outline" size={30} color={colors.ink3} />
            <Text style={styles.stateTitle}>{t('documents.reader.unavailableTitle')}</Text>
            <Text style={styles.stateBody}>{t('documents.reader.unavailableBody')}</Text>
            {showMore ? (
              <Button
                label={t('documents.reader.more')}
                onPress={() => router.replace('/documents')}
                fullWidth
                style={{ marginTop: 6 }}
              />
            ) : (
              <Button
                label={isAuthenticated ? t('documents.reader.home') : t('documents.wall.login')}
                variant="soft"
                onPress={() => router.replace(isAuthenticated ? '/(tabs)/home' : '/(auth)/login')}
                fullWidth
                style={{ marginTop: 6 }}
              />
            )}
          </Card>
        </View>
      </View>
    );
  }

  const ready_ = phase.kind === 'ready';
  const preview = ready_ && phase.mode === 'preview';
  const remaining = doc ? Math.max(0, doc.pageCount - doc.freePages) : 0;
  const category = doc ? categoryLabel(doc.categoryName, doc.categoryNameEn, language) : null;
  const subtitle = [doc?.author, category].filter(Boolean).join(' · ');
  const indicator = !ready_
    ? null
    : preview
      ? t('documents.reader.previewIndicator', { page, count: pages ?? doc?.freePages ?? 0 })
      : pages
        ? t('documents.reader.pageIndicator', { page, count: pages })
        : null;
  const nativeMissing = ready_ && !isPdfReaderAvailable();

  return (
    <View style={styles.root}>
      {/* En-tête léger : retour, titre, auteur · catégorie, indicateur de page. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.headerIcon} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {doc?.title ?? t('documents.reader.loading')}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {!!doc && (
          <Pressable
            onPress={onShare}
            hitSlop={10}
            style={styles.headerIcon}
            accessibilityLabel={t('documents.reader.share')}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={colors.moss} />
            ) : (
              <Ionicons name="share-outline" size={21} color={colors.moss} />
            )}
          </Pressable>
        )}
      </View>
      {!!indicator && (
        <View style={styles.indicatorRow}>
          <Text style={[styles.indicator, preview && styles.indicatorPreview]}>{indicator}</Text>
        </View>
      )}

      {/* Corps */}
      <View style={{ flex: 1 }}>
        {phase.kind === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.moss} />
          </View>
        )}
        {phase.kind === 'error' && (
          <View style={styles.centered}>
            <Card variant="paper2" style={styles.stateCard}>
              <Ionicons
                name={phase.offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
                size={28}
                color={colors.ink3}
              />
              <Text style={styles.stateBody}>
                {phase.offline ? t('documents.reader.offline') : t('documents.reader.loadFailed')}
              </Text>
              <Button
                label={t('common.retry')}
                variant="soft"
                onPress={() => void load()}
                fullWidth
                style={{ marginTop: 6 }}
              />
            </Card>
          </View>
        )}
        {phase.kind === 'ready' &&
          (nativeMissing ? (
            // Binaire sans le module natif (dev build / version du store antérieure) : on le dit,
            // et le PDF reste ouvrable dans le navigateur du système.
            <View style={styles.centered}>
              <Card variant="paper2" style={styles.stateCard}>
                <Ionicons name="download-outline" size={28} color={colors.ink3} />
                <Text style={styles.stateTitle}>{t('documents.reader.updateTitle')}</Text>
                <Text style={styles.stateBody}>{t('documents.reader.updateBody')}</Text>
                {!!phase.source.uri && (
                  <Button
                    label={t('documents.reader.openInBrowser')}
                    variant="soft"
                    onPress={() => void WebBrowser.openBrowserAsync(phase.source.uri)}
                    fullWidth
                    style={{ marginTop: 6 }}
                  />
                )}
              </Card>
            </View>
          ) : (
            <PdfReader
              source={phase.source}
              onLoadComplete={onLoadComplete}
              onPageChanged={onPageChanged}
              onError={onPdfError}
            />
          ))}

        {/* Mur de fin d'aperçu (RG-DOC-01) — ton positif, jamais punitif (spec §7). */}
        {phase.kind === 'ready' && phase.wall && doc && (
          wallOpen ? (
            <View style={[styles.wallWrap, { paddingBottom: insets.bottom + 12 }]}>
              <Card style={styles.wall}>
                <Pressable
                  onPress={() => setWallOpen(false)}
                  hitSlop={10}
                  style={styles.wallClose}
                  accessibilityLabel={t('common.cancel')}
                >
                  <Ionicons name="close" size={18} color={colors.ink3} />
                </Pressable>
                <Text style={styles.wallTitle}>{t('documents.wall.title', { title: doc.title })}</Text>
                <Text style={styles.wallBody}>{t('documents.wall.body')}</Text>
                {remaining > 0 && (
                  <Text style={styles.wallRemaining}>
                    {t('documents.wall.remaining', { count: remaining })}
                  </Text>
                )}
                {phase.wall === 'login' ? (
                  <>
                    <Text style={styles.wallHint}>{t('documents.wall.loginHint')}</Text>
                    <Button
                      label={t('documents.wall.login')}
                      onPress={() => goToAuth('/(auth)/login')}
                      fullWidth
                      height={50}
                      style={{ marginTop: 12 }}
                      iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
                    />
                    <Button
                      label={t('documents.wall.signup')}
                      variant="soft"
                      onPress={() => goToAuth('/(auth)/signup')}
                      fullWidth
                      height={46}
                      style={{ marginTop: 8 }}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.wallHint}>{t('documents.wall.joinHint')}</Text>
                    <Button
                      label={t('documents.wall.join')}
                      onPress={() => goToAuth('/(auth)/join')}
                      fullWidth
                      height={50}
                      style={{ marginTop: 12 }}
                      iconRight={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
                    />
                  </>
                )}
              </Card>
            </View>
          ) : (
            <View style={[styles.wallPillWrap, { bottom: showMore ? 16 : insets.bottom + 16 }]}>
              <Pressable onPress={() => setWallOpen(true)} style={styles.wallPill}>
                <Ionicons name="lock-open-outline" size={15} color={colors.white} />
                <Text style={styles.wallPillText}>
                  {remaining > 0
                    ? t('documents.wall.remaining', { count: remaining })
                    : t('documents.wall.continue')}
                </Text>
              </Pressable>
            </View>
          )
        )}
      </View>

      {/* Barre du bas : « D'autres documents » — l'espace Documents, si le compte y a accès. */}
      {showMore && !wallOpen && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <Button
            label={t('documents.reader.more')}
            variant="soft"
            onPress={() => router.push('/documents')}
            fullWidth
            height={46}
            iconLeft={<Ionicons name="library-outline" size={17} color={colors.mossDeep} />}
          />
        </View>
      )}
    </View>
  );
}

function HeaderBack({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={22} color={colors.ink2} />
      </Pressable>
    </View>
  );
}

/**
 * D-DOC-13 — Expo web (démos) : `react-native-pdf` n'existe pas ; on affiche la page web du lecteur
 * (`shephr-app/web`, `/d/:slug`) en `iframe`. Elle journalise elle-même en `WEB` : rien ici.
 */
function DocumentWebFrame({ slug, refParam }: { slug: string; refParam: string | null }) {
  const { isAuthenticated } = useAuth();
  const src = webReaderUrl(slug) + (refParam ? `?r=${encodeURIComponent(refParam)}` : '');
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <HeaderBack onPress={() => goBack(isAuthenticated ? '/(tabs)/home' : '/(auth)/login')} />
      </View>
      {React.createElement('iframe', {
        src,
        title: slug,
        style: { flex: 1, width: '100%', height: '100%', border: 0 },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.hair,
  },
  headerIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 1 },
  indicatorRow: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: colors.paper2,
    borderBottomWidth: 1,
    borderBottomColor: colors.hair,
  },
  indicator: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink2, letterSpacing: 0.6 },
  indicatorPreview: { color: colors.clay },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stateCard: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  stateTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
  },
  stateBody: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    lineHeight: 20,
    textAlign: 'center',
  },
  wallWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  wall: { paddingHorizontal: 20, paddingVertical: 20, borderRadius: radii.lg },
  wallClose: { position: 'absolute', top: 12, right: 12, zIndex: 1 },
  wallTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.2,
    paddingRight: 24,
  },
  wallBody: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2, lineHeight: 20, marginTop: 8 },
  wallRemaining: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.clay,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 10,
  },
  wallHint: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, lineHeight: 19, marginTop: 10 },
  wallPillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  wallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.moss,
  },
  wallPillText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.white },
  bottomBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
  },
});
