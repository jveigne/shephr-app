import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Field from '@/components/Field';
import Label from '@/components/Label';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  DOCUMENT_ERROR_CODES,
  documentErrorCode,
  getDocumentCategories,
  listDocuments,
  type DocumentCategoryItem,
  type DocumentListItem,
} from '@/services/documentsApi';
import { buildFolderTree, folderPath, type FolderNode } from '@/utils/documentFolders';
import { goBack } from '@/utils/navigation';

/**
 * Plan 18/10 (§6.3, RG-DOC-09) — ESPACE DOCUMENTS de l'app. D-DOC-14 (JP 18/10) [HYPOTHÈSE] : une
 * tuile de l'accueil et cet écran, PAS un onglet (la barre en compte déjà jusqu'à 8).
 *
 * <p>Visible si le ministère du compte a `DOCUMENTS` (RG-06, `hasDocuments`) ET que le compte est
 * rattaché (`isAttachedAccount`) — le serveur juge de même (403 `MODULE_ACCESS_DENIED` /
 * `DOCUMENT_JOIN_REQUIRED`). Contenu filtré côté serveur (RG-FOLDER-02).
 *
 * <p>D-DOC-16 (JP 19/10) — DOSSIERS : l'écran se parcourt dossier par dossier, comme Drive (fini
 * les puces de catégories et les sections par portée). À la racine : les dossiers racines puis les
 * documents « sans dossier » ; dans un dossier : ses sous-dossiers puis ses documents. Le dossier
 * courant est le paramètre de route `?folder=<id>` : entrer dans un dossier POUSSE le même écran,
 * de sorte que le retour système (Android, geste iOS) remonte d'un dossier avant de quitter
 * l'espace. Seuls les dossiers contenant un document visible apparaissent, avec leur nombre de
 * documents (récursif). La portée devient une mention sur chaque ligne (« Bruxelles »).
 *
 * <p>La recherche (titre) reste GLOBALE, quel que soit le dossier courant : résultats à plat avec le
 * chemin du dossier sous chaque titre. Pattern de données local : `useState` + `useFocusEffect`,
 * pas de react-query ; le dernier chargement est gardé en mémoire (lié au compte) pour qu'entrer
 * dans un dossier s'affiche sans attente, puis se revalide. Ouvrir un document = le lecteur du lien
 * (`/d/{slug}`).
 */
export default function DocumentsScreen() {
  const { t, language } = useLanguage();
  const { me, hasDocuments } = useAuth();
  const active = hasDocuments && isAttachedAccount(me);
  const { folder } = useLocalSearchParams<{ folder?: string }>();
  const folderId = typeof folder === 'string' && folder ? folder : null;

  const cached = me && snapshot?.userId === me.id ? snapshot : null;
  const [docs, setDocs] = useState<DocumentListItem[]>(cached?.docs ?? []);
  const [categories, setCategories] = useState<DocumentCategoryItem[]>(cached?.categories ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!active) {
      setLoading(false);
      return;
    }
    try {
      const [list, cats] = await Promise.all([listDocuments(), getDocumentCategories()]);
      setDocs(list);
      setCategories(cats);
      setLoadError(null);
      if (me) snapshot = { userId: me.id, docs: list, categories: cats };
    } catch (e: any) {
      const code = documentErrorCode(e);
      setLoadError(
        !e?.response
          ? t('documents.space.offline')
          : code && DOCUMENT_ERROR_CODES.includes(code)
            ? t(`documents.errors.${code}`)
            : code === 'MODULE_ACCESS_DENIED'
              ? t('documents.space.moduleUnavailable')
              : (e.response.data?.message ?? t('documents.space.loadFailed')),
      );
    } finally {
      setLoading(false);
    }
  }, [active, me, t]);

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

  const tree = useMemo(() => buildFolderTree(categories, docs, language), [categories, docs, language]);
  const path = useMemo(() => folderPath(tree, folderId), [tree, folderId]);
  const current: FolderNode | null = path.length ? path[path.length - 1] : null;
  // Dossier demandé mais absent (vidé, désactivé, lien périmé) — seulement une fois chargé.
  const folderMissing = !!folderId && !current && !loading && !loadError;

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => (q ? docs.filter((d) => d.title.toLowerCase().includes(q)) : []),
    [docs, q],
  );

  const scopeLabel = (d: DocumentListItem) => {
    if (d.scopeLevel === 'MINISTRY') return t('documents.space.wholeMinistry');
    if (d.scopeLevel === 'UNIT' && d.scopeId && d.scopeId === me?.goalUnitId) return t('documents.space.myAssembly');
    return d.scopeName ?? t(`documents.scope.${d.scopeLevel}`);
  };

  const pathLabel = (d: DocumentListItem) => {
    const p = folderPath(tree, d.categoryId);
    return p.length ? p.map((f) => f.label).join(' › ') : t('documents.space.unfiled');
  };

  const openDoc = (d: DocumentListItem) => router.push({ pathname: '/d/[slug]', params: { slug: d.slug } });
  const openFolder = (f: FolderNode) => router.push({ pathname: '/documents', params: { folder: f.id } });

  const subFolders = current ? current.children : tree.roots;
  const folderDocs = current ? current.docs : tree.unfiled;
  const nothing = !loading && !loadError && docs.length === 0;
  const emptyFolder = !!current && subFolders.length === 0 && folderDocs.length === 0;

  const renderDoc = (d: DocumentListItem, withPath: boolean) => (
    <DocumentRow
      key={d.slug}
      doc={d}
      scope={scopeLabel(d)}
      path={withPath ? pathLabel(d) : null}
      onPress={() => openDoc(d)}
    />
  );

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
      {folderId && active ? (
        // Fil d'Ariane : « Documents › Parent › » au-dessus du nom du dossier courant.
        <Text style={styles.kicker} numberOfLines={1}>
          {[t('documents.space.title'), ...path.slice(0, -1).map((f) => f.label)].join(' › ')}
        </Text>
      ) : (
        <Text style={styles.kicker}>{t('documents.space.kicker')}</Text>
      )}
      <Text style={styles.title} numberOfLines={2}>
        {current && active ? current.label : t('documents.space.title')}
      </Text>

      {!active ? (
        <Card variant="paper2" style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.ink3} />
          <Text style={styles.emptyText}>
            {hasDocuments ? t('documents.space.joinRequired') : t('documents.space.moduleUnavailable')}
          </Text>
          {hasDocuments && (
            <Text style={styles.link} onPress={() => router.push('/(auth)/join')}>
              {t('documents.wall.join')}
            </Text>
          )}
        </Card>
      ) : (
        <>
          <View style={{ marginTop: 16 }}>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder={t('documents.space.searchPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          {!!loadError && <ErrorBanner message={loadError} onRetry={load} />}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.moss} />
            </View>
          ) : nothing ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name="library-outline" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('documents.space.empty')}</Text>
            </Card>
          ) : q ? (
            searchResults.length === 0 ? (
              <Card variant="paper2" style={styles.empty}>
                <Ionicons name="search-outline" size={26} color={colors.ink3} />
                <Text style={styles.emptyText}>{t('documents.space.noMatch')}</Text>
              </Card>
            ) : (
              <View style={styles.block}>{searchResults.map((d) => renderDoc(d, true))}</View>
            )
          ) : folderMissing || emptyFolder ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name="folder-open-outline" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('documents.space.folderEmpty')}</Text>
            </Card>
          ) : (
            <>
              {subFolders.length > 0 && (
                <View style={styles.block}>
                  <Label style={styles.blockLabel}>
                    {current ? t('documents.space.subfolders') : t('documents.space.folders')}
                  </Label>
                  {subFolders.map((f) => (
                    <FolderRow key={f.id} folder={f} onPress={() => openFolder(f)} />
                  ))}
                </View>
              )}
              {folderDocs.length > 0 && (
                <View style={styles.block}>
                  <Label style={styles.blockLabel}>
                    {current ? t('documents.space.documents') : t('documents.space.unfiled')}
                  </Label>
                  {folderDocs.map((d) => renderDoc(d, false))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </ScreenShell>
  );
}

/**
 * Dernier chargement, lié au compte (`me.id`) : chaque niveau de dossier est un écran poussé, il
 * s'affiche aussitôt avec ces données puis se revalide (useFocusEffect). Jamais partagé entre comptes.
 */
let snapshot: { userId: string; docs: DocumentListItem[]; categories: DocumentCategoryItem[] } | null = null;

function FolderRow({ folder, onPress }: { folder: FolderNode; onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={[styles.rowIcon, styles.folderIcon]}>
        <Ionicons name="folder-outline" size={20} color={colors.clay} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {folder.label}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {t('documents.space.documentCount', { count: folder.count })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </Pressable>
  );
}

function DocumentRow({
  doc,
  scope,
  path,
  onPress,
}: {
  doc: DocumentListItem;
  /** D-DOC-16 : la portée n'est plus une section, mais une mention sur la ligne. */
  scope: string;
  /** Chemin du dossier — affiché seulement en recherche (résultats à plat). */
  path: string | null;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const meta = [doc.author, scope, t('documents.space.pages', { count: doc.pageCount })]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.rowIcon}>
        <Ionicons name="document-text-outline" size={20} color={colors.moss} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {doc.title}
        </Text>
        {!!path && (
          <View style={styles.pathRow}>
            <Ionicons name="folder-outline" size={12} color={colors.ink3} />
            <Text style={styles.pathText} numberOfLines={1}>
              {path}
            </Text>
          </View>
        )}
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
    </Pressable>
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
  block: { marginTop: 20, gap: 8 },
  blockLabel: { marginBottom: 0 },
  loadingBox: { marginTop: 40, alignItems: 'center' },
  empty: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink2,
    lineHeight: 20,
    textAlign: 'center',
  },
  link: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.moss },
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
  folderIcon: { backgroundColor: colors.paper2 },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  pathText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, letterSpacing: -0.1 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
});
