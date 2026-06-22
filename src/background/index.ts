// Blink — Background Service Worker
// Routes messages from side panel to CampaignOrchestrator.

import { CampaignOrchestrator } from './orchestrator';
import {
  isStartCampaign,
  isPauseCampaign,
  isResumeCampaign,
  isCancelCampaign,
  isGetCampaignStatus,
  createStatusUpdateMessage,
} from '@shared/messages';

// ── Instantiate orchestrator (module-level singleton) ─────────────────────

const orchestrator = new CampaignOrchestrator();

// ── Open side panel when extension icon is clicked ────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ── Message routing ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isStartCampaign(message)) {
    const { postDraft, groupListId, settings } = message.payload;
    orchestrator.start(postDraft, groupListId, settings).catch(console.error);
    sendResponse({ ok: true });
    return true;
  }

  if (isPauseCampaign(message)) {
    orchestrator.pause();
    sendResponse({ ok: true });
    return true;
  }

  if (isResumeCampaign(message)) {
    orchestrator.resume().catch(console.error);
    sendResponse({ ok: true });
    return true;
  }

  if (isCancelCampaign(message)) {
    orchestrator.cancel().catch(console.error);
    sendResponse({ ok: true });
    return true;
  }

  if (isGetCampaignStatus(message)) {
    const campaign = orchestrator.currentCampaign;
    if (campaign) {
      sendResponse(createStatusUpdateMessage(campaign));
    } else {
      sendResponse({ type: 'CAMPAIGN_STATUS_UPDATE', payload: null });
    }
    return true;
  }

  return false;
});

// ── Lifecycle events ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Blink] Extension installed:', details.reason);
  orchestrator.recoverFromCrash().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Blink] Browser started, service worker waking up.');
  orchestrator.recoverFromCrash().catch(console.error);
});

// ── Keep-alive alarm handler ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'blink-keepalive') {
    // No-op — just keeps service worker alive
    console.log('[Blink] Keep-alive ping');
  }
});
