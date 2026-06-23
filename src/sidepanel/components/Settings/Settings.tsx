import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw, RotateCcw, Info } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { DEFAULT_CAMPAIGN_SETTINGS } from '@shared/constants';
import { Button } from '../shared/Button';
import styles from './Settings.module.css';

export const Settings: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetDefaults = useSettingsStore((s) => s.resetDefaults);

  const [localMin, setLocalMin] = useState(settings.delayMinSeconds);
  const [localMax, setLocalMax] = useState(settings.delayMaxSeconds);
  const [localRetries, setLocalRetries] = useState(settings.maxRetries);

  // Sync local state when store changes (e.g., after reset)
  useEffect(() => {
    setLocalMin(settings.delayMinSeconds);
    setLocalMax(settings.delayMaxSeconds);
    setLocalRetries(settings.maxRetries);
  }, [settings.delayMinSeconds, settings.delayMaxSeconds, settings.maxRetries]);

  // Debounced persist
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSettings({
        delayMinSeconds: localMin,
        delayMaxSeconds: Math.max(localMin, localMax),
        maxRetries: localRetries,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [localMin, localMax, localRetries, updateSettings]);

  const minMaxError = localMin > localMax;

  return (
    <div className={styles.settings}>
      {/* ── Timing ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Clock size={16} className={styles.sectionIcon} />
          <h2 className={styles.sectionTitle}>Timing</h2>
        </div>
        <p className={styles.sectionDesc}>
          Random delay between each post to reduce detection risk.
        </p>
        <div className={styles.inputGroup}>
          <div className={styles.inputRow}>
            <label className={styles.label} htmlFor="blink-delay-min">Min delay (sec)</label>
            <input
              id="blink-delay-min"
              type="number"
              className={`${styles.input} ${minMaxError ? styles.inputError : ''}`}
              value={localMin}
              onChange={(e) => setLocalMin(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
            />
          </div>
          <div className={styles.inputRow}>
            <label className={styles.label} htmlFor="blink-delay-max">Max delay (sec)</label>
            <input
              id="blink-delay-max"
              type="number"
              className={`${styles.input} ${minMaxError ? styles.inputError : ''}`}
              value={localMax}
              onChange={(e) => setLocalMax(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
            />
          </div>
          {minMaxError && (
            <span className={styles.errorText}>Minimum must be ≤ maximum</span>
          )}
        </div>
      </section>

      {/* ── Retry Policy ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <RefreshCw size={16} className={styles.sectionIcon} />
          <h2 className={styles.sectionTitle}>Retry Policy</h2>
        </div>
        <p className={styles.sectionDesc}>
          How many times to retry a failed post before giving up.
        </p>
        <div className={styles.inputRow}>
          <label className={styles.label} htmlFor="blink-retries">Max retries</label>
          <input
            id="blink-retries"
            type="number"
            className={styles.input}
            value={localRetries}
            onChange={(e) => setLocalRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
            min={0}
            max={10}
          />
        </div>
      </section>

      {/* ── About ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Info size={16} className={styles.sectionIcon} />
          <h2 className={styles.sectionTitle}>About</h2>
        </div>
        <p className={styles.sectionDesc}>
          Blink v1.0.0 — Multi-group poster for Facebook.
          Uses your authenticated browser session. No data leaves your machine.
        </p>
      </section>

      {/* ── Footer ── */}
      <div className={styles.footer}>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={resetDefaults}>
          Reset to Defaults
        </Button>
        <span className={styles.defaults}>
          Defaults: {DEFAULT_CAMPAIGN_SETTINGS.delayMinSeconds}–{DEFAULT_CAMPAIGN_SETTINGS.delayMaxSeconds}s, {DEFAULT_CAMPAIGN_SETTINGS.maxRetries} retries
        </span>
      </div>
    </div>
  );
};
