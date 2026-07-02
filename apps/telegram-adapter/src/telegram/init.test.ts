import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyThemeCssVars, initTelegram, THEME_DEFAULTS } from './init';

const tg = vi.hoisted(() => {
  const guarded = <T extends (...args: never[]) => unknown>(impl: T) =>
    Object.assign(vi.fn(impl), { isAvailable: vi.fn(() => true) });

  return {
    init: vi.fn(() => () => undefined),
    miniApp: {
      mountSync: guarded(() => undefined),
      ready: guarded(() => undefined),
    },
    themeParams: {
      mountSync: guarded(() => undefined),
      backgroundColor: vi.fn<() => `#${string}` | undefined>(() => undefined),
      textColor: vi.fn<() => `#${string}` | undefined>(() => undefined),
      buttonColor: vi.fn<() => `#${string}` | undefined>(() => undefined),
    },
    viewport: {
      mount: guarded(() => Promise.resolve()),
      expand: guarded(() => undefined),
    },
    swipeBehavior: {
      isSupported: vi.fn(() => true),
      mount: guarded(() => undefined),
      disableVertical: guarded(() => undefined),
    },
  };
});

vi.mock('@telegram-apps/sdk', () => tg);

const allGuarded = [
  tg.miniApp.mountSync,
  tg.miniApp.ready,
  tg.themeParams.mountSync,
  tg.viewport.mount,
  tg.viewport.expand,
  tg.swipeBehavior.mount,
  tg.swipeBehavior.disableVertical,
];

beforeEach(() => {
  vi.clearAllMocks();
  tg.init.mockImplementation(() => () => undefined);
  tg.miniApp.mountSync.mockImplementation(() => undefined);
  tg.miniApp.ready.mockImplementation(() => undefined);
  tg.themeParams.mountSync.mockImplementation(() => undefined);
  tg.themeParams.backgroundColor.mockReturnValue(undefined);
  tg.themeParams.textColor.mockReturnValue(undefined);
  tg.themeParams.buttonColor.mockReturnValue(undefined);
  tg.viewport.mount.mockImplementation(() => Promise.resolve());
  tg.viewport.expand.mockImplementation(() => undefined);
  tg.swipeBehavior.isSupported.mockReturnValue(true);
  tg.swipeBehavior.mount.mockImplementation(() => undefined);
  tg.swipeBehavior.disableVertical.mockImplementation(() => undefined);
  for (const fn of allGuarded) {
    fn.isAvailable.mockReturnValue(true);
  }
});

describe('applyThemeCssVars', () => {
  it('maps theme params to --tg-* custom properties', () => {
    tg.themeParams.backgroundColor.mockReturnValue('#112233');
    tg.themeParams.textColor.mockReturnValue('#445566');
    tg.themeParams.buttonColor.mockReturnValue('#778899');
    const el = document.createElement('div');

    applyThemeCssVars(el);

    expect(el.style.getPropertyValue('--tg-bg')).toBe('#112233');
    expect(el.style.getPropertyValue('--tg-text')).toBe('#445566');
    expect(el.style.getPropertyValue('--tg-accent')).toBe('#778899');
  });

  it('falls back to dark defaults when theme params are missing', () => {
    const el = document.createElement('div');

    applyThemeCssVars(el);

    expect(el.style.getPropertyValue('--tg-bg')).toBe(THEME_DEFAULTS.bg);
    expect(el.style.getPropertyValue('--tg-text')).toBe(THEME_DEFAULTS.text);
    expect(el.style.getPropertyValue('--tg-accent')).toBe(THEME_DEFAULTS.accent);
  });
});

describe('initTelegram', () => {
  it('runs the full boot sequence when everything is supported', async () => {
    tg.themeParams.backgroundColor.mockReturnValue('#001122');

    await initTelegram();

    expect(tg.init).toHaveBeenCalledTimes(1);
    expect(tg.miniApp.mountSync).toHaveBeenCalledTimes(1);
    expect(tg.themeParams.mountSync).toHaveBeenCalledTimes(1);
    expect(tg.viewport.mount).toHaveBeenCalledTimes(1);
    expect(tg.viewport.expand).toHaveBeenCalledTimes(1);
    expect(tg.swipeBehavior.mount).toHaveBeenCalledTimes(1);
    expect(tg.swipeBehavior.disableVertical).toHaveBeenCalledTimes(1);
    expect(tg.miniApp.ready).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.getPropertyValue('--tg-bg')).toBe('#001122');
    expect(document.documentElement.style.getPropertyValue('--tg-text')).toBe(THEME_DEFAULTS.text);
  });

  it('resolves without calling anything on a fully unsupported environment', async () => {
    for (const fn of allGuarded) {
      fn.isAvailable.mockReturnValue(false);
    }
    tg.swipeBehavior.isSupported.mockReturnValue(false);

    await expect(initTelegram()).resolves.toBeUndefined();

    expect(tg.miniApp.mountSync).not.toHaveBeenCalled();
    expect(tg.themeParams.mountSync).not.toHaveBeenCalled();
    expect(tg.viewport.mount).not.toHaveBeenCalled();
    expect(tg.viewport.expand).not.toHaveBeenCalled();
    expect(tg.swipeBehavior.mount).not.toHaveBeenCalled();
    expect(tg.swipeBehavior.disableVertical).not.toHaveBeenCalled();
    expect(tg.miniApp.ready).not.toHaveBeenCalled();
    // Theme defaults are still applied so the UI is readable.
    expect(document.documentElement.style.getPropertyValue('--tg-bg')).toBe(THEME_DEFAULTS.bg);
  });

  it('skips swipe mounting when supported but not available', async () => {
    tg.swipeBehavior.isSupported.mockReturnValue(true);
    tg.swipeBehavior.mount.isAvailable.mockReturnValue(false);

    await initTelegram();

    expect(tg.swipeBehavior.mount).not.toHaveBeenCalled();
    expect(tg.swipeBehavior.disableVertical).not.toHaveBeenCalled();
  });

  it('mounts swipe behavior but skips disabling when unavailable', async () => {
    tg.swipeBehavior.disableVertical.isAvailable.mockReturnValue(false);

    await initTelegram();

    expect(tg.swipeBehavior.mount).toHaveBeenCalledTimes(1);
    expect(tg.swipeBehavior.disableVertical).not.toHaveBeenCalled();
  });

  it('survives throwing steps and a rejecting viewport mount', async () => {
    tg.miniApp.mountSync.mockImplementation(() => {
      throw new Error('mount failed');
    });
    tg.viewport.mount.mockImplementation(() => Promise.reject(new Error('viewport failed')));

    await expect(initTelegram()).resolves.toBeUndefined();

    // Later steps still run: the app must reach ready() no matter what.
    expect(tg.viewport.expand).not.toHaveBeenCalled();
    expect(tg.miniApp.ready).toHaveBeenCalledTimes(1);
  });
});
