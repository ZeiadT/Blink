import React, { useCallback, useRef, useState } from 'react';
import { FileUp, Upload, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useGroupStore } from '../../store/groupStore';
import { formatFileSize } from '@shared/utils';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { showToast } from '../shared/Toast';
import styles from './GroupImportPanel.module.css';

type IssueFilter = 'all' | 'issues';

export const GroupImportPanel: React.FC = () => {
  const preview = useGroupStore((state) => state.importPreview);
  const isPersisting = useGroupStore((state) => state.isPersisting);
  const isPreviewing = useGroupStore((state) => state.isPreviewingImport);
  const previewImport = useGroupStore((state) => state.previewImport);
  const confirmImport = useGroupStore((state) => state.confirmImport);
  const cancelImport = useGroupStore((state) => state.cancelImport);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState<IssueFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const result = await previewImport(file);
      if (!result.ok) showToast('error', result.error ?? 'Could not preview this import.');
      setFilter('all');
    },
    [previewImport],
  );

  const close = useCallback(() => {
    cancelImport();
    setIsOpen(false);
  }, [cancelImport]);

  const handleConfirm = useCallback(async () => {
    if (!preview) return;
    const result = await confirmImport(preview.id);
    if (result.ok) {
      showToast('success', `Imported ${result.added ?? 0} group${result.added === 1 ? '' : 's'}.`);
      setIsOpen(false);
    } else {
      showToast('error', result.error ?? 'Could not import groups.');
    }
  }, [confirmImport, preview]);

  const visibleRows =
    preview?.rows.filter((row) => filter === 'all' || row.status !== 'valid') ?? [];
  const isPending = isPreviewing || isPersisting;

  return (
    <section className={styles.section} aria-label="Import groups">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Catalog intake</p>
          <p className={styles.copy}>
            Bring in CSV or TXT files, review every issue, then save once.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={FileUp} onClick={() => setIsOpen(true)}>
          Import groups
        </Button>
      </div>

      <Modal isOpen={isOpen} onClose={close} title="Import groups">
        <div className={styles.modalBody}>
          <input
            ref={inputRef}
            className={styles.fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            aria-label="Choose group import file"
            onChange={(event) => {
              const [file] = event.target.files ?? [];
              event.target.value = '';
              void loadFile(file);
            }}
          />
          <div
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void loadFile(event.dataTransfer.files[0]);
            }}
          >
            <Upload size={22} />
            <strong>Drop a CSV or TXT file here</strong>
            <span>UTF-8 · up to 1 MiB · 2,000 non-empty rows</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
            >
              Choose file
            </Button>
          </div>

          {preview && (
            <div className={styles.preview}>
              <div className={styles.fileMeta}>
                <div>
                  <strong>{preview.fileName}</strong>
                  <span>
                    {formatFileSize(preview.sizeBytes)} · {preview.format.toUpperCase()} ·{' '}
                    {preview.separator}-separated
                  </span>
                </div>
                <button
                  className={styles.clearFile}
                  onClick={cancelImport}
                  aria-label="Clear import preview"
                >
                  <X size={15} />
                </button>
              </div>

              <div className={styles.summary} role="status" aria-live="polite">
                <span>
                  <CheckCircle2 size={14} /> {preview.validCount} ready
                </span>
                <span>
                  <AlertTriangle size={14} /> {preview.duplicateCount} duplicate
                </span>
                <span>
                  <AlertTriangle size={14} /> {preview.invalidCount} invalid
                </span>
                <span>{preview.totalCount} total</span>
              </div>

              <div className={styles.previewTools}>
                <span>Rows</span>
                <div className={styles.filters} aria-label="Import row filter">
                  <button
                    className={filter === 'all' ? styles.activeFilter : ''}
                    onClick={() => setFilter('all')}
                    aria-pressed={filter === 'all'}
                  >
                    All
                  </button>
                  <button
                    className={filter === 'issues' ? styles.activeFilter : ''}
                    onClick={() => setFilter('issues')}
                    aria-pressed={filter === 'issues'}
                  >
                    Issues
                  </button>
                </div>
              </div>

              <div className={styles.rows} aria-label="Import preview rows">
                {visibleRows.map((row) => (
                  <div key={row.sourceRow} className={`${styles.row} ${styles[row.status]}`}>
                    <span className={styles.rowNumber}>{row.sourceRow}</span>
                    <div className={styles.rowDetail}>
                      <strong>{(row.candidate?.name ?? row.identity) || 'Blank identity'}</strong>
                      <span>{row.reason ?? row.candidate?.groupId ?? row.identity}</span>
                    </div>
                    <span className={styles.rowStatus}>{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className={styles.permissionNote}>
            Blink imports group references only. It does not join groups or bypass Facebook
            membership or posting permissions.
          </p>

          <div className={styles.actions}>
            <Button variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirm()}
              disabled={!preview || preview.validCount === 0 || isPending}
              loading={isPersisting}
            >
              Import {preview?.validCount ?? 0} group{preview?.validCount === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
};
