import { describe, it, expect } from 'vitest';
import {
  isValidMediaFile,
  isValidPostDraft,
  getMediaType,
  fileToDataUrl,
  isValidFacebookGroupUrl,
  parseFacebookGroupUrl,
  deduplicateUrls,
} from '@shared/validators';
import { MEDIA_CONSTRAINTS } from '@shared/constants';
import type { PostDraft } from '@shared/types';

// Helper to create a mock File
function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('isValidMediaFile', () => {
  it('should accept a valid JPEG image', () => {
    const file = createMockFile('photo.jpg', 1024, 'image/jpeg');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should accept a valid PNG image', () => {
    const file = createMockFile('image.png', 2048, 'image/png');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should accept a valid GIF image', () => {
    const file = createMockFile('anim.gif', 512, 'image/gif');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should accept a valid WebP image', () => {
    const file = createMockFile('photo.webp', 1024, 'image/webp');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should accept a valid MP4 video', () => {
    const file = createMockFile('video.mp4', 5 * 1024 * 1024, 'video/mp4');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should accept a valid WebM video', () => {
    const file = createMockFile('clip.webm', 3 * 1024 * 1024, 'video/webm');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should reject unsupported file type', () => {
    const file = createMockFile('doc.pdf', 1024, 'application/pdf');
    const result = isValidMediaFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported file type');
  });

  it('should reject file with unknown type', () => {
    const file = createMockFile('mystery', 1024, '');
    const result = isValidMediaFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown');
  });

  it('should reject file exceeding size limit', () => {
    const file = createMockFile('huge.jpg', 15 * 1024 * 1024, 'image/jpeg');
    const result = isValidMediaFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
  });

  it('should accept file at exact size limit', () => {
    const file = createMockFile('exact.jpg', MEDIA_CONSTRAINTS.MAX_FILE_SIZE_BYTES, 'image/jpeg');
    expect(isValidMediaFile(file)).toEqual({ valid: true });
  });

  it('should reject empty file', () => {
    const file = createMockFile('empty.jpg', 0, 'image/jpeg');
    const result = isValidMediaFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });
});

describe('isValidPostDraft', () => {
  const baseDraft: PostDraft = {
    id: '1',
    text: '',
    mediaFiles: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should reject draft with no text and no media', () => {
    const result = isValidPostDraft(baseDraft);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('text or at least one media');
  });

  it('should reject draft with only whitespace text and no media', () => {
    const result = isValidPostDraft({ ...baseDraft, text: '   \n  ' });
    expect(result.valid).toBe(false);
  });

  it('should accept draft with text only', () => {
    const result = isValidPostDraft({ ...baseDraft, text: 'Hello world' });
    expect(result.valid).toBe(true);
  });

  it('should accept draft with media only', () => {
    const draft = {
      ...baseDraft,
      mediaFiles: [
        { id: '1', name: 'photo.jpg', type: 'image' as const, mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc', sizeBytes: 1024 },
      ],
    };
    expect(isValidPostDraft(draft).valid).toBe(true);
  });

  it('should accept draft with text and media', () => {
    const draft = {
      ...baseDraft,
      text: 'Check this out',
      mediaFiles: [
        { id: '1', name: 'photo.jpg', type: 'image' as const, mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc', sizeBytes: 1024 },
      ],
    };
    expect(isValidPostDraft(draft).valid).toBe(true);
  });

  it('should reject draft with too many media files', () => {
    const mediaFiles = Array.from({ length: MEDIA_CONSTRAINTS.MAX_MEDIA_FILES + 1 }, (_, i) => ({
      id: String(i),
      name: `file-${i}.jpg`,
      type: 'image' as const,
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,abc',
      sizeBytes: 1024,
    }));
    const result = isValidPostDraft({ ...baseDraft, text: 'test', mediaFiles });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Too many');
  });
});

describe('getMediaType', () => {
  it('should return "image" for image MIME types', () => {
    expect(getMediaType('image/jpeg')).toBe('image');
    expect(getMediaType('image/png')).toBe('image');
    expect(getMediaType('image/gif')).toBe('image');
    expect(getMediaType('image/webp')).toBe('image');
  });

  it('should return "video" for video MIME types', () => {
    expect(getMediaType('video/mp4')).toBe('video');
    expect(getMediaType('video/webm')).toBe('video');
  });

  it('should return null for unsupported types', () => {
    expect(getMediaType('application/pdf')).toBeNull();
    expect(getMediaType('text/plain')).toBeNull();
    expect(getMediaType('')).toBeNull();
  });
});

describe('isValidFacebookGroupUrl', () => {
  it('should accept standard group URL', () => {
    expect(isValidFacebookGroupUrl('https://www.facebook.com/groups/mygroup')).toBe(true);
  });

  it('should accept URL without www', () => {
    expect(isValidFacebookGroupUrl('https://facebook.com/groups/mygroup')).toBe(true);
  });

  it('should accept mobile URL', () => {
    expect(isValidFacebookGroupUrl('https://m.facebook.com/groups/mygroup')).toBe(true);
  });

  it('should accept URL with trailing slash', () => {
    expect(isValidFacebookGroupUrl('https://www.facebook.com/groups/mygroup/')).toBe(true);
  });

  it('should accept URL with query params', () => {
    expect(isValidFacebookGroupUrl('https://www.facebook.com/groups/mygroup/?ref=share')).toBe(true);
  });

  it('should accept numeric group IDs', () => {
    expect(isValidFacebookGroupUrl('https://www.facebook.com/groups/123456789')).toBe(true);
  });

  it('should reject non-Facebook URL', () => {
    expect(isValidFacebookGroupUrl('https://twitter.com/groups/mygroup')).toBe(false);
  });

  it('should reject non-group Facebook URL', () => {
    expect(isValidFacebookGroupUrl('https://www.facebook.com/profile/user123')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidFacebookGroupUrl('')).toBe(false);
  });

  it('should reject malformed URL', () => {
    expect(isValidFacebookGroupUrl('not-a-url')).toBe(false);
  });

  it('should reject URL without group slug', () => {
    expect(isValidFacebookGroupUrl('https://www.facebook.com/groups/')).toBe(false);
  });
});

describe('parseFacebookGroupUrl', () => {
  it('should extract group ID from valid URL', () => {
    expect(parseFacebookGroupUrl('https://www.facebook.com/groups/mygroup')).toEqual({ groupId: 'mygroup' });
  });

  it('should extract numeric group ID', () => {
    expect(parseFacebookGroupUrl('https://www.facebook.com/groups/123456')).toEqual({ groupId: '123456' });
  });

  it('should return null for invalid URL', () => {
    expect(parseFacebookGroupUrl('https://twitter.com/groups/x')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseFacebookGroupUrl('')).toBeNull();
  });
});

describe('deduplicateUrls', () => {
  it('should return unique URLs', () => {
    const result = deduplicateUrls([
      'https://facebook.com/groups/a',
      'https://facebook.com/groups/b',
    ]);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it('should detect exact duplicates', () => {
    const result = deduplicateUrls([
      'https://facebook.com/groups/a',
      'https://facebook.com/groups/a',
    ]);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('should detect trailing slash variants as duplicates', () => {
    const result = deduplicateUrls([
      'https://facebook.com/groups/a',
      'https://facebook.com/groups/a/',
    ]);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('should detect query param variants as duplicates', () => {
    const result = deduplicateUrls([
      'https://facebook.com/groups/a',
      'https://facebook.com/groups/a?ref=share',
    ]);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});
