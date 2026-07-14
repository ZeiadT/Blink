import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignStore } from '@sidepanel/store/campaignStore';
import { isDismissCampaign, isStartCampaign } from '@shared/messages';
import type {
  Campaign,
  CampaignHistoryEntry,
  CampaignLaunchSnapshot,
  CampaignSettings,
  GroupEntry,
  PostDraft,
} from '@shared/types';

const postDraft: PostDraft = {
  id: 'post-1',
  text: 'Campaign copy',
  mediaFiles: [],
  createdAt: 1,
  updatedAt: 1,
};

const settings: CampaignSettings = {
  delayMinSeconds: 30,
  delayMaxSeconds: 60,
  maxRetries: 2,
};

describe('campaignStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCampaignStore.setState({
      campaign: null,
      history: [],
      isLoading: false,
      pendingAction: null,
      actionError: null,
      historyError: null,
    });
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      ok: true,
      campaign: null,
    } as never);
  });

  it('should send a copied target snapshot without writing saved-group storage', async () => {
    const activeGroups: GroupEntry[] = [
      { url: 'https://facebook.com/groups/campaign-target', label: 'Campaign target' },
    ];
    const launch: CampaignLaunchSnapshot = {
      postSource: { kind: 'current', label: 'Current post draft' },
      groupSource: { kind: 'current', label: 'Current working groups' },
      randomizeGroupOrder: false,
    };

    await useCampaignStore.getState().startCampaign(postDraft, activeGroups, settings, launch);

    const message = vi.mocked(chrome.runtime.sendMessage).mock.calls.at(-1)?.[0];
    expect(isStartCampaign(message)).toBe(true);

    if (!isStartCampaign(message) || !('targetGroups' in message.payload)) {
      throw new Error('Expected a snapshot-backed START_CAMPAIGN message.');
    }

    activeGroups[0].label = 'Mutated after start';
    launch.groupSource.label = 'Mutated launch';
    expect(message.payload.targetGroups).toEqual([
      { url: 'https://facebook.com/groups/campaign-target', label: 'Campaign target' },
    ]);
    expect(message.payload.launch?.groupSource.label).toBe('Current working groups');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('should hydrate a paused campaign from the typed status response', async () => {
    const pausedCampaign: Campaign = {
      id: 'campaign-paused',
      postDraft,
      targetGroups: [{ url: 'https://facebook.com/groups/paused-target' }],
      status: 'paused',
      currentIndex: 1,
      totalGroups: 1,
      results: [
        {
          groupUrl: 'https://facebook.com/groups/paused-target',
          status: 'success',
          timestamp: 2,
        },
      ],
      startedAt: 1,
      settings,
    };
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      ok: true,
      campaign: pausedCampaign,
    } as never);

    await useCampaignStore.getState().refreshStatus();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CAMPAIGN_STATUS' });
    expect(useCampaignStore.getState().campaign).toEqual(pausedCampaign);
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('should not read campaign storage when the status request fails', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Background unavailable'));

    await useCampaignStore.getState().refreshStatus();

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(useCampaignStore.getState().campaign).toBeNull();
    expect(useCampaignStore.getState().actionError).toContain('Background unavailable');
  });

  it('surfaces failed campaign commands for the UI', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      ok: false,
      campaign: null,
      error: 'Campaign is not paused.',
    } as never);

    await expect(useCampaignStore.getState().resumeCampaign()).rejects.toThrow('Campaign is not paused');
    expect(useCampaignStore.getState().actionError).toContain('Campaign is not paused');
    expect(useCampaignStore.getState().pendingAction).toBeNull();
  });

  it('hydrates campaign history through the background contract', async () => {
    const history: CampaignHistoryEntry[] = [
      {
        id: 'history-1',
        status: 'completed-with-issues',
        postText: 'First\n\nمرحبا 😀',
        mediaCount: 1,
        totalGroups: 2,
        results: [],
        settings,
        completedAt: 3,
      },
    ];
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true, history } as never);

    await useCampaignStore.getState().refreshHistory();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CAMPAIGN_HISTORY' });
    expect(useCampaignStore.getState().history).toEqual(history);
    expect(useCampaignStore.getState().historyError).toBeNull();
  });

  it('dismisses active campaign through background before refreshing history', async () => {
    vi.mocked(chrome.runtime.sendMessage)
      .mockResolvedValueOnce({ ok: true, campaign: null } as never)
      .mockResolvedValueOnce({ ok: true, history: [] } as never);

    await useCampaignStore.getState().dismissCampaign();

    expect(isDismissCampaign(vi.mocked(chrome.runtime.sendMessage).mock.calls[0][0])).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'GET_CAMPAIGN_HISTORY' });
    expect(useCampaignStore.getState().campaign).toBeNull();
  });
});
