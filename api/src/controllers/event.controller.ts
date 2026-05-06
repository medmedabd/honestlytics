import type { Request, Response } from 'express';
import { getChannel } from '../config/channel';
import { EventExchange } from '../types/event.types';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const MAX_BATCH = 100;

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
    //server_timestamp: z.string().datetime(),
    device_properties: z.record(z.string(), z.unknown()).nullable().optional(),
    properties: z.record(z.string(), z.unknown()).nullable().optional(),
    site_id: z.string().uuid(),
});

const addEvent = async (req: Request, res: Response): Promise<void> => {
    try {
        const channel = getChannel();
        if (!channel) throw new Error('Channel is null');

        const result = EventSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error.flatten() });
            return;
        }

        const eventContent: EventExchange = req.body;
        const enriched = {
            ...eventContent,
            event_id: eventContent.event_id ?? randomUUID(),
            server_timestamp: new Date().toISOString()
        };

        // TODO: handle backpressure (next release)
        try {
            channel.sendToQueue('events', Buffer.from(JSON.stringify(enriched)));
        } catch {
            res.status(503).send({ error: 'Backpressure handling not implemented yet' });
            return;
        }

        console.log('Event queued:', enriched.event_id);
        res.status(202).send();
    } catch (err) {
        console.error('Event not queued:', err);
        res.status(503).send();
    }
};

const batchEvents = async (req: Request, res: Response): Promise<void> => {
    try {
        const channel = getChannel();
        if (!channel) throw new Error('Channel is null');

        if (!Array.isArray(req.body)) {
            res.status(400).json({ error: 'Body must be an array' });
            return;
        }

        const eventsContentList: EventExchange[] = req.body;
        if (eventsContentList.length > MAX_BATCH) {
            res.status(400).send({ error: 'Batch exceeds maximum of ' + MAX_BATCH });
            return;
        }

        // Step 1: validate ALL first, fail fast before touching RabbitMQ
        const enriched = [];
        for (const eventContent of eventsContentList) {
            const result = EventSchema.safeParse(eventContent);
            if (!result.success) {
                res.status(400).json({ error: result.error.flatten() });
                return;
            }
            enriched.push({
                ...eventContent,
                event_id: eventContent.event_id ?? randomUUID(),
                server_timestamp: new Date().toISOString()
            });
        }

        // Step 2: publish all at once — no CPU work interleaved with I/O
        // NOTE: all-or-nothing at validation level, partial publish still possible
        // if sendToQueue throws mid-loop. Redis dedup handles client retries.
        try {
            for (const event of enriched) {
                channel.sendToQueue('events', Buffer.from(JSON.stringify(event)));
            }
        } catch {
            res.status(503).send({ error: 'Backpressure handling not implemented yet' });
            return;
        }

        console.log(`Batch queued: ${enriched.length} events`);
        res.status(202).send();
    } catch (err) {
        console.error('Batch not queued:', err);
        res.status(503).send();
    }
};

export { addEvent, batchEvents };