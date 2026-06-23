import React, { useState } from 'react';
import { CheckCircle, XCircle, SkipForward, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { truncate } from '@shared/utils';
import { showToast } from '../shared/Toast';
import { Button } from '../shared/Button';
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
      <div
        className={styles.rowMain}
        onClick={result.error ? onToggle : undefined}
        style={result.error ? { cursor: 'pointer' } : undefined}
      >
        <span className={statusClass}>{icon}</span>
        <span className={styles.rowUrl}>{truncate(result.groupUrl, 38)}</span>
        <span className={styles.rowTime}>{formatTime(result.timestamp)}</span>
        {result.error && (
          <span className={styles.expand}>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </div>
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
    status === 'failed' ? 'Campaign Failed' :
    'Campaign Cancelled';

  const bannerClass =
    status === 'completed' ? styles.bannerSuccess :
    status === 'failed' ? styles.bannerFailed :
    styles.bannerCancelled;

  const handleRetry = () => {
    showToast('info', `Retry for ${failedCount} failed group(s) — coming soon`);
  };

  return (
    <div className={styles.summary}>
      {/* Banner */}
      <div className={`${styles.banner} ${bannerClass}`}>
        <h2 className={styles.bannerTitle}>{bannerLabel}</h2>
      </div>

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
            key={i}
            result={r}
            isExpanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
          />
        ))}
      </div>

      {/* Retry Button */}
      {failedCount > 0 && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={handleRetry}>
          Retry Failed ({failedCount})
        </Button>
      )}
    </div>
  );
};
