/**
 * Chargeur de script tiers, une fois par URL (promesse mémorisée) — D-PAY-06, JP 28/10 : les SDK
 * Google Identity Services et Sign in with Apple JS ne sont chargés QUE si leur bouton est affiché
 * (RG-PAY-43). Un échec oublie la promesse : un nouvel essai recharge.
 */
const pending = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const known = pending.get(src);
  if (known) return known;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      pending.delete(src);
      el.remove();
      reject(new Error(`script load failed: ${src}`));
    };
    document.head.appendChild(el);
  });
  pending.set(src, p);
  return p;
}
