export interface IncomingEvent {
  event_name: string;
  distinct_id: string | null;
  session_id: string | null;
  client_timestamp: string | null;
  page: string | null;
  html_element: string | null;
  sdk_version: string | null;
  user_id: string | null;
  device_properties: Record<string, unknown> | null;
  properties: Record<string, unknown> | null;
}