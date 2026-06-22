import type {
  PopupMessage,
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  StatusUpdate,
  PostDraft,
  CampaignSettings,
  MediaFile,
  PostResult,
} from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function hasType(val: unknown, type: string): boolean {
  return isObject(val) && val.type === type;
}

// ── Specific Popup Message Guards ──────────────────────────────────────────

export function isStartCampaign(
  msg: unknown,
): msg is Extract<PopupMessage, { type: 'START_CAMPAIGN' }> {
  if (!hasType(msg, 'START_CAMPAIGN')) return false;
  const m = msg as Record<string, unknown>;
  if (!isObject(m.payload)) return false;
  const p = m.payload as Record<string, unknown>;
  return isObject(p.postDraft) && typeof p.groupListId === 'string' && isObject(p.settings);
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

// ── Aggregate Popup Guard ──────────────────────────────────────────────────

export function isPopupMessage(msg: unknown): msg is PopupMessage {
  return (
    isStartCampaign(msg) ||
    isPauseCampaign(msg) ||
    isResumeCampaign(msg) ||
    isCancelCampaign(msg) ||
    isGetCampaignStatus(msg)
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
  return isObject(m.payload);
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a typed message. Payload is optional for payload-less message types.
 */
export function createStartCampaignMessage(
  postDraft: PostDraft,
  groupListId: string,
  settings: CampaignSettings,
): Extract<PopupMessage, { type: 'START_CAMPAIGN' }> {
  return { type: 'START_CAMPAIGN', payload: { postDraft, groupListId, settings } };
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

export function createExecutePostMessage(
  text: string,
  mediaFiles: MediaFile[],
): BackgroundToContentMessage {
  return { type: 'EXECUTE_POST', payload: { text, mediaFiles } };
}

export function createPostResultMessage(result: PostResult): ContentToBackgroundMessage {
  return { type: 'POST_RESULT', payload: result };
}

export function createStatusUpdateMessage(campaign: import('./types').Campaign): StatusUpdate {
  return { type: 'CAMPAIGN_STATUS_UPDATE', payload: campaign };
}
