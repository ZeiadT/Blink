import React, { useCallback } from 'react';
import { X, Trash2, Users, ExternalLink } from 'lucide-react';
import { useGroupStore } from '../../store/groupStore';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import { truncate } from '@shared/utils';
import styles from './GroupListEditor.module.css';

export const GroupListEditor: React.FC = () => {
  const { activeGroups, removeUrl, clearAll } = useGroupStore();

  const handleRemove = useCallback(
    (url: string) => {
      removeUrl(url);
      showToast('info', 'Group removed.');
    },
    [removeUrl],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    showToast('info', 'All groups cleared.');
  }, [clearAll]);

  if (activeGroups.length === 0) {
    return (
      <div className={styles.empty}>
        <Users size={32} className={styles.emptyIcon} />
        <p className={styles.emptyText}>No groups added yet</p>
        <p className={styles.emptyHint}>Paste Facebook group URLs above to get started.</p>
      </div>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.count}>{activeGroups.length} group{activeGroups.length !== 1 ? 's' : ''}</span>
        <Button variant="ghost" size="sm" icon={Trash2} onClick={handleClearAll}>
          Clear all
        </Button>
      </div>

      <div className={styles.list}>
        {activeGroups.map((group) => (
          <div key={group.url} className={styles.item}>
            <div className={styles.itemInfo}>
              <span className={styles.itemUrl} title={group.url}>
                {truncate(group.url.replace(/^https?:\/\/(www\.)?facebook\.com\/groups\//, ''), 35)}
              </span>
              {group.label && <span className={styles.itemLabel}>{group.label}</span>}
            </div>
            <div className={styles.itemActions}>
              <a
                href={group.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkButton}
                aria-label={`Open ${group.url}`}
              >
                <ExternalLink size={12} />
              </a>
              <button
                className={styles.removeButton}
                onClick={() => handleRemove(group.url)}
                aria-label={`Remove ${group.url}`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
