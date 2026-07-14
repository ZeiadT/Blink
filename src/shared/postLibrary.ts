import {
  POST_LIBRARY_SCHEMA_VERSION,
  SAVED_POST_CONSTRAINTS,
} from './constants';
import type { CampaignDraft, MediaFile, PostDraft, SavedPost, SavedPostInput } from './types';

export interface PostLibrarySnapshot {
  savedPosts: SavedPost[];
  campaignDraft: CampaignDraft | null;
}

export interface PostLibraryMigrationResult extends PostLibrarySnapshot {
  changed: boolean;
  removeLegacyDraft: boolean;
}

export function cloneMediaFiles(mediaFiles: readonly MediaFile[]): MediaFile[] {
  return mediaFiles.map((mediaFile) => ({ ...mediaFile }));
}

export function cloneSavedPost(post: SavedPost): SavedPost {
  return { ...post, mediaFiles: cloneMediaFiles(post.mediaFiles) };
}

export function cloneCampaignDraft(draft: CampaignDraft): CampaignDraft {
  return { ...draft, mediaFiles: cloneMediaFiles(draft.mediaFiles) };
}

export function createCampaignDraftFromSavedPost(post: SavedPost, id: string, now: number): CampaignDraft {
  return {
    id,
    text: post.text,
    mediaFiles: cloneMediaFiles(post.mediaFiles),
    createdAt: now,
    updatedAt: now,
    sourceSavedPostId: post.id,
  };
}

export function isDraftEquivalentToSavedPost(draft: CampaignDraft, post: SavedPost): boolean {
  return draft.text === post.text && mediaFilesEqual(draft.mediaFiles, post.mediaFiles);
}

export function hasPostContent(post: Pick<PostDraft, 'text' | 'mediaFiles'>): boolean {
  return post.text.trim().length > 0 || post.mediaFiles.length > 0;
}

export function validateSavedPostInput(input: SavedPostInput): string | null {
  const title = input.title.trim();
  if (!title) return 'Post template needs a name.';
  if (title.length > SAVED_POST_CONSTRAINTS.MAX_TITLE_LENGTH) {
    return `Title must be ${SAVED_POST_CONSTRAINTS.MAX_TITLE_LENGTH} characters or fewer.`;
  }
  if (!hasPostContent(input)) return 'Post template needs text or at least one media file.';
  return null;
}

/**
 * Safely migrate v1's single record without flattening text or replacing newer
 * values that may already have been written by a prior partial migration.
 */
export function migratePostLibrary(
  legacyDraftValue: unknown,
  savedPostsValue: unknown,
  campaignDraftValue: unknown,
  schemaVersion: unknown,
): PostLibraryMigrationResult {
  const savedPosts = readSavedPosts(savedPostsValue);
  const campaignDraft = readCampaignDraft(campaignDraftValue);
  const legacyDraft = readPostDraft(legacyDraftValue);
  const sortedPosts = sortSavedPosts(savedPosts);
  let nextPosts = sortedPosts;
  let nextDraft = campaignDraft;

  if (legacyDraft) {
    if (!nextDraft) nextDraft = toCampaignDraft(legacyDraft);
    if (hasPostContent(legacyDraft) && !nextPosts.some((post) => post.id === legacyDraft.id)) {
      nextPosts = sortSavedPosts([
        ...nextPosts,
        {
          ...legacyDraft,
          title: 'Migrated draft',
          mediaFiles: cloneMediaFiles(legacyDraft.mediaFiles),
        },
      ]);
    }
  }

  const changed =
    schemaVersion !== POST_LIBRARY_SCHEMA_VERSION ||
    Boolean(legacyDraft) ||
    !savedPostsEqual(savedPosts, nextPosts) ||
    !campaignDraftsEqual(campaignDraft, nextDraft);

  return {
    savedPosts: nextPosts,
    campaignDraft: nextDraft,
    changed,
    removeLegacyDraft: Boolean(legacyDraft),
  };
}

export function sortSavedPosts(posts: readonly SavedPost[]): SavedPost[] {
  return posts
    .map(cloneSavedPost)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

function readSavedPosts(value: unknown): SavedPost[] {
  if (!Array.isArray(value)) return [];
  return sortSavedPosts(value.flatMap((item) => {
    const post = readSavedPost(item);
    return post ? [post] : [];
  }));
}

function readSavedPost(value: unknown): SavedPost | null {
  if (!isRecord(value) || typeof value.title !== 'string') return null;
  const draft = readPostDraft(value);
  const title = value.title.trim();
  if (!draft || !title || title.length > SAVED_POST_CONSTRAINTS.MAX_TITLE_LENGTH) return null;
  return { ...draft, title };
}

function readCampaignDraft(value: unknown): CampaignDraft | null {
  if (!isRecord(value)) return null;
  const draft = readPostDraft(value);
  if (!draft) return null;
  return {
    ...draft,
    ...(typeof value.sourceSavedPostId === 'string' ? { sourceSavedPostId: value.sourceSavedPostId } : {}),
  };
}

function readPostDraft(value: unknown): PostDraft | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.text !== 'string' ||
    !Array.isArray(value.mediaFiles) ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }

  const mediaFiles = value.mediaFiles.flatMap((item) => {
    if (!isMediaFile(item)) return [];
    return [{ ...item }];
  });
  if (mediaFiles.length !== value.mediaFiles.length) return null;

  return {
    id: value.id,
    text: value.text,
    mediaFiles,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function toCampaignDraft(draft: PostDraft): CampaignDraft {
  return { ...draft, mediaFiles: cloneMediaFiles(draft.mediaFiles) };
}

function isMediaFile(value: unknown): value is MediaFile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.type === 'image' || value.type === 'video') &&
    typeof value.mimeType === 'string' &&
    typeof value.dataUrl === 'string' &&
    typeof value.sizeBytes === 'number' &&
    Number.isFinite(value.sizeBytes)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mediaFilesEqual(left: readonly MediaFile[], right: readonly MediaFile[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function savedPostsEqual(left: readonly SavedPost[], right: readonly SavedPost[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function campaignDraftsEqual(left: CampaignDraft | null, right: CampaignDraft | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
