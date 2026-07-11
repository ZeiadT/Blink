import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN_ALARM_PREFIX,
  CampaignAlarmScheduler,
  createCampaignAlarmName,
  getRandomDelayMs,
  KeepAliveScheduler,
  parseCampaignAlarmName,
  randomDelay,
} from '@background/scheduler';

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
    expect(() => randomDelay(-1, 5)).toThrow('whole 5-second steps from 0 to 300');
  });

  it('throws RangeError when maxSeconds < minSeconds', () => {
    expect(() => randomDelay(10, 5)).toThrow(RangeError);
    expect(() => randomDelay(10, 5)).toThrow('whole 5-second steps from 0 to 300');
  });

  it('throws RangeError for off-step or unbounded delays', () => {
    expect(() => randomDelay(5, 17)).toThrow(RangeError);
    expect(() => randomDelay(0, 305)).toThrow(RangeError);
  });

  it('does not throw when min equals max', () => {
    expect(() => randomDelay(5, 5)).not.toThrow();
    vi.runAllTimers();
  });

  it('creates a timeout within expected range', async () => {
    // Spy on setTimeout to capture delay value
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    randomDelay(5, 15);

    // Should have created exactly one timer
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    const delayMs = setTimeoutSpy.mock.calls[0][1] as number;
    expect(delayMs).toBeGreaterThanOrEqual(5000);
    expect(delayMs).toBeLessThanOrEqual(15000);

    vi.runAllTimers();
    setTimeoutSpy.mockRestore();
  });

  it('produces varying delays across calls (statistical)', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const delays: number[] = [];

    for (let i = 0; i < 50; i++) {
      randomDelay(5, 50);
      const delay = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number;
      delays.push(delay);
    }

    // All within range
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(5000);
      expect(d).toBeLessThanOrEqual(50000);
    }

    // At least some variation (not all identical)
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);

    vi.runAllTimers();
    setTimeoutSpy.mockRestore();
  });

  it('exposes the generated delay without creating a timer', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    expect(getRandomDelayMs(5, 15)).toBe(7500);
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    randomSpy.mockRestore();
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

describe('CampaignAlarmScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a reversible, namespaced campaign alarm name', () => {
    const name = createCampaignAlarmName('campaign:one', 'run/token?two');

    expect(name.startsWith(CAMPAIGN_ALARM_PREFIX)).toBe(true);
    expect(parseCampaignAlarmName(name)).toEqual({
      campaignId: 'campaign:one',
      runToken: 'run/token?two',
    });
  });

  it('rejects non-campaign and malformed campaign alarm names', () => {
    expect(parseCampaignAlarmName('blink-keepalive')).toBeNull();
    expect(parseCampaignAlarmName(CAMPAIGN_ALARM_PREFIX)).toBeNull();
    expect(parseCampaignAlarmName(`${CAMPAIGN_ALARM_PREFIX}campaign`)).toBeNull();
    expect(parseCampaignAlarmName(`${CAMPAIGN_ALARM_PREFIX}campaign:run:extra`)).toBeNull();
    expect(parseCampaignAlarmName(`${CAMPAIGN_ALARM_PREFIX}%:run`)).toBeNull();
  });

  it('schedules one named, one-shot alarm at the requested time', () => {
    const scheduler = new CampaignAlarmScheduler();
    const when = Date.now() + 30_000;
    const name = scheduler.schedule('campaign-1', 'run-1', when);

    expect(name).toBe(createCampaignAlarmName('campaign-1', 'run-1'));
    expect(chrome.alarms.create).toHaveBeenCalledWith(name, { when });
    expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
  });

  it('clears a campaign alarm by its campaign and run token', () => {
    const scheduler = new CampaignAlarmScheduler();
    scheduler.clear('campaign-1', 'run-1');

    expect(chrome.alarms.clear).toHaveBeenCalledWith(createCampaignAlarmName('campaign-1', 'run-1'));
  });

  it('clears a supplied alarm name without retaining local state', () => {
    const scheduler = new CampaignAlarmScheduler();
    const alarmName = createCampaignAlarmName('campaign-1', 'run-1');

    scheduler.schedule('campaign-1', 'run-1', Date.now() + 30_000);
    scheduler.schedule('campaign-1', 'run-1', Date.now() + 60_000);
    scheduler.clearByName(alarmName);
    scheduler.clearByName(alarmName);

    expect(chrome.alarms.create).toHaveBeenCalledTimes(2);
    expect(chrome.alarms.clear).toHaveBeenCalledTimes(2);
    expect(chrome.alarms.clear).toHaveBeenLastCalledWith(alarmName);
  });
});
