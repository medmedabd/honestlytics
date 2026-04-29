import { randomUUID } from "crypto";
import pool from "../config/postgres";
import { Channel, Message } from 'amqplib';
import { IncomingEvent } from '../types/event.types';

export const insertEvent = async (
    channel: Channel,
    msg: Message,
    eventContent: IncomingEvent
): Promise<void> => {
    try {
        const eventContent = JSON.parse(msg.content.toString());
        console.log('Received:', eventContent);
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
                randomUUID(),
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