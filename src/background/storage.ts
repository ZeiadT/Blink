import type {
  Campaign,
  CampaignHistoryEntry,
  CampaignSettings,
  CatalogGroupEntry,
  GroupList,
  PostResult,
  TerminalCampaignStatus,
} from '@shared/types';
import {
  CAMPAIGN_HISTORY_CONSTRAINTS,
  GROUP_CATALOG_SCHEMA_VERSION,
  STORAGE_KEYS,
} from '@shared/constants';
import {
  cloneCampaignLaunch,
  cloneCampaignTargetGroups,
  isCampaignLaunch,
  isCampaignTargetGroups,
} from '@shared/campaignSnapshot';
import { cloneCatalogGroups, migrateCatalog } from '@shared/groupCatalog';

type LegacyCampaignRecord = Omit<Campaign, 'targetGroups'> & {
  groupListId: string;
};

export type StoredCampaign = Campaign | LegacyCampaignRecord;

export interface GroupCatalogSnapshot {
  activeGroups: CatalogGroupEntry[];
  savedLists: GroupList[];
}

export type GroupCatalogStorageResult =
  | { ok: true; value: GroupCatalogSnapshot; migrated: boolean }
  | { ok: false; error: string };

/**
 * Return the only safe cursor for a pre-runner campaign. Old records stored
 * `currentIndex` before a Facebook side effect completed, so a running record
 * must advance past that index rather than risk a duplicate post on recovery.
 */
export function getSafeNextPendingIndex(campaign: Campaign): number {
  const targetCount = campaign.targetGroups.length;
  const explicitIndex = campaign.nextPendingIndex;
  if (isValidTargetIndex(explicitIndex, targetCount)) {
    return explicitIndex;
  }

  const legacyIndex = isValidTargetIndex(campaign.currentIndex, targetCount)
    ? campaign.currentIndex
    : 0;
  const resolvedPrefix = getResolvedTargetPrefix(campaign);

  // Paused legacy records reached the loop boundary before persisting paused,
  // so currentIndex is the next target. Running records may have been stopped
  // mid-post; skip that ambiguous target to fail closed.
  const cursor = campaign.status === 'running' ? legacyIndex + 1 : legacyIndex;
  return Math.min(targetCount, Math.max(resolvedPrefix, cursor));
}

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

export async function loadCampaignState(): Promise<StoredCampaign | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CAMPAIGN_STATE);
  return (result[STORAGE_KEYS.CAMPAIGN_STATE] as StoredCampaign) || null;
}

/** Read immutable, media-free terminal campaign records. */
export async function loadCampaignHistory(): Promise<CampaignHistoryEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CAMPAIGN_HISTORY);
  const value = result[STORAGE_KEYS.CAMPAIGN_HISTORY];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isValidCampaignHistoryEntry)) {
    throw new Error('Saved campaign history is invalid.');
  }

  return sortHistory(value.map(cloneCampaignHistoryEntry));
}

/** Upsert a terminal campaign by ID, retaining only newest records. */
export async function archiveCampaignHistory(campaign: Campaign): Promise<CampaignHistoryEntry[]> {
  if (!isTerminalCampaignStatus(campaign.status)) {
    throw new Error('Only terminal campaigns can be added to history.');
  }

  const entry = createCampaignHistoryEntry(campaign);
  const existing = await loadCampaignHistory();
  const next = sortHistory([entry, ...existing.filter((record) => record.id !== entry.id)]).slice(
    0,
    CAMPAIGN_HISTORY_CONSTRAINTS.MAX_RECORDS,
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_HISTORY]: next });
  return next.map(cloneCampaignHistoryEntry);
}

export function createCampaignHistoryEntry(campaign: Campaign): CampaignHistoryEntry {
  if (!isTerminalCampaignStatus(campaign.status)) {
    throw new Error('Only terminal campaigns can be converted to history.');
  }

  return {
    id: campaign.id,
    status: campaign.status,
    postText: campaign.postDraft.text,
    mediaCount: campaign.postDraft.mediaFiles.length,
    totalGroups: campaign.totalGroups,
    results: campaign.results.map((result) => ({ ...result })),
    settings: { ...campaign.settings },
    targetGroups: cloneCampaignTargetGroups(campaign.targetGroups),
    ...(campaign.launch ? { launch: cloneCampaignLaunch(campaign.launch) } : {}),
    ...(campaign.startedAt === undefined ? {} : { startedAt: campaign.startedAt }),
    completedAt: campaign.completedAt ?? Date.now(),
    ...(campaign.error ? { error: campaign.error } : {}),
  };
}

/**
 * Read active groups and saved lists through the one migration seam. A failed
 * migration never writes a partial catalog, preserving legacy records intact.
 */
export async function loadGroupCatalog(): Promise<GroupCatalogStorageResult> {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.ACTIVE_GROUPS,
      STORAGE_KEYS.GROUP_LISTS,
      STORAGE_KEYS.GROUP_CATALOG_SCHEMA,
    ]);
    const migrated = migrateCatalog(
      result[STORAGE_KEYS.ACTIVE_GROUPS],
      result[STORAGE_KEYS.GROUP_LISTS],
    );
    if (!migrated.ok) {
      return {
        ok: false,
        error: migrated.errors.map((error) => error.message).join(' '),
      };
    }

    const schemaVersion = result[STORAGE_KEYS.GROUP_CATALOG_SCHEMA];
    const needsWrite = migrated.changed || schemaVersion !== GROUP_CATALOG_SCHEMA_VERSION;
    const value = snapshotFrom(migrated.activeGroups, migrated.savedLists);
    if (needsWrite) {
      const write = await saveGroupCatalogSnapshot(value);
      if (!write.ok) return write;
    }
    return { ok: true, value, migrated: needsWrite };
  } catch (error) {
    return { ok: false, error: storageError('load group catalog', error) };
  }
}

/** Persist the complete catalog snapshot atomically from the UI's perspective. */
export async function saveGroupCatalogSnapshot(
  snapshot: GroupCatalogSnapshot,
): Promise<GroupCatalogStorageResult> {
  try {
    const value = snapshotFrom(snapshot.activeGroups, snapshot.savedLists);
    await chrome.storage.local.set({
      [STORAGE_KEYS.ACTIVE_GROUPS]: value.activeGroups,
      [STORAGE_KEYS.GROUP_LISTS]: value.savedLists,
      [STORAGE_KEYS.GROUP_CATALOG_SCHEMA]: GROUP_CATALOG_SCHEMA_VERSION,
    });
    return { ok: true, value, migrated: false };
  } catch (error) {
    return { ok: false, error: storageError('save group catalog', error) };
  }
}

export async function clearCampaignState(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.CAMPAIGN_STATE);
}

/**
 * Upgrade a pre-snapshot campaign exactly once. Legacy campaigns referred to a
 * saved GroupList; modern campaigns persist their own copied target groups.
 *
 * A missing legacy list fails closed. We never invent targets or mutate the
 * saved-groups key during migration.
 */
export async function migrateLegacyCampaignTargetSnapshot(
  campaign: StoredCampaign,
): Promise<Campaign | null> {
  if (isCampaignTargetGroups((campaign as Partial<Campaign>).targetGroups)) {
    return {
      ...campaign,
      targetGroups: cloneCampaignTargetGroups((campaign as Campaign).targetGroups),
    };
  }

  const legacy = campaign as LegacyCampaignRecord;
  if (!legacy.groupListId) return null;

  const lists = await getGroupLists();
  const legacyList = lists.find((list) => list.id === legacy.groupListId);
  if (!legacyList) return null;

  const { groupListId: _legacyGroupListId, ...campaignWithoutLegacyList } = legacy;
  const migrated: Campaign = {
    ...campaignWithoutLegacyList,
    targetGroups: cloneCampaignTargetGroups(legacyList.groups),
  };

  await saveCampaignState(migrated);
  return migrated;
}

function isValidTargetIndex(value: unknown, targetCount: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= targetCount;
}

function getResolvedTargetPrefix(campaign: Campaign): number {
  let targetIndex = 0;

  for (const result of campaign.results) {
    if (targetIndex >= campaign.targetGroups.length) break;
    if (result.groupUrl !== campaign.targetGroups[targetIndex].url) break;
    targetIndex++;
  }

  return targetIndex;
}

function snapshotFrom(
  activeGroups: readonly CatalogGroupEntry[],
  savedLists: readonly GroupList[],
): GroupCatalogSnapshot {
  return {
    activeGroups: cloneCatalogGroups(activeGroups),
    savedLists: savedLists.map((list) => ({
      ...list,
      groups: list.groups.map((group) => ({ ...group })),
    })),
  };
}

function storageError(action: string, error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  return `Could not ${action}: ${details || 'unknown storage error'}`;
}

function sortHistory(history: CampaignHistoryEntry[]): CampaignHistoryEntry[] {
  return [...history].sort((a, b) => b.completedAt - a.completedAt);
}

function cloneCampaignHistoryEntry(entry: CampaignHistoryEntry): CampaignHistoryEntry {
  return {
    ...entry,
    results: entry.results.map((result) => ({ ...result })),
    settings: { ...entry.settings },
    ...(entry.targetGroups
      ? { targetGroups: cloneCampaignTargetGroups(entry.targetGroups) }
      : {}),
    ...(entry.launch ? { launch: cloneCampaignLaunch(entry.launch) } : {}),
  };
}

function isValidCampaignHistoryEntry(value: unknown): value is CampaignHistoryEntry {
  if (!isObject(value) || !isTerminalCampaignStatus(value.status)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.postText === 'string' &&
    Number.isInteger(value.mediaCount) &&
    value.mediaCount >= 0 &&
    Number.isInteger(value.totalGroups) &&
    value.totalGroups >= 0 &&
    Array.isArray(value.results) &&
    value.results.every(isValidPostResult) &&
    isValidHistorySettings(value.settings) &&
    (value.targetGroups === undefined || isCampaignTargetGroups(value.targetGroups)) &&
    (value.launch === undefined || isCampaignLaunch(value.launch)) &&
    Number.isFinite(value.completedAt) &&
    (value.startedAt === undefined || Number.isFinite(value.startedAt)) &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

function isTerminalCampaignStatus(value: unknown): value is TerminalCampaignStatus {
  return (
    value === 'completed' ||
    value === 'completed-with-issues' ||
    value === 'failed' ||
    value === 'cancelled'
  );
}

function isValidHistorySettings(value: unknown): value is CampaignSettings {
  return (
    isObject(value) &&
    Number.isFinite(value.delayMinSeconds) &&
    Number.isFinite(value.delayMaxSeconds) &&
    Number.isInteger(value.maxRetries) &&
    value.maxRetries >= 0
  );
}

function isValidPostResult(value: unknown): value is PostResult {
  return (
    isObject(value) &&
    typeof value.groupUrl === 'string' &&
    (value.status === 'success' || value.status === 'failed' || value.status === 'skipped') &&
    Number.isFinite(value.timestamp) &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.retryable === undefined || typeof value.retryable === 'boolean')
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
