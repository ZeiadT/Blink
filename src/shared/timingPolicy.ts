import type { CampaignSettings } from './types';

export const DELAY_POLICY = {
  minSeconds: 0,
  maxSeconds: 300,
  stepSeconds: 5,
} as const;

export const DEFAULT_DELAY_RANGE = {
  delayMinSeconds: 30,
  delayMaxSeconds: 60,
} as const;

export type DelayRange = Pick<CampaignSettings, 'delayMinSeconds' | 'delayMaxSeconds'>;
export type DelayEndpoint = 'min' | 'max';
export type DelayDirection = -1 | 1;

export function isValidDelayRange(value: unknown): value is DelayRange {
  if (!isRecord(value)) return false;

  const { delayMinSeconds, delayMaxSeconds } = value;
  return (
    isDelayStep(delayMinSeconds) &&
    isDelayStep(delayMaxSeconds) &&
    delayMinSeconds <= delayMaxSeconds
  );
}

/**
 * Converts persisted or otherwise untrusted delay values into a safe range.
 * Minimums round down and maximums round up so legacy ranges never become
 * narrower merely because they predate the five-second policy.
 */
export function normalizeDelayRange(value: unknown): DelayRange {
  const source = isRecord(value) ? value : {};
  const min = normalizeEndpoint(source.delayMinSeconds, 'min');
  const max = normalizeEndpoint(source.delayMaxSeconds, 'max');

  return min <= max
    ? { delayMinSeconds: min, delayMaxSeconds: max }
    : { delayMinSeconds: min, delayMaxSeconds: min };
}

export function adjustDelayRange(
  range: DelayRange,
  endpoint: DelayEndpoint,
  direction: DelayDirection,
): DelayRange {
  const normalized = normalizeDelayRange(range);
  const delta = direction * DELAY_POLICY.stepSeconds;

  if (endpoint === 'min') {
    const nextMin = normalized.delayMinSeconds + delta;
    if (nextMin < DELAY_POLICY.minSeconds || nextMin > normalized.delayMaxSeconds) {
      return normalized;
    }
    return { ...normalized, delayMinSeconds: nextMin };
  }

  const nextMax = normalized.delayMaxSeconds + delta;
  if (nextMax > DELAY_POLICY.maxSeconds || nextMax < normalized.delayMinSeconds) {
    return normalized;
  }
  return { ...normalized, delayMaxSeconds: nextMax };
}

export function canAdjustDelay(
  range: DelayRange,
  endpoint: DelayEndpoint,
  direction: DelayDirection,
): boolean {
  const normalized = normalizeDelayRange(range);
  return endpoint === 'min'
    ? direction === -1
      ? normalized.delayMinSeconds > DELAY_POLICY.minSeconds
      : normalized.delayMinSeconds < normalized.delayMaxSeconds
    : direction === -1
      ? normalized.delayMaxSeconds > normalized.delayMinSeconds
      : normalized.delayMaxSeconds < DELAY_POLICY.maxSeconds;
}

function normalizeEndpoint(value: unknown, endpoint: DelayEndpoint): number {
  const fallback =
    endpoint === 'min' ? DEFAULT_DELAY_RANGE.delayMinSeconds : DEFAULT_DELAY_RANGE.delayMaxSeconds;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;

  const clamped = Math.min(DELAY_POLICY.maxSeconds, Math.max(DELAY_POLICY.minSeconds, value));
  return endpoint === 'min'
    ? Math.floor(clamped / DELAY_POLICY.stepSeconds) * DELAY_POLICY.stepSeconds
    : Math.ceil(clamped / DELAY_POLICY.stepSeconds) * DELAY_POLICY.stepSeconds;
}

function isDelayStep(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= DELAY_POLICY.minSeconds &&
    value <= DELAY_POLICY.maxSeconds &&
    value % DELAY_POLICY.stepSeconds === 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
