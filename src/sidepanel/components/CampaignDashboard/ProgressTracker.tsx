import React from 'react';
import { Loader2 } from 'lucide-react';
import { truncate } from '@shared/utils';
import type { Campaign } from '@shared/types';
import styles from './ProgressTracker.module.css';

interface ProgressTrackerProps {
  campaign: Campaign;
  progress: number;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({ campaign, progress }) => {
  const { results, totalGroups, currentGroupUrl, status, settings } = campaign;
  const completed = results.length;
  const remaining = totalGroups - completed;
  const avgDelay = (settings.delayMinSeconds + settings.delayMaxSeconds) / 2;
  const estimatedMinutes = Math.max(1, Math.ceil((remaining * avgDelay) / 60));

  return (
    <div className={styles.tracker}>
      {/* Counter */}
      <div className={styles.counter}>
        <span className={styles.bigNum}>{completed}</span>
        <span className={styles.sep}>/</span>
        <span className={styles.total}>{totalGroups}</span>
      </div>
      <span className={styles.counterLabel}>posts completed</span>

      {/* Progress Bar */}
      <div className={styles.barTrack}>
        <div
          className={`${styles.barFill} ${status === 'running' ? styles.barActive : ''}`}
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>

      {/* Current Group */}
      {currentGroupUrl && status === 'running' && (
        <div className={styles.current}>
          <Loader2 size={14} className={styles.spinner} />
          <span className={styles.currentLabel}>Posting to</span>
          <span className={styles.currentUrl}>{truncate(currentGroupUrl, 42)}</span>
        </div>
      )}

      {/* Paused Badge */}
      {status === 'paused' && (
        <div className={styles.pausedBadge}>Paused</div>
      )}

      {/* Time Estimate */}
      {remaining > 0 && status === 'running' && (
        <span className={styles.estimate}>~{estimatedMinutes} min remaining</span>
      )}

      {/* Step Dots */}
      {totalGroups > 0 && (
        <div className={styles.steps} role="list" aria-label="Group posting status">
          {results.map((r, i) => (
            <div
              key={i}
              className={`${styles.dot} ${styles[`dot_${r.status}`]}`}
              title={`${r.groupUrl}: ${r.status}`}
              role="listitem"
              aria-label={`Group ${i + 1}: ${r.status}`}
            />
          ))}
          {Array.from({ length: remaining }).map((_, i) => (
            <div
              key={`p-${i}`}
              className={`${styles.dot} ${i === 0 && status === 'running' ? styles.dot_current : styles.dot_pending}`}
              role="listitem"
              aria-label={`Group ${completed + i + 1}: ${i === 0 && status === 'running' ? 'current' : 'pending'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
