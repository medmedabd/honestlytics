// All aggregation buckets are UTC. Never use server-local time here.
export function utcDay(daysAgo = 0): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - daysAgo)
    return d.toISOString().slice(0, 10) // yyyy-MM-dd
}
