import { Request, Response, NextFunction } from 'express';

export function eventValidator(req: Request, res: Response, next: NextFunction): void {
    if (!req.body?.event_name) {
        res.status(400).json({ error: 'event_name is required' });
        return;
    }
    next();
}