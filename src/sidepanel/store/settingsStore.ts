import { create } from 'zustand';
import type { CampaignSettings } from '@shared/types';
import { STORAGE_KEYS, DEFAULT_CAMPAIGN_SETTINGS } from '@shared/constants';
import {
  adjustDelayRange,
  normalizeDelayRange,
  type DelayDirection,
  type DelayEndpoint,
} from '@shared/timingPolicy';

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export const DELAY_SAVE_DEBOUNCE_MS = 250;

interface SettingsState {
  settings: CampaignSettings;
  isLoaded: boolean;
  isPersisting: boolean;
  error: string | null;
  adjustDelay: (endpoint: DelayEndpoint, direction: DelayDirection) => void;
  beginDelayPersistence: () => void;
  endDelayPersistence: () => Promise<SettingsActionResult>;
  flushDelayPersistence: () => Promise<SettingsActionResult>;
  setMaxRetries: (value: number) => Promise<SettingsActionResult>;
  resetDefaults: () => Promise<SettingsActionResult>;
  loadFromStorage: () => Promise<void>;
  clearError: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMaxRetries(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CAMPAIGN_SETTINGS.maxRetries;
  }
  return Math.min(10, Math.max(0, Math.trunc(value)));
}

function normalizeSettings(value: unknown): CampaignSettings {
  const source = isRecord(value) ? value : {};
  return {
    ...normalizeDelayRange(source),
    maxRetries: normalizeMaxRetries(source.maxRetries),
  };
}

function settingsMatch(value: unknown, settings: CampaignSettings): boolean {
  return (
    isRecord(value) &&
    value.delayMinSeconds === settings.delayMinSeconds &&
    value.delayMaxSeconds === settings.delayMaxSeconds &&
    value.maxRetries === settings.maxRetries
  );
}

function storageError(action: string, error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  return `Could not ${action}: ${details || 'unknown storage error'}`;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  let writeQueue: Promise<void> = Promise.resolve();
  let pendingWrites = 0;
  let latestWrite = 0;
  let loadPromise: Promise<void> | null = null;
  let delayPersistenceTimer: ReturnType<typeof setTimeout> | null = null;
  let delayPersistencePending = false;
  let delayPersistenceHeld = false;

  const persistSettings = async (settings: CampaignSettings): Promise<SettingsActionResult> => {
    const snapshot = { ...settings };
    const writeId = ++latestWrite;
    pendingWrites++;
    set({ isPersisting: true });

    const write = writeQueue
      .catch(() => undefined)
      .then(() => chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: snapshot }));
    writeQueue = write;

    try {
      await write;
      if (writeId === latestWrite) set({ error: null });
      return { ok: true };
    } catch (error) {
      const message = storageError('save settings', error);
      if (writeId === latestWrite) set({ error: message });
      return { ok: false, error: message };
    } finally {
      pendingWrites--;
      if (pendingWrites === 0) set({ isPersisting: false });
    }
  };

  const commitSettings = async (settings: CampaignSettings): Promise<SettingsActionResult> => {
    set({ settings, error: null });
    return persistSettings(settings);
  };

  const clearDelayPersistence = (): void => {
    if (delayPersistenceTimer) {
      clearTimeout(delayPersistenceTimer);
      delayPersistenceTimer = null;
    }
    delayPersistencePending = false;
    delayPersistenceHeld = false;
  };

  const flushDelayPersistence = (): Promise<SettingsActionResult> => {
    if (delayPersistenceTimer) {
      clearTimeout(delayPersistenceTimer);
      delayPersistenceTimer = null;
    }
    if (!delayPersistencePending) return Promise.resolve({ ok: true });

    delayPersistencePending = false;
    return persistSettings(get().settings);
  };

  const scheduleDelayPersistence = (): void => {
    delayPersistencePending = true;
    if (delayPersistenceHeld) return;
    if (delayPersistenceTimer) clearTimeout(delayPersistenceTimer);
    delayPersistenceTimer = setTimeout(() => {
      delayPersistenceTimer = null;
      void flushDelayPersistence();
    }, DELAY_SAVE_DEBOUNCE_MS);
  };

  return {
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS },
    isLoaded: false,
    isPersisting: false,
    error: null,

    adjustDelay: (endpoint, direction) => {
      const settings = get().settings;
      const delayRange = adjustDelayRange(settings, endpoint, direction);
      if (
        delayRange.delayMinSeconds === settings.delayMinSeconds &&
        delayRange.delayMaxSeconds === settings.delayMaxSeconds
      ) {
        return;
      }
      set({ settings: { ...settings, ...delayRange }, error: null });
      scheduleDelayPersistence();
    },

    beginDelayPersistence: () => {
      delayPersistenceHeld = true;
      if (delayPersistenceTimer) {
        clearTimeout(delayPersistenceTimer);
        delayPersistenceTimer = null;
      }
    },

    endDelayPersistence: () => {
      delayPersistenceHeld = false;
      return flushDelayPersistence();
    },

    flushDelayPersistence,

    setMaxRetries: (value) => {
      clearDelayPersistence();
      return commitSettings({
        ...get().settings,
        maxRetries: Number.isFinite(value) ? Math.min(10, Math.max(0, Math.trunc(value))) : 0,
      });
    },

    resetDefaults: () => {
      clearDelayPersistence();
      return commitSettings({ ...DEFAULT_CAMPAIGN_SETTINGS });
    },

    loadFromStorage: async () => {
      if (loadPromise) return loadPromise;

      loadPromise = (async () => {
        try {
          clearDelayPersistence();
          const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
          const saved = result[STORAGE_KEYS.SETTINGS];
          const settings = normalizeSettings(saved);
          set({ settings, isLoaded: true, error: null });

          if (saved !== undefined && !settingsMatch(saved, settings)) {
            await persistSettings(settings);
          }
        } catch (error) {
          set({
            isLoaded: true,
            error: storageError('load settings', error),
          });
        }
      })().finally(() => {
        loadPromise = null;
      });

      return loadPromise;
    },

    clearError: () => set({ error: null }),
  };
});

if (typeof chrome !== 'undefined' && chrome.storage) {
  void useSettingsStore.getState().loadFromStorage();
}
