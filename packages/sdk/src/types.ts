export interface EventPayload {
  event_name: string;
  distinct_id?: string;
  user_id?: string;
  session_id?: string;
  page?: string;
  html_element?: string;
  sdk_version?: string;
  properties?: Record<string, unknown>;
  device_properties?: Record<string, unknown>;
  client_timestamp?: string;
  site_id: string;
}

export interface HonestlyticsConfig {
  url: string;
  write_key: string;
  site_id?: string;

  flushInterval?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  retry?: number;

  debug?: boolean;
  fetch?: typeof fetch;
  onRetry?: (attempt: number) => void;
  onFailed?: (error: Error) => void;
  onSuccess?: (count: number) => void;
}