import React, { useCallback, useState } from 'react';
import { X, Trash2, Users, ExternalLink, Pencil } from 'lucide-react';
import { useGroupStore } from '../../store/groupStore';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import { truncate } from '@shared/utils';
import styles from './GroupListEditor.module.css';

export const GroupListEditor: React.FC = () => {
  const activeGroups = useGroupStore((state) => state.activeGroups);
  const isPersisting = useGroupStore((state) => state.isPersisting);
  const removeGroup = useGroupStore((state) => state.removeGroup);
  const clearAll = useGroupStore((state) => state.clearAll);
  const renameGroup = useGroupStore((state) => state.renameGroup);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const handleRemove = useCallback(
    async (groupId: string) => {
      const result = await removeGroup(groupId);
      showToast(
        result.ok ? 'info' : 'error',
        result.ok ? 'Group removed.' : (result.error ?? 'Could not remove group.'),
      );
    },
    [removeGroup],
  );

  const handleClearAll = useCallback(async () => {
    const result = await clearAll();
    showToast(
      result.ok ? 'info' : 'error',
      result.ok ? 'All groups cleared.' : (result.error ?? 'Could not clear groups.'),
    );
  }, [clearAll]);

  const beginRename = useCallback((groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setName(currentName);
  }, []);

  const finishRename = useCallback(async () => {
    if (!editingGroupId) return;
    const result = await renameGroup(editingGroupId, name);
    if (!result.ok) showToast('error', result.error ?? 'Could not update group name.');
    setEditingGroupId(null);
    setName('');
  }, [editingGroupId, name, renameGroup]);

  if (activeGroups.length === 0) {
    return (
      <div className={styles.empty}>
        <Users size={32} className={styles.emptyIcon} />
        <p className={styles.emptyText}>No groups added yet</p>
        <p className={styles.emptyHint}>Paste a Facebook group URL or ID above to get started.</p>
      </div>
    );
  }

  return (
    <section className={styles.section} aria-label="Active groups">
      <div className={styles.sectionHeader}>
        <span className={styles.count}>
          {activeGroups.length} group{activeGroups.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          onClick={() => void handleClearAll()}
          disabled={isPersisting}
        >
          Clear all
        </Button>
      </div>

      <div className={styles.list}>
        {activeGroups.map((group) => (
          <div key={group.groupId} className={styles.item}>
            <div className={styles.itemInfo}>
              {editingGroupId === group.groupId ? (
                <input
                  className={styles.nameInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => void finishRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void finishRename();
                    if (event.key === 'Escape') {
                      setEditingGroupId(null);
                      setName('');
                    }
                  }}
                  aria-label={`Name for ${group.groupId}`}
                  autoFocus
                />
              ) : (
                <span className={styles.itemName} title={group.name}>
                  {group.name}
                </span>
              )}
              <span className={styles.itemUrl} title={group.url}>
                {truncate(group.groupId, 35)}
              </span>
            </div>
            <div className={styles.itemActions}>
              <a
                href={group.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkButton}
                aria-label={`Open ${group.name}`}
              >
                <ExternalLink size={12} />
              </a>
              <button
                className={styles.editButton}
                onClick={() => beginRename(group.groupId, group.name)}
                aria-label={`Edit name for ${group.name}`}
                disabled={isPersisting}
              >
                <Pencil size={13} />
              </button>
              <button
                className={styles.removeButton}
                onClick={() => void handleRemove(group.groupId)}
                aria-label={`Remove ${group.name}`}
                disabled={isPersisting}
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
