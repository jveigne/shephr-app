import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './ui';

export type ToastKind = 'ok' | 'error';
interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  msg?: string;
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((ts) => [...ts, { id, ...t }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismiss = (id: string) => setToasts((ts) => ts.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : 'ok'}`}>
            <span style={{ color: t.kind === 'error' ? 'var(--err)' : 'var(--ok)' }}>
              <Icon name={t.kind === 'error' ? 'warning' : 'check'} size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div className="ttl">{t.title}</div>
              {t.msg && <div className="msg">{t.msg}</div>}
            </div>
            <IconButton icon={<Icon name="x" size={14} />} onClick={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
