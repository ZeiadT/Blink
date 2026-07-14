import React, { useState } from 'react';
import { CheckCircle, XCircle, SkipForward, ChevronDown, ChevronUp } from 'lucide-react';
import { truncate } from '@shared/utils';
import type { Campaign, PostResult } from '@shared/types';
import styles from './ResultsSummary.module.css';

interface ResultsSummaryProps {
  campaign: Campaign;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Individual Result Row (extracted to avoid inline component re-render) ──
const ResultRow: React.FC<{
  result: PostResult;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ result, isExpanded, onToggle }) => {
  const icon =
    result.status === 'success' ? <CheckCircle size={14} /> :
    result.status === 'failed' ? <XCircle size={14} /> :
    <SkipForward size={14} />;

  const statusClass =
    result.status === 'success' ? styles.success :
    result.status === 'failed' ? styles.failed :
    styles.skipped;

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={`${styles.rowMain} ${result.error ? styles.rowButton : ''}`}
        onClick={result.error ? onToggle : undefined}
        disabled={!result.error}
        aria-expanded={result.error ? isExpanded : undefined}
      >
        <span className={statusClass}>{icon}</span>
        <span className={styles.rowUrl}>{truncate(result.groupUrl, 38)}</span>
        <span className={styles.rowTime}>{formatTime(result.timestamp)}</span>
        {result.error && (
          <span className={styles.expand}>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </button>
      {isExpanded && result.error && (
        <div className={styles.errorDetail}>{result.error}</div>
      )}
    </div>
  );
};

export const ResultsSummary: React.FC<ResultsSummaryProps> = ({ campaign }) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const { results, status } = campaign;

  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  const bannerLabel =
    status === 'completed' ? 'Campaign Complete' :
    status === 'completed-with-issues' ? 'Completed with Issues' :
    status === 'failed' ? 'Campaign Failed' :
    'Campaign Cancelled';

  const bannerClass =
    status === 'completed' ? styles.bannerSuccess :
    status === 'completed-with-issues' ? styles.bannerIssues :
    status === 'failed' ? styles.bannerFailed :
    styles.bannerCancelled;

  return (
    <div className={styles.summary}>
      {/* Banner */}
      <div className={`${styles.banner} ${bannerClass}`}>
        <h2 className={styles.bannerTitle}>{bannerLabel}</h2>
      </div>

      {campaign.error && (
        <div className={styles.recoveryError} role="alert">
          {campaign.error}
        </div>
      )}
      {campaign.historyError && (
        <div className={styles.recoveryError} role="alert">
          {campaign.historyError}
        </div>
      )}

      {campaign.launch ? (
        <div className={styles.launchContext}>
          <span><strong>Post</strong>{campaign.launch.postSource.label}</span>
          <span><strong>Targets</strong>{campaign.launch.groupSource.label}</span>
          <span><strong>Order</strong>{campaign.launch.randomizeGroupOrder ? 'Randomized once' : 'Collection order'}</span>
        </div>
      ) : null}

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={`${styles.statNum} ${styles.success}`}>{successCount}</span>
          <span className={styles.statLabel}>Succeeded</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statNum} ${styles.failed}`}>{failedCount}</span>
          <span className={styles.statLabel}>Failed</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statNum} ${styles.skipped}`}>{skippedCount}</span>
          <span className={styles.statLabel}>Skipped</span>
        </div>
      </div>

      {/* Result Rows */}
      <div className={styles.list}>
        {results.map((r, i) => (
          <ResultRow
            key={`${r.groupUrl}-${r.timestamp}-${i}`}
            result={r}
            isExpanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
          />
        ))}
      </div>

    </div>
  );
};
