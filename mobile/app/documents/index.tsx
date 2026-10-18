import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Chip from '@/components/Chip';
import Field from '@/components/Field';
import Label from '@/components/Label';
import ErrorBanner from '@/components/ErrorBanner';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isAttachedAccount } from '@/services/authApi';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_SCOPE_ORDER,
  categoryLabel,
  documentErrorCode,
  getDocumentCategories,
  listDocuments,
  type DocumentCategoryItem,
  type DocumentListItem,
} from '@/services/documentsApi';
import { goBack } from '@/utils/navigation';

/**
 * Plan 18/10 (§6.3, RG-DOC-09) — ESPACE DOCUMENTS de l'app. D-DOC-14 (JP 18/10) [HYPOTHÈSE] : une
 * tuile de l'accueil et cet écran, PAS un onglet (la barre en compte déjà jusqu'à 8).
 *
 * <p>Visible si le ministère du compte a `DOCUMENTS` (RG-06, `hasDocuments`) ET que le compte est
 * rattaché (`isAttachedAccount`) — le serveur juge de même (403 `MODULE_ACCESS_DENIED` /
 * `DOCUMENT_JOIN_REQUIRED`). Contenu (RG-FOLDER-02, filtré côté serveur) : liste groupée par portée
 * — « Tout le ministère », la nation, la région, la ville, « Mon assemblée » —, puces de catégories
 * et recherche sur le titre. Pas d'arbre navigable en V1.
 *
 * <p>La liste arrive triée (portée, nom, publication ↓, contrat §5.2) et porte `categoryId` : puces
 * et recherche filtrent EN LOCAL, sans rappel. Pattern de données local : `useState` +
 * `useFocusEffect`, pas de react-query. Ouvrir un document = le lecteur du lien (`/d/{slug}`).
 */
export default function DocumentsScreen() {
  const { t, language } = useLanguage();
  const { me, hasDocuments } = useAuth();
  const active = hasDocuments && isAttachedAccount(me);

  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [categories, setCategories] = useState<DocumentCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
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
  }, [active, t]);

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

  // Une catégorie choisie qui n'a plus de document ne doit pas vider l'écran sans raison visible :
  // les puces ne montrent que les catégories utilisées par au moins un document.
  const usedCategories = useMemo(() => {
    const used = new Set(docs.map((d) => d.categoryId).filter(Boolean));
    return categories.filter((c) => used.has(c.id));
  }, [docs, categories]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = docs.filter(
      (d) =>
        (!categoryId || d.categoryId === categoryId) &&
        (!q || d.title.toLowerCase().includes(q)),
    );
    // Un groupe par (scopeLevel, scopeId) — deux villes distinctes ne se mélangent pas (§5.2).
    const map = new Map<string, { key: string; level: DocumentListItem['scopeLevel']; scopeId: string | null; name: string | null; items: DocumentListItem[] }>();
    for (const d of filtered) {
      const key = `${d.scopeLevel}:${d.scopeId ?? ''}`;
      let g = map.get(key);
      if (!g) {
        g = { key, level: d.scopeLevel, scopeId: d.scopeId, name: d.scopeName, items: [] };
        map.set(key, g);
      }
      g.items.push(d);
    }
    // Ordre des portées du contrat §2.2 (le serveur trie déjà ; on le garantit après filtrage).
    return [...map.values()].sort(
      (a, b) => DOCUMENT_SCOPE_ORDER.indexOf(a.level) - DOCUMENT_SCOPE_ORDER.indexOf(b.level),
    );
  }, [docs, categoryId, query]);

  const groupTitle = (level: DocumentListItem['scopeLevel'], scopeId: string | null, name: string | null) => {
    if (level === 'MINISTRY') return t('documents.space.wholeMinistry');
    if (level === 'UNIT' && scopeId && scopeId === me?.goalUnitId) return t('documents.space.myAssembly');
    return name ?? t(`documents.scope.${level}`);
  };

  const nothing = !loading && !loadError && docs.length === 0;
  const noMatch = !loading && !loadError && docs.length > 0 && groups.length === 0;

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
      <Text style={styles.kicker}>{t('documents.space.kicker')}</Text>
      <Text style={styles.title}>{t('documents.space.title')}</Text>

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

          {usedCategories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              style={{ marginTop: 12, marginHorizontal: -20 }}
            >
              <Chip
                label={t('documents.space.allCategories')}
                selected={!categoryId}
                onPress={() => setCategoryId(null)}
              />
              {usedCategories.map((c) => (
                <Chip
                  key={c.id}
                  label={categoryLabel(c.name, c.nameEn, language) ?? c.name}
                  selected={categoryId === c.id}
                  onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                />
              ))}
            </ScrollView>
          )}

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
          ) : noMatch ? (
            <Card variant="paper2" style={styles.empty}>
              <Ionicons name="search-outline" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('documents.space.noMatch')}</Text>
            </Card>
          ) : (
            groups.map((g) => (
              <View key={g.key} style={styles.block}>
                <Label style={styles.blockLabel}>{groupTitle(g.level, g.scopeId, g.name)}</Label>
                {g.items.map((d) => (
                  <DocumentRow
                    key={d.slug}
                    doc={d}
                    category={categoryLabel(d.categoryName, d.categoryNameEn, language)}
                    onPress={() => router.push({ pathname: '/d/[slug]', params: { slug: d.slug } })}
                  />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </ScreenShell>
  );
}

function DocumentRow({
  doc,
  category,
  onPress,
}: {
  doc: DocumentListItem;
  category: string | null;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const meta = [doc.author, category, t('documents.space.pages', { count: doc.pageCount })]
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
  chips: { paddingHorizontal: 20, gap: 8 },
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
  rowTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, letterSpacing: -0.1 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
});
