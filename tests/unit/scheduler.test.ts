import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomDelay, KeepAliveScheduler } from '@background/scheduler';

describe('randomDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('resolves immediately when min=max=0', async () => {
    const promise = randomDelay(0, 0);
    // No timers needed — should resolve synchronously
    await expect(promise).resolves.toBeUndefined();
  });

  it('throws RangeError when minSeconds is negative', () => {
    expect(() => randomDelay(-1, 5)).toThrow(RangeError);
    expect(() => randomDelay(-1, 5)).toThrow('minSeconds must be >= 0');
  });

  it('throws RangeError when maxSeconds < minSeconds', () => {
    expect(() => randomDelay(5, 3)).toThrow(RangeError);
    expect(() => randomDelay(5, 3)).toThrow('maxSeconds (3) must be >= minSeconds (5)');
  });

  it('does not throw when min equals max', () => {
    expect(() => randomDelay(2, 2)).not.toThrow();
    vi.runAllTimers();
  });

  it('creates a timeout within expected range', async () => {
    // Spy on setTimeout to capture delay value
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    randomDelay(1, 3);

    // Should have created exactly one timer
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    const delayMs = setTimeoutSpy.mock.calls[0][1] as number;
    expect(delayMs).toBeGreaterThanOrEqual(1000);
    expect(delayMs).toBeLessThanOrEqual(3000);

    vi.runAllTimers();
    setTimeoutSpy.mockRestore();
  });

  it('produces varying delays across calls (statistical)', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const delays: number[] = [];

    for (let i = 0; i < 50; i++) {
      randomDelay(1, 10);
      const delay = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number;
      delays.push(delay);
    }

    // All within range
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(1000);
      expect(d).toBeLessThanOrEqual(10000);
    }

    // At least some variation (not all identical)
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);

    vi.runAllTimers();
    setTimeoutSpy.mockRestore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('KeepAliveScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls chrome.alarms.create on start', () => {
    const sched = new KeepAliveScheduler();
    sched.start();
    expect(chrome.alarms.create).toHaveBeenCalledWith('blink-keepalive', { periodInMinutes: 0.5 });
    expect(sched.isRunning).toBe(true);
    sched.stop();
  });

  it('calls chrome.alarms.clear on stop', () => {
    const sched = new KeepAliveScheduler();
    sched.start();
    sched.stop();
    expect(chrome.alarms.clear).toHaveBeenCalledWith('blink-keepalive');
    expect(sched.isRunning).toBe(false);
  });

  it('start is idempotent', () => {
    const sched = new KeepAliveScheduler();
    sched.start();
    sched.start();
    expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
    sched.stop();
  });

  it('stop is idempotent', () => {
    const sched = new KeepAliveScheduler();
    sched.stop(); // not started
    expect(chrome.alarms.clear).not.toHaveBeenCalled();
  });
});

// Needed for afterEach in randomDelay block
import { afterEach } from 'vitest';
