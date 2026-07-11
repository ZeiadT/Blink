import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, History } from 'lucide-react';
import type { CampaignHistoryEntry, TerminalCampaignStatus } from '@shared/types';
import { truncate } from '@shared/utils';
import { Button } from '../shared/Button';
import styles from './CampaignHistory.module.css';

interface CampaignHistoryProps {
  history: CampaignHistoryEntry[];
  activeCampaignId?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const STATUS_LABELS: Record<TerminalCampaignStatus, string> = {
  completed: 'Completed',
  'completed-with-issues': 'Completed with issues',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<TerminalCampaignStatus, string> = {
  completed: styles.completed,
  'completed-with-issues': styles.issues,
  failed: styles.failed,
  cancelled: styles.cancelled,
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function counts(entry: CampaignHistoryEntry): { success: number; failed: number; skipped: number } {
  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of entry.results) {
    if (result.status === 'success') success++;
    else if (result.status === 'failed') failed++;
    else skipped++;
  }
  return { success, failed, skipped };
}

const HistoryRow: React.FC<{ entry: CampaignHistoryEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const detailId = `history-details-${entry.id}`;
  const resultCounts = counts(entry);

  return (
    <article className={`${styles.row} ${STATUS_CLASSES[entry.status]}`}>
      <button
        type="button"
        className={styles.rowButton}
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
      >
        <span className={styles.rowTopline}>
          <span className={styles.status}>{STATUS_LABELS[entry.status]}</span>
          <span className={styles.time}>{formatDate(entry.completedAt)}</span>
        </span>
        <span className={styles.preview}>{truncate(entry.postText.replace(/\s+/g, ' ').trim(), 72) || 'Media-only post'}</span>
        <span className={styles.metrics}>
          <span>{resultCounts.success} sent</span>
          <span>{resultCounts.failed} failed</span>
          <span>{entry.mediaCount} media</span>
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </span>
      </button>
      {expanded ? (
        <div id={detailId} className={styles.details}>
          <p className={styles.postText}>{entry.postText || 'Media-only post'}</p>
          <p className={styles.settings}>
            Delay {entry.settings.delayMinSeconds}–{entry.settings.delayMaxSeconds}s · {entry.settings.maxRetries} retries
          </p>
          {entry.error ? <p className={styles.error} role="alert">{entry.error}</p> : null}
          <ul className={styles.results} aria-label="Campaign results">
            {entry.results.map((result, index) => (
              <li key={`${result.groupUrl}-${result.timestamp}-${index}`}>
                <span>{result.status}</span>
                <span>{result.groupUrl}</span>
                {result.error ? <span className={styles.resultError}>{result.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
};

export const CampaignHistory: React.FC<CampaignHistoryProps> = ({
  history,
  activeCampaignId,
  loading,
  error,
  onRetry,
}) => {
  const visibleHistory = activeCampaignId
    ? history.filter((entry) => entry.id !== activeCampaignId)
    : history;

  return (
    <section className={styles.history} aria-labelledby="recent-runs-title">
      <div className={styles.heading}>
        <span className={styles.headingIcon}><History size={15} aria-hidden="true" /></span>
        <div>
          <h2 id="recent-runs-title">Recent runs</h2>
          <p>{visibleHistory.length} saved {visibleHistory.length === 1 ? 'run' : 'runs'}</p>
        </div>
      </div>

      {error ? (
        <div className={styles.historyError} role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : null}

      {loading ? <p className={styles.empty}>Loading campaign history…</p> : null}
      {!loading && visibleHistory.length === 0 ? (
        <div className={styles.empty}>
          <Clock3 size={16} aria-hidden="true" />
          <span>Finished campaigns appear here.</span>
        </div>
      ) : null}
      {!loading && visibleHistory.length > 0 ? (
        <div className={styles.list} role="region" aria-label="Recent campaign runs">
          {visibleHistory.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
        </div>
      ) : null}
    </section>
  );
};
