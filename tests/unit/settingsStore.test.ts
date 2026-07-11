import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  STORAGE_KEYS,
} from '@shared/constants';
import {
  DELAY_SAVE_DEBOUNCE_MS,
  useSettingsStore,
} from '@sidepanel/store/settingsStore';

beforeEach(() => {
  vi.mocked(chrome.storage.local.get).mockReset().mockResolvedValue({} as never);
  vi.mocked(chrome.storage.local.set).mockReset().mockResolvedValue(undefined);
  useSettingsStore.setState({
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS },
    isLoaded: true,
    isPersisting: false,
    error: null,
  });
});

afterEach(async () => {
  await useSettingsStore.getState().flushDelayPersistence();
  vi.useRealTimers();
});

describe('settings store', () => {
  it('updates delay state immediately then persists after idle debounce', async () => {
    vi.useFakeTimers();

    useSettingsStore.getState().adjustDelay('min', -1);

    expect(useSettingsStore.getState().settings).toEqual({
      delayMinSeconds: 25,
      delayMaxSeconds: 60,
      maxRetries: 2,
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELAY_SAVE_DEBOUNCE_MS - 1);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.SETTINGS]: useSettingsStore.getState().settings,
    });
  });

  it('coalesces repeated delay updates into one flushed save', async () => {
    vi.useFakeTimers();

    useSettingsStore.getState().adjustDelay('min', -1);
    useSettingsStore.getState().adjustDelay('min', -1);
    useSettingsStore.getState().adjustDelay('min', -1);

    expect(useSettingsStore.getState().settings.delayMinSeconds).toBe(15);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    await expect(useSettingsStore.getState().flushDelayPersistence()).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(DELAY_SAVE_DEBOUNCE_MS);

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.SETTINGS]: {
        delayMinSeconds: 15,
        delayMaxSeconds: 60,
        maxRetries: 2,
      },
    });
  });

  it('does not schedule a blocked boundary adjustment', async () => {
    useSettingsStore.setState({
      settings: { delayMinSeconds: 0, delayMaxSeconds: 300, maxRetries: 2 },
    });

    useSettingsStore.getState().adjustDelay('min', -1);

    await expect(useSettingsStore.getState().flushDelayPersistence()).resolves.toEqual({ ok: true });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('normalizes and persists legacy stored settings during hydration', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        delayMinSeconds: 31,
        delayMaxSeconds: 59,
        maxRetries: 2,
      },
    } as never);

    await useSettingsStore.getState().loadFromStorage();

    expect(useSettingsStore.getState().settings).toEqual({
      delayMinSeconds: 30,
      delayMaxSeconds: 60,
      maxRetries: 2,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.SETTINGS]: {
        delayMinSeconds: 30,
        delayMaxSeconds: 60,
        maxRetries: 2,
      },
    });
  });

  it('surfaces a final persistence failure while retaining edited settings', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('quota exceeded'));

    useSettingsStore.getState().adjustDelay('max', 1);
    const result = await useSettingsStore.getState().flushDelayPersistence();

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('quota exceeded') });
    expect(useSettingsStore.getState().settings.delayMaxSeconds).toBe(65);
    expect(useSettingsStore.getState().error).toContain('quota exceeded');
  });
});
