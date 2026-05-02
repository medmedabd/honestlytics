import { EventPayload, HonestlyticsConfig } from './types';
import { getDeviceProperties } from './device';

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

  private distinct_id: string;
  onRetry?: (attempt: number) => void;
  onFailed?: (error: Error) => void;
  onSuccess?: (count: number) => void;

  constructor(config: HonestlyticsConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.write_key = config.write_key;

    this.flushInterval = config.flushInterval ?? 5000;
    this.maxBatchSize = config.maxBatchSize ?? 20;
    this.maxQueueSize = config.maxQueueSize ?? 1000;
    this.retry = config.retry ?? 3;
    this.debug = config.debug ?? false;
    this.distinct_id = this.getOrCreateDistinctId();
    this.onRetry = config.onRetry;
    this.onFailed = config.onFailed;
    this.onSuccess = config.onSuccess;
    this.fetchFn = (config.fetch ?? globalThis.fetch).bind(globalThis);

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
      distinct_id: event.distinct_id ?? this.distinct_id,
      sdk_version: '0.1.0',
      client_timestamp: event.client_timestamp ?? new Date().toISOString(),
      device_properties: event.device_properties ?? getDeviceProperties(),
      properties: event.properties ?? {}
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
      this.queue.unshift(...batch);

      if (this.debug) {
        console.error('[Honestlytics] flush failed:', err);
      }

      this.onFailed?.(err as Error);

      throw err;
    } finally {
      this.isFlushing = false;
    }
  }

  private async sendWithRetry(batch: EventPayload[]) {
    let attempt = 0;
    while (attempt < this.retry) {
      try {
        const res = await this.fetchFn(`${this.url}/event/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-write-key': this.write_key,
          },
          body: JSON.stringify(batch),
        });

        if (res.ok) {
          this.onSuccess?.(batch.length);
          return;
        }

        if (res.status >= 400 && res.status < 500) {
          if (this.debug) {
            console.error('[Honestlytics] bad request:', res.status);
          }

          throw new Error(`client error ${res.status}`);
        }

        await this.backoff(attempt);
        attempt++;

      } catch (err) {
        this.onRetry?.(attempt + 1);

        await this.backoff(attempt);
        attempt++;

        if (attempt >= this.retry) {
          throw err;
        }
      }
    }

    throw new Error('all retries failed');
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

    const flushWithBeacon = () => {
      if (this.queue.length === 0) return;

      const payload = new Blob(
        [JSON.stringify(this.queue)],
        { type: 'application/json' }
      );

      navigator.sendBeacon(
        `${this.url}/event/batch`,
        payload
      );
    };

    window.addEventListener('beforeunload', flushWithBeacon);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushWithBeacon();
      }
    });

    this.queue = [];
  }

  private getOrCreateDistinctId(): string {
    if (typeof localStorage === 'undefined') return crypto.randomUUID();
    const existing = localStorage.getItem('hnly_distinct_id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem('hnly_distinct_id', id);
    return id;
  }

  get queueSize(): number {
    return this.queue.length;
  }

}

