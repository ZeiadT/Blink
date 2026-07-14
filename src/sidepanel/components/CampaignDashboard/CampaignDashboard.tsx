import React from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { Campaign, CampaignLaunchSnapshot, GroupEntry, PostDraft } from '@shared/types';
import { useCampaign } from '../../hooks/useCampaign';
import { useCampaignStore } from '../../store/campaignStore';
import { useCampaignSetupStore } from '../../store/campaignSetupStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import { CampaignHistory } from './CampaignHistory';
import { CampaignSetup } from './CampaignSetup';
import { ProgressTracker } from './ProgressTracker';
import { ResultsSummary } from './ResultsSummary';
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
    campaign,
    isLoading,
    isIdle,
    isRunning,
    isPaused,
    isFinished,
    progress,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    dismissCampaign,
  } = useCampaign();
  const history = useCampaignStore((state) => state.history);
  const historyError = useCampaignStore((state) => state.historyError);
  const actionError = useCampaignStore((state) => state.actionError);
  const pendingAction = useCampaignStore((state) => state.pendingAction);
  const refreshHistory = useCampaignStore((state) => state.refreshHistory);
  const settings = useSettingsStore((state) => state.settings);
  const resetSetup = useCampaignSetupStore((state) => state.reset);
  const liveFacebookError = latestFacebookError(campaign);

  const handleStart = async (
    postDraft: PostDraft,
    groups: GroupEntry[],
    launch: CampaignLaunchSnapshot,
  ) => {
    try {
      await startCampaign(postDraft, groups, settings, launch);
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
      resetSetup();
      showToast('info', 'Ready for a new campaign');
    } catch (error) {
      showToast('error', formatError(error, 'Campaign history could not be saved.'));
    }
  };

  let primaryContent: React.ReactNode = null;

  if (isIdle) {
    primaryContent = <CampaignSetup loading={pendingAction === 'start'} onStart={handleStart} />;
  } else if ((isRunning || isPaused) && campaign) {
    primaryContent = (
      <>
        <ProgressTracker campaign={campaign} progress={progress} />
        {campaign.error || liveFacebookError ? (
          <div className={styles.actionError} role="alert">
            {campaign.error ?? liveFacebookError}
          </div>
        ) : null}
        <div className={styles.controls}>
          {isRunning ? (
            <Button
              variant="secondary"
              icon={Pause}
              onClick={handlePause}
              loading={pendingAction === 'pause'}
              disabled={isLoading}
            >
              Pause
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={Play}
              onClick={handleResume}
              loading={pendingAction === 'resume'}
              disabled={isLoading}
            >
              Resume
            </Button>
          )}
          <Button
            variant="danger"
            icon={Square}
            onClick={handleCancel}
            loading={pendingAction === 'cancel'}
            disabled={isLoading}
          >
            Cancel
          </Button>
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
          New campaign
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
