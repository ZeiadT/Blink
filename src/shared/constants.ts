import type { CampaignSettings, TabId } from './types';
import { DEFAULT_DELAY_RANGE } from './timingPolicy';

// ── Storage Keys ──
export const STORAGE_KEYS = {
  POST_DRAFT: 'blink_post_draft',
  SAVED_POSTS: 'blink_saved_posts',
  CAMPAIGN_DRAFT: 'blink_campaign_draft',
  POST_LIBRARY_SCHEMA: 'blink_post_library_schema',
  GROUP_LISTS: 'blink_group_lists',
  ACTIVE_GROUPS: 'blink_active_groups',
  CAMPAIGN_STATE: 'blink_campaign_state',
  CAMPAIGN_HISTORY: 'blink_campaign_history',
  SETTINGS: 'blink_settings',
  GROUP_CATALOG_SCHEMA: 'blink_group_catalog_schema',
} as const;

export const POST_LIBRARY_SCHEMA_VERSION = 1;

export const SAVED_POST_CONSTRAINTS = {
  MAX_TITLE_LENGTH: 120,
} as const;

export const GROUP_CATALOG_SCHEMA_VERSION = 2;

export const GROUP_CATALOG_CONSTRAINTS = {
  MAX_DISPLAY_NAME_LENGTH: 120,
  MAX_IMPORT_FILE_SIZE_BYTES: 1024 * 1024,
  MAX_IMPORT_ROWS: 2000,
} as const;

export const CAMPAIGN_HISTORY_CONSTRAINTS = {
  MAX_RECORDS: 50,
} as const;

// ── Default Campaign Settings ──
export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  ...DEFAULT_DELAY_RANGE,
  maxRetries: 2,
};

// ── Media Constraints ──
export const MEDIA_CONSTRAINTS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ACCEPTED_VIDEO_TYPES: ['video/mp4', 'video/webm'],
  MAX_MEDIA_FILES: 20,
} as const;

// ── Facebook URL Pattern ──
export const FACEBOOK_GROUP_URL_PATTERN =
  /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/groups\/[a-zA-Z0-9._-]+\/?(\?.*)?$/;

// ── Tab Definitions ──
export const TABS: { id: TabId; label: string; iconName: string }[] = [
  { id: 'compose', label: 'Compose', iconName: 'PenSquare' },
  { id: 'groups', label: 'Groups', iconName: 'Users' },
  { id: 'campaign', label: 'Campaign', iconName: 'Rocket' },
];
