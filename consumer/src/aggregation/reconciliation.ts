import { Pool } from 'pg'
import { utcDay } from '../utils/date'

export async function runReconciliation(db: Pool): Promise<void> {
    const yesterday = utcDay(1)
    console.log(`[reconciliation] starting for ${yesterday}`)

    await Promise.all([
        reconcilePageviews(db, yesterday),
        reconcileEvents(db, yesterday),
        reconcileSessions(db, yesterday),
        reconcileSessionDuration(db, yesterday),
    ])

    console.log(`[reconciliation] done for ${yesterday}`)
}

// ─── Pageviews ───────────────────────────────────────────────────────────────

async function reconcilePageviews(db: Pool, date: string): Promise<void> {
    await db.query(`
        INSERT INTO agg_pageviews_hourly (site_id, bucket_hour, count)
        SELECT
        site_id,
        DATE_TRUNC('hour', client_timestamp) AS bucket_hour,
        COUNT(*) AS count
        FROM events
        WHERE
        client_timestamp >= $1::timestamptz
        AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
        AND event_name = 'page_view'
        GROUP BY site_id, DATE_TRUNC('hour', client_timestamp)
        ON CONFLICT (site_id, bucket_hour)
        DO UPDATE SET count = EXCLUDED.count
    `, [date])

    console.log('[reconciliation] pageviews done')
}

// ─── Events ──────────────────────────────────────────────────────────────────

async function reconcileEvents(db: Pool, date: string): Promise<void> {
    await db.query(`
        INSERT INTO agg_events_hourly (site_id, event_name, bucket_hour, count)
        SELECT
        site_id,
        event_name,
        DATE_TRUNC('hour', client_timestamp) AS bucket_hour,
        COUNT(*) AS count
        FROM events
        WHERE
        client_timestamp >= $1::timestamptz
        AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
        GROUP BY site_id, event_name, DATE_TRUNC('hour', client_timestamp)
        ON CONFLICT (site_id, event_name, bucket_hour)
        DO UPDATE SET count = EXCLUDED.count
    `, [date])

    console.log('[reconciliation] events done')
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function reconcileSessions(db: Pool, date: string): Promise<void> {
    await db.query(`
        INSERT INTO agg_sessions_hourly (site_id, bucket_hour, count)
        SELECT
            site_id,
            DATE_TRUNC('hour', first_seen) AS bucket_hour,
            COUNT(*) AS count
        FROM (
            SELECT site_id, session_id, MIN(client_timestamp) AS first_seen
            FROM events
            WHERE
                client_timestamp >= $1::timestamptz
                AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
                AND session_id IS NOT NULL
            GROUP BY site_id, session_id
        ) s
        GROUP BY site_id, DATE_TRUNC('hour', first_seen)
        ON CONFLICT (site_id, bucket_hour)
        DO UPDATE SET count = EXCLUDED.count
    `, [date])

    console.log('[reconciliation] sessions done')
}

// ─── Session duration ─────────────────────────────────────────────────────────

async function reconcileSessionDuration(db: Pool, date: string): Promise<void> {
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
    `, [date])

    console.log('[reconciliation] session duration done')
}