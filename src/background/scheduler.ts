/**
 * Random delay within [minSeconds, maxSeconds].
 * Throws RangeError for invalid inputs.
 */
export function randomDelay(minSeconds: number, maxSeconds: number): Promise<void> {
  if (minSeconds < 0) {
    throw new RangeError(`minSeconds must be >= 0, got ${minSeconds}`);
  }
  if (maxSeconds < minSeconds) {
    throw new RangeError(`maxSeconds (${maxSeconds}) must be >= minSeconds (${minSeconds})`);
  }

  const minMs = minSeconds * 1000;
  const maxMs = maxSeconds * 1000;
  const delayMs = minMs + Math.random() * (maxMs - minMs);

  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
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
