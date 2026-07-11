import type { GroupEntry } from './types';

/**
 * Copy campaign targets at every domain seam. Campaign execution must never
 * retain references owned by the saved-groups store.
 */
export function cloneCampaignTargetGroups(groups: readonly GroupEntry[]): GroupEntry[] {
  return groups.map((group) => ({ ...group }));
}

/**
 * Narrow untyped storage/message data into a campaign target snapshot.
 */
export function isCampaignTargetGroups(value: unknown): value is GroupEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group) =>
        group !== null &&
        typeof group === 'object' &&
        !Array.isArray(group) &&
        typeof (group as { url?: unknown }).url === 'string',
    )
  );
}
