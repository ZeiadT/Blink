import { GROUP_CATALOG_CONSTRAINTS } from './constants';
import type { CatalogGroupEntry, GroupEntry, GroupList } from './types';

export type GroupCatalogReason =
  | 'empty_identity'
  | 'unsupported_url'
  | 'unsupported_group_id'
  | 'malformed_entry'
  | 'malformed_saved_list';

export interface GroupCatalogError {
  code: GroupCatalogReason;
  message: string;
}

export type GroupIdentityResult =
  | { ok: true; value: Pick<CatalogGroupEntry, 'groupId' | 'url'> }
  | { ok: false; error: GroupCatalogError };

export type GroupEntryResult =
  | { ok: true; value: CatalogGroupEntry; changed: boolean }
  | { ok: false; error: GroupCatalogError };

export interface CatalogMigrationResult {
  ok: boolean;
  activeGroups: CatalogGroupEntry[];
  savedLists: GroupList[];
  changed: boolean;
  errors: GroupCatalogError[];
}

const SUPPORTED_FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
]);
const GROUP_ID_PATTERN = /^[a-z0-9._-]+$/i;

/** Build stable Facebook group identity from supported URLs or raw IDs. */
export function normalizeGroupIdentity(input: string): GroupIdentityResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return fail('empty_identity', 'Enter a Facebook group URL or group ID.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return fail('unsupported_url', 'Use a supported Facebook group URL.');
    }

    if (!SUPPORTED_FACEBOOK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return fail('unsupported_url', 'Use a supported Facebook group URL.');
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0].toLowerCase() !== 'groups') {
      return fail('unsupported_url', 'URL must point directly to a Facebook group.');
    }

    return identityFromGroupId(segments[1]);
  }

  if (trimmed.includes('/') || trimmed.includes('://')) {
    return fail('unsupported_group_id', 'Group ID cannot contain URL path characters.');
  }

  return identityFromGroupId(trimmed);
}

export function canonicalGroupUrl(groupId: string): string {
  return `https://www.facebook.com/groups/${groupId}`;
}

/** Trim accidental whitespace and return group ID when a custom name is blank. */
export function normalizeDisplayName(name: string | undefined, groupId: string): string {
  const normalized = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return groupId;
  return normalized.slice(0, GROUP_CATALOG_CONSTRAINTS.MAX_DISPLAY_NAME_LENGTH);
}

/** Normalize either a legacy `{ url, label? }` record or a modern catalog record. */
export function normalizeGroupEntry(value: unknown): GroupEntryResult {
  if (!isRecord(value) || typeof value.url !== 'string') {
    return {
      ok: false,
      error: catalogError('malformed_entry', 'Stored group is missing a valid URL.'),
    };
  }
  if (value.lastPostStatus !== undefined && !isPostStatus(value.lastPostStatus)) {
    return {
      ok: false,
      error: catalogError('malformed_entry', 'Stored group has an invalid post status.'),
    };
  }
  if (value.lastPostAt !== undefined && !finiteNumber(value.lastPostAt)) {
    return {
      ok: false,
      error: catalogError('malformed_entry', 'Stored group has an invalid post timestamp.'),
    };
  }

  const identity = normalizeGroupIdentity(
    value.groupId && typeof value.groupId === 'string' ? value.groupId : value.url,
  );
  if (!identity.ok) return identity;

  const nameSource =
    typeof value.name === 'string'
      ? value.name
      : typeof value.label === 'string'
        ? value.label
        : undefined;
  const entry: CatalogGroupEntry = {
    groupId: identity.value.groupId,
    url: identity.value.url,
    name: normalizeDisplayName(nameSource, identity.value.groupId),
    ...(isPostStatus(value.lastPostStatus) ? { lastPostStatus: value.lastPostStatus } : {}),
    ...(finiteNumber(value.lastPostAt) ? { lastPostAt: value.lastPostAt } : {}),
  };

  return {
    ok: true,
    value: entry,
    changed:
      value.groupId !== entry.groupId ||
      value.url !== entry.url ||
      value.name !== entry.name ||
      value.label !== undefined,
  };
}

export function migrateCatalog(
  activeValue: unknown,
  savedListsValue: unknown,
): CatalogMigrationResult {
  const errors: GroupCatalogError[] = [];
  const active = migrateEntries(activeValue, errors);
  const savedLists = migrateLists(savedListsValue, errors);

  if (errors.length > 0) {
    return {
      ok: false,
      activeGroups: active.entries,
      savedLists: savedLists.lists,
      changed: false,
      errors,
    };
  }

  return {
    ok: true,
    activeGroups: active.entries,
    savedLists: savedLists.lists,
    changed: active.changed || savedLists.changed,
    errors: [],
  };
}

export function cloneCatalogGroup(group: CatalogGroupEntry): CatalogGroupEntry {
  return { ...group };
}

export function cloneCatalogGroups(groups: readonly CatalogGroupEntry[]): CatalogGroupEntry[] {
  return groups.map(cloneCatalogGroup);
}

function identityFromGroupId(rawGroupId: string): GroupIdentityResult {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawGroupId.trim());
  } catch {
    return fail('unsupported_group_id', 'Group ID contains invalid URL encoding.');
  }

  if (!decoded || !GROUP_ID_PATTERN.test(decoded)) {
    return fail(
      'unsupported_group_id',
      'Group ID can use letters, numbers, dots, underscores, and hyphens.',
    );
  }

  const groupId = decoded.toLowerCase();
  return { ok: true, value: { groupId, url: canonicalGroupUrl(groupId) } };
}

function migrateEntries(
  value: unknown,
  errors: GroupCatalogError[],
): {
  entries: CatalogGroupEntry[];
  changed: boolean;
} {
  if (value === undefined) return { entries: [], changed: false };
  if (!Array.isArray(value)) {
    errors.push(catalogError('malformed_entry', 'Stored active groups are not a list.'));
    return { entries: [], changed: false };
  }

  const entries: CatalogGroupEntry[] = [];
  const positions = new Map<string, number>();
  let changed = false;

  value.forEach((raw, index) => {
    const normalized = normalizeGroupEntry(raw);
    if (!normalized.ok) {
      errors.push({
        ...normalized.error,
        message: `Active group ${index + 1}: ${normalized.error.message}`,
      });
      return;
    }

    changed ||= normalized.changed;
    const existingIndex = positions.get(normalized.value.groupId);
    if (existingIndex === undefined) {
      positions.set(normalized.value.groupId, entries.length);
      entries.push(normalized.value);
      return;
    }

    changed = true;
    const current = entries[existingIndex];
    if (current.name === current.groupId && normalized.value.name !== normalized.value.groupId) {
      entries[existingIndex] = { ...current, name: normalized.value.name };
    }
  });

  return { entries, changed };
}

function migrateLists(
  value: unknown,
  errors: GroupCatalogError[],
): { lists: GroupList[]; changed: boolean } {
  if (value === undefined) return { lists: [], changed: false };
  if (!Array.isArray(value)) {
    errors.push(catalogError('malformed_saved_list', 'Stored group collections are not a list.'));
    return { lists: [], changed: false };
  }

  let changed = false;
  const lists: GroupList[] = [];
  value.forEach((raw, listIndex) => {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.name !== 'string' ||
      !Array.isArray(raw.groups)
    ) {
      errors.push(
        catalogError('malformed_saved_list', `Group collection ${listIndex + 1} is malformed.`),
      );
      return;
    }

    const initialErrorCount = errors.length;
    const migrated = migrateEntries(raw.groups, errors);
    for (let errorIndex = initialErrorCount; errorIndex < errors.length; errorIndex++) {
      errors[errorIndex] = {
        ...errors[errorIndex],
        message: `Group collection ${listIndex + 1}: ${errors[errorIndex].message}`,
      };
    }
    changed ||= migrated.changed;
    const createdAt = finiteNumber(raw.createdAt) ? raw.createdAt : Date.now();
    const updatedAt = finiteNumber(raw.updatedAt) ? raw.updatedAt : createdAt;
    const name = raw.name.trim() || 'Untitled list';
    changed ||= raw.createdAt !== createdAt || raw.updatedAt !== updatedAt || raw.name !== name;
    lists.push({
      id: raw.id,
      name,
      groups: migrated.entries,
      createdAt,
      updatedAt,
    });
  });

  return { lists, changed };
}

function fail(code: GroupCatalogReason, message: string): GroupIdentityResult {
  return { ok: false, error: catalogError(code, message) };
}

function catalogError(code: GroupCatalogReason, message: string): GroupCatalogError {
  return { code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPostStatus(value: unknown): value is GroupEntry['lastPostStatus'] {
  return value === 'success' || value === 'failed' || value === 'pending' || value === 'skipped';
}
