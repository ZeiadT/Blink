import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Bookmark, FolderOpen, Trash2, Edit3, Save } from 'lucide-react';
import { useGroupStore } from '../../store/groupStore';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { showToast } from '../shared/Toast';
import styles from './SavedLists.module.css';

// ── Isolated save-form: typing only re-renders this component, not SavedLists ──
interface SaveFormProps {
  groupCount: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}

const SaveForm: React.FC<SaveFormProps> = ({ groupCount, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus once on mount — stable, never re-fires
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }, [name, onSave]);

  return (
    <div className={styles.saveForm}>
      <label className={styles.saveLabel} htmlFor="list-name-input">
        Collection name
      </label>
      <input
        ref={inputRef}
        id="list-name-input"
        className={styles.saveInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="e.g. Marketing Groups"
      />
      <Button variant="primary" onClick={handleSubmit} disabled={!name.trim()} fullWidth>
        Save collection ({groupCount} groups)
      </Button>
    </div>
  );
};

export const SavedLists: React.FC = () => {
  const activeGroups = useGroupStore((state) => state.activeGroups);
  const savedLists = useGroupStore((state) => state.savedLists);
  const isPersisting = useGroupStore((state) => state.isPersisting);
  const saveList = useGroupStore((state) => state.saveList);
  const loadList = useGroupStore((state) => state.loadList);
  const deleteList = useGroupStore((state) => state.deleteList);
  const renameList = useGroupStore((state) => state.renameList);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  // Stable close handler — won’t change between keystrokes
  const handleCloseModal = useCallback(() => setShowSaveModal(false), []);

  const handleSave = useCallback(
    async (name: string) => {
      const result = await saveList(name);
      if (result.ok) {
        setShowSaveModal(false);
        showToast('success', `Collection "${name}" saved.`);
      } else {
        showToast('error', result.error ?? 'Could not save list.');
      }
    },
    [saveList],
  );

  const handleLoad = useCallback(
    async (listId: string, name: string) => {
      const result = await loadList(listId);
      showToast(
        result.ok ? 'info' : 'error',
        result.ok ? `Loaded "${name}".` : (result.error ?? 'Could not load collection.'),
      );
    },
    [loadList],
  );

  const handleDelete = useCallback(
    async (listId: string, name: string) => {
      const result = await deleteList(listId);
      showToast(
        result.ok ? 'info' : 'error',
        result.ok ? `Deleted "${name}".` : (result.error ?? 'Could not delete collection.'),
      );
      if (result.ok) setPendingDelete(null);
    },
    [deleteList],
  );

  const handleStartRename = useCallback((listId: string, currentName: string) => {
    setEditingId(listId);
    setEditName(currentName);
  }, []);

  const handleFinishRename = useCallback(async () => {
    if (editingId && editName.trim()) {
      const result = await renameList(editingId, editName.trim());
      showToast(
        result.ok ? 'success' : 'error',
        result.ok ? 'Collection renamed.' : (result.error ?? 'Could not rename collection.'),
      );
    }
    setEditingId(null);
    setEditName('');
  }, [editingId, editName, renameList]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>
          <Bookmark size={14} />
          <span>Group collections</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Save}
          onClick={() => setShowSaveModal(true)}
          disabled={activeGroups.length === 0 || isPersisting}
        >
          Save current
        </Button>
      </div>

      {savedLists.length === 0 ? (
        <p className={styles.emptyText}>No group collections yet. Add groups, then save your first collection.</p>
      ) : (
        <div className={styles.list}>
          {savedLists.map((list) => (
            <div key={list.id} className={styles.item}>
              <div className={styles.itemInfo}>
                {editingId === list.id ? (
                  <input
                    className={styles.renameInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => void handleFinishRename()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleFinishRename();
                      if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditName('');
                      }
                    }}
                    autoFocus
                    aria-label="Rename collection"
                  />
                ) : (
                  <span className={styles.itemName}>{list.name}</span>
                )}
                <span className={styles.itemMeta}>
                  {list.groups.length} group{list.groups.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className={styles.itemActions}>
                <button
                  className={styles.actionButton}
                  onClick={() => void handleLoad(list.id, list.name)}
                  disabled={isPersisting}
                  aria-label={`Load ${list.name}`}
                  title="Load collection"
                >
                  <FolderOpen size={14} />
                </button>
                <button
                  className={styles.actionButton}
                  onClick={() => handleStartRename(list.id, list.name)}
                  aria-label={`Rename ${list.name}`}
                  title="Rename"
                  disabled={isPersisting}
                >
                  <Edit3 size={14} />
                </button>
                <button
                  className={`${styles.actionButton} ${styles.deleteButton}`}
                  onClick={() => setPendingDelete({ id: list.id, name: list.name })}
                  aria-label={`Delete ${list.name}`}
                  title="Delete"
                  disabled={isPersisting}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Modal — onClose is stable; SaveForm owns its own name state */}
      <Modal isOpen={showSaveModal} onClose={handleCloseModal} title="Save group collection">
        <SaveForm
          groupCount={activeGroups.length}
          onSave={handleSave}
          onCancel={handleCloseModal}
        />
      </Modal>
      {pendingDelete ? (
        <Modal
          isOpen
          onClose={() => setPendingDelete(null)}
          title="Delete group collection?"
        >
          <div className={styles.saveForm}>
            <p>Delete “{pendingDelete.name}”? Running and completed campaigns stay unchanged.</p>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} fullWidth>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => void handleDelete(pendingDelete.id, pendingDelete.name)}
              disabled={isPersisting}
              fullWidth
            >
              Delete collection
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
};
