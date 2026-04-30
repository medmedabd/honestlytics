import { Channel, Message } from 'amqplib';
import { EventSchema } from "../validators/event.validator";
import redis from "../config/redis";
import { safeAck, safeNack } from "../utils/rabbitmq.utils";
import { createEvent } from '../repositories/event.repository';

export const insertEvent = async (
    channel: Channel,
    msg: Message,
): Promise<void> => {
    try {
        const parsed = JSON.parse(msg.content.toString());
        const result = EventSchema.safeParse(parsed);

        if (!result.success) {
            console.error('Invalid event schema:', result.error);
            safeAck(channel, msg); // drop invalid, don't requeue
            return;
        }

        const eventContent = result.data;

        console.log('Received:', eventContent);

        // only set if Not eXists
        const isNew = await redis.set(eventContent.event_id, '1', 'EX', 60, 'NX');

        if (isNew === null) {
            // key already existed → duplicate
            console.log('Duplicate dropped');
            channel.ack(msg);
            return;
        }

        await createEvent(eventContent);

        safeAck(channel, msg)
        console.log('Event stored ✅');
    } catch (consumeError) {
        console.error('Error processing message:', consumeError);
        safeNack(channel, msg)
    }
}