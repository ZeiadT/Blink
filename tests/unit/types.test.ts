import { describe, it, expect } from 'vitest';
import type {
  PostDraft,
  GroupList,
  Campaign,
  CampaignStatus,
  PopupMessage,
  MediaFile,
} from '@shared/types';
import { FACEBOOK_GROUP_URL_PATTERN, MEDIA_CONSTRAINTS, DEFAULT_CAMPAIGN_SETTINGS, STORAGE_KEYS } from '@shared/constants';
import { generateId, formatFileSize, truncate } from '@shared/utils';

describe('Constants', () => {
  it('should have all required storage keys', () => {
    expect(STORAGE_KEYS.POST_DRAFT).toBe('blink_post_draft');
    expect(STORAGE_KEYS.SAVED_POSTS).toBe('blink_saved_posts');
    expect(STORAGE_KEYS.CAMPAIGN_DRAFT).toBe('blink_campaign_draft');
    expect(STORAGE_KEYS.POST_LIBRARY_SCHEMA).toBe('blink_post_library_schema');
    expect(STORAGE_KEYS.GROUP_LISTS).toBe('blink_group_lists');
    expect(STORAGE_KEYS.ACTIVE_GROUPS).toBe('blink_active_groups');
    expect(STORAGE_KEYS.CAMPAIGN_STATE).toBe('blink_campaign_state');
    expect(STORAGE_KEYS.CAMPAIGN_HISTORY).toBe('blink_campaign_history');
    expect(STORAGE_KEYS.SETTINGS).toBe('blink_settings');
  });

  it('should have valid default campaign settings', () => {
    expect(DEFAULT_CAMPAIGN_SETTINGS.delayMinSeconds).toBeGreaterThan(0);
    expect(DEFAULT_CAMPAIGN_SETTINGS.delayMaxSeconds).toBeGreaterThanOrEqual(
      DEFAULT_CAMPAIGN_SETTINGS.delayMinSeconds,
    );
    expect(DEFAULT_CAMPAIGN_SETTINGS.maxRetries).toBeGreaterThanOrEqual(0);
  });

  it('should accept valid Facebook group URLs', () => {
    const validUrls = [
      'https://www.facebook.com/groups/mygroup',
      'https://www.facebook.com/groups/mygroup/',
      'https://facebook.com/groups/my-group',
      'https://m.facebook.com/groups/12345',
      'https://www.facebook.com/groups/some.group?ref=share',
      'https://web.facebook.com/groups/test_group',
    ];
    validUrls.forEach((url) => {
      expect(FACEBOOK_GROUP_URL_PATTERN.test(url)).toBe(true);
    });
  });

  it('should reject invalid Facebook group URLs', () => {
    const invalidUrls = [
      'https://www.facebook.com/profile',
      'https://www.facebook.com/groups/',
      'https://twitter.com/groups/mygroup',
      'not-a-url',
      '',
      'https://www.facebook.com/pages/mypage',
      'http://facebook.com',
    ];
    invalidUrls.forEach((url) => {
      expect(FACEBOOK_GROUP_URL_PATTERN.test(url)).toBe(false);
    });
  });

  it('should have valid media constraints', () => {
    expect(MEDIA_CONSTRAINTS.MAX_FILE_SIZE_BYTES).toBeGreaterThan(0);
    expect(MEDIA_CONSTRAINTS.ACCEPTED_IMAGE_TYPES.length).toBeGreaterThan(0);
    expect(MEDIA_CONSTRAINTS.ACCEPTED_VIDEO_TYPES.length).toBeGreaterThan(0);
  });
});

describe('Utils', () => {
  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(10485760)).toBe('10 MB');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('hello world', 6)).toBe('hello\u2026');
    });

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });
});

describe('Type Shapes (compile-time validation)', () => {
  it('should create a valid PostDraft', () => {
    const draft: PostDraft = {
      id: '1',
      text: 'Hello world',
      mediaFiles: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(draft.id).toBeDefined();
    expect(draft.text).toBe('Hello world');
    expect(draft.mediaFiles).toHaveLength(0);
  });

  it('should create a valid GroupList', () => {
    const list: GroupList = {
      id: '1',
      name: 'My Groups',
      groups: [{ url: 'https://www.facebook.com/groups/test' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(list.groups).toHaveLength(1);
  });

  it('should create a valid Campaign', () => {
    const campaign: Campaign = {
      id: '1',
      postDraft: {
        id: '1',
        text: 'test',
        mediaFiles: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      targetGroups: [],
      status: 'idle',
      currentIndex: 0,
      totalGroups: 0,
      results: [],
      settings: DEFAULT_CAMPAIGN_SETTINGS,
    };
    expect(campaign.status).toBe('idle');
  });

  it('should validate CampaignStatus union type', () => {
    const validStatuses: CampaignStatus[] = [
      'idle',
      'running',
      'paused',
      'completed',
      'completed-with-issues',
      'failed',
      'cancelled',
    ];
    expect(validStatuses).toHaveLength(7);
  });

  it('should create a valid MediaFile', () => {
    const media: MediaFile = {
      id: '1',
      name: 'photo.jpg',
      type: 'image',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,abc',
      sizeBytes: 1024,
    };
    expect(media.type).toBe('image');
  });

  it('should create valid PopupMessages', () => {
    const startMsg: PopupMessage = {
      type: 'START_CAMPAIGN',
      payload: {
        postDraft: {
          id: '1',
          text: 'test',
          mediaFiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        targetGroups: [],
        settings: DEFAULT_CAMPAIGN_SETTINGS,
      },
    };
    expect(startMsg.type).toBe('START_CAMPAIGN');

    const pauseMsg: PopupMessage = { type: 'PAUSE_CAMPAIGN' };
    expect(pauseMsg.type).toBe('PAUSE_CAMPAIGN');
  });
});
