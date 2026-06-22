// ── Media ──
export interface MediaFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

// ── Post ──
export interface PostDraft {
  id: string;
  text: string;
  mediaFiles: MediaFile[];
  createdAt: number;
  updatedAt: number;
}

// ── Groups ──
export interface GroupEntry {
  url: string;
  label?: string;
  lastPostStatus?: 'success' | 'failed' | 'pending' | 'skipped';
  lastPostAt?: number;
}

export interface GroupList {
  id: string;
  name: string;
  groups: GroupEntry[];
  createdAt: number;
  updatedAt: number;
}

// ── Campaign ──
export type CampaignStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface PostResult {
  groupUrl: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  timestamp: number;
}

export interface CampaignSettings {
  delayMinSeconds: number;
  delayMaxSeconds: number;
  maxRetries: number;
}

export interface Campaign {
  id: string;
  postDraft: PostDraft;
  groupListId: string;
  status: CampaignStatus;
  currentIndex: number;
  results: PostResult[];
  startedAt?: number;
  completedAt?: number;
  settings: CampaignSettings;
}

// ── Messages: Popup/SidePanel → Background ──
export type PopupMessage =
  | { type: 'START_CAMPAIGN'; payload: { postDraft: PostDraft; groupListId: string; settings: CampaignSettings } }
  | { type: 'PAUSE_CAMPAIGN' }
  | { type: 'RESUME_CAMPAIGN' }
  | { type: 'CANCEL_CAMPAIGN' }
  | { type: 'GET_CAMPAIGN_STATUS' };

// ── Messages: Background → Content Script ──
export type BackgroundToContentMessage =
  | { type: 'EXECUTE_POST'; payload: { text: string; mediaFiles: MediaFile[] } };

// ── Messages: Content Script → Background ──
export type ContentToBackgroundMessage =
  | { type: 'POST_RESULT'; payload: PostResult };

// ── Messages: Background → SidePanel (status broadcasts) ──
export type StatusUpdate = {
  type: 'CAMPAIGN_STATUS_UPDATE';
  payload: Campaign;
};

// ── Platform Adapter Interface (for expandability) ──
export interface PlatformAdapter {
  readonly platformId: string;
  readonly platformName: string;
  isValidGroupUrl(url: string): boolean;
  executePost(post: PostDraft): Promise<PostResult>;
  detectGroupPage(): boolean;
}

// ── Tab Navigation ──
export type TabId = 'compose' | 'groups' | 'campaign' | 'settings';
