import React, { useRef, useState, useCallback } from 'react';
import { Upload, Image, Video, X } from 'lucide-react';
import { usePostStore } from '../../store/postStore';
import { isValidMediaFile, getMediaType, fileToDataUrl } from '@shared/validators';
import { MEDIA_CONSTRAINTS } from '@shared/constants';
import { generateId, formatFileSize } from '@shared/utils';
import { showToast } from '../shared/Toast';
import type { MediaFile } from '@shared/types';
import styles from './MediaUploader.module.css';

export const MediaUploader: React.FC = () => {
  const { draft, addMedia, removeMedia } = usePostStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const acceptedTypes = [
    ...MEDIA_CONSTRAINTS.ACCEPTED_IMAGE_TYPES,
    ...MEDIA_CONSTRAINTS.ACCEPTED_VIDEO_TYPES,
  ].join(',');

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = MEDIA_CONSTRAINTS.MAX_MEDIA_FILES - draft.mediaFiles.length;

      if (fileArray.length > remaining) {
        showToast('warning', `Can only add ${remaining} more file(s). Max is ${MEDIA_CONSTRAINTS.MAX_MEDIA_FILES}.`);
      }

      const toProcess = fileArray.slice(0, remaining);

      for (const file of toProcess) {
        const validation = isValidMediaFile(file);
        if (!validation.valid) {
          showToast('error', validation.error!);
          continue;
        }

        const mediaType = getMediaType(file.type);
        if (!mediaType) continue;

        try {
          const dataUrl = await fileToDataUrl(file);
          const media: MediaFile = {
            id: generateId(),
            name: file.name,
            type: mediaType,
            mimeType: file.type,
            dataUrl,
            sizeBytes: file.size,
          };
          addMedia(media);
        } catch {
          showToast('error', `Failed to read file: ${file.name}`);
        }
      }
    },
    [draft.mediaFiles.length, addMedia],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
        e.target.value = ''; // Reset to allow re-selecting same file
      }
    },
    [processFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const atLimit = draft.mediaFiles.length >= MEDIA_CONSTRAINTS.MAX_MEDIA_FILES;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>
          <Image size={14} />
          <span>Media</span>
        </div>
        <span className={styles.counter}>
          {draft.mediaFiles.length} / {MEDIA_CONSTRAINTS.MAX_MEDIA_FILES}
        </span>
      </div>

      {/* Drop zone */}
      <div
        className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''} ${atLimit ? styles.dropZoneDisabled : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !atLimit && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload media files"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            !atLimit && fileInputRef.current?.click();
          }
        }}
      >
        <Upload size={20} className={styles.uploadIcon} />
        <span className={styles.dropText}>
          {atLimit ? 'Maximum files reached' : 'Drop files here or click to browse'}
        </span>
        <span className={styles.dropHint}>
          Images (jpg, png, gif, webp) and videos (mp4, webm) · Max 10MB each
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        multiple
        onChange={handleFileSelect}
        className={styles.fileInput}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Thumbnail grid */}
      {draft.mediaFiles.length > 0 && (
        <div className={styles.thumbnailGrid}>
          {draft.mediaFiles.map((file) => (
            <div key={file.id} className={styles.thumbnail}>
              {file.type === 'image' ? (
                <img
                  src={file.dataUrl}
                  alt={file.name}
                  className={styles.thumbnailImage}
                />
              ) : (
                <div className={styles.videoPlaceholder}>
                  <Video size={24} />
                </div>
              )}
              <div className={styles.thumbnailOverlay}>
                <span className={styles.thumbnailName}>{file.name}</span>
                <span className={styles.thumbnailSize}>{formatFileSize(file.sizeBytes)}</span>
              </div>
              <button
                className={styles.removeButton}
                onClick={(e) => {
                  e.stopPropagation();
                  removeMedia(file.id);
                }}
                aria-label={`Remove ${file.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
