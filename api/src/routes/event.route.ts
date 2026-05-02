import express from 'express';
import { addEvent, batchEvents } from '../controllers/event.controller';
import { eventValidator, eventBatchValidator } from '../middleware/event.validator';

const router = express.Router();
router.post('/', eventValidator, addEvent);
router.post('/batch', eventBatchValidator, batchEvents);
export default router;