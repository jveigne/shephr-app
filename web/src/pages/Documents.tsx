import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Button, Input, TopBar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules, isAttachedAccount } from '../services/authApi';
import {
  DOCUMENT_ERROR_CODES,
  getDocumentCategories,
  listDocuments,
  type DocumentListItem,
} from '../services/documentsApi';
import { apiErrorInfo } from '../utils/documents';
import { buildFolderTree, folderPath, type FolderNode, type FolderTree } from '../utils/documentFolders';

// ---------------------------------------------------------------------------------------------
//  Espace Documents — D-DOC-14 levée (JP 27/10, D-WEB-03) : espace Documents sur le web.
//  Port de `mobile/app/documents/index.tsx` (plan 18/10 §6.3, RG-DOC-09 ; dossiers D-DOC-16 JP 19/10).
//  Routes `/documents` (AppShell) et `/my-documents` (MemberShell) ; visible si `DOCUMENTS` ∈
//  accessible-modules (RG-06) ET compte rattaché (`isAttachedAccount`, D-DOC-04) — comme la tuile
//  mobile. Le serveur juge de même (403 `MODULE_ACCESS_DENIED` / `DOCUMENT_JOIN_REQUIRED`).
//  Navigation dossier par dossier, dossier courant dans l'URL (`?folder=<id>`) : le retour du
//  navigateur remonte d'un dossier. Recherche GLOBALE par titre (`q` côté serveur), résultats à plat
//  avec le chemin du dossier. Ouvrir un document = le lecteur du lien `/d/{slug}` (lecture complète
//  pour un compte rattaché, D-WEB-04). Cette page n'importe PAS le lecteur (PDF.js reste lazy).
// ---------------------------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Message d'une erreur de chargement (miroir du mobile) ; `join` → mur « Rejoindre mon assemblée ». */
function useErrorView(err: unknown): { join: boolean; message: string } | null {
  const { t } = useTranslation();
  if (!err) return null;
  const { status, code } = apiErrorInfo(err);
  if (code === 'DOCUMENT_JOIN_REQUIRED') return { join: true, message: t('documents.space.joinRequired') };
  if (code === 'MODULE_ACCESS_DENIED') return { join: false, message: t('documents.space.moduleUnavailable') };
  if (status == null) return { join: false, message: t('documents.space.network') };
  if (code && DOCUMENT_ERROR_CODES.includes(code)) return { join: false, message: t(`documents.errors.${code}`) };
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return { join: false, message: msg ?? t('documents.space.loadFailed') };
}

export function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder') || null;
  const basePath = location.pathname.startsWith('/my-documents') ? '/my-documents' : '/documents';

  const attached = isAttachedAccount(me);
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules, enabled: !!me });
  const hasModule = (modulesQ.data ?? []).includes('DOCUMENTS');
  const active = attached && hasModule;

  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);

  const listQ = useQuery({
    queryKey: ['documents', 'list', { categoryId: undefined, q: undefined }],
    queryFn: () => listDocuments(),
    enabled: active,
  });
  const categoriesQ = useQuery({
    queryKey: ['documents', 'categories'],
    queryFn: getDocumentCategories,
    enabled: active,
  });
  const searchQ = useQuery({
    queryKey: ['documents', 'list', { categoryId: undefined, q }],
    queryFn: () => listDocuments({ q }),
    enabled: active && q.length > 0,
  });

  const docs = listQ.data ?? [];
  const tree = useMemo(
    () => buildFolderTree(categoriesQ.data ?? [], docs, i18n.language),
    [categoriesQ.data, docs, i18n.language],
  );
  const path = useMemo(() => folderPath(tree, folderId), [tree, folderId]);
  const current: FolderNode | null = path.length ? path[path.length - 1] : null;

  const loading = modulesQ.isLoading || (active && (listQ.isLoading || categoriesQ.isLoading));
  const errorView = useErrorView(listQ.error ?? categoriesQ.error ?? null);
  const searchErrorView = useErrorView(searchQ.error ?? null);

  const openFolder = (id: string | null) => {
    setQuery('');
    setSearchParams(id ? { folder: id } : {});
  };
  const openDoc = (d: DocumentListItem) => navigate(`/d/${encodeURIComponent(d.slug)}`);

  const scopeLabel = (d: DocumentListItem) => {
    if (d.scopeLevel === 'MINISTRY') return t('documents.space.wholeMinistry');
    if (d.scopeLevel === 'UNIT' && d.scopeId && d.scopeId === me?.goalUnitId) return t('documents.space.myAssembly');
    return d.scopeName ?? t(`documents.scope.${d.scopeLevel}`);
  };

  const crumbs: ReactNode[] = [
    t('common.brand'),
    current ? (
      <CrumbLink key="root" onClick={() => openFolder(null)}>{t('documents.space.title')}</CrumbLink>
    ) : (
      t('documents.space.title')
    ),
    ...path.map((f, i) =>
      i < path.length - 1 ? (
        <CrumbLink key={f.id} onClick={() => openFolder(f.id)}>{f.label}</CrumbLink>
      ) : (
        f.label
      ),
    ),
  ];

  const retry = () => {
    void listQ.refetch();
    void categoriesQ.refetch();
  };

  // --- Corps -----------------------------------------------------------------------------------
  let body: ReactNode;
  if (loading) {
    body = <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>{t('common.loading')}</p>;
  } else if (!active) {
    body = (
      <EmptyCard icon="lock" text={hasModule ? t('documents.space.joinRequired') : t('documents.space.moduleUnavailable')}>
        {hasModule && (
          <Button variant="primary" onClick={() => navigate('/join')}>{t('documents.wall.join')}</Button>
        )}
      </EmptyCard>
    );
  } else if (errorView) {
    body = (
      <EmptyCard icon={errorView.join ? 'lock' : 'warning'} text={errorView.message}>
        {errorView.join ? (
          <Button variant="primary" onClick={() => navigate('/join')}>{t('documents.wall.join')}</Button>
        ) : (
          <Button onClick={retry}>{t('documents.reader.retry')}</Button>
        )}
      </EmptyCard>
    );
  } else if (docs.length === 0) {
    body = <EmptyCard icon="folder" text={t('documents.space.empty')} />;
  } else if (q) {
    const results = searchQ.data ?? [];
    body = searchQ.isLoading ? (
      <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>{t('common.loading')}</p>
    ) : searchErrorView ? (
      <EmptyCard icon="warning" text={searchErrorView.message}>
        <Button onClick={() => void searchQ.refetch()}>{t('documents.reader.retry')}</Button>
      </EmptyCard>
    ) : results.length === 0 ? (
      <EmptyCard icon="search" text={t('documents.space.noMatch')} />
    ) : (
      <Block label={t('documents.space.results', { count: results.length })}>
        {results.map((d) => (
          <DocumentRow key={d.slug} doc={d} scope={scopeLabel(d)} path={pathLabel(tree, d, t('documents.space.unfiled'))} onOpen={() => openDoc(d)} />
        ))}
      </Block>
    );
  } else if (folderId && !current) {
    // Dossier demandé mais absent (vidé, désactivé, lien périmé).
    body = (
      <EmptyCard icon="folder" text={t('documents.space.folderEmpty')}>
        <Button onClick={() => openFolder(null)}>{t('documents.space.backToRoot')}</Button>
      </EmptyCard>
    );
  } else {
    const subFolders = current ? current.children : tree.roots;
    const folderDocs = current ? current.docs : tree.unfiled;
    body =
      subFolders.length === 0 && folderDocs.length === 0 ? (
        <EmptyCard icon="folder" text={t('documents.space.folderEmpty')} />
      ) : (
        <>
          {subFolders.length > 0 && (
            <Block label={current ? t('documents.space.subfolders') : t('documents.space.folders')}>
              {subFolders.map((f) => (
                <FolderRow key={f.id} folder={f} onOpen={() => openFolder(f.id)} />
              ))}
            </Block>
          )}
          {folderDocs.length > 0 && (
            <Block label={current ? t('documents.space.documents') : t('documents.space.unfiled')}>
              {folderDocs.map((d) => (
                <DocumentRow key={d.slug} doc={d} scope={scopeLabel(d)} path={null} onOpen={() => openDoc(d)} />
              ))}
            </Block>
          )}
        </>
      );
  }

  return (
    <>
      <TopBar title={current ? current.label : t('documents.space.title')} crumbs={crumbs} />
      <div className="content" style={{ maxWidth: 880 }}>
        {active && !errorView && !loading && (
          <div style={{ marginBottom: 20, maxWidth: 480 }}>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('documents.space.searchPlaceholder')}
              aria-label={t('documents.space.searchPlaceholder')}
              icon={<Icon name="search" size={15} />}
            />
          </div>
        )}
        {body}
        {current && !q && active && !errorView && (
          <p style={{ marginTop: 20, fontSize: 13 }}>
            <Link
              to={path.length > 1 ? `${basePath}?folder=${encodeURIComponent(path[path.length - 2].id)}` : basePath}
              style={{ color: 'var(--green-700)', fontWeight: 600, textDecoration: 'none' }}
            >
              ‹ {path.length > 1 ? path[path.length - 2].label : t('documents.space.title')}
            </Link>
          </p>
        )}
      </div>
    </>
  );
}

/** Chemin du dossier d'un document (recherche à plat). */
function pathLabel(tree: FolderTree, d: DocumentListItem, unfiled: string): string {
  const p = folderPath(tree, d.categoryId);
  return p.length ? p.map((f) => f.label).join(' › ') : unfiled;
}

function CrumbLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >
      {children}
    </button>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-500)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  );
}

function EmptyCard({ icon, text, children }: { icon: string; text: string; children?: ReactNode }) {
  return (
    <div className="card empty" style={{ padding: '36px 24px' }}>
      <div className="icon-wrap">
        <Icon name={icon} size={24} />
      </div>
      <p>{text}</p>
      {children}
    </div>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
  padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--ivory-card)',
  border: '1px solid var(--line)', cursor: 'pointer', font: 'inherit', color: 'inherit',
} as const;

const rowIconStyle = {
  flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center',
} as const;

function FolderRow({ folder, onOpen }: { folder: FolderNode; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onOpen} style={rowStyle}>
      <span style={{ ...rowIconStyle, background: 'var(--earth-50)', color: 'var(--earth-700)' }}>
        <Icon name="folder" size={19} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--green-900)' }}>{folder.label}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>
          {t('documents.space.documentCount', { count: folder.count })}
        </span>
      </span>
      <Icon name="chevRight" size={16} style={{ color: 'var(--ink-400)' }} />
    </button>
  );
}

function DocumentRow({
  doc,
  scope,
  path,
  onOpen,
}: {
  doc: DocumentListItem;
  /** D-DOC-16 : la portée est une mention sur la ligne. */
  scope: string;
  /** Chemin du dossier — seulement en recherche (résultats à plat). */
  path: string | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const meta = [doc.author, scope, t('documents.space.pages', { count: doc.pageCount })].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onOpen} style={rowStyle}>
      <span style={{ ...rowIconStyle, background: 'var(--green-50)', color: 'var(--green-700)' }}>
        <Icon name="fileText" size={19} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--green-900)' }}>{doc.title}</span>
        {path && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--ink-700)', marginTop: 2 }}>
            <Icon name="folder" size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
          </span>
        )}
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta}
        </span>
      </span>
      <Icon name="chevRight" size={16} style={{ color: 'var(--ink-400)' }} />
    </button>
  );
}
