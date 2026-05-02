import type { Request, Response } from 'express';
import { getChannel } from '../config/channel';
import { EventExchange } from '../types/event.types';
import { randomUUID } from 'crypto';

const MAX_BATCH = 100;

const addEvent = async (req: Request, res: Response): Promise<void> => {
    try {
        const channel = getChannel();
        if (!channel) throw new Error('Channel is null');

        const eventContent: EventExchange = req.body;
        const enriched = {
            ...eventContent,
            event_id: randomUUID(),
            server_timestamp: new Date().toISOString()
        };

        // TODO: handle backpressure (next release)
        try {
            channel.sendToQueue('events', Buffer.from(JSON.stringify(enriched)));
        } catch {
            res.status(503).send({ error: 'Backpressure handling not implemented yet' });
            return;
        }

        console.log('Event queued:', enriched);
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

        const eventsContentList: EventExchange[] = req.body;
        if (eventsContentList.length > MAX_BATCH) {
            res.status(400).send({ error: 'Batch exceeds maximum of ' + MAX_BATCH });
            return;
        }
       
        
        // NOTE: partial batch failure is possible — if sendToQueue fails mid-loop,
        // events queued before the failure are already in RabbitMQ and will be processed.
        // Redis dedup (NX flag) handles duplicates on client retry.
        // Full backpressure handling (sendToQueue return value + drain event) is deferred to next release.
        for (const eventContent of eventsContentList) {
            const enriched = {
                ...eventContent,
                event_id: randomUUID(),
                server_timestamp: new Date().toISOString()
            };

            // TODO: handle backpressure (next release)
            try {
                channel.sendToQueue('events', Buffer.from(JSON.stringify(enriched)));
            } catch {
                res.status(503).send({ error: 'Backpressure handling not implemented yet' });
                return;
            }

            console.log('Event queued:', enriched);
        }

        res.status(202).send();
    } catch (err) {
        console.error('Events not queued:', err);
        res.status(503).send();
    }
};

export { addEvent, batchEvents };