import type { Request, Response } from 'express';
import { getChannel } from '../config/channel';
import { EventExchange } from '../types/event.types';
import { randomUUID } from 'crypto';

const addEvent = async (req: Request, res: Response): Promise<void> => {
    const channel = getChannel();
    const eventContent: EventExchange = req.body;
    eventContent.event_id = randomUUID();
    channel.sendToQueue('events', Buffer.from(JSON.stringify(eventContent)));
    console.log('Event queued:', req.body);
    res.status(202).send();
};

export { addEvent };