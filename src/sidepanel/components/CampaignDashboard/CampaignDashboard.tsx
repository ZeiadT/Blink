import React from 'react';
import { Rocket, Play, Pause, Square, AlertCircle, RotateCcw } from 'lucide-react';
import { useCampaign } from '../../hooks/useCampaign';
import { useCampaignStore } from '../../store/campaignStore';
import { usePostStore } from '../../store/postStore';
import { useGroupStore } from '../../store/groupStore';
import { useSettingsStore } from '../../store/settingsStore';
import { generateId } from '@shared/utils';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import { CampaignHistory } from './CampaignHistory';
import { ProgressTracker } from './ProgressTracker';
import { ResultsSummary } from './ResultsSummary';
import type { Campaign, PostDraft } from '@shared/types';
import styles from './CampaignDashboard.module.css';

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function latestFacebookError(campaign: Campaign | null): string | null {
  if (!campaign) return null;
  for (let index = campaign.results.length - 1; index >= 0; index--) {
    const error = campaign.results[index].error;
    if (error) return error;
  }
  return null;
}

export const CampaignDashboard: React.FC = () => {
  const {
    campaign, isLoading, isIdle, isRunning, isPaused, isFinished,
    progress, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, dismissCampaign,
  } = useCampaign();
  const history = useCampaignStore((state) => state.history);
  const historyError = useCampaignStore((state) => state.historyError);
  const actionError = useCampaignStore((state) => state.actionError);
  const pendingAction = useCampaignStore((state) => state.pendingAction);
  const refreshHistory = useCampaignStore((state) => state.refreshHistory);

  const draft = usePostStore((state) => state.draft);
  const activeGroups = useGroupStore((state) => state.activeGroups);
  const settings = useSettingsStore((state) => state.settings);

  const hasPost = draft.text.trim().length > 0 || draft.mediaFiles.length > 0;
  const hasGroups = activeGroups.length > 0;
  const canStart = hasPost && hasGroups && isIdle && !isLoading;
  const liveFacebookError = latestFacebookError(campaign);

  const handleStart = async () => {
    const postDraft: PostDraft = {
      id: generateId(),
      text: draft.text,
      mediaFiles: draft.mediaFiles,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await startCampaign(postDraft, activeGroups, settings);
      showToast('info', 'Campaign started — posting to groups…');
    } catch (error) {
      showToast('error', formatError(error, 'Campaign could not be started.'));
    }
  };

  const handlePause = async () => {
    try {
      await pauseCampaign();
      showToast('warning', 'Campaign paused');
    } catch (error) {
      showToast('error', formatError(error, 'Campaign could not be paused.'));
    }
  };

  const handleResume = async () => {
    try {
      await resumeCampaign();
      showToast('info', 'Campaign resumed');
    } catch (error) {
      showToast('error', formatError(error, 'Campaign could not be resumed.'));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCampaign();
      showToast('warning', 'Campaign cancelled');
    } catch (error) {
      showToast('error', formatError(error, 'Campaign could not be cancelled.'));
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissCampaign();
      showToast('info', 'Ready for a new campaign');
    } catch (error) {
      showToast('error', formatError(error, 'Campaign history could not be saved.'));
    }
  };

  let primaryContent: React.ReactNode = null;

  if (isIdle) {
    primaryContent = (
      <>
        <div className={styles.hero}>
          <div className={styles.heroIconWrap}><Rocket size={28} /></div>
          <h2 className={styles.heroTitle}>Ready to Post</h2>
          <p className={styles.heroSub}>Review your campaign before launching</p>
        </div>

        <div className={styles.cards}>
          <div className={`${styles.card} ${hasPost ? styles.cardReady : styles.cardWarn}`}>
            <span className={styles.cardLabel}>Post Content</span>
            <span className={styles.cardValue}>
              {hasPost
                ? `${draft.text.length > 0 ? draft.text.slice(0, 36) + (draft.text.length > 36 ? '…' : '') : ''}${draft.mediaFiles.length > 0 ? ` + ${draft.mediaFiles.length} file(s)` : ''}`.trim()
                : 'No content yet'}
            </span>
          </div>
          <div className={`${styles.card} ${hasGroups ? styles.cardReady : styles.cardWarn}`}>
            <span className={styles.cardLabel}>Target Groups</span>
            <span className={styles.cardValue}>{hasGroups ? `${activeGroups.length} group(s)` : 'No groups added'}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Delay Range</span>
            <span className={styles.cardValue}>{settings.delayMinSeconds}–{settings.delayMaxSeconds}s</span>
          </div>
        </div>

        {!hasPost ? <div className={styles.warning}><AlertCircle size={14} /><span>Add post content in the Compose tab</span></div> : null}
        {!hasGroups ? <div className={styles.warning}><AlertCircle size={14} /><span>Add group URLs in the Groups tab</span></div> : null}

        <Button
          variant="primary"
          size="lg"
          icon={Play}
          onClick={handleStart}
          disabled={!canStart}
          loading={pendingAction === 'start'}
          fullWidth
          className={styles.startBtn}
        >
          Start Posting
        </Button>
      </>
    );
  } else if ((isRunning || isPaused) && campaign) {
    primaryContent = (
      <>
        <ProgressTracker campaign={campaign} progress={progress} />
        {campaign.error || liveFacebookError ? (
          <div className={styles.actionError} role="alert">{campaign.error ?? liveFacebookError}</div>
        ) : null}
        <div className={styles.controls}>
          {isRunning ? (
            <Button variant="secondary" icon={Pause} onClick={handlePause} loading={pendingAction === 'pause'} disabled={isLoading}>Pause</Button>
          ) : (
            <Button variant="primary" icon={Play} onClick={handleResume} loading={pendingAction === 'resume'} disabled={isLoading}>Resume</Button>
          )}
          <Button variant="danger" icon={Square} onClick={handleCancel} loading={pendingAction === 'cancel'} disabled={isLoading}>Cancel</Button>
        </div>
      </>
    );
  } else if (isFinished && campaign) {
    primaryContent = (
      <>
        <ResultsSummary campaign={campaign} />
        <Button
          variant="secondary"
          icon={RotateCcw}
          onClick={handleDismiss}
          loading={pendingAction === 'dismiss'}
          disabled={isLoading}
          fullWidth
          className={styles.newBtn}
        >
          New Campaign
        </Button>
      </>
    );
  }

  return (
    <div className={styles.dashboard}>
      {actionError ? <div className={styles.actionError} role="alert">{actionError}</div> : null}
      {primaryContent}
      <CampaignHistory
        history={history}
        activeCampaignId={campaign?.id}
        loading={pendingAction === 'history'}
        error={historyError}
        onRetry={() => void refreshHistory()}
      />
    </div>
  );
};
