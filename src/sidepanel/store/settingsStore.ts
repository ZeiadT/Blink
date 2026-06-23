import { create } from 'zustand';
import type { CampaignSettings } from '@shared/types';
import { STORAGE_KEYS, DEFAULT_CAMPAIGN_SETTINGS } from '@shared/constants';

interface SettingsState {
  settings: CampaignSettings;
  isLoaded: boolean;
  updateSettings: (partial: Partial<CampaignSettings>) => void;
  resetDefaults: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_CAMPAIGN_SETTINGS },
  isLoaded: false,

  updateSettings: (partial) => {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }));
    persistSettings(get().settings);
  },

  resetDefaults: () => {
    set({ settings: { ...DEFAULT_CAMPAIGN_SETTINGS } });
    persistSettings({ ...DEFAULT_CAMPAIGN_SETTINGS });
  },

  loadFromStorage: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const saved = result[STORAGE_KEYS.SETTINGS] as CampaignSettings | undefined;
      if (saved) {
        set({ settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...saved }, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('[Blink] Failed to load settings:', error);
      set({ isLoaded: true });
    }
  },
}));

function persistSettings(settings: CampaignSettings) {
  try {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  } catch (error) {
    console.error('[Blink] Failed to persist settings:', error);
  }
}

// Auto-load on init
if (typeof chrome !== 'undefined' && chrome.storage) {
  useSettingsStore.getState().loadFromStorage();
}
