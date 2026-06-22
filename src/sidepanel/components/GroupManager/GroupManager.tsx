import React, { useEffect, useCallback } from 'react';
import { useGroupStore } from '../../store/groupStore';
import { GroupUrlInput } from './GroupUrlInput';
import { GroupListEditor } from './GroupListEditor';
import { SavedLists } from './SavedLists';
import { showToast } from '../shared/Toast';
import styles from './GroupManager.module.css';

export const GroupManager: React.FC = () => {
  const { isLoaded, loadFromStorage, addUrls } = useGroupStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const handleAdd = useCallback(
    (urls: string[]) => {
      const result = addUrls(urls);
      if (result.added > 0) {
        showToast('success', `Added ${result.added} group${result.added > 1 ? 's' : ''}.`);
      }
      if (result.invalid.length > 0) {
        showToast('error', `${result.invalid.length} invalid URL${result.invalid.length > 1 ? 's' : ''} skipped.`);
      }
      if (result.duplicates.length > 0) {
        showToast('warning', `${result.duplicates.length} duplicate${result.duplicates.length > 1 ? 's' : ''} skipped.`);
      }
      return result;
    },
    [addUrls],
  );

  if (!isLoaded) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.skeleton}>
          <div className="animate-shimmer" style={{ height: 80, borderRadius: 12 }} />
          <div className="animate-shimmer" style={{ height: 120, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <GroupUrlInput onAdd={handleAdd} />
      <GroupListEditor />
      <SavedLists />
    </div>
  );
};
