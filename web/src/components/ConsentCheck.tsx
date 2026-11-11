import type { ReactNode } from 'react';
import { Checkbox } from './ui';

/**
 * Case de consentement RGPD (RG-PAYS-12 / RG-PAYS-26, JP 11/11) : jamais pré-cochée, libellé cliquable, le geste
 * qu'elle conditionne reste inactif tant qu'elle ne l'est pas (décidé par l'appelant).
 */
export function ConsentCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-700)' }}
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}><Checkbox checked={checked} onChange={() => { /* géré par le libellé */ }} /></span>
      <span>{children}</span>
    </label>
  );
}
