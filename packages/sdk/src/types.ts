export interface EventPayload {
  event_name: string;
  user_id?: string;
  session_id?: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

export interface HonestlyticsConfig {
  url: string;
  write_key: string;

  flushInterval?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  retry?: number;

  debug?: boolean;
  fetch?: typeof fetch;
}