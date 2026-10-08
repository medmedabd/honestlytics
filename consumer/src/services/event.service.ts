import { Channel, Message } from 'amqplib';
import { EventSchema } from "../validators/event.validator";
import redis from "../config/redis";
import { safeAck, safeNack } from "../utils/rabbitmq.utils";
import { createEvent } from '../repositories/event.repository';
import { incrementAggregationCounters } from '../aggregation/increment'

const MAX_ATTEMPTS = 5;
const DEAD_QUEUE = process.env.RABBITMQ_DEAD_QUEUE ?? 'events.dead';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Failure path: free the dedup key so the redelivery isn't mistaken for a
// duplicate, then requeue. After MAX_ATTEMPTS the message goes to a dead
// queue (kept for inspection/replay) instead of looping forever.
const handleFailure = async (
    channel: Channel,
    msg: Message,
    eventId: string | null,
    dedupKeySet: boolean,
): Promise<void> => {
    try {
        if (eventId && dedupKeySet) await redis.del(eventId);

        const attempts = eventId ? await redis.incr(`hnly:retry:${eventId}`) : MAX_ATTEMPTS;
        if (eventId && attempts === 1) await redis.expire(`hnly:retry:${eventId}`, 3600);

        if (attempts >= MAX_ATTEMPTS) {
            console.error(`Event ${eventId ?? '(unparsed)'} failed ${attempts} times, moving to ${DEAD_QUEUE}`);
            await channel.assertQueue(DEAD_QUEUE, { durable: true });
            channel.sendToQueue(DEAD_QUEUE, msg.content, { persistent: true });
            safeAck(channel, msg);
            return;
        }

        await wait(Math.min(attempts * 1000, 5000)); // back off so a DB outage isn't hot-looped
    } catch (err) {
        // Redis/broker trouble while handling a failure: still requeue so nothing is lost.
        console.error('Failure handler error:', err);
    }
    safeNack(channel, msg);
};

export const insertEvent = async (
    channel: Channel,
    msg: Message,
): Promise<void> => {
    let eventId: string | null = null;
    let dedupKeySet = false;

    try {
        let parsed: unknown;
        try {
            parsed = JSON.parse(msg.content.toString());
        } catch {
            console.error('Unparseable message, dropping');
            safeAck(channel, msg);
            return;
        }

        const result = EventSchema.safeParse(parsed);

        if (!result.success) {
            console.error('Invalid event schema:', result.error);
            safeAck(channel, msg); // drop invalid, don't requeue
            return;
        }

        const eventContent = result.data;
        eventId = eventContent.event_id;

        // only set if Not eXists
        const isNew = await redis.set(eventContent.event_id, '1', 'EX', 86400, 'NX');

        if (isNew === null) {
            // key already existed → duplicate
            console.log('Duplicate dropped', eventContent.event_id);
            safeAck(channel, msg);
            return;
        }
        dedupKeySet = true;

        await createEvent(eventContent)

        try {
            await incrementAggregationCounters({
                site_id: eventContent.site_id,
                event_name: eventContent.event_name,
                distinct_id: eventContent.distinct_id,
                session_id: eventContent.session_id ?? null,
                client_timestamp: eventContent.client_timestamp,
            })
        } catch (aggErr) {
            console.error('[aggregation] increment failed, will reconcile:', aggErr)
        }

        safeAck(channel, msg)
    } catch (consumeError: any) {
        if (consumeError.code === '23505') {
            console.log('Duplicate caught at DB level, discarding');
            safeAck(channel, msg); // ack, don't requeue
            return;
        }
        console.error('Error processing message:', consumeError);
        await handleFailure(channel, msg, eventId, dedupKeySet);
    }
}
