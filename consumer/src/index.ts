import 'dotenv/config';
import pool from './config/postgres';
import dotenv from 'dotenv';
import { startWorker } from './workers/event.worker';

dotenv.config();
startWorker();

// Handle graceful shutdown
const shutdown = async () => {
    console.log('Shutting down worker...');
    await pool.end();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
