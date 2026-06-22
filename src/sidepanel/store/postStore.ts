import { create } from 'zustand';
import type { MediaFile, PostDraft } from '@shared/types';
import { STORAGE_KEYS, MEDIA_CONSTRAINTS } from '@shared/constants';
import { generateId } from '@shared/utils';

interface PostState {
  // ── State ──
  draft: PostDraft;
  isDirty: boolean;
  isLoaded: boolean;

  // ── Actions ──
  setText: (text: string) => void;
  addMedia: (file: MediaFile) => void;
  removeMedia: (fileId: string) => void;
  clearDraft: () => void;
  loadDraft: () => Promise<void>;
  saveDraft: () => Promise<void>;
}

function createEmptyDraft(): PostDraft {
  const now = Date.now();
  return {
    id: generateId(),
    text: '',
    mediaFiles: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const usePostStore = create<PostState>((set, get) => ({
  draft: createEmptyDraft(),
  isDirty: false,
  isLoaded: false,

  setText: (text: string) => {
    set((state) => ({
      draft: { ...state.draft, text, updatedAt: Date.now() },
      isDirty: true,
    }));
    // Auto-persist on change (debounced in component if needed)
    get().saveDraft();
  },

  addMedia: (file: MediaFile) => {
    const { draft } = get();
    if (draft.mediaFiles.length >= MEDIA_CONSTRAINTS.MAX_MEDIA_FILES) {
      return; // Caller should check and show toast
    }
    set((state) => ({
      draft: {
        ...state.draft,
        mediaFiles: [...state.draft.mediaFiles, file],
        updatedAt: Date.now(),
      },
      isDirty: true,
    }));
    get().saveDraft();
  },

  removeMedia: (fileId: string) => {
    set((state) => ({
      draft: {
        ...state.draft,
        mediaFiles: state.draft.mediaFiles.filter((f) => f.id !== fileId),
        updatedAt: Date.now(),
      },
      isDirty: true,
    }));
    get().saveDraft();
  },

  clearDraft: () => {
    const newDraft = createEmptyDraft();
    set({ draft: newDraft, isDirty: false });
    chrome.storage.local.remove(STORAGE_KEYS.POST_DRAFT).catch(console.error);
  },

  loadDraft: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.POST_DRAFT);
      const saved = result[STORAGE_KEYS.POST_DRAFT] as PostDraft | undefined;
      if (saved) {
        set({ draft: saved, isDirty: false, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (err) {
      console.error('[Blink] Failed to load draft:', err);
      set({ isLoaded: true });
    }
  },

  saveDraft: async () => {
    try {
      const { draft } = get();
      await chrome.storage.local.set({ [STORAGE_KEYS.POST_DRAFT]: draft });
    } catch (err) {
      console.error('[Blink] Failed to save draft:', err);
    }
  },
}));
