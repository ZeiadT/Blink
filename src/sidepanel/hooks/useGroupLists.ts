import { useGroupStore } from '../store/groupStore';

/**
 * Convenience hook wrapping groupStore with derived values.
 */
export function useGroupLists() {
  const activeGroups = useGroupStore((s) => s.activeGroups);
  const savedLists = useGroupStore((s) => s.savedLists);

  return {
    activeGroups,
    savedLists,
    hasGroups: activeGroups.length > 0,
    groupCount: activeGroups.length,
  };
}
