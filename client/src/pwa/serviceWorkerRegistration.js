export const registerPwaServiceWorker = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none'
  });

  registration.update().catch(error => {
    console.warn('Pawzzle service worker update check failed:', error);
  });
  return registration;
};
