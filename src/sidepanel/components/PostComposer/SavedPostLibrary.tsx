import React, { useCallback, useState } from 'react';
import { Copy, FilePlus2, Files, Pencil, Trash2 } from 'lucide-react';
import type { CampaignDraft, MediaFile, SavedPost, SavedPostInput } from '@shared/types';
import { cloneMediaFiles, hasPostContent, isDraftEquivalentToSavedPost } from '@shared/postLibrary';
import { SAVED_POST_CONSTRAINTS } from '@shared/constants';
import { usePostStore, type PostStoreResult } from '../../store/postStore';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { showToast } from '../shared/Toast';
import { MediaUploader } from './MediaUploader';
import styles from './SavedPostLibrary.module.css';

type EditorRequest =
  | { mode: 'create'; input: SavedPostInput }
  | { mode: 'edit'; post: SavedPost };

const UPDATED_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const SavedPostLibrary: React.FC = () => {
  const savedPosts = usePostStore((state) => state.savedPosts);
  const draft = usePostStore((state) => state.draft);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [pendingUse, setPendingUse] = useState<SavedPost | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedPost | null>(null);

  const openCreate = useCallback(() => {
    setEditor({
      mode: 'create',
      input: {
        title: '',
        text: draft.text,
        mediaFiles: cloneMediaFiles(draft.mediaFiles),
      },
    });
  }, [draft.mediaFiles, draft.text]);

  const usePost = useCallback(async (post: SavedPost) => {
    const result = await usePostStore.getState().loadSavedPost(post.id);
    if (result.ok) {
      showToast('success', `Loaded “${post.title}” into campaign draft.`);
    } else {
      showToast('error', result.error);
    }
  }, []);

  const requestUse = useCallback(
    (post: SavedPost) => {
      const wouldReplaceContent = hasPostContent(draft) && !isDraftEquivalentToSavedPost(draft, post);
      if (wouldReplaceContent) {
        setPendingUse(post);
        return;
      }
      void usePost(post);
    },
    [draft, usePost],
  );

  const handleDuplicate = useCallback(async (post: SavedPost) => {
    const result = await usePostStore.getState().duplicateSavedPost(post.id);
    showToast(result.ok ? 'success' : 'error', result.ok ? 'Saved post duplicated.' : result.error);
  }, []);

  const handleDelete = useCallback(async (post: SavedPost) => {
    const result = await usePostStore.getState().deleteSavedPost(post.id);
    if (result.ok) {
      showToast('info', 'Saved post deleted. Current campaign draft was kept.');
      setPendingDelete(null);
    } else {
      showToast('error', result.error);
    }
  }, []);

  const handleSave = useCallback(
    async (input: SavedPostInput): Promise<PostStoreResult> => {
      if (!editor) return { ok: false, error: 'Saved post editor is closed.' };
      const result =
        editor.mode === 'create'
          ? await usePostStore.getState().createSavedPost(input)
          : await usePostStore.getState().updateSavedPost(editor.post.id, input);
      if (result.ok) {
        showToast('success', editor.mode === 'create' ? 'Saved post created.' : 'Saved post updated.');
        setEditor(null);
      }
      return result;
    },
    [editor],
  );

  return (
    <section className={styles.library} aria-label="Saved posts">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Reusable posts</span>
          <p className={styles.description}>Load a copy. Campaign edits stay separate.</p>
        </div>
        <Button variant="secondary" size="sm" icon={FilePlus2} onClick={openCreate}>
          Save as reusable
        </Button>
      </div>

      {savedPosts.length === 0 ? (
        <div className={styles.empty}>
          <Files size={24} aria-hidden="true" />
          <div>
            <strong>No saved posts</strong>
            <p>Save current campaign draft for reuse across future campaigns.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={openCreate}>
            Create first post
          </Button>
        </div>
      ) : (
        <div className={styles.list} role="region" aria-label="Saved post list" tabIndex={0}>
          {savedPosts.map((post) => (
            <SavedPostCard
              key={post.id}
              post={post}
              isLoaded={draft.sourceSavedPostId === post.id}
              onUse={requestUse}
              onEdit={setEditor}
              onDuplicate={handleDuplicate}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      {editor && (
        <SavedPostEditorModal
          key={editor.mode === 'create' ? 'new' : editor.post.id}
          title={editor.mode === 'create' ? 'Save reusable post' : 'Edit reusable post'}
          initial={editor.mode === 'create' ? editor.input : editor.post}
          onClose={() => setEditor(null)}
          onSave={handleSave}
        />
      )}

      {pendingUse && (
        <Modal isOpen onClose={() => setPendingUse(null)} title="Replace campaign draft?">
          <div className={styles.confirmation}>
            <p>
              Current campaign text and media will be replaced with a copy of “{pendingUse.title}”.
              Reusable post will not change.
            </p>
            <div className={styles.confirmActions}>
              <Button variant="ghost" size="sm" onClick={() => setPendingUse(null)}>Keep current</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  void usePost(pendingUse);
                  setPendingUse(null);
                }}
              >
                Replace draft
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <Modal isOpen onClose={() => setPendingDelete(null)} title="Delete saved post?">
          <div className={styles.confirmation}>
            <p>Delete “{pendingDelete.title}”? This cannot be undone.</p>
            <div className={styles.confirmActions}>
              <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={() => void handleDelete(pendingDelete)}>
                Delete post
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};

interface SavedPostCardProps {
  post: SavedPost;
  isLoaded: boolean;
  onUse: (post: SavedPost) => void;
  onEdit: (request: EditorRequest) => void;
  onDuplicate: (post: SavedPost) => void;
  onDelete: (post: SavedPost) => void;
}

const SavedPostCard: React.FC<SavedPostCardProps> = ({
  post,
  isLoaded,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const mediaLabel = post.mediaFiles.length
    ? `${post.mediaFiles.length} media file${post.mediaFiles.length === 1 ? '' : 's'}`
    : 'Text only';

  return (
    <article className={`${styles.card} ${isLoaded ? styles.cardLoaded : ''}`}>
      <div className={styles.cardTopline}>
        <h3>{post.title}</h3>
        {isLoaded && <span className={styles.loadedBadge}>Loaded copy</span>}
      </div>
      <p className={styles.excerpt}>{post.text || 'Media-only post'}</p>
      <div className={styles.meta}>
        <span>{mediaLabel}</span>
        <span>{UPDATED_FORMATTER.format(post.updatedAt)}</span>
      </div>
      <div className={styles.cardActions}>
        <Button variant="primary" size="sm" onClick={() => onUse(post)}>Use</Button>
        <button className={styles.iconAction} onClick={() => onEdit({ mode: 'edit', post })} aria-label={`Edit ${post.title}`}>
          <Pencil size={14} />
        </button>
        <button className={styles.iconAction} onClick={() => onDuplicate(post)} aria-label={`Duplicate ${post.title}`}>
          <Copy size={14} />
        </button>
        <button className={`${styles.iconAction} ${styles.deleteAction}`} onClick={() => onDelete(post)} aria-label={`Delete ${post.title}`}>
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
};

interface SavedPostEditorModalProps {
  title: string;
  initial: SavedPostInput;
  onClose: () => void;
  onSave: (input: SavedPostInput) => Promise<PostStoreResult>;
}

const SavedPostEditorModal: React.FC<SavedPostEditorModalProps> = ({ title, initial, onClose, onSave }) => {
  const [postTitle, setPostTitle] = useState(initial.title);
  const [text, setText] = useState(initial.text);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>(() => cloneMediaFiles(initial.mediaFiles));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    const result = await onSave({ title: postTitle, text, mediaFiles });
    if (!result.ok) setError(result.error);
    setIsSaving(false);
  }, [mediaFiles, onSave, postTitle, text]);

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className={styles.editor}>
        <label className={styles.field}>
          <span>Post title</span>
          <input
            value={postTitle}
            onChange={(event) => setPostTitle(event.target.value)}
            maxLength={SAVED_POST_CONSTRAINTS.MAX_TITLE_LENGTH}
            placeholder="e.g. Friday product update"
            aria-label="Saved post title"
            autoFocus
          />
        </label>
        <label className={styles.field}>
          <span>Post content</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write reusable post content"
            aria-label="Saved post content"
            rows={6}
          />
        </label>
        <MediaUploader
          mediaFiles={mediaFiles}
          onAdd={(file) => setMediaFiles((current) => [...current, file])}
          onRemove={(fileId) => setMediaFiles((current) => current.filter((file) => file.id !== fileId))}
          label="Upload reusable post media"
        />
        {error && <p className={styles.editorError} role="alert">{error}</p>}
        <div className={styles.editorActions}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => void handleSave()} loading={isSaving}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};
