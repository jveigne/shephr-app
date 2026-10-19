/**
 * Imprime un document HTML autonome via un iframe caché — D-ASM-18 (JP 08/10).
 *
 * Le web n'a pas d'équivalent d'expo-print : on s'appuie sur la boîte d'impression du navigateur,
 * où l'utilisateur choisit « Enregistrer en PDF ». Aucune dépendance. Le `<title>` du document
 * sert de nom de fichier proposé par la plupart des navigateurs.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    // Pas de `visibility: hidden` / `display: none` : certains navigateurs impriment alors une page blanche.

    let done = false;
    const cleanup = () => {
      // Laisser au navigateur le temps de capturer le document avant de le retirer.
      setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = () => {
      if (done) return;
      done = true;
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error('print frame unavailable'));
        return;
      }
      win.addEventListener('afterprint', cleanup, { once: true });
      try {
        win.focus();
        win.print();
        resolve();
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}
