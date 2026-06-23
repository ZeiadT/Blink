import React from 'react';
import { Rocket, Play, Pause, Square, AlertCircle, RotateCcw } from 'lucide-react';
import { useCampaign } from '../../hooks/useCampaign';
import { usePostStore } from '../../store/postStore';
import { useGroupStore } from '../../store/groupStore';
import { useSettingsStore } from '../../store/settingsStore';
import { generateId } from '@shared/utils';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import { ProgressTracker } from './ProgressTracker';
import { ResultsSummary } from './ResultsSummary';
import type { PostDraft } from '@shared/types';
import styles from './CampaignDashboard.module.css';

export const CampaignDashboard: React.FC = () => {
  const {
    campaign, isLoading, isIdle, isRunning, isPaused, isFinished,
    progress, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, clearCampaign,
  } = useCampaign();

  const draft = usePostStore((s) => s.draft);
  const activeGroups = useGroupStore((s) => s.activeGroups);
  const settings = useSettingsStore((s) => s.settings);

  const hasPost = draft.text.trim().length > 0 || draft.mediaFiles.length > 0;
  const hasGroups = activeGroups.length > 0;
  const canStart = hasPost && hasGroups && isIdle && !isLoading;

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
    } catch {
      showToast('error', 'Failed to start campaign');
    }
  };

  const handlePause = () => {
    pauseCampaign();
    showToast('warning', 'Campaign paused');
  };

  const handleResume = () => {
    resumeCampaign();
    showToast('info', 'Campaign resumed');
  };

  const handleCancel = () => {
    cancelCampaign();
    showToast('warning', 'Campaign cancelled');
  };

  // ── Idle State ──
  if (isIdle) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.hero}>
          <div className={styles.heroIconWrap}>
            <Rocket size={28} />
          </div>
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
            <span className={styles.cardValue}>
              {hasGroups ? `${activeGroups.length} group(s)` : 'No groups added'}
            </span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Delay Range</span>
            <span className={styles.cardValue}>
              {settings.delayMinSeconds}–{settings.delayMaxSeconds}s
            </span>
          </div>
        </div>

        {!hasPost && (
          <div className={styles.warning}>
            <AlertCircle size={14} />
            <span>Add post content in the Compose tab</span>
          </div>
        )}
        {!hasGroups && (
          <div className={styles.warning}>
            <AlertCircle size={14} />
            <span>Add group URLs in the Groups tab</span>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          icon={Play}
          onClick={handleStart}
          disabled={!canStart}
          loading={isLoading}
          fullWidth
          className={styles.startBtn}
        >
          Start Posting
        </Button>
      </div>
    );
  }

  // ── Running / Paused ──
  if (isRunning || isPaused) {
    return (
      <div className={styles.dashboard}>
        <ProgressTracker campaign={campaign!} progress={progress} />
        <div className={styles.controls}>
          {isRunning ? (
            <Button variant="secondary" icon={Pause} onClick={handlePause}>Pause</Button>
          ) : (
            <Button variant="primary" icon={Play} onClick={handleResume}>Resume</Button>
          )}
          <Button variant="danger" icon={Square} onClick={handleCancel}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ── Finished ──
  if (isFinished && campaign) {
    return (
      <div className={styles.dashboard}>
        <ResultsSummary campaign={campaign} />
        <Button
          variant="secondary"
          icon={RotateCcw}
          onClick={clearCampaign}
          fullWidth
          className={styles.newBtn}
        >
          New Campaign
        </Button>
      </div>
    );
  }

  return null;
};
