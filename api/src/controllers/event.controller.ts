import type { Request, Response } from 'express';
import { getChannel } from '../config/channel';

const addEvent = async (req: Request, res: Response): Promise<void> => {
    const channel = getChannel();
    channel.sendToQueue('events', Buffer.from(JSON.stringify(req.body)));
    console.log('Event queued:', req.body);
    res.status(202).send();
};

export { addEvent };