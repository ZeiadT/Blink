import React from 'react';
import { Eye, User } from 'lucide-react';
import type { PostDraft } from '@shared/types';
import styles from './PostPreview.module.css';

interface PostPreviewProps {
  draft: PostDraft;
}

export const PostPreview: React.FC<PostPreviewProps> = ({ draft }) => {
  const imageFiles = draft.mediaFiles.filter((f) => f.type === 'image');
  const videoFiles = draft.mediaFiles.filter((f) => f.type === 'video');
  const hasText = draft.text.trim().length > 0;
  const hasMedia = draft.mediaFiles.length > 0;

  if (!hasText && !hasMedia) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>
          <Eye size={14} />
          <span>Preview</span>
        </div>
      </div>

      <div className={styles.card}>
        {/* Simulated user header */}
        <div className={styles.userHeader}>
          <div className={styles.avatar}>
            <User size={16} />
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>You</span>
            <span className={styles.postMeta}>Just now · Public</span>
          </div>
        </div>

        {/* Post text */}
        {hasText && (
          <div className={styles.textContent}>
            {draft.text.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Image grid */}
        {imageFiles.length > 0 && (
          <div
            className={styles.mediaGrid}
            data-count={Math.min(imageFiles.length, 5)}
          >
            {imageFiles.slice(0, 5).map((file, i) => (
              <div key={file.id} className={styles.mediaItem}>
                <img src={file.dataUrl} alt={file.name} />
                {i === 4 && imageFiles.length > 5 && (
                  <div className={styles.moreOverlay}>
                    +{imageFiles.length - 5}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Video indicators */}
        {videoFiles.length > 0 && (
          <div className={styles.videoList}>
            {videoFiles.map((file) => (
              <div key={file.id} className={styles.videoItem}>
                <div className={styles.videoPlay}>▶</div>
                <span className={styles.videoName}>{file.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
