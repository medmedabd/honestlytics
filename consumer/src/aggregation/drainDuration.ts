import { Pool } from 'pg'
import { utcDay } from '../utils/date'

export async function drainSessionDuration(db: Pool): Promise<void> {
    const yesterday = utcDay(1)

    // compute per-session durations from raw events, aggregate per site per day
    await db.query(`
        INSERT INTO agg_session_duration_daily (site_id, bucket_date, duration_sum, session_count)
        SELECT
            site_id,
            $1::date AS bucket_date,
            SUM(duration_ms)::BIGINT AS duration_sum,
            COUNT(*) AS session_count
        FROM (
            SELECT
                site_id,
                session_id,
                EXTRACT(EPOCH FROM (MAX(client_timestamp) - MIN(client_timestamp))) * 1000 AS duration_ms
            FROM events
            WHERE
                client_timestamp >= $1::timestamptz
                AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
                AND session_id IS NOT NULL
            GROUP BY site_id, session_id
        ) s
        GROUP BY site_id
        ON CONFLICT (site_id, bucket_date)
        DO UPDATE SET
            duration_sum  = EXCLUDED.duration_sum,
            session_count = EXCLUDED.session_count
    `, [yesterday])
}