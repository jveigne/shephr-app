import type { CSSProperties, ReactNode } from 'react';

// Design-system icon set — ported verbatim from shephr-webapp (Lot 1.1).
// Faithful geometry shared by the Web Espace ministère and the back-office.
type IconProps = { size?: number; style?: CSSProperties; className?: string };

const I = ({
  size = 18,
  children,
  vb = '0 0 24 24',
  style,
  className,
}: IconProps & { children: ReactNode; vb?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox={vb}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    className={className}
  >
    {children}
  </svg>
);

export const Icons = {
  Mark: (p: IconProps) => (
    <I {...p}>
      <path d="M5 15c0-5 4-9 9-9 1.8 0 3.3.5 4 1" />
      <path d="M19 9c0 5-4 9-9 9-1.8 0-3.3-.5-4-1" />
    </I>
  ),
  Dashboard: (p: IconProps) => (
    <I {...p}>
      <rect x="3" y="3" width="8" height="10" rx="1.5" />
      <rect x="13" y="3" width="8" height="6" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
      <rect x="13" y="11" width="8" height="10" rx="1.5" />
    </I>
  ),
  Donation: (p: IconProps) => (
    <I {...p}>
      <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />
    </I>
  ),
  Building: (p: IconProps) => (
    <I {...p}>
      <rect x="4" y="6" width="16" height="15" rx="1.5" />
      <path d="M9 6V3h6v3" />
      <path d="M9 10h2M13 10h2M9 14h2M13 14h2M9 18h2M13 18h2" />
    </I>
  ),
  Locality: (p: IconProps) => (
    <I {...p}>
      <path d="M12 21s-6-5-6-11a6 6 0 1 1 12 0c0 6-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </I>
  ),
  Unit: (p: IconProps) => (
    <I {...p}>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M10 21v-6h4v6" />
    </I>
  ),
  Users: (p: IconProps) => (
    <I {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15 20c0-2.4 1.5-4.5 3.5-5.5" />
    </I>
  ),
  Hierarchy: (p: IconProps) => (
    <I {...p}>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v3M6 16v-2h12v2" />
    </I>
  ),
  Export: (p: IconProps) => (
    <I {...p}>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </I>
  ),
  Settings: (p: IconProps) => (
    <I {...p}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </I>
  ),
  ChevRight: (p: IconProps) => <I {...p}><path d="M9 6l6 6-6 6" /></I>,
  ChevLeft: (p: IconProps) => <I {...p}><path d="M15 6l-6 6 6 6" /></I>,
  ChevDown: (p: IconProps) => <I {...p}><path d="M6 9l6 6 6-6" /></I>,
  Plus: (p: IconProps) => <I {...p}><path d="M12 5v14M5 12h14" /></I>,
  X: (p: IconProps) => <I {...p}><path d="M6 6l12 12M18 6L6 18" /></I>,
  Check: (p: IconProps) => <I {...p}><path d="M5 12l4 4 10-10" /></I>,
  Search: (p: IconProps) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></I>,
  Filter: (p: IconProps) => <I {...p}><path d="M3 5h18M6 12h12M10 19h4" /></I>,
  Menu: (p: IconProps) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16" /></I>,
  Mail: (p: IconProps) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></I>,
  Lock: (p: IconProps) => <I {...p}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>,
  Eye: (p: IconProps) => <I {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>,
  EyeOff: (p: IconProps) => (
    <I {...p}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.1 3.8" />
      <path d="M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.3-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </I>
  ),
  Calendar: (p: IconProps) => <I {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></I>,
  Download: (p: IconProps) => <I {...p}><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></I>,
  Upload: (p: IconProps) => <I {...p}><path d="M12 20V8" /><path d="M7 13l5-5 5 5" /><path d="M5 4h14" /></I>,
  Edit: (p: IconProps) => <I {...p}><path d="M16.5 3.5a2 2 0 0 1 2.8 2.8L7 18.6 3 20l1.4-4 12.1-12.5z" /></I>,
  Trash: (p: IconProps) => <I {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></I>,
  More: (p: IconProps) => (
    <I {...p}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </I>
  ),
  Bell: (p: IconProps) => <I {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16z" /><path d="M10 21h4" /></I>,
  Help: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3 3v1.5" /><path d="M12 17.5v.5" /></I>,
  Logout: (p: IconProps) => <I {...p}><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></I>,
  Globe: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></I>,
  Currency: (p: IconProps) => (
    <I {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5a3.5 3.5 0 0 0-3-1.5c-1.5 0-3 .8-3 2.3 0 1.5 1.2 2 3 2.5s3 1 3 2.5C15 16 13.5 17 12 17a3.5 3.5 0 0 1-3-1.5" />
      <path d="M12 6v12" />
    </I>
  ),
  Tag: (p: IconProps) => <I {...p}><path d="M20 11.5V4h-7.5L3 13.5 10.5 21z" /><circle cx="8" cy="8" r="1.2" /></I>,
  History: (p: IconProps) => <I {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></I>,
  Copy: (p: IconProps) => <I {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></I>,
  Shield: (p: IconProps) => <I {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.6-8 9-4.6-.4-8-4.5-8-9V6l8-3z" /></I>,
  User: (p: IconProps) => <I {...p}><circle cx="12" cy="8" r="3.5" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></I>,
  Hash: (p: IconProps) => <I {...p}><path d="M5 9h14M5 15h14M10 4l-3 16M17 4l-3 16" /></I>,
  Sparkle: (p: IconProps) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></I>,
  Arrow_Up: (p: IconProps) => <I {...p}><path d="M5 12l7-7 7 7" /><path d="M12 5v14" /></I>,
  Arrow_Down: (p: IconProps) => <I {...p}><path d="M5 12l7 7 7-7" /><path d="M12 5v14" /></I>,
  ArrowRight: (p: IconProps) => <I {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></I>,
  Sort: (p: IconProps) => <I {...p}><path d="M7 4v16M3 8l4-4 4 4" /><path d="M17 20V4M21 16l-4 4-4-4" /></I>,
  Info: (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8h0M11 12h1v5h1" /></I>,
  Warning: (p: IconProps) => <I {...p}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18v.5" /></I>,
  Folder: (p: IconProps) => <I {...p}><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" /></I>,
  Tree: (p: IconProps) => <I {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8 7l3 9M16 7l-3 9" /></I>,
  Inbox: (p: IconProps) => <I {...p}><path d="M3 12l3-7h12l3 7" /><path d="M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" /><path d="M3 12h5l1 2h6l1-2h5" /></I>,
};

export type IconName = keyof typeof Icons;
