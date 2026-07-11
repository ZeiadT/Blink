import { create } from 'zustand';
import type {
  Campaign,
  CampaignSettings,
  GroupEntry,
  PopupMessage,
  PostDraft,
  CampaignHistoryEntry,
} from '@shared/types';
import {
  createCancelCampaignMessage,
  createDismissCampaignMessage,
  createGetCampaignHistoryMessage,
  createGetCampaignStatusMessage,
  createPauseCampaignMessage,
  createResumeCampaignMessage,
  createStartCampaignMessage,
  isCampaignHistoryResponse,
  isCampaignStatusResponse,
  isStatusUpdate,
} from '@shared/messages';

type CampaignAction = 'start' | 'pause' | 'resume' | 'cancel' | 'dismiss' | 'history' | null;

type CampaignCommandMessage = Exclude<PopupMessage, { type: 'GET_CAMPAIGN_STATUS' | 'GET_CAMPAIGN_HISTORY' }>;

interface CampaignState {
  campaign: Campaign | null;
  history: CampaignHistoryEntry[];
  isLoading: boolean;
  pendingAction: CampaignAction;
  actionError: string | null;
  historyError: string | null;
  startCampaign: (postDraft: PostDraft, groups: GroupEntry[], settings: CampaignSettings) => Promise<void>;
  pauseCampaign: () => Promise<void>;
  resumeCampaign: () => Promise<void>;
  cancelCampaign: () => Promise<void>;
  dismissCampaign: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  setCampaign: (campaign: Campaign | null) => void;
  clearActionError: () => void;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaign: null,
  history: [],
  isLoading: false,
  pendingAction: null,
  actionError: null,
  historyError: null,

  startCampaign: async (postDraft, groups, settings) => {
    await sendCampaignCommand(
      'start',
      createStartCampaignMessage(postDraft, groups, settings),
      set,
    );
  },

  pauseCampaign: async () => {
    await sendCampaignCommand('pause', createPauseCampaignMessage(), set);
  },

  resumeCampaign: async () => {
    await sendCampaignCommand('resume', createResumeCampaignMessage(), set);
  },

  cancelCampaign: async () => {
    await sendCampaignCommand('cancel', createCancelCampaignMessage(), set);
  },

  dismissCampaign: async () => {
    await sendCampaignCommand('dismiss', createDismissCampaignMessage(), set);
    await useCampaignStore.getState().refreshHistory();
  },

  refreshStatus: async () => {
    try {
      const response = await chrome.runtime.sendMessage(createGetCampaignStatusMessage());
      const campaign = readCampaignResponse(response);
      set({ campaign, actionError: null });
    } catch (error) {
      set({ actionError: formatError(error) });
    }
  },

  refreshHistory: async () => {
    set({ pendingAction: 'history', historyError: null });
    try {
      const response = await chrome.runtime.sendMessage(createGetCampaignHistoryMessage());
      if (!isCampaignHistoryResponse(response)) {
        throw new Error('Background returned an invalid campaign-history response.');
      }
      if (!response.ok) {
        throw new Error(response.error ?? 'Campaign history is unavailable.');
      }
      set({ history: response.history, historyError: null, pendingAction: null });
    } catch (error) {
      set({ historyError: formatError(error), pendingAction: null });
    }
  },

  setCampaign: (campaign) => set({ campaign }),
  clearActionError: () => set({ actionError: null }),
}));

async function sendCampaignCommand(
  action: Exclude<CampaignAction, 'history' | null>,
  message: CampaignCommandMessage,
  set: (partial: Partial<CampaignState>) => void,
): Promise<void> {
  set({ isLoading: true, pendingAction: action, actionError: null });
  try {
    const response = await chrome.runtime.sendMessage(message);
    const campaign = readCampaignResponse(response);
    set({ campaign, isLoading: false, pendingAction: null, actionError: null });
  } catch (error) {
    const messageText = formatError(error);
    set({ isLoading: false, pendingAction: null, actionError: messageText });
    throw error instanceof Error ? error : new Error(messageText);
  }
}

function readCampaignResponse(response: unknown): Campaign | null {
  if (!isCampaignStatusResponse(response)) {
    throw new Error('Background returned an invalid campaign response.');
  }
  if (!response.ok) {
    throw new Error(response.error ?? 'Campaign action could not be completed.');
  }
  return response.campaign;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTerminalCampaign(campaign: Campaign | null): boolean {
  return (
    campaign?.status === 'completed' ||
    campaign?.status === 'completed-with-issues' ||
    campaign?.status === 'failed' ||
    campaign?.status === 'cancelled'
  );
}

// Side panel reads only background contracts; it never reads campaign storage.
if (typeof chrome !== 'undefined' && chrome.runtime) {
  void initializeCampaignState();

  chrome.runtime.onMessage.addListener((message) => {
    if (!isStatusUpdate(message)) return;
    useCampaignStore.getState().setCampaign(message.payload);
    if (isTerminalCampaign(message.payload)) {
      void useCampaignStore.getState().refreshHistory();
    }
  });
}

async function initializeCampaignState(): Promise<void> {
  await useCampaignStore.getState().refreshStatus();
  await useCampaignStore.getState().refreshHistory();
}
