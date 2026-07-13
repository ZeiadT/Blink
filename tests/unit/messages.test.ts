import { describe, it, expect } from 'vitest';
import {
  isStartCampaign,
  isPauseCampaign,
  isResumeCampaign,
  isCancelCampaign,
  isGetCampaignStatus,
  isGetCampaignHistory,
  isDismissCampaign,
  isPopupMessage,
  isExecutePost,
  isBackgroundToContentMessage,
  isPostResult,
  isContentToBackgroundMessage,
  isStatusUpdate,
  createStartCampaignMessage,
  createPauseCampaignMessage,
  createResumeCampaignMessage,
  createCancelCampaignMessage,
  createGetCampaignStatusMessage,
  createGetCampaignHistoryMessage,
  createDismissCampaignMessage,
  createExecutePostMessage,
  createPostResultMessage,
  createStatusUpdateMessage,
  createCampaignStatusResponse,
  createCampaignHistoryResponse,
  isCampaignStatusResponse,
  isCampaignHistoryResponse,
} from '@shared/messages';
import type {
  PostDraft,
  CampaignSettings,
  Campaign,
  CampaignHistoryEntry,
  CampaignStatusResponse,
} from '@shared/types';

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockDraft: PostDraft = {
  id: 'draft-1',
  text: 'Hello world',
  mediaFiles: [],
  createdAt: 1000,
  updatedAt: 1000,
};

const mockSettings: CampaignSettings = {
  delayMinSeconds: 30,
  delayMaxSeconds: 60,
  maxRetries: 2,
};

const mockCampaign: Campaign = {
  id: 'campaign-1',
  postDraft: mockDraft,
  targetGroups: [{ url: 'https://facebook.com/groups/group-1' }],
  status: 'running',
  currentIndex: 0,
  totalGroups: 3,
  results: [],
  startedAt: 1000,
  settings: mockSettings,
};

// ── Type Guard Tests ───────────────────────────────────────────────────────

describe('isStartCampaign', () => {
  it('returns true for valid START_CAMPAIGN', () => {
    const msg = {
      type: 'START_CAMPAIGN',
      payload: {
        postDraft: mockDraft,
        targetGroups: [{ url: 'https://facebook.com/groups/group-1' }],
        settings: mockSettings,
      },
    };
    expect(isStartCampaign(msg)).toBe(true);
  });

  it('returns true for legacy START_CAMPAIGN', () => {
    const msg = {
      type: 'START_CAMPAIGN',
      payload: { postDraft: mockDraft, groupListId: 'list-1', settings: mockSettings },
    };
    expect(isStartCampaign(msg)).toBe(true);
  });

  it('returns false when payload missing', () => {
    expect(isStartCampaign({ type: 'START_CAMPAIGN' })).toBe(false);
  });

  it('returns false when payload missing targetGroups and groupListId', () => {
    const msg = {
      type: 'START_CAMPAIGN',
      payload: { postDraft: mockDraft, settings: mockSettings },
    };
    expect(isStartCampaign(msg)).toBe(false);
  });

  it('returns false for invalid campaign settings', () => {
    const msg = {
      type: 'START_CAMPAIGN',
      payload: {
        postDraft: mockDraft,
        targetGroups: [{ url: 'https://facebook.com/groups/group-1' }],
        settings: { ...mockSettings, delayMinSeconds: 20, delayMaxSeconds: 10 },
      },
    };
    expect(isStartCampaign(msg)).toBe(false);
  });

  it('returns false for off-step campaign delays', () => {
    const msg = {
      type: 'START_CAMPAIGN',
      payload: {
        postDraft: mockDraft,
        targetGroups: [{ url: 'https://facebook.com/groups/group-1' }],
        settings: { ...mockSettings, delayMinSeconds: 31, delayMaxSeconds: 60 },
      },
    };
    expect(isStartCampaign(msg)).toBe(false);
  });

  it('returns false for an incomplete post draft', () => {
    const msg = {
      type: 'START_CAMPAIGN',
      payload: {
        postDraft: { text: 'Missing draft fields' },
        targetGroups: [{ url: 'https://facebook.com/groups/group-1' }],
        settings: mockSettings,
      },
    };
    expect(isStartCampaign(msg)).toBe(false);
  });

  it('returns false for wrong type', () => {
    expect(isStartCampaign({ type: 'PAUSE_CAMPAIGN' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isStartCampaign(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isStartCampaign(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isStartCampaign('START_CAMPAIGN')).toBe(false);
  });
});

describe('isPauseCampaign', () => {
  it('returns true for valid PAUSE_CAMPAIGN', () => {
    expect(isPauseCampaign({ type: 'PAUSE_CAMPAIGN' })).toBe(true);
  });

  it('returns false for wrong type', () => {
    expect(isPauseCampaign({ type: 'RESUME_CAMPAIGN' })).toBe(false);
  });
});

describe('isResumeCampaign', () => {
  it('returns true for valid RESUME_CAMPAIGN', () => {
    expect(isResumeCampaign({ type: 'RESUME_CAMPAIGN' })).toBe(true);
  });

  it('returns false for wrong type', () => {
    expect(isResumeCampaign({ type: 'START_CAMPAIGN' })).toBe(false);
  });
});

describe('isCancelCampaign', () => {
  it('returns true for valid CANCEL_CAMPAIGN', () => {
    expect(isCancelCampaign({ type: 'CANCEL_CAMPAIGN' })).toBe(true);
  });

  it('returns false for wrong type', () => {
    expect(isCancelCampaign({ type: 'PAUSE_CAMPAIGN' })).toBe(false);
  });
});

describe('isGetCampaignStatus', () => {
  it('returns true for valid GET_CAMPAIGN_STATUS', () => {
    expect(isGetCampaignStatus({ type: 'GET_CAMPAIGN_STATUS' })).toBe(true);
  });

  it('returns false for wrong type', () => {
    expect(isGetCampaignStatus({ type: 'CANCEL_CAMPAIGN' })).toBe(false);
  });
});

describe('campaign history messages', () => {
  it('recognizes history and dismissal messages', () => {
    expect(isGetCampaignHistory({ type: 'GET_CAMPAIGN_HISTORY' })).toBe(true);
    expect(isDismissCampaign({ type: 'DISMISS_CAMPAIGN' })).toBe(true);
    expect(isGetCampaignHistory({ type: 'GET_CAMPAIGN_STATUS' })).toBe(false);
    expect(isDismissCampaign({ type: 'CANCEL_CAMPAIGN' })).toBe(false);
  });
});

describe('isPopupMessage', () => {
  it('matches all popup message types', () => {
    expect(isPopupMessage({ type: 'PAUSE_CAMPAIGN' })).toBe(true);
    expect(isPopupMessage({ type: 'RESUME_CAMPAIGN' })).toBe(true);
    expect(isPopupMessage({ type: 'CANCEL_CAMPAIGN' })).toBe(true);
    expect(isPopupMessage({ type: 'GET_CAMPAIGN_STATUS' })).toBe(true);
    expect(isPopupMessage({ type: 'GET_CAMPAIGN_HISTORY' })).toBe(true);
    expect(isPopupMessage({ type: 'DISMISS_CAMPAIGN' })).toBe(true);
    expect(
      isPopupMessage({
        type: 'START_CAMPAIGN',
        payload: {
          postDraft: mockDraft,
          targetGroups: [{ url: 'https://facebook.com/groups/group-1' }],
          settings: mockSettings,
        },
      }),
    ).toBe(true);
  });

  it('rejects non-popup messages', () => {
    expect(isPopupMessage({ type: 'EXECUTE_POST' })).toBe(false);
    expect(isPopupMessage({ type: 'POST_RESULT' })).toBe(false);
    expect(isPopupMessage(null)).toBe(false);
  });
});

describe('isExecutePost', () => {
  it('returns true for valid EXECUTE_POST', () => {
    const msg = { type: 'EXECUTE_POST', payload: { text: 'hi', mediaFiles: [] } };
    expect(isExecutePost(msg)).toBe(true);
    expect(isBackgroundToContentMessage(msg)).toBe(true);
  });

  it('returns false when payload missing text', () => {
    expect(isExecutePost({ type: 'EXECUTE_POST', payload: { mediaFiles: [] } })).toBe(false);
  });

  it('returns false when payload missing mediaFiles', () => {
    expect(isExecutePost({ type: 'EXECUTE_POST', payload: { text: 'hi' } })).toBe(false);
  });
});

describe('isPostResult', () => {
  it('returns true for valid POST_RESULT', () => {
    const msg = {
      type: 'POST_RESULT',
      payload: { groupUrl: 'https://facebook.com/groups/test', status: 'success', timestamp: 123 },
    };
    expect(isPostResult(msg)).toBe(true);
    expect(isContentToBackgroundMessage(msg)).toBe(true);
  });

  it('returns false for invalid status', () => {
    const msg = {
      type: 'POST_RESULT',
      payload: { groupUrl: 'url', status: 'invalid', timestamp: 123 },
    };
    expect(isPostResult(msg)).toBe(false);
  });

  it('returns false when timestamp not number', () => {
    const msg = {
      type: 'POST_RESULT',
      payload: { groupUrl: 'url', status: 'success', timestamp: 'now' },
    };
    expect(isPostResult(msg)).toBe(false);
  });
});

describe('isStatusUpdate', () => {
  it('returns true for valid CAMPAIGN_STATUS_UPDATE', () => {
    const msg = { type: 'CAMPAIGN_STATUS_UPDATE', payload: mockCampaign };
    expect(isStatusUpdate(msg)).toBe(true);
  });

  it('returns false when payload is not object', () => {
    expect(isStatusUpdate({ type: 'CAMPAIGN_STATUS_UPDATE', payload: 'not-obj' })).toBe(false);
  });

  it('accepts null after active campaign dismissal', () => {
    expect(isStatusUpdate({ type: 'CAMPAIGN_STATUS_UPDATE', payload: null })).toBe(true);
  });

  it('returns false for wrong type', () => {
    expect(isStatusUpdate({ type: 'OTHER', payload: {} })).toBe(false);
  });
});

describe('isCampaignStatusResponse', () => {
  it('returns true for a successful response with a campaign', () => {
    expect(isCampaignStatusResponse({ ok: true, campaign: mockCampaign })).toBe(true);
  });

  it('returns true for a successful response with no active campaign', () => {
    expect(isCampaignStatusResponse({ ok: true, campaign: null })).toBe(true);
  });

  it('returns true for an error response', () => {
    expect(
      isCampaignStatusResponse({ ok: false, campaign: null, error: 'Status unavailable' }),
    ).toBe(true);
  });

  it('returns false for a malformed response', () => {
    expect(isCampaignStatusResponse({ ok: 'yes', campaign: mockCampaign })).toBe(false);
    expect(isCampaignStatusResponse({ ok: true })).toBe(false);
    expect(isCampaignStatusResponse({ ok: true, campaign: 'campaign-1' })).toBe(false);
    expect(isCampaignStatusResponse({ ok: false, campaign: null, error: 404 })).toBe(false);
  });
});

describe('isCampaignHistoryResponse', () => {
  const history: CampaignHistoryEntry[] = [
    {
      id: 'history-1',
      status: 'completed-with-issues',
      postText: 'Multiline\npost',
      mediaCount: 0,
      totalGroups: 2,
      results: [],
      settings: mockSettings,
      completedAt: 2,
    },
  ];

  it('accepts a typed history response', () => {
    expect(isCampaignHistoryResponse({ ok: true, history })).toBe(true);
  });

  it('rejects malformed history responses', () => {
    expect(isCampaignHistoryResponse({ ok: true, history: 'nope' })).toBe(false);
    expect(isCampaignHistoryResponse({ ok: true, history: [{ id: 'missing fields' }] })).toBe(false);
  });
});

// ── Factory Tests ──────────────────────────────────────────────────────────

describe('message factories', () => {
  it('createStartCampaignMessage produces valid message', () => {
    const targetGroups = [{ url: 'https://facebook.com/groups/group-1' }];
    const msg = createStartCampaignMessage(mockDraft, targetGroups, mockSettings);
    expect(msg.type).toBe('START_CAMPAIGN');
    expect(msg.payload.postDraft).toBe(mockDraft);
    expect(msg.payload.targetGroups).toEqual(targetGroups);
    expect(msg.payload.targetGroups).not.toBe(targetGroups);
    expect(msg.payload.settings).toBe(mockSettings);
    expect(isStartCampaign(msg)).toBe(true);
  });

  it('createStartCampaignMessage snapshots unified launch choices', () => {
    const launch = {
      postSource: { kind: 'saved' as const, id: 'template-1', label: 'Weekly update' },
      groupSource: { kind: 'saved' as const, id: 'collection-1', label: 'Marketing groups' },
      randomizeGroupOrder: true,
    };
    const msg = createStartCampaignMessage(
      mockDraft,
      [{ url: 'https://facebook.com/groups/group-1' }],
      mockSettings,
      launch,
    );

    launch.groupSource.label = 'Changed later';
    expect(msg.payload.launch?.groupSource.label).toBe('Marketing groups');
    expect(isStartCampaign(msg)).toBe(true);
  });

  it('createPauseCampaignMessage produces valid message', () => {
    const msg = createPauseCampaignMessage();
    expect(msg.type).toBe('PAUSE_CAMPAIGN');
    expect(isPauseCampaign(msg)).toBe(true);
  });

  it('createResumeCampaignMessage produces valid message', () => {
    const msg = createResumeCampaignMessage();
    expect(msg.type).toBe('RESUME_CAMPAIGN');
    expect(isResumeCampaign(msg)).toBe(true);
  });

  it('createCancelCampaignMessage produces valid message', () => {
    const msg = createCancelCampaignMessage();
    expect(msg.type).toBe('CANCEL_CAMPAIGN');
    expect(isCancelCampaign(msg)).toBe(true);
  });

  it('createGetCampaignStatusMessage produces valid message', () => {
    const msg = createGetCampaignStatusMessage();
    expect(msg.type).toBe('GET_CAMPAIGN_STATUS');
    expect(isGetCampaignStatus(msg)).toBe(true);
  });

  it('creates typed history and dismissal messages', () => {
    expect(isGetCampaignHistory(createGetCampaignHistoryMessage())).toBe(true);
    expect(isDismissCampaign(createDismissCampaignMessage())).toBe(true);
  });

  it('createExecutePostMessage produces valid message', () => {
    const text = 'hello\r\n\r\nمرحبا 😀';
    const msg = createExecutePostMessage(text, []);
    expect(msg.type).toBe('EXECUTE_POST');
    expect(msg.payload.text).toBe(text);
    expect(isExecutePost(msg)).toBe(true);
  });

  it('createPostResultMessage produces valid message', () => {
    const result = { groupUrl: 'url', status: 'success' as const, timestamp: 123 };
    const msg = createPostResultMessage(result);
    expect(msg.type).toBe('POST_RESULT');
    expect(msg.payload).toBe(result);
    expect(isPostResult(msg)).toBe(true);
  });

  it('createStatusUpdateMessage produces valid message', () => {
    const msg = createStatusUpdateMessage(mockCampaign);
    expect(msg.type).toBe('CAMPAIGN_STATUS_UPDATE');
    expect(msg.payload).toBe(mockCampaign);
    expect(isStatusUpdate(msg)).toBe(true);
  });

  it('createCampaignStatusResponse produces a successful typed response', () => {
    const response: CampaignStatusResponse = createCampaignStatusResponse(mockCampaign);

    expect(response).toEqual({ ok: true, campaign: mockCampaign });
    expect(isCampaignStatusResponse(response)).toBe(true);
  });

  it('createCampaignStatusResponse represents an empty status read', () => {
    const response: CampaignStatusResponse = createCampaignStatusResponse(null);

    expect(response).toEqual({ ok: true, campaign: null });
    expect(isCampaignStatusResponse(response)).toBe(true);
  });

  it('createCampaignStatusResponse includes a typed failure', () => {
    const response: CampaignStatusResponse = createCampaignStatusResponse(
      null,
      'Campaign state is invalid',
    );

    expect(response).toEqual({
      ok: false,
      campaign: null,
      error: 'Campaign state is invalid',
    });
    expect(isCampaignStatusResponse(response)).toBe(true);
  });

  it('createCampaignHistoryResponse preserves records and failures', () => {
    const history: CampaignHistoryEntry[] = [
      {
        id: 'history-1',
        status: 'completed',
        postText: 'Done',
        mediaCount: 0,
        totalGroups: 1,
        results: [],
        settings: mockSettings,
        completedAt: 3,
      },
    ];

    expect(createCampaignHistoryResponse(history)).toEqual({ ok: true, history });
    expect(createCampaignHistoryResponse([], 'Storage unavailable')).toEqual({
      ok: false,
      history: [],
      error: 'Storage unavailable',
    });
  });
});
