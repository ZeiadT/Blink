import React, { useCallback, useEffect, useRef } from 'react';
import { Trash2, Type } from 'lucide-react';
import { usePostStore } from '../../store/postStore';
import { MediaUploader } from './MediaUploader';
import { PostPreview } from './PostPreview';
import { SavedPostLibrary } from './SavedPostLibrary';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import styles from './PostComposer.module.css';

export const PostComposer: React.FC = () => {
  const draft = usePostStore((state) => state.draft);
  const isLoaded = usePostStore((state) => state.isLoaded);
  const error = usePostStore((state) => state.error);
  const setText = usePostStore((state) => state.setText);
  const addMedia = usePostStore((state) => state.addMedia);
  const removeMedia = usePostStore((state) => state.removeMedia);
  const clearDraft = usePostStore((state) => state.clearDraft);
  const loadDraft = usePostStore((state) => state.loadDraft);
  const clearError = usePostStore((state) => state.clearError);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isLoaded) void loadDraft();
  }, [isLoaded, loadDraft]);

  const adjustHeight = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, draft.text]);

  const handleClear = useCallback(() => {
    clearDraft();
    showToast('info', 'Campaign draft cleared. Saved posts were kept.');
  }, [clearDraft]);

  if (!isLoaded) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.loadingSkeleton}>
          <div className={`${styles.skeletonBlock} animate-shimmer`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonSmall} animate-shimmer`} />
        </div>
      </div>
    );
  }

  const hasContent = draft.text.trim().length > 0 || draft.mediaFiles.length > 0;

  return (
    <div className={styles.wrapper}>
      <SavedPostLibrary />

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss post storage error">Dismiss</button>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>
            <Type size={14} />
            <span>Campaign content</span>
          </div>
          <span className={styles.charCount}>{draft.text.length.toLocaleString()}</span>
        </div>
        <textarea
          ref={textareaRef}
          id="post-text-input"
          className={styles.textarea}
          value={draft.text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What do you want to share with your groups?"
          rows={5}
          aria-label="Post text content"
        />
      </section>

      <MediaUploader
        mediaFiles={draft.mediaFiles}
        onAdd={addMedia}
        onRemove={removeMedia}
      />

      <div className={styles.actions}>
        <Button variant="ghost" size="sm" icon={Trash2} onClick={handleClear} disabled={!hasContent}>
          Clear campaign draft
        </Button>
      </div>

      {hasContent && <PostPreview draft={draft} />}

      <p className={styles.disclaimer}>
        Automated posting may violate platform terms of service. Use responsibly.
      </p>
    </div>
  );
};
