import type { Request, Response } from 'express'
import pool from '../config/postgres'
import { subDays, format, parseISO, isValid } from 'date-fns'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(query: Request['query']): { from: string; to: string } | null {
    const to = query.to ? String(query.to) : format(new Date(), 'yyyy-MM-dd')
    const from = query.from ? String(query.from) : format(subDays(new Date(), 7), 'yyyy-MM-dd')

    if (!isValid(parseISO(from)) || !isValid(parseISO(to))) return null
    return { from, to }
}

function getSiteId(query: Request['query']): string | null {
    return query.site_id ? String(query.site_id) : null
}

// ─── Pageviews ────────────────────────────────────────────────────────────────

export const getPageviews = async (req: Request, res: Response): Promise<void> => {
    const siteId = getSiteId(req.query)
    const range = getDateRange(req.query)

    if (!siteId) { res.status(400).json({ error: 'site_id required' }); return }
    if (!range) { res.status(400).json({ error: 'invalid date range' }); return }

    const { rows } = await pool.query(`
    SELECT
      DATE_TRUNC('hour', bucket_hour) AS hour,
      count
    FROM agg_pageviews_hourly
    WHERE
      site_id = $1
      AND bucket_hour >= $2::timestamptz
      AND bucket_hour <  $3::timestamptz + INTERVAL '1 day'
    ORDER BY hour ASC
  `, [siteId, range.from, range.to])

    res.json({ data: rows })
}

// ─── Events ───────────────────────────────────────────────────────────────────

export const getEvents = async (req: Request, res: Response): Promise<void> => {
    const siteId = getSiteId(req.query)
    const range = getDateRange(req.query)
    const eventName = req.query.event_name ? String(req.query.event_name) : null

    if (!siteId) { res.status(400).json({ error: 'site_id required' }); return }
    if (!range) { res.status(400).json({ error: 'invalid date range' }); return }

    const { rows } = await pool.query(`
    SELECT
      event_name,
      DATE_TRUNC('hour', bucket_hour) AS hour,
      count
    FROM agg_events_hourly
    WHERE
      site_id = $1
      AND bucket_hour >= $2::timestamptz
      AND bucket_hour <  $3::timestamptz + INTERVAL '1 day'
      ${eventName ? 'AND event_name = $4' : ''}
    ORDER BY hour ASC, count DESC
  `, eventName ? [siteId, range.from, range.to, eventName] : [siteId, range.from, range.to])

    res.json({ data: rows })
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const getSessions = async (req: Request, res: Response): Promise<void> => {
    const siteId = getSiteId(req.query)
    const range = getDateRange(req.query)

    if (!siteId) { res.status(400).json({ error: 'site_id required' }); return }
    if (!range) { res.status(400).json({ error: 'invalid date range' }); return }

    const { rows } = await pool.query(`
    SELECT
      DATE_TRUNC('hour', bucket_hour) AS hour,
      count
    FROM agg_sessions_hourly
    WHERE
      site_id = $1
      AND bucket_hour >= $2::timestamptz
      AND bucket_hour <  $3::timestamptz + INTERVAL '1 day'
    ORDER BY hour ASC
  `, [siteId, range.from, range.to])

    res.json({ data: rows })
}

// ─── Unique Users ─────────────────────────────────────────────────────────────

export const getUniqueUsers = async (req: Request, res: Response): Promise<void> => {
    const siteId = getSiteId(req.query)
    const range = getDateRange(req.query)

    if (!siteId) { res.status(400).json({ error: 'site_id required' }); return }
    if (!range) { res.status(400).json({ error: 'invalid date range' }); return }

    const { rows } = await pool.query(`
    SELECT
      bucket_date,
      approx_count
    FROM agg_unique_users_daily
    WHERE
      site_id = $1
      AND bucket_date >= $2::date
      AND bucket_date <= $3::date
    ORDER BY bucket_date ASC
  `, [siteId, range.from, range.to])

    res.json({ data: rows })
}

// ─── Session Duration ─────────────────────────────────────────────────────────

export const getSessionDuration = async (req: Request, res: Response): Promise<void> => {
    const siteId = getSiteId(req.query)
    const range = getDateRange(req.query)

    if (!siteId) { res.status(400).json({ error: 'site_id required' }); return }
    if (!range) { res.status(400).json({ error: 'invalid date range' }); return }

    const { rows } = await pool.query(`
    SELECT
      bucket_date,
      duration_sum,
      session_count,
      CASE
        WHEN session_count = 0 THEN 0
        ELSE duration_sum / session_count
      END AS avg_duration_ms
    FROM agg_session_duration_daily
    WHERE
      site_id = $1
      AND bucket_date >= $2::date
      AND bucket_date <= $3::date
    ORDER BY bucket_date ASC
  `, [siteId, range.from, range.to])

    res.json({ data: rows })
}

// ─── Summary (all metrics, one shot) ─────────────────────────────────────────

export const getSummary = async (req: Request, res: Response): Promise<void> => {
    const siteId = getSiteId(req.query)
    const range = getDateRange(req.query)

    if (!siteId) { res.status(400).json({ error: 'site_id required' }); return }
    if (!range) { res.status(400).json({ error: 'invalid date range' }); return }

    const [pageviews, sessions, uniqueUsers, duration] = await Promise.all([
        pool.query(`
      SELECT COALESCE(SUM(count), 0) AS total
      FROM agg_pageviews_hourly
      WHERE site_id = $1
        AND bucket_hour >= $2::timestamptz
        AND bucket_hour <  $3::timestamptz + INTERVAL '1 day'
    `, [siteId, range.from, range.to]),

        pool.query(`
      SELECT COALESCE(SUM(count), 0) AS total
      FROM agg_sessions_hourly
      WHERE site_id = $1
        AND bucket_hour >= $2::timestamptz
        AND bucket_hour <  $3::timestamptz + INTERVAL '1 day'
    `, [siteId, range.from, range.to]),

        pool.query(`
      SELECT COALESCE(SUM(approx_count), 0) AS total
      FROM agg_unique_users_daily
      WHERE site_id = $1
        AND bucket_date >= $2::date
        AND bucket_date <= $3::date
    `, [siteId, range.from, range.to]),

        pool.query(`
      SELECT
        COALESCE(SUM(duration_sum), 0)  AS duration_sum,
        COALESCE(SUM(session_count), 0) AS session_count
      FROM agg_session_duration_daily
      WHERE site_id = $1
        AND bucket_date >= $2::date
        AND bucket_date <= $3::date
    `, [siteId, range.from, range.to]),
    ])

    const dur = duration.rows[0]

    res.json({
        data: {
            pageviews: Number(pageviews.rows[0].total),
            sessions: Number(sessions.rows[0].total),
            unique_users: Number(uniqueUsers.rows[0].total),
            avg_duration_ms: dur.session_count > 0
                ? Math.round(dur.duration_sum / dur.session_count)
                : 0,
        }
    })
}