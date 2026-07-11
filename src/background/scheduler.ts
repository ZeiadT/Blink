import { isValidDelayRange } from '@shared/timingPolicy';

/**
 * Gets a random delay within [minSeconds, maxSeconds].
 * Throws RangeError for invalid inputs.
 */
export function getRandomDelayMs(minSeconds: number, maxSeconds: number): number {
  if (!isValidDelayRange({ delayMinSeconds: minSeconds, delayMaxSeconds: maxSeconds })) {
    throw new RangeError('Delay range must use whole 5-second steps from 0 to 300 seconds.');
  }

  const minMs = minSeconds * 1000;
  const maxMs = maxSeconds * 1000;
  return minMs + Math.random() * (maxMs - minMs);
}

/**
 * Waits for a random delay within [minSeconds, maxSeconds].
 * Throws RangeError for invalid inputs.
 */
export function randomDelay(minSeconds: number, maxSeconds: number): Promise<void> {
  const delayMs = getRandomDelayMs(minSeconds, maxSeconds);

  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// ── Campaign Alarm Scheduler ───────────────────────────────────────────────

export const CAMPAIGN_ALARM_PREFIX = 'blink-campaign:';

export interface CampaignAlarmIdentity {
  campaignId: string;
  runToken: string;
}

/**
 * Returns a collision-safe Chrome alarm name for one campaign execution.
 */
export function createCampaignAlarmName(campaignId: string, runToken: string): string {
  return `${CAMPAIGN_ALARM_PREFIX}${encodeURIComponent(campaignId)}:${encodeURIComponent(runToken)}`;
}

/**
 * Parses an alarm name created by createCampaignAlarmName.
 */
export function parseCampaignAlarmName(name: string): CampaignAlarmIdentity | null {
  if (!name.startsWith(CAMPAIGN_ALARM_PREFIX)) return null;

  const parts = name.slice(CAMPAIGN_ALARM_PREFIX.length).split(':');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return null;

  try {
    const [campaignId, runToken] = parts.map(decodeURIComponent);
    return { campaignId, runToken };
  } catch {
    return null;
  }
}

/**
 * Schedules one durable continuation alarm per campaign run. Chrome owns all
 * alarm state, so this object remains safe to recreate after worker suspension.
 */
export class CampaignAlarmScheduler {
  schedule(campaignId: string, runToken: string, when: number): string {
    const name = createCampaignAlarmName(campaignId, runToken);
    chrome.alarms.create(name, { when });
    return name;
  }

  clear(campaignId: string, runToken: string): void {
    this.clearByName(createCampaignAlarmName(campaignId, runToken));
  }

  clearByName(name: string): void {
    chrome.alarms.clear(name);
  }
}

// ── Keep-Alive Scheduler ───────────────────────────────────────────────────

const ALARM_NAME = 'blink-keepalive';
const PERIOD_MINUTES = 0.5; // 30 seconds — minimum chrome.alarms allows in MV3

/**
 * Wraps chrome.alarms to keep service worker alive during long campaigns.
 * Create one per orchestrator instance.
 */
export class KeepAliveScheduler {
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: PERIOD_MINUTES });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    chrome.alarms.clear(ALARM_NAME);
  }

  get isRunning(): boolean {
    return this.running;
  }
}
