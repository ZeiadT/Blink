import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getGroupLists,
  saveGroupList,
  deleteGroupList,
  saveCampaignState,
  loadCampaignState,
  clearCampaignState,
} from '@background/storage';
import type { GroupList, Campaign } from '@shared/types';

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
