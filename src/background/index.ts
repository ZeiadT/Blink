// Blink — Background Service Worker
// Background owns campaign execution; side panel only sends intent and reads state.

import { CampaignOrchestrator } from './orchestrator';
import {
  createCampaignHistoryResponse,
  createCampaignStatusResponse,
  isCancelCampaign,
  isDismissCampaign,
  isGetCampaignHistory,
  isGetCampaignStatus,
  isPauseCampaign,
  isResumeCampaign,
  isStartCampaign,
} from '@shared/messages';
import type { CampaignHistoryResponse, CampaignStatusResponse } from '@shared/types';

const orchestrator = new CampaignOrchestrator();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !isStartCampaign(message) &&
    !isPauseCampaign(message) &&
    !isResumeCampaign(message) &&
    !isCancelCampaign(message) &&
    !isGetCampaignStatus(message) &&
    !isGetCampaignHistory(message) &&
    !isDismissCampaign(message)
  ) {
    return false;
  }

  void routeCampaignMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const details = formatError(error);
      sendResponse(
        isGetCampaignHistory(message)
          ? createCampaignHistoryResponse([], details)
          : createCampaignStatusResponse(orchestrator.currentCampaign, details),
      );
    });
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Blink] Extension installed:', details.reason);
  void orchestrator.recoverFromCrash().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Blink] Browser started, service worker waking up.');
  void orchestrator.recoverFromCrash().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void orchestrator.handleAlarm(alarm.name).catch(console.error);
});

// A worker can be started by an alarm or a side-panel message without a
// startup event. Single-flight hydration inside the runner makes this safe.
void orchestrator.recoverFromCrash().catch(console.error);

async function routeCampaignMessage(
  message: unknown,
): Promise<CampaignStatusResponse | CampaignHistoryResponse> {
  if (isStartCampaign(message)) {
    const { postDraft, settings, launch } = message.payload;
    const targetGroups =
      'targetGroups' in message.payload
        ? message.payload.targetGroups
        : message.payload.groupListId;
    await orchestrator.start(postDraft, targetGroups, settings, launch);
    return createCampaignStatusResponse(await orchestrator.getStatus());
  }

  if (isPauseCampaign(message)) {
    await orchestrator.pause();
    return createCampaignStatusResponse(await orchestrator.getStatus());
  }

  if (isResumeCampaign(message)) {
    await orchestrator.resume();
    return createCampaignStatusResponse(await orchestrator.getStatus());
  }

  if (isCancelCampaign(message)) {
    await orchestrator.cancel();
    return createCampaignStatusResponse(await orchestrator.getStatus());
  }

  if (isDismissCampaign(message)) {
    await orchestrator.dismiss();
    return createCampaignStatusResponse(await orchestrator.getStatus());
  }

  if (isGetCampaignStatus(message)) {
    return createCampaignStatusResponse(await orchestrator.getStatus());
  }

  if (isGetCampaignHistory(message)) {
    return createCampaignHistoryResponse(await orchestrator.getHistory());
  }

  return createCampaignStatusResponse(null, 'Unsupported campaign message.');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
