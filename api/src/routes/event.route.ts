import express from 'express';
import { addEvent } from '../controllers/event.controller';
import { eventValidator } from '../middleware/event.validator';

const router = express.Router();
router.post('/', eventValidator, addEvent);
export default router;