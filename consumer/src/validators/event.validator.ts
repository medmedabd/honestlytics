import { z } from 'zod';

export const EventSchema = z.object({
  event_id: z.string().uuid(),
  event_name: z.string().min(1),
  distinct_id: z.string().min(1),
  session_id: z.string().uuid().nullable().optional(),
  client_timestamp: z.string().datetime(),
  page: z.string().nullable(),
  html_element: z.string().nullable(),
  sdk_version: z.string().nullable(),
  user_id: z.string().nullable().optional(),
  server_timestamp: z.string().datetime(),
  device_properties: z.record(z.string(), z.unknown()).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  site_id: z.string().uuid(),
})

export type EventExchange = z.infer<typeof EventSchema>;