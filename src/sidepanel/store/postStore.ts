import { create } from 'zustand';
import type { CampaignDraft, MediaFile, SavedPost, SavedPostInput } from '@shared/types';
import {
  POST_LIBRARY_SCHEMA_VERSION,
  SAVED_POST_CONSTRAINTS,
  STORAGE_KEYS,
  MEDIA_CONSTRAINTS,
} from '@shared/constants';
import { generateId } from '@shared/utils';
import {
  cloneCampaignDraft,
  cloneMediaFiles,
  createCampaignDraftFromSavedPost,
  isDraftEquivalentToSavedPost,
  migratePostLibrary,
  sortSavedPosts,
  validateSavedPostInput,
} from '@shared/postLibrary';

export type PostStoreResult = { ok: true } | { ok: false; error: string };

interface PostState {
  draft: CampaignDraft;
  savedPosts: SavedPost[];
  isDirty: boolean;
  isLoaded: boolean;
  error: string | null;
  setText: (text: string) => void;
  addMedia: (file: MediaFile) => void;
  removeMedia: (fileId: string) => void;
  clearDraft: () => void;
  loadDraft: () => Promise<void>;
  saveDraft: () => Promise<void>;
  createSavedPost: (input: SavedPostInput) => Promise<PostStoreResult>;
  updateSavedPost: (id: string, input: SavedPostInput) => Promise<PostStoreResult>;
  duplicateSavedPost: (id: string) => Promise<PostStoreResult>;
  deleteSavedPost: (id: string) => Promise<PostStoreResult>;
  loadSavedPost: (id: string) => Promise<PostStoreResult>;
  isDraftEquivalentToSavedPost: (id: string) => boolean;
  clearError: () => void;
}

function createEmptyDraft(): CampaignDraft {
  const now = Date.now();
  return {
    id: generateId(),
    text: '',
    mediaFiles: [],
    createdAt: now,
    updatedAt: now,
  };
}

function storageError(action: string, error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  return `Could not ${action}: ${details || 'unknown storage error'}`;
}

async function writeSavedPosts(savedPosts: readonly SavedPost[]): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SAVED_POSTS]: sortSavedPosts(savedPosts),
    [STORAGE_KEYS.POST_LIBRARY_SCHEMA]: POST_LIBRARY_SCHEMA_VERSION,
  });
}

export const usePostStore = create<PostState>((set, get) => {
  let draftSaveChain: Promise<void> = Promise.resolve();

  const persistDraft = (draft: CampaignDraft): Promise<void> => {
    const snapshot = cloneCampaignDraft(draft);
    draftSaveChain = draftSaveChain.catch(() => undefined).then(async () => {
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_DRAFT]: snapshot });
      } catch (error) {
        set({ error: storageError('save campaign draft', error) });
      }
    });
    return draftSaveChain;
  };

  const updateDraft = (update: (draft: CampaignDraft) => CampaignDraft): void => {
    let nextDraft: CampaignDraft | null = null;
    set((state) => {
      nextDraft = { ...update(state.draft), sourceSavedPostId: undefined };
      return { draft: nextDraft, isDirty: true, error: null };
    });
    if (nextDraft) void persistDraft(nextDraft);
  };

  const savePosts = async (savedPosts: SavedPost[]): Promise<PostStoreResult> => {
    try {
      await writeSavedPosts(savedPosts);
      set({ savedPosts: sortSavedPosts(savedPosts), error: null });
      return { ok: true };
    } catch (error) {
      const message = storageError('save post templates', error);
      set({ error: message });
      return { ok: false, error: message };
    }
  };

  return {
    draft: createEmptyDraft(),
    savedPosts: [],
    isDirty: false,
    isLoaded: false,
    error: null,

    setText: (text) => {
      updateDraft((draft) => ({ ...draft, text, updatedAt: Date.now() }));
    },

    addMedia: (file) => {
      const { draft } = get();
      if (draft.mediaFiles.length >= MEDIA_CONSTRAINTS.MAX_MEDIA_FILES) return;
      updateDraft((current) => ({
        ...current,
        mediaFiles: [...current.mediaFiles, { ...file }],
        updatedAt: Date.now(),
      }));
    },

    removeMedia: (fileId) => {
      updateDraft((draft) => ({
        ...draft,
        mediaFiles: draft.mediaFiles.filter((file) => file.id !== fileId),
        updatedAt: Date.now(),
      }));
    },

    clearDraft: () => {
      const draft = createEmptyDraft();
      set({ draft, isDirty: false, error: null });
      void persistDraft(draft);
    },

    loadDraft: async () => {
      try {
        const result = await chrome.storage.local.get([
          STORAGE_KEYS.POST_DRAFT,
          STORAGE_KEYS.SAVED_POSTS,
          STORAGE_KEYS.CAMPAIGN_DRAFT,
          STORAGE_KEYS.POST_LIBRARY_SCHEMA,
        ]);
        const migration = migratePostLibrary(
          result[STORAGE_KEYS.POST_DRAFT],
          result[STORAGE_KEYS.SAVED_POSTS],
          result[STORAGE_KEYS.CAMPAIGN_DRAFT],
          result[STORAGE_KEYS.POST_LIBRARY_SCHEMA],
        );
        let cleanupError: string | null = null;

        if (migration.changed) {
          await chrome.storage.local.set({
            [STORAGE_KEYS.SAVED_POSTS]: migration.savedPosts,
            [STORAGE_KEYS.CAMPAIGN_DRAFT]: migration.campaignDraft,
            [STORAGE_KEYS.POST_LIBRARY_SCHEMA]: POST_LIBRARY_SCHEMA_VERSION,
          });
          if (migration.removeLegacyDraft) {
            try {
              await chrome.storage.local.remove(STORAGE_KEYS.POST_DRAFT);
            } catch (error) {
              cleanupError = storageError('remove legacy draft', error);
            }
          }
        }

        set({
          draft: migration.campaignDraft ?? createEmptyDraft(),
          savedPosts: migration.savedPosts,
          isDirty: false,
          isLoaded: true,
          error: cleanupError,
        });
      } catch (error) {
        set({
          isLoaded: true,
          error: storageError('load post templates', error),
        });
      }
    },

    saveDraft: async () => {
      await persistDraft(get().draft);
    },

    createSavedPost: async (input) => {
      const validation = validateSavedPostInput(input);
      if (validation) return { ok: false, error: validation };
      const now = Date.now();
      const post: SavedPost = {
        id: generateId(),
        title: input.title.trim(),
        text: input.text,
        mediaFiles: cloneMediaFiles(input.mediaFiles),
        createdAt: now,
        updatedAt: now,
      };
      return savePosts([...get().savedPosts, post]);
    },

    updateSavedPost: async (id, input) => {
      const validation = validateSavedPostInput(input);
      if (validation) return { ok: false, error: validation };
      const existing = get().savedPosts.find((post) => post.id === id);
      if (!existing) return { ok: false, error: 'Post template no longer exists.' };
      const now = Date.now();
      const savedPosts = get().savedPosts.map((post) =>
        post.id === id
          ? {
              ...post,
              title: input.title.trim(),
              text: input.text,
              mediaFiles: cloneMediaFiles(input.mediaFiles),
              updatedAt: now,
            }
          : post,
      );
      return savePosts(savedPosts);
    },

    duplicateSavedPost: async (id) => {
      const source = get().savedPosts.find((post) => post.id === id);
      if (!source) return { ok: false, error: 'Post template no longer exists.' };
      const now = Date.now();
      const title = `Copy of ${source.title}`.slice(0, SAVED_POST_CONSTRAINTS.MAX_TITLE_LENGTH);
      return savePosts([
        ...get().savedPosts,
        {
          ...source,
          id: generateId(),
          title,
          mediaFiles: cloneMediaFiles(source.mediaFiles),
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },

    deleteSavedPost: async (id) => {
      if (!get().savedPosts.some((post) => post.id === id)) {
        return { ok: false, error: 'Post template no longer exists.' };
      }
      return savePosts(get().savedPosts.filter((post) => post.id !== id));
    },

    loadSavedPost: async (id) => {
      const post = get().savedPosts.find((savedPost) => savedPost.id === id);
      if (!post) return { ok: false, error: 'Post template no longer exists.' };
      const draft = createCampaignDraftFromSavedPost(post, generateId(), Date.now());
      set({ draft, isDirty: false, error: null });
      await persistDraft(draft);
      return { ok: true };
    },

    isDraftEquivalentToSavedPost: (id) => {
      const post = get().savedPosts.find((savedPost) => savedPost.id === id);
      return Boolean(post && isDraftEquivalentToSavedPost(get().draft, post));
    },

    clearError: () => set({ error: null }),
  };
});
