import { EventPayload, HonestlyticsConfig } from './types';

export class Honestlytics {
  private url: string;
  private write_key: string;

  private queue: EventPayload[] = [];
  private timer?: ReturnType<typeof setInterval>;

  private flushInterval: number;
  private maxBatchSize: number;
  private maxQueueSize: number;
  private retry: number;

  private fetchFn: typeof fetch;
  private debug: boolean;

  private isFlushing = false;

  constructor(config: HonestlyticsConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.write_key = config.write_key;

    this.flushInterval = config.flushInterval ?? 5000;
    this.maxBatchSize = config.maxBatchSize ?? 20;
    this.maxQueueSize = config.maxQueueSize ?? 1000;
    this.retry = config.retry ?? 3;
    this.debug = config.debug ?? false;

    this.fetchFn = config.fetch ?? globalThis.fetch;

    if (!this.fetchFn) {
      throw new Error('fetch is not available');
    }

    this.start();
    this.setupUnloadHook();
  }

  // -------------------
  // Public API
  // -------------------

  track(event: EventPayload): void {
    const payload: EventPayload = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    // backpressure control
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift(); // drop oldest
    }

    this.queue.push(payload);

    // trigger flush if batch ready
    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  // -------------------
  // Flush system
  // -------------------

  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;

    this.isFlushing = true;

    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await this.sendWithRetry(batch);
    } catch (err) {
      // restore on failure
      this.queue.unshift(...batch);

      if (this.debug) {
        console.error('[Honestlytics] flush failed:', err);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async sendWithRetry(batch: EventPayload[]) {
    let attempt = 0;

    while (attempt < this.retry) {
      try {
        const res = await this.fetchFn(`${this.url}/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-write-key': this.write_key,
          },
          body: JSON.stringify({ events: batch }),
        });

        if (res.ok) return;

        if (res.status >= 400 && res.status < 500) {
          if (this.debug) {
            console.error('[Honestlytics] bad request:', res.status);
          }
          return;
        }

        await this.backoff(attempt);
        attempt++;
      } catch (err) {
        await this.backoff(attempt);
        attempt++;

        if (attempt >= this.retry && this.debug) {
          console.error('[Honestlytics] retry failed:', err);
        }
      }
    }
  }

  private backoff(attempt: number) {
    const delay = Math.min(1000 * 2 ** attempt, 10000);
    return new Promise((res) => setTimeout(res, delay));
  }

  // -------------------
  // Lifecycle
  // -------------------

  private start() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  // -------------------
  // Browser safety
  // -------------------

  private setupUnloadHook() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeunload', () => {
      if (this.queue.length === 0) return;

      const payload = new Blob(
        [JSON.stringify({ events: this.queue })],
        { type: 'application/json' }
      );

      navigator.sendBeacon(`${this.url}/batch`, payload);
    });
  }
}