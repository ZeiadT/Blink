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

/** A reusable post kept independently from the current campaign composition. */
export interface SavedPost extends PostDraft {
  title: string;
}

/** Current compose state. It may have originated from a saved post, but is never shared with it. */
export interface CampaignDraft extends PostDraft {
  sourceSavedPostId?: string;
}

export interface SavedPostInput {
  title: string;
  text: string;
  mediaFiles: MediaFile[];
}

// ── Groups ──
export interface GroupEntry {
  /**
   * Catalog identity. Legacy campaign snapshots may omit this value; catalog
   * reads normalize those records before they enter active or saved lists.
   */
  groupId?: string;
  url: string;
  /** User-facing catalog name. `label` remains read-compatible with v1 data. */
  name?: string;
  /** @deprecated Use `name`. Kept only so legacy snapshots recover safely. */
  label?: string;
  lastPostStatus?: 'success' | 'failed' | 'pending' | 'skipped';
  lastPostAt?: number;
}

/** Fully normalized record written by the group catalog. */
export interface CatalogGroupEntry extends GroupEntry {
  groupId: string;
  name: string;
}

export interface GroupList {
  id: string;
  name: string;
  groups: GroupEntry[];
  createdAt: number;
  updatedAt: number;
}

// ── Campaign ──
export type CampaignStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed-with-issues'
  | 'failed'
  | 'cancelled';

export type TerminalCampaignStatus = Exclude<CampaignStatus, 'idle' | 'running' | 'paused'>;

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

/**
 * A target claimed before the Facebook side effect begins. A persisted claim
 * prevents crash recovery from sending the same post twice.
 */
export interface CampaignTargetClaim {
  index: number;
  groupUrl: string;
  runToken: string;
  claimedAt: number;
}

export interface Campaign {
  id: string;
  postDraft: PostDraft;
  /**
   * Copy of campaign targets captured when the campaign starts. New campaigns
   * never retain a pointer to a user-managed GroupList.
   */
  targetGroups: GroupEntry[];
  status: CampaignStatus;
  /**
   * Legacy cursor retained for stored campaigns created before the durable
   * runner. Modern campaigns keep it aligned with nextPendingIndex.
   */
  currentIndex: number;
  /** Index of the next target that has not reached a terminal result. */
  nextPendingIndex?: number;
  /** Lease for the active start/resume run. Stale loops and alarms must exit. */
  runToken?: string;
  /** Epoch milliseconds for the persisted continuation alarm, if delayed. */
  nextRunAt?: number;
  /** Target durably claimed before a post attempt. */
  activeTarget?: CampaignTargetClaim;
  /** Actionable runner/recovery error shown by the side panel. */
  error?: string;
  /** Storage failure while copying a terminal campaign into history. */
  historyError?: string;
  totalGroups: number;
  currentGroupUrl?: string;
  results: PostResult[];
  startedAt?: number;
  completedAt?: number;
  settings: CampaignSettings;
}

/** Single background-to-side-panel response shape for campaign reads/commands. */
export interface CampaignStatusResponse {
  ok: boolean;
  campaign: Campaign | null;
  error?: string;
}

/** Storage-safe campaign record. Media payloads are intentionally omitted. */
export interface CampaignHistoryEntry {
  id: string;
  status: TerminalCampaignStatus;
  postText: string;
  mediaCount: number;
  totalGroups: number;
  results: PostResult[];
  settings: CampaignSettings;
  startedAt?: number;
  completedAt: number;
  error?: string;
}

export interface CampaignHistoryResponse {
  ok: boolean;
  history: CampaignHistoryEntry[];
  error?: string;
}

// ── Messages: Popup/SidePanel → Background ──
export type ModernStartCampaignPayload = {
  postDraft: PostDraft;
  targetGroups: GroupEntry[];
  settings: CampaignSettings;
};

export type LegacyStartCampaignPayload = {
  postDraft: PostDraft;
  groupListId: string;
  settings: CampaignSettings;
};

export type StartCampaignPayload = ModernStartCampaignPayload | LegacyStartCampaignPayload;

export type PopupMessage =
  | { type: 'START_CAMPAIGN'; payload: StartCampaignPayload }
  | { type: 'PAUSE_CAMPAIGN' }
  | { type: 'RESUME_CAMPAIGN' }
  | { type: 'CANCEL_CAMPAIGN' }
  | { type: 'GET_CAMPAIGN_STATUS' }
  | { type: 'GET_CAMPAIGN_HISTORY' }
  | { type: 'DISMISS_CAMPAIGN' };

// ── Messages: Background → Content Script ──
export type BackgroundToContentMessage = {
  type: 'EXECUTE_POST';
  payload: { text: string; mediaFiles: MediaFile[] };
};

// ── Messages: Content Script → Background ──
export type ContentToBackgroundMessage = { type: 'POST_RESULT'; payload: PostResult };

// ── Messages: Background → SidePanel (status broadcasts) ──
export type StatusUpdate = {
  type: 'CAMPAIGN_STATUS_UPDATE';
  payload: Campaign | null;
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
