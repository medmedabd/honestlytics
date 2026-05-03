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

        console.log('Received:', eventContent.event_id);

        // only set if Not eXists
        const isNew = await redis.set(eventContent.event_id, '1', 'EX', 86400, 'NX');

        if (isNew === null) {
            // key already existed → duplicate
            console.log('Duplicate dropped', eventContent.event_id);
            channel.ack(msg);
            return;
        }

        await createEvent(eventContent);

        safeAck(channel, msg);

        console.log('Event stored ✅✅');
    } catch (consumeError: any) {
        console.error('Error processing message:', consumeError);
        if (consumeError.code === '23505') {
        console.log('Duplicate caught at DB level, discarding');
        safeAck(channel, msg); // ack, don't requeue
        return;
    }
    }
}