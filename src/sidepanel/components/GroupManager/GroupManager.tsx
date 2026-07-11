import React, { useEffect, useCallback } from 'react';
import { useGroupStore } from '../../store/groupStore';
import { GroupUrlInput } from './GroupUrlInput';
import { GroupListEditor } from './GroupListEditor';
import { SavedLists } from './SavedLists';
import { GroupImportPanel } from './GroupImportPanel';
import { showToast } from '../shared/Toast';
import styles from './GroupManager.module.css';

export const GroupManager: React.FC = () => {
  const isLoaded = useGroupStore((state) => state.isLoaded);
  const catalogError = useGroupStore((state) => state.catalogError);
  const hydrateCatalog = useGroupStore((state) => state.hydrateCatalog);
  const addEntries = useGroupStore((state) => state.addEntries);

  useEffect(() => {
    if (isLoaded) return;
    void hydrateCatalog();
  }, [hydrateCatalog, isLoaded]);

  const handleAdd = useCallback(
    async (urls: string[]) => {
      const result = await addEntries(urls);
      if (!result.ok) {
        showToast('error', result.error ?? 'Could not save groups.');
        return result;
      }
      if (result.added > 0) {
        showToast('success', `Added ${result.added} group${result.added > 1 ? 's' : ''}.`);
      }
      if (result.invalid.length > 0) {
        showToast(
          'error',
          `${result.invalid.length} invalid URL${result.invalid.length > 1 ? 's' : ''} skipped.`,
        );
      }
      if (result.duplicates.length > 0) {
        showToast(
          'warning',
          `${result.duplicates.length} duplicate${result.duplicates.length > 1 ? 's' : ''} skipped.`,
        );
      }
      return result;
    },
    [addEntries],
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
      {catalogError && (
        <p className={styles.error} role="alert">
          {catalogError}
        </p>
      )}
      <GroupUrlInput onAdd={handleAdd} />
      <GroupImportPanel />
      <GroupListEditor />
      <SavedLists />
    </div>
  );
};
