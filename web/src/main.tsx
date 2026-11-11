import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './i18n';
import './theme/styles.css';
import { applyCachedBranding } from './theme/branding';

// D-PAYS-02 / §5.4 (JP 11/11) : couleurs du pays (cache) posées sur :root AVANT le premier rendu, sans clignotement.
// Sans cache applicable (ou sur un chemin neutre, RG-PAYS-07) : rien n'est réécrit, Shephr standard.
applyCachedBranding();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
