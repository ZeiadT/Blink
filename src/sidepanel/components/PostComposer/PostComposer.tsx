import React, { useEffect, useRef, useCallback } from 'react';
import { Trash2, Save, Type } from 'lucide-react';
import { usePostStore } from '../../store/postStore';
import { MediaUploader } from './MediaUploader';
import { PostPreview } from './PostPreview';
import { Button } from '../shared/Button';
import { showToast } from '../shared/Toast';
import styles from './PostComposer.module.css';

export const PostComposer: React.FC = () => {
  const { draft, isDirty, isLoaded, setText, clearDraft, loadDraft, saveDraft } = usePostStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load draft from storage on mount
  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [draft.text, adjustHeight]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
    },
    [setText],
  );

  const handleClear = useCallback(() => {
    clearDraft();
    showToast('info', 'Draft cleared.');
  }, [clearDraft]);

  const handleSave = useCallback(() => {
    saveDraft();
    showToast('success', 'Draft saved.');
  }, [saveDraft]);

  const charCount = draft.text.length;
  const hasContent = draft.text.trim().length > 0 || draft.mediaFiles.length > 0;

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

  return (
    <div className={styles.wrapper}>
      {/* ── Text Input Section ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>
            <Type size={14} />
            <span>Post content</span>
          </div>
          <span className={styles.charCount}>{charCount.toLocaleString()}</span>
        </div>
        <textarea
          ref={textareaRef}
          id="post-text-input"
          className={styles.textarea}
          value={draft.text}
          onChange={handleTextChange}
          placeholder="What do you want to share with your groups?"
          rows={5}
          aria-label="Post text content"
        />
      </section>

      {/* ── Media Upload Section ── */}
      <MediaUploader />

      {/* ── Actions ── */}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          onClick={handleClear}
          disabled={!hasContent}
        >
          Clear
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={Save}
          onClick={handleSave}
          disabled={!isDirty}
        >
          Save draft
        </Button>
      </div>

      {/* ── Preview ── */}
      {hasContent && <PostPreview draft={draft} />}

      {/* ── Disclaimer ── */}
      <p className={styles.disclaimer}>
        Automated posting may violate platform terms of service. Use responsibly.
      </p>
    </div>
  );
};
