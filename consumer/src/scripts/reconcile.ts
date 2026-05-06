// consumer/src/scripts/reconcile.ts
import pool from '../config/postgres'
import redis from '../config/redis'
import { drainHLL } from '../aggregation/drainHLL'
import { drainSessionDuration } from '../aggregation/drainDuration'

// ─── CLI arg parser ───────────────────────────────────────────────────────────

function getArg(name: string): string | null {
  const flag = process.argv.find(a => a.startsWith(`--${name}=`))
  return flag ? flag.split('=')[1] : null
}

function getDate(): string {
  const arg = getArg('date')
  if (arg) return arg
  // default: yesterday
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function getMetric(): string {
  return getArg('metric') ?? 'all'
}

// ─── Unique users reconciliation ──────────────────────────────────────────────

async function reconcileUniqueUsers(date: string): Promise<void> {
  console.log(`[unique-users] reconciling ${date}...`)

  // count exact distinct users from raw events
  const { rows } = await pool.query(`
    SELECT
      site_id,
      COUNT(DISTINCT distinct_id) AS exact_count
    FROM events
    WHERE
      client_timestamp >= $1::timestamptz
      AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
    GROUP BY site_id
  `, [date])

  if (rows.length === 0) {
    console.log(`[unique-users] no events found for ${date}`)
    return
  }

  for (const row of rows) {
    // also try to drain HLL if key still exists in Redis
    const hllKey = `hnly:${row.site_id}:uu:${date.replace(/-/g, '')}`
    const hllCount = await redis.pfcount(hllKey)

    // prefer exact count from raw events, store both
    await pool.query(`
      INSERT INTO agg_unique_users_daily (site_id, bucket_date, approx_count)
      VALUES ($1, $2, $3)
      ON CONFLICT (site_id, bucket_date)
      DO UPDATE SET approx_count = EXCLUDED.approx_count
    `, [row.site_id, date, hllCount > 0 ? hllCount : row.exact_count])

    console.log(`[unique-users] site ${row.site_id}`)
    console.log(`  exact (from raw events): ${row.exact_count}`)
    console.log(`  HLL  (from Redis):       ${hllCount > 0 ? hllCount : 'key expired'}`)
    console.log(`  stored: ${hllCount > 0 ? hllCount : row.exact_count}`)
  }

  console.log(`[unique-users] done ✅`)
}

// ─── Session duration reconciliation ─────────────────────────────────────────

async function reconcileSessionDuration(date: string): Promise<void> {
  console.log(`[session-duration] reconciling ${date}...`)

  const test = await pool.query(`
  SELECT COUNT(*), COUNT(DISTINCT session_id)
  FROM events
  WHERE client_timestamp >= $1::timestamptz
  AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
`, [date]);

  console.log("DEBUG events in range:", test.rows[0]);
  const { rows: before } = await pool.query(`
    SELECT site_id, duration_sum, session_count
    FROM agg_session_duration_daily
    WHERE bucket_date = $1::date
  `, [date])

  await pool.query(`
  INSERT INTO agg_session_duration_daily (site_id, bucket_date, duration_sum, session_count)
  SELECT
    site_id,
    $1::date AS bucket_date,
    SUM(duration_ms) AS duration_sum,
    COUNT(*) AS session_count
  FROM (
    SELECT
      site_id,
      session_id,
      (EXTRACT(EPOCH FROM (max_ts - min_ts)) * 1000)::BIGINT AS duration_ms
    FROM (
      SELECT
        site_id,
        session_id,
        MAX(client_timestamp) AS max_ts,
        MIN(client_timestamp) AS min_ts
      FROM events
      WHERE
        client_timestamp >= $1::timestamptz
        AND client_timestamp < ($1::timestamptz + INTERVAL '1 day')
        AND session_id IS NOT NULL
      GROUP BY site_id, session_id
    ) s
  ) x
  GROUP BY site_id
  ON CONFLICT (site_id, bucket_date)
  DO UPDATE SET
    duration_sum  = EXCLUDED.duration_sum,
    session_count = EXCLUDED.session_count
`, [date])

  const { rows: after } = await pool.query(`
    SELECT
      site_id,
      duration_sum,
      session_count,
      CASE WHEN session_count = 0 THEN 0
           ELSE duration_sum / session_count
      END AS avg_duration_ms
    FROM agg_session_duration_daily
    WHERE bucket_date = $1::date
  `, [date])

  for (const row of after) {
    const prev = before.find(b => b.site_id === row.site_id)
    console.log(`[session-duration] site ${row.site_id}`)
    if (prev) {
      console.log(`  before → avg: ${Math.round(prev.duration_sum / Math.max(prev.session_count, 1))}ms, sessions: ${prev.session_count}`)
    }
    console.log(`  after  → avg: ${Math.round(row.avg_duration_ms)}ms, sessions: ${row.session_count}`)
  }

  console.log(`[session-duration] done ✅`)
}

// ─── Range support ────────────────────────────────────────────────────────────

function getDatesInRange(from: string, to: string): string[] {
  const dates = []
  const current = new Date(from)
  const end = new Date(to)
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const metric = getMetric()
  const from = getArg('from')
  const to = getArg('to')
  const date = getDate()

  const dates = from && to ? getDatesInRange(from, to) : [date]

  console.log(`\n🔧 Honestlytics manual reconciliation`)
  console.log(`   metric: ${metric}`)
  console.log(`   dates:  ${dates.join(', ')}\n`)

  try {
    for (const d of dates) {
      if (metric === 'unique-users' || metric === 'all') {
        await reconcileUniqueUsers(d)
        console.log()
      }

      if (metric === 'session-duration' || metric === 'all') {
        await reconcileSessionDuration(d)
        console.log()
      }
    }

    console.log('✅ reconciliation complete')
  } catch (err) {
    console.error('❌ reconciliation failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
    redis.disconnect()
  }
}

main()