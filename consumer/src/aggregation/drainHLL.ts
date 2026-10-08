import { Redis } from 'ioredis'
import { Pool } from 'pg'
import { utcDay } from '../utils/date'

export async function drainHLL(redis: Redis, db: Pool): Promise<void> {
    // drain yesterday's HLL keys
    const yesterday = utcDay(1).replace(/-/g, '')
    const pattern = `hnly:*:uu:${yesterday}`

    const keys = await redis.keys(pattern)
    if (keys.length === 0) return

    for (const key of keys) {
        const parts = key.split(':')
        if (parts.length !== 4) continue

        const siteId = parts[1]
        const approxCount = await redis.pfcount(key)

        await db.query(`
            INSERT INTO agg_unique_users_daily (site_id, bucket_date, approx_count)
            VALUES ($1, $2, $3)
            ON CONFLICT (site_id, bucket_date)
            DO UPDATE SET approx_count = EXCLUDED.approx_count
        `, [siteId, yesterday, approxCount])

        // expire the key — 48h buffer in case of late-arriving events
        await redis.expire(key, 48 * 60 * 60)
    }
}