import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignOrchestrator } from '@background/orchestrator';
import type { PostDraft, CampaignSettings, GroupEntry, GroupList } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockDraft: PostDraft = {
  id: 'draft-1',
  text: 'Test post content',
  mediaFiles: [],
  createdAt: 1000,
  updatedAt: 1000,
};

const mockSettings: CampaignSettings = {
  delayMinSeconds: 0,
  delayMaxSeconds: 0,
  maxRetries: 1,
};

const mockGroupList: GroupList = {
  id: 'list-1',
  name: 'Test List',
  groups: [
    { url: 'https://www.facebook.com/groups/group1' },
    { url: 'https://www.facebook.com/groups/group2' },
    { url: 'https://www.facebook.com/groups/group3' },
  ],
  createdAt: 1000,
  updatedAt: 1000,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function setupStorageMock(lists: GroupList[] = [mockGroupList]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(chrome.storage.local.get).mockImplementation((async (keys: any) => {
    if (typeof keys === 'string') {
      if (keys === STORAGE_KEYS.GROUP_LISTS) return { [keys]: lists };
      if (keys === STORAGE_KEYS.CAMPAIGN_STATE) return {};
      return {};
    }
    return {};
  }) as any);
}

function setupTabsMock(options: { sendMessageResponse?: unknown; loadImmediate?: boolean } = {}) {
  const { sendMessageResponse, loadImmediate = true } = options;

  const successResult = {
    type: 'POST_RESULT',
    payload: { groupUrl: '', status: 'success', timestamp: Date.now() },
  };
  const response = sendMessageResponse ?? successResult;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 1 } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(chrome.tabs.update).mockResolvedValue({ id: 1 } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(chrome.tabs.query).mockResolvedValue([] as any);

  // Mock sendMessage — promise-based
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(chrome.tabs.sendMessage).mockResolvedValue(response as any);

  // Mock tab load completion
  vi.mocked(chrome.tabs.onUpdated.addListener).mockImplementation((listener: unknown) => {
    if (loadImmediate && typeof listener === 'function') {
      setTimeout(() => (listener as (tabId: number, changeInfo: { status: string }) => void)(1, { status: 'complete' }), 10);
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CampaignOrchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupStorageMock();
    setupTabsMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts with status idle', () => {
      const orch = new CampaignOrchestrator();
      expect(orch.status).toBe('idle');
      expect(orch.currentCampaign).toBeNull();
    });
  });

  describe('start', () => {
    it('snapshots target groups so caller mutations cannot alter the campaign', async () => {
      const sourceGroups: GroupEntry[] = [
        {
          url: 'https://www.facebook.com/groups/original-group',
          label: 'Original group',
        },
      ];
      const orch = new CampaignOrchestrator();
      const startPromise = orch.start(mockDraft, sourceGroups, mockSettings);

      sourceGroups[0].url = 'https://www.facebook.com/groups/mutated-group';
      sourceGroups[0].label = 'Mutated group';
      sourceGroups.push({ url: 'https://www.facebook.com/groups/added-later' });

      await vi.runAllTimersAsync();
      await startPromise;

      expect(orch.currentCampaign?.targetGroups).toEqual([
        {
          url: 'https://www.facebook.com/groups/original-group',
          label: 'Original group',
        },
      ]);
    });

    it('does not write campaign targets into saved group-list storage', async () => {
      const orch = new CampaignOrchestrator();
      const groups: GroupEntry[] = [
        { url: 'https://www.facebook.com/groups/campaign-only' },
      ];
      const startPromise = orch.start(mockDraft, groups, mockSettings);

      await vi.runAllTimersAsync();
      await startPromise;

      const storageWrites = vi.mocked(chrome.storage.local.set).mock.calls.map(
        ([value]) => value as Record<string, unknown>,
      );
      const storageReads = vi.mocked(chrome.storage.local.get).mock.calls.map(([key]) => key);
      expect(storageWrites.some((value) => STORAGE_KEYS.GROUP_LISTS in value)).toBe(false);
      expect(storageWrites.some((value) => STORAGE_KEYS.CAMPAIGN_STATE in value)).toBe(true);
      expect(storageReads).not.toContain(STORAGE_KEYS.GROUP_LISTS);
    });

    it('transitions to running', async () => {
      const orch = new CampaignOrchestrator();
      const startPromise = orch.start(mockDraft, 'list-1', mockSettings);

      // Advance timers to let async operations complete
      await vi.runAllTimersAsync();
      await startPromise;

      // After completing all groups, status should be completed
      expect(orch.status).toBe('completed');
    });

    it('does not start if already running', async () => {
      const orch = new CampaignOrchestrator();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Make tab load never complete so first campaign stays in 'running'
      vi.mocked(chrome.tabs.onUpdated.addListener).mockImplementation(() => {
        // Never call listener — tab never finishes loading
      });

      setupStorageMock([{
        ...mockGroupList,
        groups: [{ url: 'https://www.facebook.com/groups/g1' }],
      }]);

      // Start first campaign — it will hang on tab load
      const p1 = orch.start(mockDraft, 'list-1', mockSettings);

      // Give it a tick to enter running state
      await vi.advanceTimersByTimeAsync(10);
      expect(orch.status).toBe('running');

      // Try starting second while first is stuck
      await orch.start(mockDraft, 'list-1', mockSettings);

      expect(warnSpy).toHaveBeenCalledWith('[Blink:Orchestrator] Campaign already running.');
      warnSpy.mockRestore();

      // Cancel to clean up the hanging promise
      await orch.cancel();
      await vi.runAllTimersAsync();
    });

    it('snapshots settings before hydration so later edits affect only future campaigns', async () => {
      const settings: CampaignSettings = {
        delayMinSeconds: 30,
        delayMaxSeconds: 60,
        maxRetries: 2,
      };
      const orch = new CampaignOrchestrator();
      const startPromise = orch.start(mockDraft, 'list-1', settings);

      settings.delayMinSeconds = 5;
      settings.delayMaxSeconds = 10;
      settings.maxRetries = 0;

      await vi.runAllTimersAsync();
      await startPromise;

      expect(orch.currentCampaign?.settings).toEqual({
        delayMinSeconds: 30,
        delayMaxSeconds: 60,
        maxRetries: 2,
      });
    });

    it('persists campaign state to storage', async () => {
      const orch = new CampaignOrchestrator();
      const promise = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.runAllTimersAsync();
      await promise;

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const calls = vi.mocked(chrome.storage.local.set).mock.calls;
      const campaignSaves = calls.filter((c) => {
        const arg = c[0] as Record<string, unknown>;
        return STORAGE_KEYS.CAMPAIGN_STATE in arg;
      });
      expect(campaignSaves.length).toBeGreaterThan(0);
    });

    it('broadcasts status updates', async () => {
      const orch = new CampaignOrchestrator();
      const promise = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.runAllTimersAsync();
      await promise;

      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('rejects an empty group list without creating a campaign', async () => {
      setupStorageMock([{ ...mockGroupList, id: 'list-1', groups: [] }]);

      const orch = new CampaignOrchestrator();
      await expect(orch.start(mockDraft, 'list-1', mockSettings)).rejects.toThrow(
        'No campaign target groups found.',
      );

      expect(orch.status).toBe('idle');
    });
  });

  describe('pause and resume', () => {
    it('pause sets pauseRequested flag', async () => {
      // Use a longer group list so we can pause mid-run
      const longList: GroupList = {
        ...mockGroupList,
        groups: Array.from({ length: 5 }, (_, i) => ({
          url: `https://www.facebook.com/groups/g${i}`,
        })),
      };
      setupStorageMock([longList]);

      const orch = new CampaignOrchestrator();
      const startPromise = orch.start(mockDraft, 'list-1', mockSettings);

      // Let first group process
      await vi.advanceTimersByTimeAsync(50);

      orch.pause();

      await vi.runAllTimersAsync();
      await startPromise;

      expect(orch.status).toBe('paused');
    });

    it('resume restarts from paused state', async () => {
      const orch = new CampaignOrchestrator();
      const singleGroupList: GroupList = {
        ...mockGroupList,
        groups: [
          { url: 'https://www.facebook.com/groups/g1' },
          { url: 'https://www.facebook.com/groups/g2' },
        ],
      };
      setupStorageMock([singleGroupList]);

      const p1 = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.advanceTimersByTimeAsync(50);
      orch.pause();
      await vi.runAllTimersAsync();
      await p1;

      expect(orch.status).toBe('paused');

      // Resume
      const p2 = orch.resume();
      await vi.runAllTimersAsync();
      await p2;

      expect(orch.status).toBe('completed');
    });

    it('reports an actionable error when no paused campaign exists', async () => {
      const orch = new CampaignOrchestrator();
      await expect(orch.resume()).rejects.toThrow('No paused campaign to resume');
      expect(orch.status).toBe('idle');
    });
  });

  describe('cancel', () => {
    it('marks remaining groups as skipped', async () => {
      const longList: GroupList = {
        ...mockGroupList,
        groups: Array.from({ length: 5 }, (_, i) => ({
          url: `https://www.facebook.com/groups/g${i}`,
        })),
      };
      setupStorageMock([longList]);

      const orch = new CampaignOrchestrator();
      const startPromise = orch.start(mockDraft, 'list-1', mockSettings);

      await vi.advanceTimersByTimeAsync(50);
      await orch.cancel();
      await vi.runAllTimersAsync();
      await startPromise;

      expect(orch.status).toBe('cancelled');
      const campaign = orch.currentCampaign!;
      const skipped = campaign.results.filter((r) => r.status === 'skipped');
      expect(skipped.length).toBeGreaterThan(0);
    });

    it('cancel from paused state works immediately', async () => {
      const orch = new CampaignOrchestrator();
      setupStorageMock([{
        ...mockGroupList,
        groups: [
          { url: 'https://www.facebook.com/groups/g1' },
          { url: 'https://www.facebook.com/groups/g2' },
        ],
      }]);

      const p = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.advanceTimersByTimeAsync(50);
      orch.pause();
      await vi.runAllTimersAsync();
      await p;

      expect(orch.status).toBe('paused');

      await orch.cancel();
      expect(orch.status).toBe('cancelled');
    });

    it('reports an actionable error when no active campaign exists', async () => {
      const orch = new CampaignOrchestrator();
      await expect(orch.cancel()).rejects.toThrow('No active campaign to cancel');
      expect(orch.status).toBe('idle');
    });
  });

  describe('error handling', () => {
    it('retries failed posts up to maxRetries', async () => {
      const failResponse = {
        type: 'POST_RESULT',
        payload: { groupUrl: '', status: 'failed', error: 'DOM error', timestamp: Date.now() },
      };
      setupTabsMock({ sendMessageResponse: failResponse });
      setupStorageMock([{
        ...mockGroupList,
        groups: [{ url: 'https://www.facebook.com/groups/g1' }],
      }]);

      const settingsWithRetry: CampaignSettings = { ...mockSettings, maxRetries: 2 };
      const orch = new CampaignOrchestrator();
      const p = orch.start(mockDraft, 'list-1', settingsWithRetry);
      await vi.runAllTimersAsync();
      await p;

      // Should have attempted 3 times (1 initial + 2 retries)
      // Each attempt calls sendMessage once
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3);
      expect(orch.status).toBe('failed'); // all groups failed → campaign failed
    });

    it('campaign status is failed when all groups fail', async () => {
      const failResponse = {
        type: 'POST_RESULT',
        payload: { groupUrl: '', status: 'failed', error: 'err', timestamp: Date.now() },
      };
      setupTabsMock({ sendMessageResponse: failResponse });
      setupStorageMock([{
        ...mockGroupList,
        groups: [
          { url: 'https://www.facebook.com/groups/g1' },
          { url: 'https://www.facebook.com/groups/g2' },
        ],
      }]);

      const orch = new CampaignOrchestrator();
      const p = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.runAllTimersAsync();
      await p;

      expect(orch.status).toBe('failed');
    });

    it('reports completed-with-issues when successful and failed posts are mixed', async () => {
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(chrome.tabs.sendMessage).mockImplementation((() => {
        callCount++;
        const status = callCount === 1 ? 'success' : 'failed';
        return Promise.resolve({
          type: 'POST_RESULT',
          payload: { groupUrl: '', status, timestamp: Date.now() },
        });
      }) as any);

      setupStorageMock([{
        ...mockGroupList,
        groups: [
          { url: 'https://www.facebook.com/groups/g1' },
          { url: 'https://www.facebook.com/groups/g2' },
        ],
      }]);

      const orch = new CampaignOrchestrator();
      const p = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.runAllTimersAsync();
      await p;

      expect(orch.status).toBe('completed-with-issues');
    });
  });

  describe('crash recovery', () => {
    it('hydrates and persists targetGroups from one legacy group-list lookup', async () => {
      const legacyGroups: GroupEntry[] = [
        {
          url: 'https://www.facebook.com/groups/legacy-one',
          label: 'Legacy one',
        },
        { url: 'https://www.facebook.com/groups/legacy-two' },
      ];
      const legacyList: GroupList = {
        id: 'legacy-list',
        name: 'Legacy campaign targets',
        groups: legacyGroups,
        createdAt: 1000,
        updatedAt: 1000,
      };
      const legacyCampaign = {
        id: 'legacy-campaign',
        postDraft: mockDraft,
        groupListId: legacyList.id,
        status: 'paused',
        currentIndex: 1,
        totalGroups: legacyGroups.length,
        results: [{ groupUrl: legacyGroups[0].url, status: 'success', timestamp: 1000 }],
        startedAt: 1000,
        settings: mockSettings,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(chrome.storage.local.get).mockImplementation((async (keys: any) => {
        if (keys === STORAGE_KEYS.CAMPAIGN_STATE) {
          return { [STORAGE_KEYS.CAMPAIGN_STATE]: legacyCampaign };
        }
        if (keys === STORAGE_KEYS.GROUP_LISTS) {
          return { [STORAGE_KEYS.GROUP_LISTS]: [legacyList] };
        }
        return {};
      }) as any);

      const orch = new CampaignOrchestrator();
      await orch.recoverFromCrash();

      expect(orch.currentCampaign?.targetGroups).toEqual(legacyGroups);
      expect(
        vi.mocked(chrome.storage.local.get).mock.calls.filter(
          ([keys]) => keys === STORAGE_KEYS.GROUP_LISTS,
        ),
      ).toHaveLength(1);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.CAMPAIGN_STATE]: expect.objectContaining({
          targetGroups: legacyGroups,
        }),
      });

      legacyGroups[0].label = 'Changed after recovery';
      expect(orch.currentCampaign?.targetGroups[0].label).toBe('Legacy one');
    });

    it('restores paused campaign from storage', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(chrome.storage.local.get).mockImplementation((async (keys: any) => {
        if (typeof keys === 'string' && keys === STORAGE_KEYS.CAMPAIGN_STATE) {
          return {
            [STORAGE_KEYS.CAMPAIGN_STATE]: {
              id: 'recovered-1',
              postDraft: mockDraft,
              groupListId: 'list-1',
              status: 'paused',
              currentIndex: 1,
              results: [
                {
                  groupUrl: 'https://www.facebook.com/groups/group1',
                  status: 'success',
                  timestamp: 1000,
                },
              ],
              startedAt: 1000,
              settings: mockSettings,
            },
          };
        }
        if (typeof keys === 'string' && keys === STORAGE_KEYS.GROUP_LISTS) {
          return { [STORAGE_KEYS.GROUP_LISTS]: [mockGroupList] };
        }
        return {};
      }) as any);

      const orch = new CampaignOrchestrator();
      await orch.recoverFromCrash();

      // Paused campaigns are just restored, not auto-resumed
      expect(orch.status).toBe('paused');
    });

    it('does nothing when no saved campaign', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(chrome.storage.local.get).mockResolvedValue({} as any);

      const orch = new CampaignOrchestrator();
      await orch.recoverFromCrash();

      expect(orch.status).toBe('idle');
    });
  });

  describe('currentCampaign', () => {
    it('returns a copy, not the internal reference', async () => {
      const orch = new CampaignOrchestrator();
      setupStorageMock([{
        ...mockGroupList,
        groups: [{ url: 'https://www.facebook.com/groups/g1' }],
      }]);

      const p = orch.start(mockDraft, 'list-1', mockSettings);
      await vi.runAllTimersAsync();
      await p;

      const c1 = orch.currentCampaign;
      const c2 = orch.currentCampaign;
      expect(c1).not.toBe(c2); // Different object references
      expect(c1).toEqual(c2); // Same data
    });
  });
});

import { afterEach } from 'vitest';
