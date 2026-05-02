import { z } from 'zod';

export const EventSchema = z.object({
  event_id: z.string().uuid(),
  event_name: z.string().min(1),
  distinct_id: z.string().nullable(),
  session_id: z.string().nullable().optional(),
  client_timestamp: z.string().datetime().nullable().optional(),
  page: z.string().nullable(),
  html_element: z.string().nullable(),
  sdk_version: z.string().nullable(),
  user_id: z.string().nullable().optional(),
  server_timestamp: z.string().datetime(),
  device_properties: z.record(z.string(), z.unknown()).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type EventExchange = z.infer<typeof EventSchema>;