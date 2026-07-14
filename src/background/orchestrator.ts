import type {
  Campaign,
  CampaignHistoryEntry,
  CampaignLaunchSnapshot,
  CampaignSettings,
  CampaignStatus,
  CampaignTargetClaim,
  GroupEntry,
  PostDraft,
  PostResult,
} from '@shared/types';
import { generateId } from '@shared/utils';
import {
  getGroupLists,
  getSafeNextPendingIndex,
  archiveCampaignHistory,
  clearCampaignState,
  loadCampaignHistory,
  loadCampaignState,
  migrateLegacyCampaignTargetSnapshot,
  saveCampaignState,
} from './storage';
import {
  CampaignAlarmScheduler,
  getRandomDelayMs,
  parseCampaignAlarmName,
} from './scheduler';
import { createExecutePostMessage, createStatusUpdateMessage } from '@shared/messages';
import {
  cloneCampaignLaunch,
  cloneCampaignTargetGroups,
  isCampaignLaunch,
  isCampaignTargetGroups,
  shuffleCampaignTargetGroups,
} from '@shared/campaignSnapshot';
import { isValidDelayRange, normalizeDelayRange } from '@shared/timingPolicy';

/** How long to wait for a content script response before marking a group failed. */
const POST_TIMEOUT_MS = 60_000;

/** How long to wait after navigating before sending a post command. */
const PAGE_SETTLE_MS = 2_000;

const RETRY_DELAY_MS = 2_000;
const ATOMIC_POST_WATCHDOG_MS = POST_TIMEOUT_MS + 10_000;
const RECOVERY_INTERRUPTED_TARGET_ERROR =
  'Posting state was interrupted before a result was saved. This target was not retried to avoid a duplicate post.';
const INVALID_RECOVERY_STATE_ERROR =
  'Saved campaign state is invalid and was stopped to prevent duplicate posts. Start a new campaign to continue.';

const VALID_STATUSES = new Set<CampaignStatus>([
  'idle',
  'running',
  'paused',
  'completed',
  'completed-with-issues',
  'failed',
  'cancelled',
]);

/**
 * Durable, background-owned campaign runner.
 *
 * State transitions are persisted before their observable side effect. The
 * only long wait between targets is a Chrome alarm, so a suspended MV3 worker
 * can be recreated without resuming a local timer or duplicating a post.
 */
export class CampaignOrchestrator {
  private campaign: Campaign | null = null;
  private activeRunToken: string | null = null;
  private hasHydrated = false;
  private hydrationPromise: Promise<void> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly scheduler = new CampaignAlarmScheduler();

  get currentCampaign(): Campaign | null {
    return this.campaign ? cloneCampaign(this.campaign) : null;
  }

  get status(): CampaignStatus {
    return this.campaign?.status ?? 'idle';
  }

  /** Hydrate on demand so a side-panel request can wake an MV3 worker safely. */
  async getStatus(): Promise<Campaign | null> {
    await this.hydrateFromStorage();
    return this.currentCampaign;
  }

  async getHistory(): Promise<CampaignHistoryEntry[]> {
    await this.hydrateFromStorage();
    return loadCampaignHistory();
  }

  async start(
    postDraft: PostDraft,
    targetGroups: GroupEntry[] | string,
    settings: CampaignSettings,
    launch?: CampaignLaunchSnapshot,
  ): Promise<void> {
    if (!isValidPostDraft(postDraft) || !isValidSettings(settings)) {
      throw new Error('Campaign draft or settings are invalid.');
    }
    if (Array.isArray(targetGroups) && !isCampaignTargetGroups(targetGroups)) {
      throw new Error('Campaign target groups are invalid.');
    }
    if (launch && !isCampaignLaunch(launch)) {
      throw new Error('Campaign launch choices are invalid.');
    }

    // Snapshot caller-owned targets before the first await. A side-panel can
    // mutate its group selection while the worker hydrates persisted state.
    const suppliedTargetSnapshot = Array.isArray(targetGroups)
      ? cloneCampaignTargetGroups(targetGroups)
      : null;
    const suppliedSettingsSnapshot = { ...settings };
    const suppliedLaunchSnapshot = launch ? cloneCampaignLaunch(launch) : undefined;
    await this.hydrateFromStorage();

    if (this.campaign?.status === 'running' || this.campaign?.status === 'paused') {
      console.warn('[Blink:Orchestrator] Campaign already running.');
      return;
    }

    const groups = suppliedTargetSnapshot
      ? suppliedTargetSnapshot
      : await this.resolveLegacyGroupList(targetGroups as string);
    if (!groups || groups.length === 0) {
      throw new Error('No campaign target groups found.');
    }

    const orderedGroups = suppliedLaunchSnapshot?.randomizeGroupOrder
      ? shuffleCampaignTargetGroups(groups)
      : cloneCampaignTargetGroups(groups);

    const runToken = generateId();
    this.campaign = {
      id: generateId(),
      postDraft: clonePostDraft(postDraft),
      targetGroups: orderedGroups,
      status: 'running',
      currentIndex: 0,
      nextPendingIndex: 0,
      runToken,
      totalGroups: orderedGroups.length,
      results: [],
      startedAt: Date.now(),
      settings: suppliedSettingsSnapshot,
      ...(suppliedLaunchSnapshot ? { launch: suppliedLaunchSnapshot } : {}),
    };

    await this.persistAndBroadcast();
    this.launchContinuation(runToken);
  }

  /**
   * Pause is durable immediately. An already claimed post may finish, but no
   * continuation can claim the next target while status is paused.
   */
  async pause(): Promise<void> {
    await this.hydrateFromStorage();
    const campaign = this.campaign;
    if (!campaign) throw new Error('No running campaign to pause.');
    if (campaign.status === 'paused') return;
    if (campaign.status !== 'running') {
      throw new Error(`Campaign cannot be paused while ${campaign.status}.`);
    }

    campaign.status = 'paused';
    delete campaign.nextRunAt;
    await this.persistAndBroadcast();

    if (campaign.runToken) {
      this.scheduler.clear(campaign.id, campaign.runToken);
    }
  }

  async resume(): Promise<void> {
    await this.hydrateFromStorage();
    const campaign = this.campaign;
    if (!campaign) throw new Error('No paused campaign to resume.');
    if (campaign.status === 'running') return;
    if (campaign.status !== 'paused') {
      throw new Error(`Campaign cannot be resumed while ${campaign.status}.`);
    }

    const continuingClaim =
      campaign.activeTarget !== undefined &&
      campaign.runToken !== undefined &&
      campaign.runToken === this.activeRunToken;

    if (!continuingClaim && campaign.activeTarget) {
      await this.markInterruptedClaimAsFailed();
    }

    const previousToken = campaign.runToken;
    const runToken = continuingClaim && previousToken ? previousToken : generateId();
    campaign.status = 'running';
    campaign.runToken = runToken;
    delete campaign.nextRunAt;
    delete campaign.error;
    await this.persistAndBroadcast();

    if (previousToken && previousToken !== runToken) {
      this.scheduler.clear(campaign.id, previousToken);
    }

    if (!continuingClaim) {
      this.launchContinuation(runToken);
    }
  }

  async cancel(): Promise<void> {
    await this.hydrateFromStorage();
    const campaign = this.campaign;
    if (!campaign || campaign.status === 'idle') {
      throw new Error('No active campaign to cancel.');
    }
    if (campaign.status === 'cancelled') return;
    if (isFinished(campaign.status)) {
      throw new Error(`Campaign cannot be cancelled while ${campaign.status}.`);
    }

    const ownsClaim =
      campaign.activeTarget !== undefined &&
      campaign.runToken !== undefined &&
      campaign.runToken === this.activeRunToken;
    if (campaign.activeTarget && !ownsClaim) {
      await this.markInterruptedClaimAsFailed();
    }

    campaign.status = 'cancelled';
    delete campaign.nextRunAt;

    // A locally owned atomic post is allowed to report its result. It will
    // finalize the skipped remainder immediately afterward.
    if (!campaign.activeTarget) {
      this.markRemainingSkipped();
      this.finalizeCancellation();
    }

    await this.persistAndBroadcast();
    await this.archiveTerminalCampaign();
    if (campaign.runToken) {
      this.scheduler.clear(campaign.id, campaign.runToken);
    }
  }

  async dismiss(): Promise<void> {
    await this.hydrateFromStorage();
    const campaign = this.campaign;
    if (!campaign) return;
    if (!isFinished(campaign.status)) {
      throw new Error('Finish or cancel the campaign before starting a new one.');
    }
    if (campaign.activeTarget) {
      throw new Error('Wait for the current post to finish before starting a new campaign.');
    }
    if (!(await this.archiveTerminalCampaign())) {
      throw new Error(campaign.historyError ?? 'Could not save campaign history.');
    }

    await clearCampaignState();
    this.campaign = null;
    this.activeRunToken = null;
    this.broadcast(null);
  }

  /**
   * Restore a persisted campaign after worker/browser startup. A future
   * continuation is re-registered; due work is run once by the current token.
   */
  async recoverFromCrash(): Promise<void> {
    await this.hydrateFromStorage();
    const campaign = this.campaign;
    if (!campaign || campaign.status !== 'running' || !campaign.runToken) return;

    if (campaign.nextRunAt && campaign.nextRunAt > Date.now()) {
      this.scheduler.schedule(campaign.id, campaign.runToken, campaign.nextRunAt);
      return;
    }

    this.launchContinuation(campaign.runToken);
  }

  /** Handle a one-shot campaign alarm. Stale names/tokens do nothing. */
  async handleAlarm(alarmName: string): Promise<void> {
    const identity = parseCampaignAlarmName(alarmName);
    if (!identity) return;

    await this.hydrateFromStorage();
    const campaign = this.campaign;
    if (
      !campaign ||
      campaign.id !== identity.campaignId ||
      campaign.status !== 'running' ||
      campaign.runToken !== identity.runToken
    ) {
      return;
    }

    if (campaign.activeTarget && this.activeRunToken === identity.runToken) {
      // A live worker still owns the atomic post. Re-arm its watchdog rather
      // than letting this alarm consume the only recovery wake-up.
      campaign.nextRunAt = Date.now() + ATOMIC_POST_WATCHDOG_MS;
      await this.persistAndBroadcast();
      this.scheduler.schedule(campaign.id, campaign.runToken, campaign.nextRunAt);
      return;
    }

    if (campaign.nextRunAt && campaign.nextRunAt > Date.now()) {
      this.scheduler.schedule(campaign.id, campaign.runToken, campaign.nextRunAt);
      return;
    }

    delete campaign.nextRunAt;
    await this.persistAndBroadcast();
    await this.continueRun(identity.runToken);
  }

  private async hydrateFromStorage(): Promise<void> {
    if (this.hasHydrated) return;
    if (this.hydrationPromise) {
      await this.hydrationPromise;
      return;
    }

    this.hydrationPromise = this.loadPersistedCampaign();
    try {
      await this.hydrationPromise;
      this.hasHydrated = true;
    } finally {
      this.hydrationPromise = null;
    }
  }

  private async loadPersistedCampaign(): Promise<void> {
    const saved = await loadCampaignState();
    if (!saved) return;

    const migrated = await migrateLegacyCampaignTargetSnapshot(saved);
    if (!migrated) {
      this.campaign = createRecoveryFailure(saved, INVALID_RECOVERY_STATE_ERROR);
      await this.persistAndBroadcast();
      await this.archiveTerminalCampaign();
      return;
    }

    const normalized = this.normalizePersistedCampaign(migrated);
    if (!normalized) {
      this.campaign = createRecoveryFailure(migrated, INVALID_RECOVERY_STATE_ERROR);
      await this.persistAndBroadcast();
      await this.archiveTerminalCampaign();
      return;
    }

    this.campaign = normalized.campaign;
    if (normalized.changed) {
      await this.persistAndBroadcast();
    }
    if (isFinished(this.campaign.status)) {
      await this.archiveTerminalCampaign();
    }
  }

  private normalizePersistedCampaign(
    campaign: Campaign,
  ): { campaign: Campaign; changed: boolean } | null {
    if (
      !VALID_STATUSES.has(campaign.status) ||
      !isCampaignTargetGroups(campaign.targetGroups) ||
      !Array.isArray(campaign.results) ||
      !campaign.results.every(isValidPostResult) ||
      !isValidPostDraft(campaign.postDraft) ||
      !isRecoverableSettings(campaign.settings) ||
      (campaign.launch !== undefined && !isCampaignLaunch(campaign.launch))
    ) {
      return null;
    }

    const normalized = cloneCampaign(campaign);
    const targetCount = normalized.targetGroups.length;
    if ((normalized.status === 'running' || normalized.status === 'paused') && targetCount === 0) {
      return null;
    }

    let changed = false;
    const normalizedDelayRange = normalizeDelayRange(normalized.settings);
    if (
      normalized.settings.delayMinSeconds !== normalizedDelayRange.delayMinSeconds ||
      normalized.settings.delayMaxSeconds !== normalizedDelayRange.delayMaxSeconds
    ) {
      normalized.settings = { ...normalized.settings, ...normalizedDelayRange };
      changed = true;
    }
    if (normalized.totalGroups !== targetCount) {
      normalized.totalGroups = targetCount;
      changed = true;
    }

    const hasDurableCursor = isValidTargetIndex(normalized.nextPendingIndex, targetCount);
    const safeNextIndex = getSafeNextPendingIndex(normalized);
    if (!hasDurableCursor) {
      const resolvedPrefix = getResolvedPrefix(normalized);
      for (let index = resolvedPrefix; index < safeNextIndex; index++) {
        normalized.results.push({
          groupUrl: normalized.targetGroups[index].url,
          status: 'failed',
          error: RECOVERY_INTERRUPTED_TARGET_ERROR,
          timestamp: Date.now(),
        });
      }
      normalized.nextPendingIndex = safeNextIndex;
      normalized.currentIndex = safeNextIndex;
      changed = true;
    } else if (normalized.currentIndex !== safeNextIndex) {
      normalized.currentIndex = safeNextIndex;
      changed = true;
    }

    if (
      (normalized.status === 'running' || normalized.status === 'paused') &&
      (!normalized.runToken || typeof normalized.runToken !== 'string')
    ) {
      normalized.runToken = generateId();
      changed = true;
    }

    if (normalized.activeTarget && !isValidClaim(normalized.activeTarget, normalized)) {
      return null;
    }

    if (
      normalized.activeTarget &&
      normalized.runToken &&
      normalized.activeTarget.runToken !== normalized.runToken
    ) {
      return null;
    }

    const resolvedPrefix = getResolvedPrefix(normalized);
    if (normalized.results.length !== resolvedPrefix) {
      return null;
    }

    const durableNextIndex = normalized.nextPendingIndex ?? 0;
    if (normalized.activeTarget) {
      if (
        normalized.activeTarget.index !== resolvedPrefix ||
        durableNextIndex !== resolvedPrefix
      ) {
        return null;
      }
    } else if (durableNextIndex !== resolvedPrefix) {
      return null;
    }

    if (
      normalized.nextRunAt !== undefined &&
      (!Number.isFinite(normalized.nextRunAt) || normalized.status !== 'running')
    ) {
      delete normalized.nextRunAt;
      changed = true;
    }

    return { campaign: normalized, changed };
  }

  private launchContinuation(runToken: string): void {
    void this.continueRun(runToken).catch((error: unknown) => {
      void this.failRun(runToken, error);
    });
  }

  private async continueRun(runToken: string): Promise<void> {
    await this.hydrateFromStorage();
    if (!this.isCurrentRunningToken(runToken) || this.activeRunToken) return;

    const campaign = this.campaign;
    if (!campaign) return;

    // An in-flight claim with no local owner can only come from a worker that
    // was interrupted. Do not re-post it; rotate the lease before continuing.
    if (campaign.activeTarget) {
      await this.markInterruptedClaimAsFailed();
      if (!this.isCurrentRunningToken(runToken)) return;

      const recoveredToken = generateId();
      campaign.runToken = recoveredToken;
      delete campaign.nextRunAt;
      await this.persistAndBroadcast();
      this.scheduler.clear(campaign.id, runToken);
      this.launchContinuation(recoveredToken);
      return;
    }

    if (campaign.nextRunAt && campaign.nextRunAt > Date.now()) {
      this.scheduler.schedule(campaign.id, runToken, campaign.nextRunAt);
      return;
    }

    this.activeRunToken = runToken;
    try {
      await this.runAvailableTargets(runToken);
    } finally {
      if (this.activeRunToken === runToken) {
        this.activeRunToken = null;
      }
    }
  }

  private async runAvailableTargets(runToken: string): Promise<void> {
    while (this.isCurrentRunningToken(runToken)) {
      const campaign = this.campaign;
      if (!campaign) return;

      const nextIndex = campaign.nextPendingIndex ?? 0;
      if (nextIndex >= campaign.targetGroups.length) {
        await this.finalizeCompletion();
        return;
      }

      const group = campaign.targetGroups[nextIndex];
      const claim: CampaignTargetClaim = {
        index: nextIndex,
        groupUrl: group.url,
        runToken,
        claimedAt: Date.now(),
      };

      campaign.currentIndex = nextIndex;
      campaign.currentGroupUrl = group.url;
      campaign.activeTarget = claim;
      campaign.nextRunAt = Date.now() + ATOMIC_POST_WATCHDOG_MS;
      await this.persistAndBroadcast();
      this.scheduler.schedule(campaign.id, runToken, campaign.nextRunAt);

      const result = await this.executePostOnGroup(group, claim);
      if (!this.isCurrentClaim(claim)) return;

      campaign.results.push({
        ...result,
        groupUrl: claim.groupUrl,
        timestamp: Number.isFinite(result.timestamp) ? result.timestamp : Date.now(),
      });
      delete campaign.activeTarget;
      campaign.nextPendingIndex = claim.index + 1;
      campaign.currentIndex = claim.index + 1;

      if (campaign.status === 'cancelled') {
        this.markRemainingSkipped();
        this.finalizeCancellation();
        await this.persistAndBroadcast();
        await this.archiveTerminalCampaign();
        if (campaign.runToken) {
          this.scheduler.clear(campaign.id, campaign.runToken);
        }
        return;
      }

      if (campaign.status === 'paused') {
        delete campaign.nextRunAt;
        await this.persistAndBroadcast();
        return;
      }

      if (!this.isCurrentRunningToken(runToken)) return;

      if ((campaign.nextPendingIndex ?? 0) >= campaign.targetGroups.length) {
        await this.finalizeCompletion();
        return;
      }

      let delayMs: number;
      try {
        delayMs = getRandomDelayMs(
          campaign.settings.delayMinSeconds,
          campaign.settings.delayMaxSeconds,
        );
      } catch (error) {
        await this.failRun(runToken, error);
        return;
      }

      if (delayMs > 0) {
        campaign.nextRunAt = Date.now() + delayMs;
        await this.persistAndBroadcast();

        if (this.isCurrentRunningToken(runToken)) {
          this.scheduler.schedule(campaign.id, runToken, campaign.nextRunAt);
        }
        return;
      }
    }
  }

  private async executePostOnGroup(
    group: GroupEntry,
    claim: CampaignTargetClaim,
  ): Promise<PostResult> {
    const campaign = this.campaign;
    if (!campaign) {
      return failedResult(group.url, 'No active campaign');
    }

    let lastError = '';
    const maxAttempts = campaign.settings.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!this.isCurrentClaim(claim)) {
        return failedResult(group.url, 'Campaign ownership changed before post could finish.');
      }

      try {
        const tabId = await this.navigateToGroup(group.url);
        if (!tabId) {
          lastError = 'Failed to open tab';
          continue;
        }

        await wait(PAGE_SETTLE_MS);
        if (!this.isCurrentClaim(claim)) {
          return failedResult(group.url, 'Campaign ownership changed before post could begin.');
        }

        const result = await this.sendPostToContentScript(tabId, campaign.postDraft);
        if (result.status === 'success') {
          return result;
        }

        if (result.retryable === false) {
          return result;
        }

        lastError = result.error ?? 'Post failed without error message';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < maxAttempts - 1) {
        await wait(RETRY_DELAY_MS);
      }
    }

    return failedResult(group.url, lastError);
  }

  private async navigateToGroup(url: string): Promise<number | null> {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://*.facebook.com/*' });
      let tabId: number;

      if (tabs.length > 0 && tabs[0].id !== undefined) {
        tabId = tabs[0].id;
        await chrome.tabs.update(tabId, { url, active: true });
      } else {
        const tab = await chrome.tabs.create({ url, active: true });
        if (tab.id === undefined) return null;
        tabId = tab.id;
      }

      await this.waitForTabLoad(tabId);
      return tabId;
    } catch (error) {
      console.error('[Blink:Orchestrator] Tab navigation failed:', error);
      return null;
    }
  }

  private waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, POST_TIMEOUT_MS);

      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private async sendPostToContentScript(tabId: number, postDraft: PostDraft): Promise<PostResult> {
    const message = createExecutePostMessage(postDraft.text, postDraft.mediaFiles);
    const response = await withTimeout(
      chrome.tabs.sendMessage(tabId, message) as Promise<{ payload?: PostResult }>,
      POST_TIMEOUT_MS,
      'Content script response timeout',
    );

    if (response?.payload) {
      return response.payload;
    }
    throw new Error('Invalid response from content script');
  }

  private async resolveLegacyGroupList(groupListId: string): Promise<GroupEntry[] | null> {
    try {
      const lists = await getGroupLists();
      const list = lists.find((candidate) => candidate.id === groupListId);
      return list ? cloneCampaignTargetGroups(list.groups) : null;
    } catch (error) {
      console.error('[Blink:Orchestrator] Failed to resolve groups:', error);
      return null;
    }
  }

  private async markInterruptedClaimAsFailed(): Promise<void> {
    const campaign = this.campaign;
    const claim = campaign?.activeTarget;
    if (!campaign || !claim) return;

    campaign.results.push(failedResult(claim.groupUrl, RECOVERY_INTERRUPTED_TARGET_ERROR));
    campaign.nextPendingIndex = Math.max(campaign.nextPendingIndex ?? 0, claim.index + 1);
    campaign.currentIndex = campaign.nextPendingIndex;
    campaign.currentGroupUrl = claim.groupUrl;
    delete campaign.activeTarget;
    delete campaign.nextRunAt;
    campaign.error = RECOVERY_INTERRUPTED_TARGET_ERROR;
    await this.persistAndBroadcast();
  }

  private markRemainingSkipped(): void {
    const campaign = this.campaign;
    if (!campaign) return;

    const firstPendingIndex = Math.max(0, campaign.nextPendingIndex ?? campaign.currentIndex);
    for (let index = firstPendingIndex; index < campaign.targetGroups.length; index++) {
      campaign.results.push({
        groupUrl: campaign.targetGroups[index].url,
        status: 'skipped',
        timestamp: Date.now(),
      });
    }
    campaign.nextPendingIndex = campaign.targetGroups.length;
    campaign.currentIndex = campaign.targetGroups.length;
  }

  private async finalizeCompletion(): Promise<void> {
    const campaign = this.campaign;
    if (!campaign || campaign.status !== 'running') return;

    const successfulCount = campaign.results.filter((result) => result.status === 'success').length;
    const failedCount = campaign.results.filter((result) => result.status === 'failed').length;
    const skippedCount = campaign.results.filter((result) => result.status === 'skipped').length;
    campaign.status =
      successfulCount === 0 && failedCount > 0
        ? 'failed'
        : failedCount > 0 || skippedCount > 0
          ? 'completed-with-issues'
          : 'completed';
    campaign.completedAt = Date.now();
    campaign.nextPendingIndex = campaign.targetGroups.length;
    campaign.currentIndex = campaign.targetGroups.length;
    delete campaign.nextRunAt;
    await this.persistAndBroadcast();
    await this.archiveTerminalCampaign();

    if (campaign.runToken) {
      this.scheduler.clear(campaign.id, campaign.runToken);
    }
  }

  private finalizeCancellation(): void {
    const campaign = this.campaign;
    if (!campaign) return;

    campaign.status = 'cancelled';
    campaign.completedAt = Date.now();
    campaign.nextPendingIndex = campaign.targetGroups.length;
    campaign.currentIndex = campaign.targetGroups.length;
    delete campaign.nextRunAt;
  }

  private async failRun(runToken: string, error: unknown): Promise<void> {
    const campaign = this.campaign;
    if (!campaign || campaign.runToken !== runToken || isFinished(campaign.status)) return;

    if (campaign.activeTarget) {
      campaign.results.push(
        failedResult(
          campaign.activeTarget.groupUrl,
          'Campaign runner stopped before this target could be confirmed: ' + formatError(error),
        ),
      );
      campaign.nextPendingIndex = campaign.activeTarget.index + 1;
      campaign.currentIndex = campaign.nextPendingIndex;
      delete campaign.activeTarget;
    }

    campaign.status = 'failed';
    campaign.error = formatError(error);
    campaign.completedAt = Date.now();
    delete campaign.nextRunAt;
    await this.persistAndBroadcast();
    await this.archiveTerminalCampaign();
    this.scheduler.clear(campaign.id, runToken);
  }

  private async archiveTerminalCampaign(): Promise<boolean> {
    const campaign = this.campaign;
    if (!campaign || !isFinished(campaign.status)) return true;
    if (campaign.activeTarget) return true;

    try {
      await archiveCampaignHistory(campaign);
      if (campaign.historyError) {
        delete campaign.historyError;
        await this.persistAndBroadcast();
      }
      return true;
    } catch (error) {
      campaign.historyError = 'Could not save campaign history: ' + formatError(error);
      try {
        await this.persistAndBroadcast();
      } catch {
        this.broadcast(cloneCampaign(campaign));
      }
      return false;
    }
  }

  private isCurrentRunningToken(runToken: string): boolean {
    return this.campaign?.status === 'running' && this.campaign.runToken === runToken;
  }

  private isCurrentClaim(claim: CampaignTargetClaim): boolean {
    const activeTarget = this.campaign?.activeTarget;
    return (
      activeTarget !== undefined &&
      activeTarget.index === claim.index &&
      activeTarget.groupUrl === claim.groupUrl &&
      activeTarget.runToken === claim.runToken &&
      this.campaign?.runToken === claim.runToken
    );
  }

  private async persistAndBroadcast(): Promise<void> {
    if (!this.campaign) return;
    const snapshot = cloneCampaign(this.campaign);
    const write = this.persistQueue.catch(() => undefined).then(() => saveCampaignState(snapshot));
    this.persistQueue = write;
    await write;
    this.broadcast(snapshot);
  }

  private broadcast(campaign: Campaign | null): void {
    try {
      const message = createStatusUpdateMessage(campaign);
      chrome.runtime.sendMessage(message).catch(() => {
        // Side panel may be closed.
      });
    } catch {
      // Status broadcasts are best effort.
    }
  }
}

function clonePostDraft(postDraft: PostDraft): PostDraft {
  return {
    ...postDraft,
    mediaFiles: postDraft.mediaFiles.map((mediaFile) => ({ ...mediaFile })),
  };
}

function cloneCampaign(campaign: Campaign): Campaign {
  return {
    ...campaign,
    postDraft: clonePostDraft(campaign.postDraft),
    targetGroups: cloneCampaignTargetGroups(campaign.targetGroups),
    results: campaign.results.map((result) => ({ ...result })),
    settings: { ...campaign.settings },
    ...(campaign.launch ? { launch: cloneCampaignLaunch(campaign.launch) } : {}),
    ...(campaign.activeTarget ? { activeTarget: { ...campaign.activeTarget } } : {}),
  };
}

function createRecoveryFailure(source: unknown, error: string): Campaign {
  const raw = isObject(source) ? source : {};
  const targetGroups = isCampaignTargetGroups(raw.targetGroups)
    ? cloneCampaignTargetGroups(raw.targetGroups)
    : [];
  const postDraft = isValidPostDraft(raw.postDraft)
    ? clonePostDraft(raw.postDraft)
    : {
        id: 'recovery-error',
        text: '',
        mediaFiles: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
  const settings = isRecoverableSettings(raw.settings)
    ? { ...raw.settings, ...normalizeDelayRange(raw.settings) }
    : { delayMinSeconds: 0, delayMaxSeconds: 0, maxRetries: 0 };
  const results = Array.isArray(raw.results) ? raw.results.filter(isValidPostResult) : [];

  return {
    id: typeof raw.id === 'string' ? raw.id : 'recovery-error',
    postDraft,
    targetGroups,
    status: 'failed',
    currentIndex: targetGroups.length,
    nextPendingIndex: targetGroups.length,
    totalGroups: targetGroups.length,
    results,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : undefined,
    completedAt: Date.now(),
    settings,
    error,
  };
}

function getResolvedPrefix(campaign: Campaign): number {
  let index = 0;
  for (const result of campaign.results) {
    if (index >= campaign.targetGroups.length || result.groupUrl !== campaign.targetGroups[index].url) {
      break;
    }
    index++;
  }
  return index;
}

function isValidTargetIndex(value: unknown, targetCount: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= targetCount;
}

function isValidClaim(claim: CampaignTargetClaim, campaign: Campaign): boolean {
  return (
    isValidTargetIndex(claim.index, campaign.targetGroups.length - 1) &&
    claim.groupUrl === campaign.targetGroups[claim.index]?.url &&
    typeof claim.runToken === 'string' &&
    claim.runToken.length > 0 &&
    Number.isFinite(claim.claimedAt)
  );
}

function isValidPostDraft(value: unknown): value is PostDraft {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    Array.isArray(value.mediaFiles) &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

function isValidSettings(value: unknown): value is CampaignSettings {
  if (!isObject(value)) return false;
  const maxRetries = value.maxRetries;

  return (
    typeof maxRetries === 'number' &&
    Number.isInteger(maxRetries) &&
    isValidDelayRange(value) &&
    maxRetries >= 0 &&
    maxRetries <= 10
  );
}

function isRecoverableSettings(value: unknown): value is CampaignSettings {
  if (!isObject(value)) return false;
  return (
    typeof value.delayMinSeconds === 'number' &&
    typeof value.delayMaxSeconds === 'number' &&
    Number.isFinite(value.delayMinSeconds) &&
    Number.isFinite(value.delayMaxSeconds) &&
    typeof value.maxRetries === 'number' &&
    Number.isInteger(value.maxRetries) &&
    value.maxRetries >= 0
  );
}

function isValidPostResult(value: unknown): value is PostResult {
  return (
    isObject(value) &&
    typeof value.groupUrl === 'string' &&
    (value.status === 'success' || value.status === 'failed' || value.status === 'skipped') &&
    typeof value.timestamp === 'number' &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.retryable === undefined || typeof value.retryable === 'boolean')
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFinished(status: CampaignStatus): boolean {
  return (
    status === 'completed' ||
    status === 'completed-with-issues' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

function failedResult(groupUrl: string, error: string): PostResult {
  return {
    groupUrl,
    status: 'failed',
    error,
    timestamp: Date.now(),
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
