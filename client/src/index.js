import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initializePwaInstall } from './pwa/installPrompt';
import { registerPwaServiceWorker } from './pwa/serviceWorkerRegistration';

import { ThemeProvider } from './contexts/ThemeContext';

// Capture the browser install event before the landing page renders so the
// user can trigger it later from Pawzzle's own install button.
initializePwaInstall();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// A valid service worker and manifest allow the shared HTTPS website to be
// installed directly as a PWA. No APK download is involved.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerPwaServiceWorker().catch(error => {
      console.warn('Pawzzle service worker registration failed:', error);
    });
  }, { once: true });
}
