import React, { useCallback, useMemo } from 'react';
import { Clock, Loader2, Minus, Plus, RefreshCw, RotateCcw, Info } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { DEFAULT_CAMPAIGN_SETTINGS } from '@shared/constants';
import {
  canAdjustDelay,
  DELAY_POLICY,
  type DelayDirection,
  type DelayEndpoint,
  type DelayRange,
} from '@shared/timingPolicy';
import { Button } from '../shared/Button';
import { HoldRepeatButton } from './HoldRepeatButton';
import styles from './Settings.module.css';

interface DelayStepperProps {
  endpoint: DelayEndpoint;
  label: string;
  range: DelayRange;
  disabled: boolean;
  onAdjust: (endpoint: DelayEndpoint, direction: DelayDirection) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

const DelayStepper: React.FC<DelayStepperProps> = ({
  endpoint,
  label,
  range,
  disabled,
  onAdjust,
  onHoldStart,
  onHoldEnd,
}) => {
  const value = endpoint === 'min' ? range.delayMinSeconds : range.delayMaxSeconds;
  const lowerDisabled = disabled || !canAdjustDelay(range, endpoint, -1);
  const raiseDisabled = disabled || !canAdjustDelay(range, endpoint, 1);
  const valueId = `blink-delay-${endpoint}-value`;
  const decrease = useCallback(() => onAdjust(endpoint, -1), [endpoint, onAdjust]);
  const increase = useCallback(() => onAdjust(endpoint, 1), [endpoint, onAdjust]);

  return (
    <div className={styles.delayStepper}>
      <span className={styles.stepperLabel}>{label}</span>
      <div className={styles.stepperControls}>
        <HoldRepeatButton
          className={styles.stepperButton}
          activeClassName={styles.stepperButtonHolding}
          aria-label={`Decrease ${label.toLowerCase()} by ${DELAY_POLICY.stepSeconds} seconds`}
          aria-describedby={valueId}
          disabled={lowerDisabled}
          onRepeat={decrease}
          onHoldStart={onHoldStart}
          onHoldEnd={onHoldEnd}
        >
          <Minus size={15} aria-hidden="true" />
        </HoldRepeatButton>
        <output id={valueId} className={styles.stepperValue} aria-live="polite">
          <strong>{value}</strong>
          <span>sec</span>
        </output>
        <HoldRepeatButton
          className={styles.stepperButton}
          activeClassName={styles.stepperButtonHolding}
          aria-label={`Increase ${label.toLowerCase()} by ${DELAY_POLICY.stepSeconds} seconds`}
          aria-describedby={valueId}
          disabled={raiseDisabled}
          onRepeat={increase}
          onHoldStart={onHoldStart}
          onHoldEnd={onHoldEnd}
        >
          <Plus size={15} aria-hidden="true" />
        </HoldRepeatButton>
      </div>
    </div>
  );
};

const TimingSection: React.FC = () => {
  const delayMinSeconds = useSettingsStore((state) => state.settings.delayMinSeconds);
  const delayMaxSeconds = useSettingsStore((state) => state.settings.delayMaxSeconds);
  const isLoaded = useSettingsStore((state) => state.isLoaded);
  const error = useSettingsStore((state) => state.error);
  const adjustDelay = useSettingsStore((state) => state.adjustDelay);
  const beginDelayPersistence = useSettingsStore((state) => state.beginDelayPersistence);
  const endDelayPersistence = useSettingsStore((state) => state.endDelayPersistence);
  const range = useMemo(() => ({ delayMinSeconds, delayMaxSeconds }), [delayMaxSeconds, delayMinSeconds]);
  const windowStyle = useMemo(
    () =>
      ({
        '--delay-window-start': `${(delayMinSeconds / DELAY_POLICY.maxSeconds) * 100}%`,
        '--delay-window-end': `${(delayMaxSeconds / DELAY_POLICY.maxSeconds) * 100}%`,
      }) as React.CSSProperties,
    [delayMaxSeconds, delayMinSeconds],
  );

  const handleDelayAdjust = useCallback(
    (endpoint: DelayEndpoint, direction: DelayDirection) => {
      adjustDelay(endpoint, direction);
    },
    [adjustDelay],
  );

  const handleHoldEnd = useCallback(() => {
    void endDelayPersistence();
  }, [endDelayPersistence]);

  return (
    <section className={styles.section} aria-labelledby="timing-title">
      <div className={styles.sectionHeader}>
        <Clock size={16} className={styles.sectionIcon} />
        <h2 id="timing-title" className={styles.sectionTitle}>Timing</h2>
      </div>
      <p className={styles.sectionDesc}>
        Choose random pause after each post. Running campaigns keep their own timing.
      </p>

      <div className={styles.delayWindow} style={windowStyle}>
        <div className={styles.windowHeading}>
          <span>Random delay window</span>
          <output aria-live="polite">{delayMinSeconds}–{delayMaxSeconds} sec</output>
        </div>
        <div className={styles.windowTrack} aria-hidden="true" />
        <span className={styles.windowBounds}>0 sec</span>
        <span className={styles.windowMaximum}>{DELAY_POLICY.maxSeconds} sec</span>
      </div>

      <div className={styles.delayControls} aria-label="Delay range controls">
        <DelayStepper
          endpoint="min"
          label="Minimum delay"
          range={range}
          disabled={!isLoaded}
          onAdjust={handleDelayAdjust}
          onHoldStart={beginDelayPersistence}
          onHoldEnd={handleHoldEnd}
        />
        <DelayStepper
          endpoint="max"
          label="Maximum delay"
          range={range}
          disabled={!isLoaded}
          onAdjust={handleDelayAdjust}
          onHoldStart={beginDelayPersistence}
          onHoldEnd={handleHoldEnd}
        />
      </div>
      <p className={styles.helperText}>Hold a control to adjust faster in {DELAY_POLICY.stepSeconds}-second steps.</p>
      {!isLoaded ? <p className={styles.statusText}>Loading saved settings…</p> : null}
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
    </section>
  );
};

const RetryPolicySection: React.FC = () => {
  const maxRetries = useSettingsStore((state) => state.settings.maxRetries);
  const isLoaded = useSettingsStore((state) => state.isLoaded);
  const setMaxRetries = useSettingsStore((state) => state.setMaxRetries);
  const handleRetryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number.parseInt(event.target.value, 10);
      void setMaxRetries(Number.isNaN(next) ? 0 : next);
    },
    [setMaxRetries],
  );

  return (
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
          value={maxRetries}
          onChange={handleRetryChange}
          min={0}
          max={10}
          disabled={!isLoaded}
        />
      </div>
    </section>
  );
};

const AboutSection: React.FC = () => (
  <section className={styles.section}>
    <div className={styles.sectionHeader}>
      <Info size={16} className={styles.sectionIcon} />
      <h2 className={styles.sectionTitle}>About</h2>
    </div>
    <p className={styles.sectionDesc}>
      Blink v1.0.0 — Multi-group poster for Facebook. Uses your authenticated browser session. No data leaves your machine.
    </p>
  </section>
);

const SettingsFooter: React.FC = () => {
  const isLoaded = useSettingsStore((state) => state.isLoaded);
  const resetDefaults = useSettingsStore((state) => state.resetDefaults);
  const handleReset = useCallback(() => {
    void resetDefaults();
  }, [resetDefaults]);

  return (
    <div className={styles.footer}>
      <Button
        variant="ghost"
        size="sm"
        icon={RotateCcw}
        disabled={!isLoaded}
        onClick={handleReset}
      >
        Reset to Defaults
      </Button>
      <span className={styles.defaults}>
        Defaults: {DEFAULT_CAMPAIGN_SETTINGS.delayMinSeconds}–{DEFAULT_CAMPAIGN_SETTINGS.delayMaxSeconds}s, {DEFAULT_CAMPAIGN_SETTINGS.maxRetries} retries
      </span>
    </div>
  );
};

const SettingsSavingIndicator: React.FC = () => {
  const isPersisting = useSettingsStore((state) => state.isPersisting);

  if (!isPersisting) {
    return null;
  }

  return (
    <div className={styles.savingIndicator} role="status" aria-live="polite">
      <span>Saving changes</span>
      <Loader2 size={15} className={styles.savingSpinner} aria-hidden="true" />
    </div>
  );
};

interface SettingsProps {
  showAbout?: boolean;
  embedded?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({ showAbout = true, embedded = false }) => (
  <div
    className={`${styles.settings} ${embedded ? styles.embedded : ''}`}
    data-testid="settings-shell"
  >
    <TimingSection />
    <RetryPolicySection />
    {showAbout ? <AboutSection /> : null}
    <SettingsFooter />
    <SettingsSavingIndicator />
  </div>
);
