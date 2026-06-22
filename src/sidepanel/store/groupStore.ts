import { create } from 'zustand';
import type { GroupEntry, GroupList } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import { generateId } from '@shared/utils';
import { isValidFacebookGroupUrl, deduplicateUrls } from '@shared/validators';

interface GroupState {
  // ── State ──
  activeGroups: GroupEntry[];
  savedLists: GroupList[];
  isLoaded: boolean;

  // ── Active Group Actions ──
  addUrls: (urls: string[]) => { added: number; invalid: string[]; duplicates: string[] };
  removeUrl: (url: string) => void;
  clearAll: () => void;
  setLabel: (url: string, label: string) => void;

  // ── Saved List Actions ──
  saveList: (name: string) => void;
  loadList: (listId: string) => void;
  deleteList: (listId: string) => void;
  renameList: (listId: string, newName: string) => void;

  // ── Persistence ──
  loadFromStorage: () => Promise<void>;
  persistActiveGroups: () => Promise<void>;
  persistSavedLists: () => Promise<void>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  activeGroups: [],
  savedLists: [],
  isLoaded: false,

  addUrls: (urls: string[]) => {
    const { activeGroups } = get();
    const existingUrls = activeGroups.map((g) => g.url);

    // Filter valid URLs
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const url of urls) {
      const trimmed = url.trim();
      if (!trimmed) continue;
      if (isValidFacebookGroupUrl(trimmed)) {
        valid.push(trimmed);
      } else {
        invalid.push(trimmed);
      }
    }

    // Deduplicate against existing + within batch
    const { unique, duplicates } = deduplicateUrls([...existingUrls, ...valid]);
    const newUrls = unique.slice(existingUrls.length); // Only the genuinely new ones

    const newEntries: GroupEntry[] = newUrls.map((url) => ({ url }));

    set((state) => ({
      activeGroups: [...state.activeGroups, ...newEntries],
    }));

    get().persistActiveGroups();
    return { added: newEntries.length, invalid, duplicates };
  },

  removeUrl: (url: string) => {
    set((state) => ({
      activeGroups: state.activeGroups.filter((g) => g.url !== url),
    }));
    get().persistActiveGroups();
  },

  clearAll: () => {
    set({ activeGroups: [] });
    get().persistActiveGroups();
  },

  setLabel: (url: string, label: string) => {
    set((state) => ({
      activeGroups: state.activeGroups.map((g) =>
        g.url === url ? { ...g, label } : g
      ),
    }));
    get().persistActiveGroups();
  },

  saveList: (name: string) => {
    const { activeGroups, savedLists } = get();
    const now = Date.now();
    const newList: GroupList = {
      id: generateId(),
      name,
      groups: [...activeGroups],
      createdAt: now,
      updatedAt: now,
    };
    set({ savedLists: [...savedLists, newList] });
    get().persistSavedLists();
  },

  loadList: (listId: string) => {
    const list = get().savedLists.find((l) => l.id === listId);
    if (list) {
      set({ activeGroups: [...list.groups] });
      get().persistActiveGroups();
    }
  },

  deleteList: (listId: string) => {
    set((state) => ({
      savedLists: state.savedLists.filter((l) => l.id !== listId),
    }));
    get().persistSavedLists();
  },

  renameList: (listId: string, newName: string) => {
    set((state) => ({
      savedLists: state.savedLists.map((l) =>
        l.id === listId ? { ...l, name: newName, updatedAt: Date.now() } : l
      ),
    }));
    get().persistSavedLists();
  },

  loadFromStorage: async () => {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.ACTIVE_GROUPS,
        STORAGE_KEYS.GROUP_LISTS,
      ]);
      const groups = (result[STORAGE_KEYS.ACTIVE_GROUPS] as GroupEntry[]) || [];
      const lists = (result[STORAGE_KEYS.GROUP_LISTS] as GroupList[]) || [];
      set({ activeGroups: groups, savedLists: lists, isLoaded: true });
    } catch (err) {
      console.error('[Blink] Failed to load groups:', err);
      set({ isLoaded: true });
    }
  },

  persistActiveGroups: async () => {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.ACTIVE_GROUPS]: get().activeGroups,
      });
    } catch (err) {
      console.error('[Blink] Failed to persist active groups:', err);
    }
  },

  persistSavedLists: async () => {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.GROUP_LISTS]: get().savedLists,
      });
    } catch (err) {
      console.error('[Blink] Failed to persist saved lists:', err);
    }
  },
}));
