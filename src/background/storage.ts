import type { GroupList, Campaign } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

/**
 * Typed wrappers around chrome.storage.local for reuse in background service worker.
 */

export async function getGroupLists(): Promise<GroupList[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.GROUP_LISTS);
  return (result[STORAGE_KEYS.GROUP_LISTS] as GroupList[]) || [];
}

export async function saveGroupList(list: GroupList): Promise<void> {
  const lists = await getGroupLists();
  const idx = lists.findIndex((l) => l.id === list.id);
  if (idx >= 0) {
    lists[idx] = list;
  } else {
    lists.push(list);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.GROUP_LISTS]: lists });
}

export async function deleteGroupList(listId: string): Promise<void> {
  const lists = await getGroupLists();
  const filtered = lists.filter((l) => l.id !== listId);
  await chrome.storage.local.set({ [STORAGE_KEYS.GROUP_LISTS]: filtered });
}

export async function saveCampaignState(campaign: Campaign): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_STATE]: campaign });
}

export async function loadCampaignState(): Promise<Campaign | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CAMPAIGN_STATE);
  return (result[STORAGE_KEYS.CAMPAIGN_STATE] as Campaign) || null;
}

export async function clearCampaignState(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.CAMPAIGN_STATE);
}
