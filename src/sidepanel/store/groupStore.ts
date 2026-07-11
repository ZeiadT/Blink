import { create } from 'zustand';
import { loadGroupCatalog, saveGroupCatalogSnapshot } from '@background/storage';
import {
  cloneCatalogGroups,
  normalizeDisplayName,
  normalizeGroupIdentity,
} from '@shared/groupCatalog';
import { previewGroupImport, type GroupImportPreview } from '@shared/groupImport';
import type { CatalogGroupEntry, GroupList } from '@shared/types';
import { generateId } from '@shared/utils';

export interface CatalogActionResult {
  ok: boolean;
  error?: string;
}

export interface AddEntriesResult extends CatalogActionResult {
  added: number;
  invalid: string[];
  duplicates: string[];
}

export interface ImportPreviewState extends GroupImportPreview {
  catalogRevision: number;
}

interface GroupState {
  activeGroups: CatalogGroupEntry[];
  savedLists: GroupList[];
  isLoaded: boolean;
  isPersisting: boolean;
  isPreviewingImport: boolean;
  catalogError: string | null;
  importPreview: ImportPreviewState | null;
  catalogRevision: number;

  hydrateCatalog: () => Promise<CatalogActionResult>;
  addEntries: (inputs: string[]) => Promise<AddEntriesResult>;
  renameGroup: (groupId: string, name: string) => Promise<CatalogActionResult>;
  removeGroup: (groupId: string) => Promise<CatalogActionResult>;
  clearAll: () => Promise<CatalogActionResult>;
  saveList: (name: string) => Promise<CatalogActionResult>;
  loadList: (listId: string) => Promise<CatalogActionResult>;
  deleteList: (listId: string) => Promise<CatalogActionResult>;
  renameList: (listId: string, name: string) => Promise<CatalogActionResult>;
  previewImport: (file: File) => Promise<CatalogActionResult>;
  confirmImport: (previewId: string) => Promise<CatalogActionResult & { added?: number }>;
  cancelImport: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => {
  const commitCatalog = async (
    activeGroups: CatalogGroupEntry[],
    savedLists: GroupList[],
  ): Promise<CatalogActionResult> => {
    set({ isPersisting: true, catalogError: null });
    const result = await saveGroupCatalogSnapshot({ activeGroups, savedLists });
    if (!result.ok) {
      set({ isPersisting: false, catalogError: result.error });
      return { ok: false, error: result.error };
    }

    set((state) => ({
      activeGroups: result.value.activeGroups,
      savedLists: result.value.savedLists,
      isPersisting: false,
      catalogRevision: state.catalogRevision + 1,
    }));
    return { ok: true };
  };

  return {
    activeGroups: [],
    savedLists: [],
    isLoaded: false,
    isPersisting: false,
    isPreviewingImport: false,
    catalogError: null,
    importPreview: null,
    catalogRevision: 0,

    hydrateCatalog: async () => {
      const result = await loadGroupCatalog();
      if (!result.ok) {
        set({ isLoaded: true, catalogError: result.error });
        return { ok: false, error: result.error };
      }

      set((state) => ({
        activeGroups: result.value.activeGroups,
        savedLists: result.value.savedLists,
        isLoaded: true,
        catalogError: null,
        catalogRevision: state.catalogRevision + 1,
      }));
      return { ok: true };
    },

    addEntries: async (inputs) => {
      const activeGroups = get().activeGroups;
      const knownGroups = new Map(activeGroups.map((group) => [group.groupId, group]));
      const seenInputs = new Set<string>();
      const entries: CatalogGroupEntry[] = [];
      const invalid: string[] = [];
      const duplicates: string[] = [];

      for (const input of inputs) {
        const trimmed = input.trim();
        if (!trimmed) continue;
        const normalized = normalizeGroupIdentity(trimmed);
        if (!normalized.ok) {
          invalid.push(trimmed);
          continue;
        }
        const duplicate = knownGroups.get(normalized.value.groupId);
        if (duplicate) {
          duplicates.push(`${trimmed} (already “${duplicate.name}”)`);
          continue;
        }
        if (seenInputs.has(normalized.value.groupId)) {
          duplicates.push(`${trimmed} (repeated in this entry)`);
          continue;
        }

        seenInputs.add(normalized.value.groupId);
        entries.push({
          ...normalized.value,
          name: normalized.value.groupId,
        });
      }

      if (entries.length === 0) {
        return { ok: true, added: 0, invalid, duplicates };
      }

      const savedLists = get().savedLists;
      const persisted = await commitCatalog([...activeGroups, ...entries], savedLists);
      return { ...persisted, added: persisted.ok ? entries.length : 0, invalid, duplicates };
    },

    renameGroup: async (groupId, name) => {
      const activeGroups = get().activeGroups;
      const group = activeGroups.find((entry) => entry.groupId === groupId);
      if (!group) return { ok: false, error: 'Group no longer exists.' };
      const nextName = normalizeDisplayName(name, groupId);
      if (nextName === group.name) return { ok: true };
      return commitCatalog(
        activeGroups.map((entry) =>
          entry.groupId === groupId ? { ...entry, name: nextName } : entry,
        ),
        get().savedLists,
      );
    },

    removeGroup: async (groupId) => {
      const activeGroups = get().activeGroups;
      if (!activeGroups.some((group) => group.groupId === groupId)) {
        return { ok: false, error: 'Group no longer exists.' };
      }
      return commitCatalog(
        activeGroups.filter((group) => group.groupId !== groupId),
        get().savedLists,
      );
    },

    clearAll: async () => commitCatalog([], get().savedLists),

    saveList: async (name) => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'Enter a name for this saved list.' };
      const activeGroups = get().activeGroups;
      const now = Date.now();
      const list: GroupList = {
        id: generateId(),
        name: trimmed,
        groups: cloneCatalogGroups(activeGroups),
        createdAt: now,
        updatedAt: now,
      };
      return commitCatalog(activeGroups, [...get().savedLists, list]);
    },

    loadList: async (listId) => {
      const list = get().savedLists.find((candidate) => candidate.id === listId);
      if (!list) return { ok: false, error: 'Saved list no longer exists.' };
      return commitCatalog(
        cloneCatalogGroups(list.groups as CatalogGroupEntry[]),
        get().savedLists,
      );
    },

    deleteList: async (listId) => {
      const savedLists = get().savedLists;
      if (!savedLists.some((list) => list.id === listId)) {
        return { ok: false, error: 'Saved list no longer exists.' };
      }
      return commitCatalog(
        get().activeGroups,
        savedLists.filter((list) => list.id !== listId),
      );
    },

    renameList: async (listId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'List name cannot be blank.' };
      const savedLists = get().savedLists;
      if (!savedLists.some((list) => list.id === listId)) {
        return { ok: false, error: 'Saved list no longer exists.' };
      }
      return commitCatalog(
        get().activeGroups,
        savedLists.map((list) =>
          list.id === listId ? { ...list, name: trimmed, updatedAt: Date.now() } : list,
        ),
      );
    },

    previewImport: async (file) => {
      set({ isPreviewingImport: true, catalogError: null });
      const result = await previewGroupImport(file, get().activeGroups);
      if (!result.ok) {
        set({ isPreviewingImport: false, catalogError: result.error.message });
        return { ok: false, error: result.error.message };
      }
      set({
        isPreviewingImport: false,
        importPreview: { ...result.preview, catalogRevision: get().catalogRevision },
      });
      return { ok: true };
    },

    confirmImport: async (previewId) => {
      const preview = get().importPreview;
      if (!preview || preview.id !== previewId) {
        const error = 'This import preview is no longer available.';
        set({ catalogError: error });
        return { ok: false, error };
      }
      if (preview.catalogRevision !== get().catalogRevision) {
        const error = 'Groups changed since this preview. Review the file again before importing.';
        set({ catalogError: error });
        return { ok: false, error };
      }

      const entries = preview.rows.flatMap((row) =>
        row.status === 'valid' && row.candidate ? [row.candidate] : [],
      );
      if (entries.length === 0) {
        return { ok: false, error: 'No valid groups are available to import.' };
      }
      const persisted = await commitCatalog([...get().activeGroups, ...entries], get().savedLists);
      if (persisted.ok) set({ importPreview: null });
      return { ...persisted, ...(persisted.ok ? { added: entries.length } : {}) };
    },

    cancelImport: () => set({ importPreview: null, catalogError: null }),
  };
});
