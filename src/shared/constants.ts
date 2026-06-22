import type { CampaignSettings, TabId } from './types';

// ── Storage Keys ──
export const STORAGE_KEYS = {
  POST_DRAFT: 'blink_post_draft',
  GROUP_LISTS: 'blink_group_lists',
  ACTIVE_GROUPS: 'blink_active_groups',
  CAMPAIGN_STATE: 'blink_campaign_state',
  SETTINGS: 'blink_settings',
} as const;

// ── Default Campaign Settings ──
export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  delayMinSeconds: 30,
  delayMaxSeconds: 60,
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
export const FACEBOOK_GROUP_URL_PATTERN = /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/groups\/[a-zA-Z0-9._-]+\/?(\?.*)?$/;

// ── Tab Definitions ──
export const TABS: { id: TabId; label: string; iconName: string }[] = [
  { id: 'compose', label: 'Compose', iconName: 'PenSquare' },
  { id: 'groups', label: 'Groups', iconName: 'Users' },
  { id: 'campaign', label: 'Campaign', iconName: 'Rocket' },
  { id: 'settings', label: 'Settings', iconName: 'Settings' },
];
