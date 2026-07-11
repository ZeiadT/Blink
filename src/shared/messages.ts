import type {
  PopupMessage,
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  StatusUpdate,
  PostDraft,
  CampaignSettings,
  ModernStartCampaignPayload,
  GroupEntry,
  MediaFile,
  PostResult,
  Campaign,
  CampaignStatusResponse,
  CampaignHistoryEntry,
  CampaignHistoryResponse,
} from './types';
import { cloneCampaignTargetGroups, isCampaignTargetGroups } from './campaignSnapshot';
import { isValidDelayRange } from './timingPolicy';

// ── Helpers ────────────────────────────────────────────────────────────────

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function hasType(val: unknown, type: string): boolean {
  return isObject(val) && val.type === type;
}

function isPostDraftPayload(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    Array.isArray(value.mediaFiles) &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

function isCampaignSettingsPayload(value: unknown): boolean {
  if (!isObject(value)) return false;
  const delayMinSeconds = value.delayMinSeconds;
  const delayMaxSeconds = value.delayMaxSeconds;
  const maxRetries = value.maxRetries;
  return (
    typeof maxRetries === 'number' &&
    Number.isInteger(maxRetries) &&
    isValidDelayRange({ delayMinSeconds, delayMaxSeconds }) &&
    maxRetries >= 0
  );
}

// ── Specific Popup Message Guards ──────────────────────────────────────────

export function isStartCampaign(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'START_CAMPAIGN' }> {
  if (!hasType(msg, 'START_CAMPAIGN')) return false;
  const m = msg as Record<string, unknown>;
  if (!isObject(m.payload)) return false;
  const p = m.payload as Record<string, unknown>;
  return (
    isPostDraftPayload(p.postDraft) &&
    isCampaignSettingsPayload(p.settings) &&
    (isCampaignTargetGroups(p.targetGroups) || typeof p.groupListId === 'string')
  );
}

export function isPauseCampaign(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'PAUSE_CAMPAIGN' }> {
  return hasType(msg, 'PAUSE_CAMPAIGN');
}

export function isResumeCampaign(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'RESUME_CAMPAIGN' }> {
  return hasType(msg, 'RESUME_CAMPAIGN');
}

export function isCancelCampaign(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'CANCEL_CAMPAIGN' }> {
  return hasType(msg, 'CANCEL_CAMPAIGN');
}

export function isGetCampaignStatus(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'GET_CAMPAIGN_STATUS' }> {
  return hasType(msg, 'GET_CAMPAIGN_STATUS');
}

export function isGetCampaignHistory(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'GET_CAMPAIGN_HISTORY' }> {
  return hasType(msg, 'GET_CAMPAIGN_HISTORY');
}

export function isDismissCampaign(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'DISMISS_CAMPAIGN' }> {
  return hasType(msg, 'DISMISS_CAMPAIGN');
}

// ── Aggregate Popup Guard ──────────────────────────────────────────────────

export function isPopupMessage(msg: unknown): msg is PopupMessage {
  return (
    isStartCampaign(msg) ||
    isPauseCampaign(msg) ||
    isResumeCampaign(msg) ||
    isCancelCampaign(msg) ||
    isGetCampaignStatus(msg) ||
    isGetCampaignHistory(msg) ||
    isDismissCampaign(msg)
  );
}

// ── Background → Content Script ────────────────────────────────────────────

export function isExecutePost(msg: unknown): msg is BackgroundToContentMessage {
  if (!hasType(msg, 'EXECUTE_POST')) return false;
  const m = msg as Record<string, unknown>;
  if (!isObject(m.payload)) return false;
  const p = m.payload as Record<string, unknown>;
  return typeof p.text === 'string' && Array.isArray(p.mediaFiles);
}

export function isBackgroundToContentMessage(msg: unknown): msg is BackgroundToContentMessage {
  return isExecutePost(msg);
}

// ── Content Script → Background ────────────────────────────────────────────

export function isPostResult(msg: unknown): msg is ContentToBackgroundMessage {
  if (!hasType(msg, 'POST_RESULT')) return false;
  const m = msg as Record<string, unknown>;
  if (!isObject(m.payload)) return false;
  const p = m.payload as Record<string, unknown>;
  return (
    typeof p.groupUrl === 'string' &&
    (p.status === 'success' || p.status === 'failed' || p.status === 'skipped') &&
    typeof p.timestamp === 'number'
  );
}

export function isContentToBackgroundMessage(msg: unknown): msg is ContentToBackgroundMessage {
  return isPostResult(msg);
}

// ── Status Update ──────────────────────────────────────────────────────────

export function isStatusUpdate(msg: unknown): msg is StatusUpdate {
  if (!hasType(msg, 'CAMPAIGN_STATUS_UPDATE')) return false;
  const m = msg as Record<string, unknown>;
  return m.payload === null || isObject(m.payload);
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a typed message. Payload is optional for payload-less message types.
 */
export function createStartCampaignMessage(
  postDraft: PostDraft,
  targetGroups: GroupEntry[],
  settings: CampaignSettings,
): { type: 'START_CAMPAIGN'; payload: ModernStartCampaignPayload } {
  return {
    type: 'START_CAMPAIGN',
    payload: { postDraft, targetGroups: cloneCampaignTargetGroups(targetGroups), settings },
  };
}

/** Validate the one response shape used by side-panel campaign requests. */
export function isCampaignStatusResponse(value: unknown): value is CampaignStatusResponse {
  if (!isObject(value) || typeof value.ok !== 'boolean' || !('campaign' in value)) {
    return false;
  }

  if (value.campaign !== null && !isObject(value.campaign)) {
    return false;
  }

  return value.error === undefined || typeof value.error === 'string';
}

export function isCampaignHistoryResponse(value: unknown): value is CampaignHistoryResponse {
  if (!isObject(value) || typeof value.ok !== 'boolean' || !Array.isArray(value.history)) {
    return false;
  }

  return (
    value.history.every(isCampaignHistoryEntry) &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

export function createPauseCampaignMessage(): Extract<PopupMessage, { type: 'PAUSE_CAMPAIGN' }> {
  return { type: 'PAUSE_CAMPAIGN' };
}

export function createResumeCampaignMessage(): Extract<PopupMessage, { type: 'RESUME_CAMPAIGN' }> {
  return { type: 'RESUME_CAMPAIGN' };
}

export function createCancelCampaignMessage(): Extract<PopupMessage, { type: 'CANCEL_CAMPAIGN' }> {
  return { type: 'CANCEL_CAMPAIGN' };
}

export function createGetCampaignStatusMessage(): Extract<PopupMessage, { type: 'GET_CAMPAIGN_STATUS' }> {
  return { type: 'GET_CAMPAIGN_STATUS' };
}

export function createGetCampaignHistoryMessage(): Extract<
  PopupMessage,
  { type: 'GET_CAMPAIGN_HISTORY' }
> {
  return { type: 'GET_CAMPAIGN_HISTORY' };
}

export function createDismissCampaignMessage(): Extract<PopupMessage, { type: 'DISMISS_CAMPAIGN' }> {
  return { type: 'DISMISS_CAMPAIGN' };
}

export function createExecutePostMessage(
  text: string,
  mediaFiles: MediaFile[],
): BackgroundToContentMessage {
  return { type: 'EXECUTE_POST', payload: { text, mediaFiles } };
}

export function createPostResultMessage(result: PostResult): ContentToBackgroundMessage {
  return { type: 'POST_RESULT', payload: result };
}

export function createStatusUpdateMessage(campaign: Campaign | null): StatusUpdate {
  return { type: 'CAMPAIGN_STATUS_UPDATE', payload: campaign };
}

export function createCampaignStatusResponse(
  campaign: Campaign | null,
  error?: string,
): CampaignStatusResponse {
  if (error) {
    return { ok: false, campaign, error };
  }

  return { ok: true, campaign };
}

export function createCampaignHistoryResponse(
  history: CampaignHistoryEntry[],
  error?: string,
): CampaignHistoryResponse {
  if (error) {
    return { ok: false, history, error };
  }

  return { ok: true, history };
}

function isCampaignHistoryEntry(value: unknown): value is CampaignHistoryEntry {
  if (!isObject(value)) return false;

  return (
    typeof value.id === 'string' &&
    (value.status === 'completed' ||
      value.status === 'completed-with-issues' ||
      value.status === 'failed' ||
      value.status === 'cancelled') &&
    typeof value.postText === 'string' &&
    typeof value.mediaCount === 'number' &&
    typeof value.totalGroups === 'number' &&
    Array.isArray(value.results) &&
    isObject(value.settings) &&
    typeof value.completedAt === 'number' &&
    (value.startedAt === undefined || typeof value.startedAt === 'number') &&
    (value.error === undefined || typeof value.error === 'string')
  );
}
