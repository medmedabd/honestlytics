import createRabbitMQChannel from '../config/rabbitmq'
import { insertEvent } from '../services/event.service'
import { startCronJobs } from '../cron/cron'
import redis from '../config/redis'
import pool from '../config/postgres'

export const startWorker = async (): Promise<void> => {
    try {
        const channel = await createRabbitMQChannel();

        // start drain + reconciliation crons
        startCronJobs(redis, pool);

        const queue = process.env.RABBITMQ_QUEUE ?? 'events'
        console.log(`[*] Worker waiting for messages in ${queue}. To exit press CTRL+C`)

        channel.prefetch(100);
        channel.consume(queue, async (msg) => {
            if (msg !== null) {
                try {
                    await insertEvent(channel, msg);
                } catch (error) {
                    console.error('insertion failed:', error);
                    process.exit(1);
                }
            }
        })
    } catch (error) {
        console.error('Starting Worker failed:', error);
        process.exit(1);
    }
}