const listeners = new Set();

let deferredPrompt = null;
let initialized = false;
let state = {
  canPrompt: false,
  installed: false,
  isPrompting: false,
  lastOutcome: null,
  platform: 'desktop'
};

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'desktop';
  const userAgent = String(navigator.userAgent || '');
  const touchMac = /Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints) > 1;
  if (/iPad|iPhone|iPod/i.test(userAgent) || touchMac) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
};

const detectInstalled = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || window.navigator?.standalone === true;
};

const publish = patch => {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener(state));
};

const handleBeforeInstallPrompt = event => {
  event.preventDefault();
  deferredPrompt = event;
  publish({ canPrompt: true, installed: false, lastOutcome: null });
};

const handleAppInstalled = () => {
  deferredPrompt = null;
  publish({ canPrompt: false, installed: true, isPrompting: false, lastOutcome: 'installed' });
};

export const initializePwaInstall = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  state = { ...state, installed: detectInstalled(), platform: detectPlatform() };
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
};

export const getPwaInstallState = () => state;

export const subscribePwaInstall = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const requestPwaInstall = async () => {
  initializePwaInstall();
  if (state.installed) return { outcome: 'installed' };
  if (!deferredPrompt) return { outcome: 'unavailable' };

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  publish({ canPrompt: false, isPrompting: true, lastOutcome: null });

  try {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    const outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    publish({ isPrompting: false, lastOutcome: outcome });
    return { outcome };
  } catch (error) {
    publish({ isPrompting: false, lastOutcome: 'unavailable' });
    return { outcome: 'unavailable', error };
  }
};

export const manualInstallInstructions = platform => {
  if (platform === 'android') return [
    'Open this Pawzzle website in Chrome on your Android device.',
    'Tap the three-dot browser menu in the upper-right corner.',
    'Choose “Install app” or “Add to Home screen,” then confirm Install.'
  ];
  if (platform === 'ios') return [
    'Open this Pawzzle website in Safari on your iPhone or iPad.',
    'Tap the Share button in Safari.',
    'Choose “Add to Home Screen,” then tap Add.'
  ];
  return [
    'Open Pawzzle in Chrome or Microsoft Edge.',
    'Open the browser menu or select the install icon in the address bar.',
    'Choose “Install Pawzzle” or “Install app,” then confirm.'
  ];
};

export const __resetPwaInstallForTests = () => {
  if (initialized && typeof window !== 'undefined') {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', handleAppInstalled);
  }
  listeners.clear();
  deferredPrompt = null;
  initialized = false;
  state = {
    canPrompt: false,
    installed: false,
    isPrompting: false,
    lastOutcome: null,
    platform: 'desktop'
  };
};
