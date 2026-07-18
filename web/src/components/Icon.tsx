import type { CSSProperties } from 'react';
import { Icons, type IconName } from './icons';

// Backward-compatible shim: keeps the `<Icon name="..." />` call-site API used
// across the app, but renders the faithful design-system geometry from `icons.tsx`
// (Lot 1.1). New code can import `Icons` directly for the full set.
interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

// Lowercase/camelCase name → Icons object key.
const NAME_MAP: Record<string, IconName> = {
  dashboard: 'Dashboard',
  donation: 'Donation',
  building: 'Building',
  locality: 'Locality',
  unit: 'Unit',
  users: 'Users',
  hierarchy: 'Hierarchy',
  export: 'Export',
  settings: 'Settings',
  chevRight: 'ChevRight',
  chevLeft: 'ChevLeft',
  chevDown: 'ChevDown',
  plus: 'Plus',
  x: 'X',
  check: 'Check',
  search: 'Search',
  filter: 'Filter',
  menu: 'Menu',
  mail: 'Mail',
  lock: 'Lock',
  eye: 'Eye',
  eyeOff: 'EyeOff',
  calendar: 'Calendar',
  download: 'Download',
  upload: 'Upload',
  edit: 'Edit',
  trash: 'Trash',
  more: 'More',
  bell: 'Bell',
  help: 'Help',
  logout: 'Logout',
  globe: 'Globe',
  currency: 'Currency',
  tag: 'Tag',
  history: 'History',
  copy: 'Copy',
  shield: 'Shield',
  user: 'User',
  hash: 'Hash',
  sparkle: 'Sparkle',
  arrowUp: 'Arrow_Up',
  arrowDown: 'Arrow_Down',
  arrowRight: 'ArrowRight',
  sort: 'Sort',
  info: 'Info',
  warning: 'Warning',
  folder: 'Folder',
  tree: 'Tree',
  inbox: 'Inbox',
  mark: 'Mark',
};

export function Icon({ name, size = 18, className, style }: IconProps) {
  const key = NAME_MAP[name];
  if (!key) return null;
  const Cmp = Icons[key];
  return <Cmp size={size} className={className} style={style} />;
}
