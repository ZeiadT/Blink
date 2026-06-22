import React, { useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  // Focus the modal container only when it first opens
  useEffect(() => {
    if (isOpen) {
      contentRef.current?.focus();
    }
  }, [isOpen]);

  // Keyboard listener — separate so re-creating handleKeyDown doesn't re-focus
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        ref={contentRef}
        className={styles.content}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
};
