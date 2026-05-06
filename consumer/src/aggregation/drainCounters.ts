import { Redis } from 'ioredis'
import { Pool } from 'pg'
import { parseCounterKey } from './keyParser'

const GETDEL_SCRIPT = `
  local val = redis.call('GET', KEYS[1])
  if val then
    redis.call('DEL', KEYS[1])
    return val
  end
  return false
`

function toUTCHour(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  return `${y}${m}${d}${h}`
}

export async function drainCounters(redis: Redis, db: Pool): Promise<void> {
  const currentHour = toUTCHour(new Date())
  const keys = await redis.keys('hnly:*:*:*:*')
  if (keys.length === 0) return

  const drainableKeys = keys.filter(key => {
    const parts = key.split(':')
    const bucket = parts[parts.length - 1]
    return bucket !== currentHour && bucket.length === 10
  })

  for (const key of drainableKeys) {
    const parsed = parseCounterKey(key)
    if (!parsed) continue

    const raw = await redis.eval(GETDEL_SCRIPT, 1, key) as string | null
    if (!raw) continue

    const value = parseInt(raw)
    if (isNaN(value) || value === 0) continue

    await upsertCounter(db, parsed, value)
  }
}

async function upsertCounter(
  db: Pool,
  key: ReturnType<typeof parseCounterKey>,
  value: number
): Promise<void> {
  if (!key) return

  switch (key.metric) {
    case 'pageviews':
      await db.query(`
        INSERT INTO agg_pageviews_hourly (site_id, bucket_hour, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (site_id, bucket_hour)
        DO UPDATE SET count = agg_pageviews_hourly.count + EXCLUDED.count
      `, [key.siteId, key.bucketHour, value])
      break

    case 'event':
      await db.query(`
        INSERT INTO agg_events_hourly (site_id, event_name, bucket_hour, count)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (site_id, event_name, bucket_hour)
        DO UPDATE SET count = agg_events_hourly.count + EXCLUDED.count
      `, [key.siteId, key.dimension, key.bucketHour, value])
      break

    case 'sessions':
      await db.query(`
        INSERT INTO agg_sessions_hourly (site_id, bucket_hour, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (site_id, bucket_hour)
        DO UPDATE SET count = agg_sessions_hourly.count + EXCLUDED.count
      `, [key.siteId, key.bucketHour, value])
      break
  }
}