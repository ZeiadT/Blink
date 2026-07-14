import { create } from 'zustand';

export const CURRENT_SOURCE_ID = 'current';

interface CampaignSetupState {
  postSourceId: string;
  groupSourceId: string;
  randomizeGroupOrder: boolean;
  setPostSourceId: (sourceId: string) => void;
  setGroupSourceId: (sourceId: string) => void;
  setRandomizeGroupOrder: (enabled: boolean) => void;
  reset: () => void;
}

const INITIAL_SETUP = {
  postSourceId: CURRENT_SOURCE_ID,
  groupSourceId: CURRENT_SOURCE_ID,
  randomizeGroupOrder: false,
};

export const useCampaignSetupStore = create<CampaignSetupState>((set) => ({
  ...INITIAL_SETUP,
  setPostSourceId: (postSourceId) => set({ postSourceId }),
  setGroupSourceId: (groupSourceId) => set({ groupSourceId }),
  setRandomizeGroupOrder: (randomizeGroupOrder) => set({ randomizeGroupOrder }),
  reset: () => set(INITIAL_SETUP),
}));
