import express from 'express';
import {
    getPageviews,
    getEvents,
    getSessions,
    getUniqueUsers,
    getSessionDuration,
    getSummary,
} from '../controllers/analytics.controller';

const router = express.Router();

router.get('/pageviews',        getPageviews);
router.get('/events',           getEvents);
router.get('/sessions',         getSessions);
router.get('/unique-users',     getUniqueUsers);
router.get('/session-duration', getSessionDuration);
router.get('/summary',          getSummary);

export default router;