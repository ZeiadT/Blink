import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostStore } from '@sidepanel/store/postStore';
import type { CampaignDraft, SavedPost } from '@shared/types';

const draft: CampaignDraft = {
  id: 'campaign-draft',
  text: 'Campaign text',
  mediaFiles: [],
  createdAt: 1,
  updatedAt: 1,
};

const firstPost: SavedPost = {
  id: 'saved-1',
  title: 'First',
  text: 'First saved text',
  mediaFiles: [],
  createdAt: 1,
  updatedAt: 1,
};

const secondPost: SavedPost = {
  id: 'saved-2',
  title: 'Second',
  text: 'Second saved text',
  mediaFiles: [],
  createdAt: 2,
  updatedAt: 2,
};

beforeEach(() => {
  vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
  usePostStore.setState({
    draft: { ...draft, mediaFiles: [] },
    savedPosts: [{ ...firstPost }, { ...secondPost }],
    isDirty: false,
    isLoaded: true,
    error: null,
  });
});

describe('postStore', () => {
  it('updates one reusable post without overwriting another', async () => {
    const result = await usePostStore.getState().updateSavedPost('saved-1', {
      title: 'Updated first',
      text: 'Updated text\n\nمرحبا 😀',
      mediaFiles: [],
    });

    expect(result).toEqual({ ok: true });
    expect(usePostStore.getState().savedPosts.find((post) => post.id === 'saved-1')).toMatchObject({
      title: 'Updated first',
      text: 'Updated text\n\nمرحبا 😀',
    });
    expect(usePostStore.getState().savedPosts.find((post) => post.id === 'saved-2')).toEqual(secondPost);
  });

  it('loads a cloned saved post into campaign draft', async () => {
    const result = await usePostStore.getState().loadSavedPost('saved-1');

    expect(result).toEqual({ ok: true });
    expect(usePostStore.getState().draft).toMatchObject({
      sourceSavedPostId: 'saved-1',
      text: 'First saved text',
    });
    usePostStore.getState().setText('Campaign-only revision');
    await usePostStore.getState().saveDraft();
    expect(usePostStore.getState().savedPosts.find((post) => post.id === 'saved-1')?.text).toBe(
      'First saved text',
    );
  });
});
