import type { CampaignLaunchSnapshot, GroupEntry } from './types';

/**
 * Copy campaign targets at every domain seam. Campaign execution must never
 * retain references owned by the saved-groups store.
 */
export function cloneCampaignTargetGroups(groups: readonly GroupEntry[]): GroupEntry[] {
  return groups.map((group) => ({ ...group }));
}

export function shuffleCampaignTargetGroups(
  groups: readonly GroupEntry[],
  random: () => number = Math.random,
): GroupEntry[] {
  const shuffled = cloneCampaignTargetGroups(groups);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function cloneCampaignLaunch(launch: CampaignLaunchSnapshot): CampaignLaunchSnapshot {
  return {
    postSource: { ...launch.postSource },
    groupSource: { ...launch.groupSource },
    randomizeGroupOrder: launch.randomizeGroupOrder,
  };
}

export function isCampaignLaunch(value: unknown): value is CampaignLaunchSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const launch = value as Record<string, unknown>;
  return (
    isCampaignSource(launch.postSource) &&
    isCampaignSource(launch.groupSource) &&
    typeof launch.randomizeGroupOrder === 'boolean'
  );
}

function isCampaignSource(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return (
    (source.kind === 'current' || source.kind === 'saved') &&
    typeof source.label === 'string' &&
    source.label.trim().length > 0 &&
    (source.id === undefined || typeof source.id === 'string')
  );
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
