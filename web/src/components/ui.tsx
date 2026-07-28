import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Icon } from './Icon';

// ---------------- Button ----------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  variant?: Variant;
  size?: 'sm';
  iconL?: ReactNode;
  iconR?: ReactNode;
}

export function Button({
  children,
  variant = 'secondary',
  size,
  iconL,
  iconR,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${variant} ${size === 'sm' ? 'sm' : ''} ${className}`}
      {...rest}
    >
      {iconL && <span className="ico">{iconL}</span>}
      {children}
      {iconR && <span className="ico">{iconR}</span>}
    </button>
  );
}

export function IconButton({
  icon,
  danger,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn ${danger ? 'danger' : ''} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}

// ---------------- Field / Inputs ----------------
export function Field({
  label,
  hint,
  children,
  style,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export function Input({ icon, className = 'input', ...rest }: InputProps) {
  if (icon) {
    return (
      <div className="input-wrap">
        <span className="ico-left">{icon}</span>
        <input className="input with-icon" {...rest} />
      </div>
    );
  }
  return <input className={className} {...rest} />;
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="select" {...rest}>
      {children}
    </select>
  );
}

// ---------------- Picker ----------------
// Liste déroulante rendue DANS la page : la liste native d'un <select> s'affiche mal en
// navigation téléphone (popup rognée, texte illisible). Mêmes repères visuels que `.select`,
// options à hauteur tactile, recherche au-delà de `searchFrom` entrées.
export interface PickerOption {
  id: string;
  label: string;
  /** Ligne secondaire optionnelle (ex. la région d'une ville). */
  sub?: string;
}

export function Picker({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  searchFrom = 8,
  searchPlaceholder,
  style,
}: {
  value: string;
  onChange: (id: string) => void;
  options: PickerOption[];
  placeholder: string;
  disabled?: boolean;
  searchFrom?: number;
  searchPlaceholder?: string;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Option survolée au clavier (index dans `shown`). */
  const [cursor, setCursor] = useState(0);
  /** Le panneau s'ouvre vers le haut quand la place manque en dessous (modale, bas de page). */
  const [drop, setDrop] = useState<{ up: boolean; maxHeight: number }>({ up: false, maxHeight: 320 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const searchable = options.length >= searchFrom;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  // Fermeture au clic extérieur : le panneau vit dans le flux, pas dans un portail.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // Place disponible : sens d'ouverture et hauteur max, mesurés avant peinture pour éviter le saut.
  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 12;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const wanted = Math.min(320, window.innerHeight * 0.5);
    const up = below < Math.min(wanted, 220) && above > below;
    setDrop({ up, maxHeight: Math.max(150, Math.min(wanted, up ? above : below)) });
  }, [open, shown.length]);

  // Ouverture : le curseur clavier part de la valeur retenue, et la ligne est amenée à l'écran.
  useEffect(() => {
    if (!open) return;
    const i = shown.findIndex((o) => o.id === value);
    setCursor(i >= 0 ? i : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  // Un changement de périmètre amont peut vider la liste : on referme plutôt que d'afficher un vide.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
    btnRef.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!disabled) setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') btnRef.current?.focus();
      return;
    }
    if (shown.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(shown.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(shown.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = shown[cursor];
      if (o) pick(o.id);
    }
  };

  return (
    <div className="picker" ref={rootRef} style={style} onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        className={`picker-btn ${selected ? '' : 'is-placeholder'}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker-label">{selected?.label ?? placeholder}</span>
        <Icon name="chevDown" size={13} />
      </button>

      {open && (
        <div
          className={`picker-panel ${drop.up ? 'is-up' : ''}`}
          style={{ maxHeight: drop.maxHeight }}
          role="listbox"
          ref={panelRef}
        >
          {searchable && (
            <div className="picker-search">
              <input
                className="input"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
                placeholder={searchPlaceholder ?? t('common.search')}
                autoFocus
              />
            </div>
          )}
          {shown.length === 0 ? (
            <div className="picker-empty">{t('ui.noResult')}</div>
          ) : (
            shown.map((o, i) => (
              <button
                key={o.id}
                type="button"
                role="option"
                data-i={i}
                aria-selected={o.id === value}
                className={`picker-opt ${o.id === value ? 'is-active' : ''} ${i === cursor ? 'is-cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(o.id)}
              >
                <span className="picker-opt-label">{o.label}</span>
                {o.sub && <span className="picker-opt-sub">{o.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="track" />
      {label && <span className="lbl">{label}</span>}
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span
      className={`checkbox ${checked ? 'checked' : ''}`}
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
    >
      {checked && <Icon name="check" size={11} />}
    </span>
  );
}

// ---------------- Badges ----------------
type Tone = 'green' | 'earth' | 'gray' | 'ok' | 'warn' | 'err';

export function Badge({
  children,
  tone = 'gray',
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  if (role === 'ADMIN') return <Badge tone="green">{t('ui.roleAdmin')}</Badge>;
  if (role === 'LEADER') return <Badge tone="earth">{t('ui.roleLeader')}</Badge>;
  return <Badge tone="gray">{t('ui.roleMember')}</Badge>;
}

export function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  if (active) return <Badge tone="ok" dot>{t('ui.statusActive')}</Badge>;
  return <Badge tone="gray" dot>{t('ui.statusInactive')}</Badge>;
}

// ---------------- Modal / Drawer ----------------
export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${size === 'lg' ? 'lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="ttl">{title}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="ttl">{title}</div>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <IconButton icon={<Icon name="x" size={18} />} onClick={onClose} title={t('common.close')} />
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}

// ---------------- Table ----------------
export interface Column<T> {
  label: ReactNode;
  cellClass?: string;
  style?: CSSProperties;
  cellStyle?: CSSProperties;
  render: (row: T) => ReactNode;
}

export function Table<T extends { id?: string | number }>({
  columns,
  rows,
  onRowClick,
  zebra,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  zebra?: boolean;
  empty?: ReactNode;
}) {
  const { t } = useTranslation();
  if (!rows || rows.length === 0) {
    return (
      <>
        {empty ?? (
          <div className="empty">
            <div className="icon-wrap">
              <Icon name="inbox" size={26} />
            </div>
            <h4>{t('ui.noResult')}</h4>
            <p>{t('ui.adjustFilters')}</p>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={c.style}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={(r.id as string | number | undefined) ?? i}
              className={`${zebra ? 'zebra' : ''} ${onRowClick ? 'clickable' : ''}`}
              onClick={() => onRowClick?.(r)}
            >
              {columns.map((c, j) => (
                <td key={j} className={c.cellClass} style={c.cellStyle}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Pagination ----------------
export function Pagination({
  page,
  pageCount,
  total,
  perPage,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const windowSize = 5;
  let start = Math.max(1, page - 2);
  const end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pagination">
      <div>
        <Trans i18nKey="ui.paginationShowing" values={{ from, to, total }} components={[<strong />, <strong />, <strong />]} />
      </div>
      <div className="pages">
        <button className="pg-btn" disabled={page === 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevLeft" size={12} />
        </button>
        {start > 1 && <button className="pg-btn" onClick={() => onPage(1)}>1</button>}
        {start > 2 && <span style={{ padding: '0 4px', color: 'var(--ink-400)' }}>…</span>}
        {pages.map((p) => (
          <button
            key={p}
            className={`pg-btn ${p === page ? 'active' : ''}`}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        {end < pageCount - 1 && <span style={{ padding: '0 4px', color: 'var(--ink-400)' }}>…</span>}
        {end < pageCount && (
          <button className="pg-btn" onClick={() => onPage(pageCount)}>{pageCount}</button>
        )}
        <button
          className="pg-btn"
          disabled={page === pageCount || pageCount === 0}
          onClick={() => onPage(page + 1)}
        >
          <Icon name="chevRight" size={12} />
        </button>
      </div>
    </div>
  );
}

// ---------------- Crumbs / TopBar ----------------
export function Crumbs({ items }: { items: ReactNode[] }) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span className="sep"><Icon name="chevRight" size={11} /></span>}
          <span className={i === items.length - 1 ? 'here' : ''}>{it}</span>
        </span>
      ))}
    </div>
  );
}

export function TopBar({
  title,
  crumbs,
  actions,
}: {
  title: ReactNode;
  crumbs?: ReactNode[];
  actions?: ReactNode;
}) {
  return (
    <div className="topbar">
      <div>
        {crumbs && <Crumbs items={crumbs} />}
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="spacer" />
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
