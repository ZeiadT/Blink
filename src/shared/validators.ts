import { MEDIA_CONSTRAINTS, FACEBOOK_GROUP_URL_PATTERN } from './constants';
import type { MediaFile, PostDraft } from './types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file for media attachment.
 * Checks type and size constraints.
 */
export function isValidMediaFile(file: File): ValidationResult {
  const allAccepted: string[] = [
    ...MEDIA_CONSTRAINTS.ACCEPTED_IMAGE_TYPES,
    ...MEDIA_CONSTRAINTS.ACCEPTED_VIDEO_TYPES,
  ];

  if (!allAccepted.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || 'unknown'}. Accepted: ${allAccepted.join(', ')}`,
    };
  }

  if (file.size > MEDIA_CONSTRAINTS.MAX_FILE_SIZE_BYTES) {
    const maxMB = MEDIA_CONSTRAINTS.MAX_FILE_SIZE_BYTES / (1024 * 1024);
    return {
      valid: false,
      error: `File "${file.name}" exceeds ${maxMB}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: `File "${file.name}" is empty.` };
  }

  return { valid: true };
}

/**
 * Validate a post draft before campaign submission.
 * A valid draft must have text OR at least one media file.
 */
export function isValidPostDraft(draft: PostDraft): ValidationResult {
  const hasText = draft.text.trim().length > 0;
  const hasMedia = draft.mediaFiles.length > 0;

  if (!hasText && !hasMedia) {
    return {
      valid: false,
      error: 'Post must contain text or at least one media file.',
    };
  }

  if (draft.mediaFiles.length > MEDIA_CONSTRAINTS.MAX_MEDIA_FILES) {
    return {
      valid: false,
      error: `Too many media files. Maximum is ${MEDIA_CONSTRAINTS.MAX_MEDIA_FILES}.`,
    };
  }

  return { valid: true };
}

/**
 * Determine whether a File is an image or video based on its MIME type.
 */
export function getMediaType(mimeType: string): 'image' | 'video' | null {
  if ((MEDIA_CONSTRAINTS.ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return 'image';
  }
  if ((MEDIA_CONSTRAINTS.ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mimeType)) {
    return 'video';
  }
  return null;
}

/**
 * Read a File into a base64 data URL string.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ── Facebook Group URL Validators ──────────────────────────────────────────

/**
 * Validate whether a URL is a valid Facebook group URL.
 * Accepts www, m, and web subdomains, with or without trailing slash/query params.
 */
export function isValidFacebookGroupUrl(url: string): boolean {
  try {
    const trimmed = url.trim();
    if (!trimmed) return false;
    return FACEBOOK_GROUP_URL_PATTERN.test(trimmed);
  } catch {
    return false;
  }
}

/**
 * Extract group identifier from a Facebook group URL.
 * Returns the group slug/ID portion, or null if invalid.
 */
export function parseFacebookGroupUrl(url: string): { groupId: string } | null {
  if (!isValidFacebookGroupUrl(url)) return null;
  try {
    const parsed = new URL(url.trim());
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected: ['groups', '<groupId>']
    const groupIdx = segments.indexOf('groups');
    if (groupIdx === -1 || groupIdx + 1 >= segments.length) return null;
    return { groupId: segments[groupIdx + 1] };
  } catch {
    return null;
  }
}

/**
 * Deduplicate a list of URLs.
 * Normalizes by stripping trailing slashes and query params before comparing.
 */
export function deduplicateUrls(urls: string[]): { unique: string[]; duplicates: string[] } {
  const normalize = (u: string) => {
    try {
      const parsed = new URL(u.trim());
      return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    } catch {
      return u.trim().replace(/\/+$/, '');
    }
  };

  const seen = new Map<string, string>(); // normalized → original
  const unique: string[] = [];
  const duplicates: string[] = [];

  for (const url of urls) {
    const key = normalize(url);
    if (seen.has(key)) {
      duplicates.push(url);
    } else {
      seen.set(key, url);
      unique.push(url);
    }
  }

  return { unique, duplicates };
}
