export type CounterKey = {
    siteId: string
    metric: 'pageviews' | 'event' | 'sessions'
    dimension: string | null  // event_name for 'event', null for others
    bucket: string            // raw YYYYMMDDHH
    bucketHour: Date          // parsed UTC date
}

export function parseCounterKey(key: string): CounterKey | null {
    // hnly:{siteId}:{metric}:{dimension}:{bucket}
    const parts = key.split(':')

    if (parts.length !== 5) return null
    if (parts[0] !== 'hnly') return null

    const [, siteId, metric, dimension, bucket] = parts

    if (!['pageviews', 'event', 'sessions'].includes(metric)) return null

    const year = parseInt(bucket.slice(0, 4))
    const month = parseInt(bucket.slice(4, 6)) - 1
    const day = parseInt(bucket.slice(6, 8))
    const hour = parseInt(bucket.slice(8, 10))

    const bucketHour = new Date(Date.UTC(year, month, day, hour))
    if (isNaN(bucketHour.getTime())) return null

    return {
        siteId,
        metric: metric as CounterKey['metric'],
        dimension: dimension === '_' ? null : dimension,
        bucket,
        bucketHour,
    }
}