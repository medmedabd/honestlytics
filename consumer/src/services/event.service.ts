import { randomUUID } from "crypto";
import pool from "../config/postgres";
import { Channel, Message } from 'amqplib';
import { EventExchange } from '../types/event.types';
import redis from "../config/redis";

export const insertEvent = async (
    channel: Channel,
    msg: Message,
): Promise<void> => {
    try {
        const eventContent: EventExchange = JSON.parse(msg.content.toString());
        console.log('Received:', eventContent);

        const isEventDuplicated = await redis.get(eventContent.event_id);
        if (isEventDuplicated !== null) {
            console.log('Cache hit: Event is duplicated:', eventContent);
            channel.ack(msg);
            return;
        }
        await redis.set(eventContent.event_id, '1', 'EX', 60);
        await pool.query(
            `INSERT INTO events (
                            event_id,
                            event_name,
                            distinct_id,
                            session_id,
                            timestamp,
                            page,
                            html_element,
                            sdk_version,
                            device_properties,
                            properties,
                            intent
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                eventContent.event_id,
                eventContent.event_name,
                eventContent.distinct_id ?? 'anonymous',
                eventContent.session_id ?? null,
                new Date(),
                eventContent.page ?? null,
                eventContent.html_element ?? null,
                eventContent.sdk_version ?? null,
                eventContent.device_properties ?? null,
                eventContent.properties ?? null,
                'unconfirmed'
            ]
        );

        channel.ack(msg);
        console.log('Event stored ✅');
    } catch (consumeError) {
        console.error('Error processing message:', consumeError);
        channel.nack(msg, false, true);
    }
}