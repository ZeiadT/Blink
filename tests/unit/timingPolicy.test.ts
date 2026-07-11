import { describe, expect, it } from 'vitest';
import {
  adjustDelayRange,
  canAdjustDelay,
  DELAY_POLICY,
  isValidDelayRange,
  normalizeDelayRange,
} from '@shared/timingPolicy';

describe('timing policy', () => {
  it('accepts only ordered, bounded five-second ranges', () => {
    expect(isValidDelayRange({ delayMinSeconds: 0, delayMaxSeconds: 300 })).toBe(true);
    expect(isValidDelayRange({ delayMinSeconds: 5, delayMaxSeconds: 15 })).toBe(true);
    expect(isValidDelayRange({ delayMinSeconds: 31, delayMaxSeconds: 60 })).toBe(false);
    expect(isValidDelayRange({ delayMinSeconds: 15, delayMaxSeconds: 10 })).toBe(false);
    expect(isValidDelayRange({ delayMinSeconds: 0, delayMaxSeconds: 305 })).toBe(false);
    expect(isValidDelayRange({ delayMinSeconds: Number.NaN, delayMaxSeconds: 60 })).toBe(false);
  });

  it('normalizes legacy ranges outward and clamps finite bounds', () => {
    expect(normalizeDelayRange({ delayMinSeconds: 31, delayMaxSeconds: 59 })).toEqual({
      delayMinSeconds: 30,
      delayMaxSeconds: 60,
    });
    expect(normalizeDelayRange({ delayMinSeconds: -8, delayMaxSeconds: 309 })).toEqual({
      delayMinSeconds: DELAY_POLICY.minSeconds,
      delayMaxSeconds: DELAY_POLICY.maxSeconds,
    });
  });

  it('keeps normalized legacy ranges ordered and idempotent', () => {
    const normalized = normalizeDelayRange({ delayMinSeconds: 70, delayMaxSeconds: 20 });

    expect(normalized).toEqual({ delayMinSeconds: 70, delayMaxSeconds: 70 });
    expect(normalizeDelayRange(normalized)).toEqual(normalized);
  });

  it('adjusts a range without crossing either endpoint', () => {
    const range = { delayMinSeconds: 30, delayMaxSeconds: 60 };

    expect(adjustDelayRange(range, 'min', 1)).toEqual({ delayMinSeconds: 35, delayMaxSeconds: 60 });
    expect(adjustDelayRange(range, 'max', -1)).toEqual({ delayMinSeconds: 30, delayMaxSeconds: 55 });
    expect(adjustDelayRange({ delayMinSeconds: 60, delayMaxSeconds: 60 }, 'min', 1)).toEqual({
      delayMinSeconds: 60,
      delayMaxSeconds: 60,
    });
    expect(canAdjustDelay({ delayMinSeconds: 0, delayMaxSeconds: 300 }, 'min', -1)).toBe(false);
    expect(canAdjustDelay({ delayMinSeconds: 0, delayMaxSeconds: 300 }, 'max', 1)).toBe(false);
  });
});
