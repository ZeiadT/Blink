import type {
  Campaign,
  CampaignSettings,
  CampaignStatus,
  GroupEntry,
  PostDraft,
  PostResult,
} from '@shared/types';
import { generateId } from '@shared/utils';
import { saveCampaignState, loadCampaignState, clearCampaignState } from './storage';
import { getGroupLists } from './storage';
import { randomDelay, KeepAliveScheduler } from './scheduler';
import { createExecutePostMessage, createStatusUpdateMessage } from '@shared/messages';

/** How long to wait for a content script response before marking the group as failed. */
const POST_TIMEOUT_MS = 60_000;

/** How long to wait after navigating before sending the post message. */
const PAGE_SETTLE_MS = 2_000;

export class CampaignOrchestrator {
  private campaign: Campaign | null = null;
  private pauseRequested = false;
  private cancelRequested = false;
  private scheduler = new KeepAliveScheduler();

  // ── Public API ─────────────────────────────────────────────────────────

  get currentCampaign(): Campaign | null {
    return this.campaign ? { ...this.campaign } : null;
  }

  get status(): CampaignStatus {
    return this.campaign?.status ?? 'idle';
  }

  async start(
    postDraft: PostDraft,
    groupListId: string,
    settings: CampaignSettings,
  ): Promise<void> {
    if (this.campaign?.status === 'running') {
      console.warn('[Blink:Orchestrator] Campaign already running.');
      return;
    }

    // Resolve groups from storage
    const groups = await this.resolveGroups(groupListId);
    if (!groups || groups.length === 0) {
      console.error('[Blink:Orchestrator] No groups found for list:', groupListId);
      return;
    }

    this.campaign = {
      id: generateId(),
      postDraft,
      groupListId,
      status: 'running',
      currentIndex: 0,
      results: [],
      startedAt: Date.now(),
      settings,
    };

    this.pauseRequested = false;
    this.cancelRequested = false;

    await this.persist();
    this.broadcast();
    this.scheduler.start();

    await this.executeLoop(groups);
  }

  pause(): void {
    if (this.campaign?.status !== 'running') return;
    this.pauseRequested = true;
  }

  async resume(): Promise<void> {
    if (this.campaign?.status !== 'paused') return;

    this.pauseRequested = false;
    this.cancelRequested = false;
    this.campaign.status = 'running';

    await this.persist();
    this.broadcast();
    this.scheduler.start();

    const groups = await this.resolveGroups(this.campaign.groupListId);
    if (groups) {
      await this.executeLoop(groups);
    }
  }

  async cancel(): Promise<void> {
    if (!this.campaign || this.campaign.status === 'idle' || this.campaign.status === 'completed') {
      return;
    }

    this.cancelRequested = true;

    // If paused, finalize immediately since the loop isn't running
    if (this.campaign.status === 'paused') {
      const groups = await this.resolveGroups(this.campaign.groupListId);
      if (groups) {
        this.markRemainingSkipped(groups);
      }
      this.campaign.status = 'cancelled';
      this.campaign.completedAt = Date.now();
      this.scheduler.stop();
      await this.persist();
      this.broadcast();
    }
    // If running, the loop will pick up cancelRequested and finalize
  }

  /**
   * Attempt crash recovery on service worker startup.
   * If a campaign was running/paused, resume it.
   */
  async recoverFromCrash(): Promise<void> {
    const saved = await loadCampaignState();
    if (!saved) return;

    if (saved.status === 'running' || saved.status === 'paused') {
      console.log('[Blink:Orchestrator] Recovering campaign:', saved.id, 'status:', saved.status);
      this.campaign = saved;

      if (saved.status === 'running') {
        this.pauseRequested = false;
        this.cancelRequested = false;
        this.scheduler.start();
        const groups = await this.resolveGroups(saved.groupListId);
        if (groups) {
          await this.executeLoop(groups);
        }
      }
      // If paused, just restore state — user must explicitly resume
    }
  }

  // ── Core Execution Loop ────────────────────────────────────────────────

  private async executeLoop(groups: GroupEntry[]): Promise<void> {
    if (!this.campaign) return;

    for (let i = this.campaign.currentIndex; i < groups.length; i++) {
      // Check pause/cancel between groups
      if (this.cancelRequested) {
        this.markRemainingSkipped(groups);
        this.campaign.status = 'cancelled';
        this.campaign.completedAt = Date.now();
        this.scheduler.stop();
        await this.persist();
        this.broadcast();
        return;
      }

      if (this.pauseRequested) {
        this.campaign.status = 'paused';
        this.scheduler.stop();
        await this.persist();
        this.broadcast();
        return;
      }

      this.campaign.currentIndex = i;
      await this.persist();
      this.broadcast();

      const group = groups[i];
      const result = await this.executePostOnGroup(group);
      this.campaign.results.push(result);

      await this.persist();
      this.broadcast();

      // Delay before next group (skip after last)
      if (i < groups.length - 1 && !this.cancelRequested && !this.pauseRequested) {
        try {
          await randomDelay(
            this.campaign.settings.delayMinSeconds,
            this.campaign.settings.delayMaxSeconds,
          );
        } catch {
          // If delay fails (shouldn't), continue anyway
        }
      }
    }

    // All groups processed
    if (this.campaign.status === 'running') {
      const allFailed = this.campaign.results.every((r) => r.status === 'failed');
      this.campaign.status = allFailed ? 'failed' : 'completed';
      this.campaign.completedAt = Date.now();
      this.scheduler.stop();
      await this.persist();
      this.broadcast();
    }
  }

  // ── Per-Group Execution ────────────────────────────────────────────────

  private async executePostOnGroup(group: GroupEntry): Promise<PostResult> {
    if (!this.campaign) {
      return { groupUrl: group.url, status: 'failed', error: 'No active campaign', timestamp: Date.now() };
    }

    let lastError = '';
    const maxAttempts = this.campaign.settings.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Navigate to group
        const tabId = await this.navigateToGroup(group.url);
        if (!tabId) {
          lastError = 'Failed to open tab';
          continue;
        }

        // Wait for page to settle after load
        await new Promise((resolve) => setTimeout(resolve, PAGE_SETTLE_MS));

        // Send post command to content script
        const result = await this.sendPostToContentScript(tabId, this.campaign.postDraft);

        if (result.status === 'success') {
          return result;
        }

        lastError = result.error ?? 'Post failed without error message';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      // Brief wait before retry
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return {
      groupUrl: group.url,
      status: 'failed',
      error: lastError,
      timestamp: Date.now(),
    };
  }

  // ── Tab Navigation ─────────────────────────────────────────────────────

  private async navigateToGroup(url: string): Promise<number | null> {
    try {
      // Try reusing existing tab first
      const tabs = await chrome.tabs.query({ url: 'https://*.facebook.com/*' });
      let tabId: number;

      if (tabs.length > 0 && tabs[0].id !== undefined) {
        tabId = tabs[0].id;
        await chrome.tabs.update(tabId, { url, active: true });
      } else {
        const tab = await chrome.tabs.create({ url, active: true });
        if (!tab.id) return null;
        tabId = tab.id;
      }

      // Wait for page load
      await this.waitForTabLoad(tabId);
      return tabId;
    } catch (err) {
      console.error('[Blink:Orchestrator] Tab navigation failed:', err);
      return null;
    }
  }

  private waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, POST_TIMEOUT_MS);

      const listener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // ── Content Script Communication ───────────────────────────────────────

  private async sendPostToContentScript(
    tabId: number,
    postDraft: PostDraft,
  ): Promise<PostResult> {
    const message = createExecutePostMessage(postDraft.text, postDraft.mediaFiles);

    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, message) as Promise<{ payload?: PostResult }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Content script response timeout')), POST_TIMEOUT_MS),
      ),
    ]);

    if (response?.payload) {
      return response.payload;
    }
    throw new Error('Invalid response from content script');
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async resolveGroups(groupListId: string): Promise<GroupEntry[] | null> {
    try {
      const lists = await getGroupLists();
      const list = lists.find((l) => l.id === groupListId);
      return list?.groups ?? null;
    } catch (err) {
      console.error('[Blink:Orchestrator] Failed to resolve groups:', err);
      return null;
    }
  }

  private markRemainingSkipped(groups: GroupEntry[]): void {
    if (!this.campaign) return;
    const processedUrls = new Set(this.campaign.results.map((r) => r.groupUrl));
    for (const group of groups) {
      if (!processedUrls.has(group.url)) {
        this.campaign.results.push({
          groupUrl: group.url,
          status: 'skipped',
          timestamp: Date.now(),
        });
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.campaign) {
      await saveCampaignState(this.campaign);
    }
  }

  private broadcast(): void {
    if (!this.campaign) return;
    try {
      const msg = createStatusUpdateMessage(this.campaign);
      chrome.runtime.sendMessage(msg).catch(() => {
        // No listeners — side panel may be closed, that's fine
      });
    } catch {
      // Swallow — broadcast is best-effort
    }
  }
}
