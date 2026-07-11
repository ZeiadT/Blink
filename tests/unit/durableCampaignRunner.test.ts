import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignOrchestrator } from '@background/orchestrator';
import { createCampaignAlarmName } from '@background/scheduler';
import { STORAGE_KEYS } from '@shared/constants';
import type { Campaign, CampaignHistoryEntry, CampaignSettings, GroupEntry, PostDraft } from '@shared/types';

const postDraft: PostDraft = {
  id: 'durable-draft',
  text: 'Durable runner test post\r\n\r\n- مرحبا\nEmoji 😀',
  mediaFiles: [],
  createdAt: 1,
  updatedAt: 1,
};

const targetGroups: GroupEntry[] = [
  { url: 'https://www.facebook.com/groups/durable-first' },
  { url: 'https://www.facebook.com/groups/durable-second' },
];

const noDelaySettings: CampaignSettings = {
  delayMinSeconds: 0,
  delayMaxSeconds: 0,
  maxRetries: 0,
};

const delayedSettings: CampaignSettings = {
  delayMinSeconds: 5,
  delayMaxSeconds: 5,
  maxRetries: 0,
};

let storedCampaign: Campaign | null;
let storedHistory: CampaignHistoryEntry[];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'persisted-campaign',
    postDraft: clone(postDraft),
    targetGroups: clone(targetGroups),
    status: 'running',
    currentIndex: 0,
    nextPendingIndex: 0,
    runToken: 'persisted-run',
    totalGroups: targetGroups.length,
    results: [],
    startedAt: Date.now(),
    settings: clone(noDelaySettings),
    ...overrides,
  };
}

function installStorageMock(): void {
  vi.mocked(chrome.storage.local.get).mockImplementation(
    (async (keys: unknown) => {
      if (keys === STORAGE_KEYS.CAMPAIGN_STATE && storedCampaign) {
        return { [STORAGE_KEYS.CAMPAIGN_STATE]: clone(storedCampaign) };
      }
      if (keys === STORAGE_KEYS.CAMPAIGN_HISTORY) {
        return { [STORAGE_KEYS.CAMPAIGN_HISTORY]: clone(storedHistory) };
      }
      return {};
    }) as never,
  );

  vi.mocked(chrome.storage.local.set).mockImplementation(
    (async (items: Record<string, unknown>) => {
      const campaign = items[STORAGE_KEYS.CAMPAIGN_STATE];
      if (campaign !== undefined) {
        storedCampaign = clone(campaign as Campaign);
      }
      const history = items[STORAGE_KEYS.CAMPAIGN_HISTORY];
      if (history !== undefined) {
        storedHistory = clone(history as CampaignHistoryEntry[]);
      }
    }) as never,
  );

  vi.mocked(chrome.storage.local.remove).mockImplementation(
    (async (key: string | string[]) => {
      if (key === STORAGE_KEYS.CAMPAIGN_STATE) storedCampaign = null;
    }) as never,
  );
}

function installPostMocks(): void {
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined as never);
  vi.mocked(chrome.tabs.query).mockResolvedValue([] as never);
  vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 42 } as never);
  vi.mocked(chrome.tabs.update).mockResolvedValue({ id: 42 } as never);
  vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
    payload: { groupUrl: '', status: 'success', timestamp: Date.now() },
  } as never);
  vi.mocked(chrome.tabs.onUpdated.addListener).mockImplementation((listener) => {
    (listener as unknown as (tabId: number, changeInfo: { status?: string }) => void)(42, {
      status: 'complete',
    });
  });
}

async function flushPost(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2_000);
  await vi.advanceTimersByTimeAsync(0);
}

async function startThroughFirstDelayedResult(
  orchestrator: CampaignOrchestrator,
): Promise<Campaign> {
  await orchestrator.start(postDraft, targetGroups, delayedSettings);
  await flushPost();

  const campaign = orchestrator.currentCampaign;
  expect(campaign).not.toBeNull();
  return campaign!;
}

describe('CampaignOrchestrator durable runner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00.000Z'));
    vi.clearAllMocks();
    storedCampaign = null;
    storedHistory = [];
    installStorageMock();
    installPostMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules one named campaign alarm for a positive delay', async () => {
    const orchestrator = new CampaignOrchestrator();
    const campaign = await startThroughFirstDelayedResult(orchestrator);

    expect(campaign.results).toHaveLength(1);
    expect(campaign.nextRunAt).toBeDefined();
    expect(campaign.runToken).toBeDefined();
    expect(chrome.alarms.create).toHaveBeenCalledTimes(2);
    expect(chrome.alarms.create).toHaveBeenLastCalledWith(
      createCampaignAlarmName(campaign.id, campaign.runToken!),
      { when: campaign.nextRunAt },
    );
  });

  it('does not post a second target when paused after the first result, even if its alarm fires', async () => {
    const orchestrator = new CampaignOrchestrator();
    const campaign = await startThroughFirstDelayedResult(orchestrator);
    const alarmName = createCampaignAlarmName(campaign.id, campaign.runToken!);

    await orchestrator.pause();
    await orchestrator.handleAlarm(alarmName);
    await flushPost();

    expect(orchestrator.status).toBe('paused');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(orchestrator.currentCampaign?.results.map((result) => result.groupUrl)).toEqual([
      targetGroups[0].url,
    ]);
  });

  it('resumes by posting only the remaining target', async () => {
    const orchestrator = new CampaignOrchestrator();
    await startThroughFirstDelayedResult(orchestrator);
    await orchestrator.pause();

    await orchestrator.resume();
    await flushPost();

    expect(orchestrator.status).toBe('completed');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(orchestrator.currentCampaign?.results.map((result) => result.groupUrl)).toEqual(
      targetGroups.map((group) => group.url),
    );
    expect(orchestrator.currentCampaign?.postDraft.text).toBe(postDraft.text);
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.objectContaining({ payload: expect.objectContaining({ text: postDraft.text }) }),
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [STORAGE_KEYS.CAMPAIGN_HISTORY]: [
          expect.objectContaining({
            id: expect.any(String),
            status: 'completed',
            postText: postDraft.text,
            mediaCount: 0,
          }),
        ],
      }),
    );
  });

  it('makes repeated resume calls create one execution', async () => {
    const orchestrator = new CampaignOrchestrator();
    await startThroughFirstDelayedResult(orchestrator);
    await orchestrator.pause();

    await Promise.all([orchestrator.resume(), orchestrator.resume(), orchestrator.resume()]);
    await flushPost();

    expect(orchestrator.status).toBe('completed');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(orchestrator.currentCampaign?.results).toHaveLength(2);
  });

  it('ignores a stale alarm token without posting', async () => {
    const orchestrator = new CampaignOrchestrator();
    const campaign = await startThroughFirstDelayedResult(orchestrator);
    const staleAlarmName = createCampaignAlarmName(campaign.id, 'stale-run-token');

    await orchestrator.handleAlarm(staleAlarmName);
    await flushPost();

    expect(orchestrator.status).toBe('running');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(orchestrator.currentCampaign?.runToken).toBe(campaign.runToken);
  });

  it('hydrates a paused campaign in a fresh orchestrator without posting', async () => {
    storedCampaign = createCampaign({
      status: 'paused',
      currentIndex: 1,
      nextPendingIndex: 1,
      results: [
        { groupUrl: targetGroups[0].url, status: 'success', timestamp: Date.now() - 1_000 },
      ],
    });
    const orchestrator = new CampaignOrchestrator();

    await orchestrator.recoverFromCrash();

    expect(orchestrator.status).toBe('paused');
    expect(orchestrator.currentCampaign?.nextPendingIndex).toBe(1);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });

  it('has a fresh instance resume a persisted delayed campaign exactly once from its alarm', async () => {
    const nextRunAt = Date.now() + 5_000;
    storedCampaign = createCampaign({
      currentIndex: 1,
      nextPendingIndex: 1,
      nextRunAt,
      results: [
        { groupUrl: targetGroups[0].url, status: 'success', timestamp: Date.now() - 1_000 },
      ],
    });
    const orchestrator = new CampaignOrchestrator();
    const alarmName = createCampaignAlarmName(storedCampaign.id, storedCampaign.runToken!);

    await orchestrator.recoverFromCrash();
    expect(chrome.alarms.create).toHaveBeenCalledWith(alarmName, { when: nextRunAt });

    await vi.advanceTimersByTimeAsync(5_000);
    const alarmHandling = orchestrator.handleAlarm(alarmName);
    await flushPost();
    await alarmHandling;
    await orchestrator.handleAlarm(alarmName);
    await flushPost();

    expect(orchestrator.status).toBe('completed');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(orchestrator.currentCampaign?.results.map((result) => result.groupUrl)).toEqual(
      targetGroups.map((group) => group.url),
    );
  });

  it('fails a persisted active target during recovery instead of reposting it', async () => {
    storedCampaign = createCampaign({
      activeTarget: {
        index: 0,
        groupUrl: targetGroups[0].url,
        runToken: 'persisted-run',
        claimedAt: Date.now() - 1_000,
      },
    });
    const orchestrator = new CampaignOrchestrator();

    await orchestrator.recoverFromCrash();
    await flushPost();

    expect(chrome.tabs.create).not.toHaveBeenCalledWith({
      url: targetGroups[0].url,
      active: true,
    });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: targetGroups[1].url,
      active: true,
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(orchestrator.currentCampaign?.results).toEqual([
      expect.objectContaining({
        groupUrl: targetGroups[0].url,
        status: 'failed',
        error: expect.stringContaining('interrupted'),
      }),
      expect.objectContaining({ groupUrl: targetGroups[1].url, status: 'success' }),
    ]);
  });

  it('fails closed when a durable cursor would repost an already saved result', async () => {
    storedCampaign = createCampaign({
      currentIndex: 0,
      nextPendingIndex: 0,
      results: [
        { groupUrl: targetGroups[0].url, status: 'success', timestamp: Date.now() - 1_000 },
      ],
    });
    const orchestrator = new CampaignOrchestrator();

    await orchestrator.recoverFromCrash();
    await flushPost();

    expect(orchestrator.status).toBe('failed');
    expect(orchestrator.currentCampaign?.error).toContain('invalid');
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('archives terminal recovery once and keeps history when active campaign is dismissed', async () => {
    storedCampaign = createCampaign({
      status: 'completed',
      currentIndex: 2,
      nextPendingIndex: 2,
      completedAt: Date.now(),
      results: targetGroups.map((group) => ({
        groupUrl: group.url,
        status: 'success' as const,
        timestamp: Date.now(),
      })),
    });
    const firstWorker = new CampaignOrchestrator();
    await firstWorker.recoverFromCrash();
    expect(storedHistory).toHaveLength(1);

    const secondWorker = new CampaignOrchestrator();
    await secondWorker.recoverFromCrash();
    expect(storedHistory).toHaveLength(1);

    await secondWorker.dismiss();
    expect(storedCampaign).toBeNull();
    expect(storedHistory).toHaveLength(1);
  });

  it('keeps terminal result visible when history storage rejects a write', async () => {
    vi.mocked(chrome.storage.local.set).mockImplementation(
      (async (items: Record<string, unknown>) => {
        if (items[STORAGE_KEYS.CAMPAIGN_HISTORY] !== undefined) {
          throw new Error('quota exceeded');
        }
        const campaign = items[STORAGE_KEYS.CAMPAIGN_STATE];
        if (campaign !== undefined) storedCampaign = clone(campaign as Campaign);
      }) as never,
    );
    const orchestrator = new CampaignOrchestrator();

    await orchestrator.start(postDraft, [targetGroups[0]], noDelaySettings);
    await flushPost();

    expect(orchestrator.status).toBe('completed');
    expect(orchestrator.currentCampaign?.historyError).toContain('quota exceeded');
    expect(storedHistory).toEqual([]);
  });
});
