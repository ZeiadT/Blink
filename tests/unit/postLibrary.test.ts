import { describe, expect, it } from 'vitest';
import {
  createCampaignDraftFromSavedPost,
  isDraftEquivalentToSavedPost,
  migratePostLibrary,
  validateSavedPostInput,
} from '@shared/postLibrary';
import { POST_LIBRARY_SCHEMA_VERSION } from '@shared/constants';
import type { PostDraft, SavedPost } from '@shared/types';

const legacyDraft: PostDraft = {
  id: 'legacy-draft',
  text: 'First paragraph\r\n\r\n- Arabic: مرحبا\nEmoji: 😀',
  mediaFiles: [
    {
      id: 'media-1',
      name: 'photo.png',
      type: 'image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,abc',
      sizeBytes: 3,
    },
  ],
  createdAt: 10,
  updatedAt: 20,
};

describe('post library migration', () => {
  it('migrates legacy draft into independent campaign and reusable copies', () => {
    const result = migratePostLibrary(legacyDraft, undefined, undefined, undefined);

    expect(result.changed).toBe(true);
    expect(result.removeLegacyDraft).toBe(true);
    expect(result.campaignDraft).toMatchObject({
      id: legacyDraft.id,
      text: legacyDraft.text,
    });
    expect(result.savedPosts).toHaveLength(1);
    expect(result.savedPosts[0]).toMatchObject({
      id: legacyDraft.id,
      title: 'Migrated draft',
      text: legacyDraft.text,
    });
    expect(result.savedPosts[0].mediaFiles).not.toBe(legacyDraft.mediaFiles);
  });

  it('is idempotent and does not overwrite newer saved-post data', () => {
    const existing: SavedPost = {
      ...legacyDraft,
      title: 'Newer title',
      text: 'Keep this newer reusable post',
      mediaFiles: [],
      updatedAt: 40,
    };
    const first = migratePostLibrary(
      legacyDraft,
      [existing],
      { ...legacyDraft, text: 'Current campaign draft' },
      POST_LIBRARY_SCHEMA_VERSION,
    );
    const second = migratePostLibrary(
      undefined,
      first.savedPosts,
      first.campaignDraft,
      POST_LIBRARY_SCHEMA_VERSION,
    );

    expect(first.savedPosts).toEqual([existing]);
    expect(first.campaignDraft?.text).toBe('Current campaign draft');
    expect(second.changed).toBe(false);
    expect(second.removeLegacyDraft).toBe(false);
  });

  it('does not create an empty reusable record from an empty legacy draft', () => {
    const result = migratePostLibrary(
      { ...legacyDraft, text: '', mediaFiles: [] },
      undefined,
      undefined,
      undefined,
    );

    expect(result.savedPosts).toEqual([]);
    expect(result.campaignDraft?.text).toBe('');
  });
});

describe('saved post boundaries', () => {
  it('copies a saved post into campaign state without sharing media references', () => {
    const savedPost: SavedPost = { ...legacyDraft, title: 'Reusable' };
    const draft = createCampaignDraftFromSavedPost(savedPost, 'campaign-draft', 50);

    expect(draft).toMatchObject({
      id: 'campaign-draft',
      sourceSavedPostId: savedPost.id,
      text: savedPost.text,
    });
    expect(draft.mediaFiles).not.toBe(savedPost.mediaFiles);
    draft.mediaFiles[0].name = 'changed.png';
    expect(savedPost.mediaFiles[0].name).toBe('photo.png');
  });

  it('detects campaign edits without normalizing multiline content', () => {
    const savedPost: SavedPost = { ...legacyDraft, title: 'Reusable' };
    const draft = createCampaignDraftFromSavedPost(savedPost, 'campaign-draft', 50);

    expect(isDraftEquivalentToSavedPost(draft, savedPost)).toBe(true);
    draft.text = draft.text.replace('First', 'Edited');
    expect(isDraftEquivalentToSavedPost(draft, savedPost)).toBe(false);
  });

  it('validates only title trimming while keeping post text untouched', () => {
    const input = { title: '  Weekly update  ', text: '  Keep\n\nspaces  ', mediaFiles: [] };
    expect(validateSavedPostInput(input)).toBeNull();
    expect(input.text).toBe('  Keep\n\nspaces  ');
    expect(validateSavedPostInput({ ...input, title: '   ' })).toBe('Post template needs a name.');
  });
});
