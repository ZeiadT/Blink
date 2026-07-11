import React, { useState, useCallback } from 'react';
import { Plus, Link, CheckCircle, XCircle } from 'lucide-react';
import { normalizeGroupIdentity } from '@shared/groupCatalog';
import { Button } from '../shared/Button';
import styles from './GroupUrlInput.module.css';

interface GroupUrlInputProps {
  onAdd: (
    urls: string[],
  ) => Promise<{ ok: boolean; added: number; invalid: string[]; duplicates: string[] }>;
}

interface ParsedUrl {
  raw: string;
  valid: boolean;
}

export const GroupUrlInput: React.FC<GroupUrlInputProps> = ({ onAdd }) => {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedUrl[]>([]);

  const parseInput = useCallback((value: string) => {
    setText(value);
    const lines = value
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    setParsed(lines.map((raw) => ({ raw, valid: normalizeGroupIdentity(raw).ok })));
  }, []);

  const handleAdd = useCallback(async () => {
    const validUrls = parsed.filter((p) => p.valid).map((p) => p.raw);
    if (validUrls.length === 0) return;
    const result = await onAdd(validUrls);
    if (result.ok) {
      setText('');
      setParsed([]);
    }
  }, [parsed, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        void handleAdd();
      }
    },
    [handleAdd],
  );

  const validCount = parsed.filter((p) => p.valid).length;
  const invalidCount = parsed.filter((p) => !p.valid).length;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>
          <Link size={14} />
          <span>Add group URLs or IDs</span>
        </div>
      </div>

      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => parseInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          'Paste Facebook group URLs or IDs, one per line:\nhttps://facebook.com/groups/example1\nexample-group-id'
        }
        rows={4}
        aria-label="Group URLs input"
        id="group-url-input"
      />

      {/* Validation summary */}
      {parsed.length > 0 && (
        <div className={styles.validationSummary}>
          {validCount > 0 && (
            <span className={styles.validBadge}>
              <CheckCircle size={12} /> {validCount} valid
            </span>
          )}
          {invalidCount > 0 && (
            <span className={styles.invalidBadge}>
              <XCircle size={12} /> {invalidCount} invalid
            </span>
          )}
        </div>
      )}

      {/* Per-URL validation feedback */}
      {parsed.length > 0 && (
        <div className={styles.urlList}>
          {parsed.map((p, i) => (
            <div
              key={i}
              className={`${styles.urlItem} ${p.valid ? styles.urlValid : styles.urlInvalid}`}
            >
              {p.valid ? <CheckCircle size={12} /> : <XCircle size={12} />}
              <span className={styles.urlText}>{p.raw}</span>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        icon={Plus}
        onClick={() => void handleAdd()}
        disabled={validCount === 0}
        fullWidth
      >
        Add {validCount > 0 ? `${validCount} group${validCount > 1 ? 's' : ''}` : 'groups'}
      </Button>
    </section>
  );
};
