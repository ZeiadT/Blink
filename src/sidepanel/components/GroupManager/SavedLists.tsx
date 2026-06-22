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
      <label className={styles.saveLabel} htmlFor="list-name-input">List name</label>
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
        Save list ({groupCount} groups)
      </Button>
    </div>
  );
};

export const SavedLists: React.FC = () => {
  const { activeGroups, savedLists, saveList, loadList, deleteList, renameList } = useGroupStore();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Stable close handler — won’t change between keystrokes
  const handleCloseModal = useCallback(() => setShowSaveModal(false), []);

  const handleSave = useCallback(
    (name: string) => {
      saveList(name);
      setShowSaveModal(false);
      showToast('success', `List "${name}" saved.`);
    },
    [saveList],
  );

  const handleLoad = useCallback(
    (listId: string, name: string) => {
      loadList(listId);
      showToast('info', `Loaded "${name}".`);
    },
    [loadList],
  );

  const handleDelete = useCallback(
    (listId: string, name: string) => {
      deleteList(listId);
      showToast('info', `Deleted "${name}".`);
    },
    [deleteList],
  );

  const handleStartRename = useCallback((listId: string, currentName: string) => {
    setEditingId(listId);
    setEditName(currentName);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingId && editName.trim()) {
      renameList(editingId, editName.trim());
      showToast('success', 'List renamed.');
    }
    setEditingId(null);
    setEditName('');
  }, [editingId, editName, renameList]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>
          <Bookmark size={14} />
          <span>Saved lists</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Save}
          onClick={() => setShowSaveModal(true)}
          disabled={activeGroups.length === 0}
        >
          Save current
        </Button>
      </div>

      {savedLists.length === 0 ? (
        <p className={styles.emptyText}>No saved lists yet.</p>
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
                    onBlur={handleFinishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename();
                      if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                    }}
                    autoFocus
                    aria-label="Rename list"
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
                  onClick={() => handleLoad(list.id, list.name)}
                  aria-label={`Load ${list.name}`}
                  title="Load list"
                >
                  <FolderOpen size={14} />
                </button>
                <button
                  className={styles.actionButton}
                  onClick={() => handleStartRename(list.id, list.name)}
                  aria-label={`Rename ${list.name}`}
                  title="Rename"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  className={`${styles.actionButton} ${styles.deleteButton}`}
                  onClick={() => handleDelete(list.id, list.name)}
                  aria-label={`Delete ${list.name}`}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Modal — onClose is stable; SaveForm owns its own name state */}
      <Modal isOpen={showSaveModal} onClose={handleCloseModal} title="Save group list">
        <SaveForm
          groupCount={activeGroups.length}
          onSave={handleSave}
          onCancel={handleCloseModal}
        />
      </Modal>
    </section>
  );
};
