import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getGroupLists,
  saveGroupList,
  deleteGroupList,
  saveCampaignState,
  loadCampaignState,
  clearCampaignState,
  archiveCampaignHistory,
  createCampaignHistoryEntry,
  getSafeNextPendingIndex,
  loadCampaignHistory,
  migrateLegacyCampaignTargetSnapshot,
} from '@background/storage';
import type { GroupList, Campaign, CampaignHistoryEntry, CampaignSettings, PostDraft } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

beforeEach(() => {
  vi.mocked(chrome.storage.local.get).mockReset();
  vi.mocked(chrome.storage.local.set).mockReset().mockResolvedValue(undefined);
  vi.mocked(chrome.storage.local.remove).mockReset().mockResolvedValue(undefined);
});

describe('getGroupLists', () => {
  it('should return empty array when no lists stored', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({} as any);
    const result = await getGroupLists();
    expect(result).toEqual([]);
  });

  it('should return stored lists', async () => {
    const mockLists: GroupList[] = [
      { id: '1', name: 'Test', groups: [], createdAt: 0, updatedAt: 0 },
    ];
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ blink_group_lists: mockLists } as any);
    const result = await getGroupLists();
    expect(result).toEqual(mockLists);
  });
});

describe('saveGroupList', () => {
  it('should add new list', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({} as any);
    const list: GroupList = { id: '1', name: 'New', groups: [], createdAt: 0, updatedAt: 0 };
    await saveGroupList(list);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blink_group_lists: [list],
    });
  });

  it('should update existing list', async () => {
    const existing: GroupList = { id: '1', name: 'Old', groups: [], createdAt: 0, updatedAt: 0 };
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ blink_group_lists: [existing] } as any);
    const updated = { ...existing, name: 'Updated' };
    await saveGroupList(updated);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blink_group_lists: [updated],
    });
  });
});

describe('deleteGroupList', () => {
  it('should remove list by ID', async () => {
    const lists: GroupList[] = [
      { id: '1', name: 'A', groups: [], createdAt: 0, updatedAt: 0 },
      { id: '2', name: 'B', groups: [], createdAt: 0, updatedAt: 0 },
    ];
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ blink_group_lists: lists } as any);
    await deleteGroupList('1');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blink_group_lists: [lists[1]],
    });
  });
});

describe('campaign state', () => {
  it('should save campaign state', async () => {
    const campaign = { id: 'c1', status: 'running' } as Campaign;
    await saveCampaignState(campaign);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blink_campaign_state: campaign,
    });
  });

  it('should return null when no campaign stored', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({} as any);
    const result = await loadCampaignState();
    expect(result).toBeNull();
  });

  it('should clear campaign state', async () => {
    await clearCampaignState();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('blink_campaign_state');
  });
});

describe('campaign history', () => {
  const completedCampaign: Campaign = {
    id: 'completed-campaign',
    postDraft: {
      id: 'post-history',
      text: 'First paragraph\r\n\r\nمرحبا 😀',
      mediaFiles: [
        {
          id: 'media-1',
          name: 'photo.png',
          type: 'image',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,should-not-be-stored',
          sizeBytes: 24,
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    },
    targetGroups: [{ url: 'https://facebook.com/groups/history' }],
    status: 'completed' as const,
    currentIndex: 1,
    nextPendingIndex: 1,
    totalGroups: 1,
    results: [
      { groupUrl: 'https://facebook.com/groups/history', status: 'success', timestamp: 3 },
    ],
    startedAt: 1,
    completedAt: 4,
    settings: { delayMinSeconds: 5, delayMaxSeconds: 10, maxRetries: 1 },
    launch: {
      postSource: { kind: 'saved', id: 'template-1', label: 'Weekly update' },
      groupSource: { kind: 'saved', id: 'collection-1', label: 'Marketing groups' },
      randomizeGroupOrder: true,
    },
  };

  it('returns an empty history when no records exist', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({} as never);

    await expect(loadCampaignHistory()).resolves.toEqual([]);
  });

  it('creates a lean record without media payload bytes', () => {
    const entry = createCampaignHistoryEntry(completedCampaign);

    expect(entry).toMatchObject({
      id: 'completed-campaign',
      postText: 'First paragraph\r\n\r\nمرحبا 😀',
      mediaCount: 1,
      status: 'completed',
      targetGroups: [{ url: 'https://facebook.com/groups/history' }],
      launch: completedCampaign.launch,
    });
    expect(JSON.stringify(entry)).not.toContain('should-not-be-stored');
    expect(entry).not.toHaveProperty('postDraft');
  });

  it('upserts by campaign ID and sorts newest records first', async () => {
    const oldRecord: CampaignHistoryEntry = {
      ...createCampaignHistoryEntry({ ...completedCampaign, id: 'old', completedAt: 2 }),
    };
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.CAMPAIGN_HISTORY]: [oldRecord, { ...oldRecord, id: 'completed-campaign', completedAt: 1 }],
    } as never);

    const archived = await archiveCampaignHistory(completedCampaign);

    expect(archived.map((entry) => entry.id)).toEqual(['completed-campaign', 'old']);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.CAMPAIGN_HISTORY]: archived,
    });
  });

  it('keeps only 50 newest records', async () => {
    const existing = Array.from({ length: 50 }, (_, index) =>
      createCampaignHistoryEntry({
        ...completedCampaign,
        id: `old-${index}`,
        completedAt: index + 1,
      }),
    );
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.CAMPAIGN_HISTORY]: existing,
    } as never);

    const archived = await archiveCampaignHistory({ ...completedCampaign, completedAt: 100 });

    expect(archived).toHaveLength(50);
    expect(archived[0].id).toBe('completed-campaign');
    expect(archived.some((entry) => entry.id === 'old-0')).toBe(false);
  });

  it('fails safely when persisted history is malformed', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.CAMPAIGN_HISTORY]: { invalid: true },
    } as never);

    await expect(loadCampaignHistory()).rejects.toThrow('Saved campaign history is invalid');
  });
});

describe('legacy campaign cursor migration', () => {
  const campaign = {
    id: 'cursor-campaign',
    postDraft: {
      id: 'post-1',
      text: 'Hello',
      mediaFiles: [],
      createdAt: 1,
      updatedAt: 1,
    },
    targetGroups: [
      { url: 'https://facebook.com/groups/one' },
      { url: 'https://facebook.com/groups/two' },
      { url: 'https://facebook.com/groups/three' },
    ],
    status: 'running' as const,
    currentIndex: 1,
    totalGroups: 3,
    results: [
      {
        groupUrl: 'https://facebook.com/groups/one',
        status: 'success' as const,
        timestamp: 1,
      },
    ],
    settings: { delayMinSeconds: 1, delayMaxSeconds: 1, maxRetries: 0 },
  } satisfies Campaign;

  it('skips an ambiguous running legacy target instead of reposting it', () => {
    expect(getSafeNextPendingIndex(campaign)).toBe(2);
  });

  it('keeps a paused legacy cursor on its next unprocessed target', () => {
    expect(getSafeNextPendingIndex({ ...campaign, status: 'paused' })).toBe(1);
  });

  it('prefers an explicit durable cursor when one exists', () => {
    expect(getSafeNextPendingIndex({ ...campaign, nextPendingIndex: 1 })).toBe(1);
  });
});

describe('legacy campaign target snapshot migration', () => {
  const settings: CampaignSettings = {
    delayMinSeconds: 30,
    delayMaxSeconds: 60,
    maxRetries: 2,
  };
  const postDraft: PostDraft = {
    id: 'post-1',
    text: 'Hello',
    mediaFiles: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const legacyCampaign = {
    id: 'legacy-campaign',
    postDraft,
    groupListId: 'legacy-list',
    status: 'paused' as const,
    currentIndex: 1,
    totalGroups: 2,
    results: [],
    settings,
  };

  it('should migrate a legacy group-list reference into copied target groups', async () => {
    const legacyGroups = [{ url: 'https://facebook.com/groups/one', label: 'One' }];
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.GROUP_LISTS]: [
        { id: 'legacy-list', name: 'Legacy', groups: legacyGroups, createdAt: 1, updatedAt: 1 },
      ],
    } as any);

    const migrated = await migrateLegacyCampaignTargetSnapshot(legacyCampaign);

    expect(migrated).toMatchObject({
      id: 'legacy-campaign',
      targetGroups: legacyGroups,
    });
    expect(migrated).not.toHaveProperty('groupListId');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.CAMPAIGN_STATE]: migrated,
    });

    legacyGroups[0].label = 'Mutated legacy group';
    expect(migrated?.targetGroups[0].label).toBe('One');
  });

  it('should leave a modern campaign snapshot alone', async () => {
    const modernCampaign: Campaign = {
      ...legacyCampaign,
      targetGroups: [{ url: 'https://facebook.com/groups/one', label: 'One' }],
    };

    const migrated = await migrateLegacyCampaignTargetSnapshot(modernCampaign);

    expect(migrated).toEqual(modernCampaign);
    expect(migrated?.targetGroups).not.toBe(modernCampaign.targetGroups);
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('should fail closed when legacy source list is missing', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.GROUP_LISTS]: [],
    } as any);

    const migrated = await migrateLegacyCampaignTargetSnapshot(legacyCampaign);

    expect(migrated).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
