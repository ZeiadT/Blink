import { create } from 'zustand';
import type { Campaign, CampaignSettings, PostDraft, GroupEntry, GroupList } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import {
  createStartCampaignMessage,
  createPauseCampaignMessage,
  createResumeCampaignMessage,
  createCancelCampaignMessage,
  createGetCampaignStatusMessage,
} from '@shared/messages';
import { generateId } from '@shared/utils';

interface CampaignState {
  campaign: Campaign | null;
  isLoading: boolean;
  startCampaign: (postDraft: PostDraft, groups: GroupEntry[], settings: CampaignSettings) => Promise<void>;
  pauseCampaign: () => Promise<void>;
  resumeCampaign: () => Promise<void>;
  cancelCampaign: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setCampaign: (campaign: Campaign | null) => void;
  clearCampaign: () => void;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaign: null,
  isLoading: false,

  startCampaign: async (postDraft, groups, settings) => {
    set({ isLoading: true });
    try {
      const groupListId = await saveGroupsForCampaign(groups);
      await chrome.runtime.sendMessage(
        createStartCampaignMessage(postDraft, groupListId, settings),
      );
    } catch (error) {
      console.error('[Blink] Failed to start campaign:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  pauseCampaign: async () => {
    try {
      await chrome.runtime.sendMessage(createPauseCampaignMessage());
    } catch (error) {
      console.error('[Blink] Failed to pause:', error);
    }
  },

  resumeCampaign: async () => {
    try {
      await chrome.runtime.sendMessage(createResumeCampaignMessage());
    } catch (error) {
      console.error('[Blink] Failed to resume:', error);
    }
  },

  cancelCampaign: async () => {
    try {
      await chrome.runtime.sendMessage(createCancelCampaignMessage());
    } catch (error) {
      console.error('[Blink] Failed to cancel:', error);
    }
  },

  refreshStatus: async () => {
    try {
      const response = await chrome.runtime.sendMessage(createGetCampaignStatusMessage());
      if (response?.success && response.campaign) {
        set({ campaign: response.campaign });
      }
    } catch {
      // Background might not be ready — load from storage
      try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.CAMPAIGN_STATE);
        const campaign = result[STORAGE_KEYS.CAMPAIGN_STATE] as Campaign | undefined;
        if (campaign) set({ campaign });
      } catch (e) {
        console.error('[Blink] Failed to load campaign state:', e);
      }
    }
  },

  setCampaign: (campaign) => set({ campaign }),

  clearCampaign: () => set({ campaign: null }),
}));

/** Save active groups as a GroupList so the orchestrator can find them by ID. */
async function saveGroupsForCampaign(groups: GroupEntry[]): Promise<string> {
  const listId = generateId();
  const list: GroupList = {
    id: listId,
    name: `Campaign ${new Date().toLocaleDateString()}`,
    groups: [...groups],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const result = await chrome.storage.local.get(STORAGE_KEYS.GROUP_LISTS);
  const lists = (result[STORAGE_KEYS.GROUP_LISTS] as GroupList[]) ?? [];
  lists.push(list);
  await chrome.storage.local.set({ [STORAGE_KEYS.GROUP_LISTS]: lists });
  return listId;
}

// Auto-init: load status + listen for real-time updates
if (typeof chrome !== 'undefined' && chrome.storage) {
  useCampaignStore.getState().refreshStatus();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.CAMPAIGN_STATE]) {
      const campaign = changes[STORAGE_KEYS.CAMPAIGN_STATE].newValue as Campaign | undefined;
      useCampaignStore.getState().setCampaign(campaign ?? null);
    }
  });
}
