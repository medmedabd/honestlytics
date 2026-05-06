import { EventExchange } from "../validators/event.validator";
import pool from "../config/postgres";

export const createEvent = async (eventContent: EventExchange): Promise<void> => {
    await pool.query(
        `INSERT INTO events (
            event_id,
            site_id,
            event_name,
            distinct_id,
            session_id,
            client_timestamp,
            server_timestamp,
            page,
            html_element,
            sdk_version,
            device_properties,
            properties,
            intent
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (event_id) DO NOTHING`,
        [
            eventContent.event_id,
            eventContent.site_id,
            eventContent.event_name,
            eventContent.distinct_id ?? 'anonymous',
            eventContent.session_id ?? null,
            eventContent.client_timestamp,  // from SDK
            eventContent.server_timestamp,
            eventContent.page ?? null,
            eventContent.html_element ?? null,
            eventContent.sdk_version ?? null,
            eventContent.device_properties ?? null,
            eventContent.properties ?? null,
            'unconfirmed'
        ]
    );
}