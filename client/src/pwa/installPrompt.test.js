import {
  __resetPwaInstallForTests,
  getPwaInstallState,
  initializePwaInstall,
  manualInstallInstructions,
  requestPwaInstall
} from './installPrompt';

beforeEach(() => __resetPwaInstallForTests());
afterEach(() => __resetPwaInstallForTests());

test('captures and consumes the supported browser installation prompt', async () => {
  initializePwaInstall();
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = jest.fn();
  event.userChoice = Promise.resolve({ outcome: 'accepted' });

  window.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(getPwaInstallState().canPrompt).toBe(true);

  await expect(requestPwaInstall()).resolves.toEqual({ outcome: 'accepted' });
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(getPwaInstallState()).toEqual(expect.objectContaining({
    canPrompt: false,
    isPrompting: false,
    lastOutcome: 'accepted'
  }));
});

test('tracks completed installation and provides platform-specific fallback steps', () => {
  initializePwaInstall();
  window.dispatchEvent(new Event('appinstalled'));

  expect(getPwaInstallState()).toEqual(expect.objectContaining({ installed: true, canPrompt: false }));
  expect(manualInstallInstructions('android')).toEqual(expect.arrayContaining([
    expect.stringMatching(/Chrome/i),
    expect.stringMatching(/three-dot browser menu/i),
    expect.stringMatching(/Install app/i)
  ]));
  expect(manualInstallInstructions('ios').join(' ')).toMatch(/Safari.*Share.*Add to Home Screen/i);
});
