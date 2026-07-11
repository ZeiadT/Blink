import React, { useCallback, useRef, useState } from 'react';
import { Image, Upload, Video, X } from 'lucide-react';
import { getMediaType, isValidMediaFile, fileToDataUrl } from '@shared/validators';
import { MEDIA_CONSTRAINTS } from '@shared/constants';
import { formatFileSize, generateId } from '@shared/utils';
import { showToast } from '../shared/Toast';
import type { MediaFile } from '@shared/types';
import styles from './MediaUploader.module.css';

interface MediaUploaderProps {
  mediaFiles: MediaFile[];
  onAdd: (file: MediaFile) => void;
  onRemove: (fileId: string) => void;
  label?: string;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  mediaFiles,
  onAdd,
  onRemove,
  label = 'Upload media files',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const acceptedTypes = [
    ...MEDIA_CONSTRAINTS.ACCEPTED_IMAGE_TYPES,
    ...MEDIA_CONSTRAINTS.ACCEPTED_VIDEO_TYPES,
  ].join(',');

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = MEDIA_CONSTRAINTS.MAX_MEDIA_FILES - mediaFiles.length;

      if (fileArray.length > remaining) {
        showToast(
          'warning',
          `Can only add ${remaining} more file(s). Max is ${MEDIA_CONSTRAINTS.MAX_MEDIA_FILES}.`,
        );
      }

      for (const file of fileArray.slice(0, remaining)) {
        const validation = isValidMediaFile(file);
        if (!validation.valid) {
          showToast('error', validation.error!);
          continue;
        }

        const mediaType = getMediaType(file.type);
        if (!mediaType) continue;

        try {
          const dataUrl = await fileToDataUrl(file);
          onAdd({
            id: generateId(),
            name: file.name,
            type: mediaType,
            mimeType: file.type,
            dataUrl,
            sizeBytes: file.size,
          });
        } catch {
          showToast('error', `Failed to read file: ${file.name}`);
        }
      }
    },
    [mediaFiles.length, onAdd],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files?.length) {
        void processFiles(event.target.files);
        event.target.value = '';
      }
    },
    [processFiles],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);
      if (event.dataTransfer.files.length) void processFiles(event.dataTransfer.files);
    },
    [processFiles],
  );

  const atLimit = mediaFiles.length >= MEDIA_CONSTRAINTS.MAX_MEDIA_FILES;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>
          <Image size={14} />
          <span>Media</span>
        </div>
        <span className={styles.counter}>
          {mediaFiles.length} / {MEDIA_CONSTRAINTS.MAX_MEDIA_FILES}
        </span>
      </div>

      <div
        className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''} ${atLimit ? styles.dropZoneDisabled : ''}`}
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !atLimit && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!atLimit) fileInputRef.current?.click();
          }
        }}
      >
        <Upload size={20} className={styles.uploadIcon} />
        <span className={styles.dropText}>
          {atLimit ? 'Maximum files reached' : 'Drop files here or click to browse'}
        </span>
        <span className={styles.dropHint}>
          Images (jpg, png, gif, webp) and videos (mp4, webm) Â· Max 10MB each
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

      {mediaFiles.length > 0 && (
        <div className={styles.thumbnailGrid}>
          {mediaFiles.map((file) => (
            <div key={file.id} className={styles.thumbnail}>
              {file.type === 'image' ? (
                <img src={file.dataUrl} alt={file.name} className={styles.thumbnailImage} />
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
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(file.id);
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
