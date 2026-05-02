import { Request, Response, NextFunction } from 'express';
import { EventExchange } from 'src/types/event.types';

export function eventValidator(req: Request, res: Response, next: NextFunction): void {
    if (!req.body?.event_name) {
        res.status(400).json({ error: 'event_name is required' });
        return;
    }
    next();
}
export function eventBatchValidator(req: Request, res: Response, next: NextFunction): void {
    const eventsContentList: EventExchange[] = req.body;

    for (const eventContent of eventsContentList) {
        if (!eventContent.event_name) {
            res.status(400).json({ error: 'event_name is required' });
            return;
        }
    }
    next();
}