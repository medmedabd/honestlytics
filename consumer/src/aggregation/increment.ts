import redis from '../config/redis'
import { format, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

// one pipeline per event — single round trip
export async function incrementAggregationCounters(event: {
    site_id: string
    event_name: string
    distinct_id: string
    session_id?: string | null
    client_timestamp: string
}): Promise<void> {
    const hour = formatInTimeZone(parseISO(event.client_timestamp), 'UTC', 'yyyyMMddHH')
    const day = formatInTimeZone(parseISO(event.client_timestamp), 'UTC', 'yyyyMMdd')

    const siteId = event.site_id

    const p = redis.pipeline()

    // pageviews
    p.incr(`hnly:${siteId}:pageviews:_:${hour}`)

    // event count by name
    p.incr(`hnly:${siteId}:event:${event.event_name}:${hour}`)

    // unique users via HLL
    p.pfadd(`hnly:${siteId}:uu:${day}`, event.distinct_id)

    // session — only count if session_id is new for this site+day
    if (event.session_id) {
        const seenKey = `hnly:${siteId}:seen_sessions:${day}`
        p.sadd(seenKey, event.session_id)
        p.expire(seenKey, 48 * 60 * 60)
    }

    const results = await p.exec()

    // check if session was new (SADD returns 1 if member was added, 0 if already existed)
    if (event.session_id && results) {
        const saddResult = results[3] // index 3 = sadd result
        const isNewSession = saddResult?.[1] === 1

        if (isNewSession) {
            await redis.incr(`hnly:${siteId}:sessions:_:${hour}`)
        }
    }
}