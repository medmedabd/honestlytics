import { Redis } from 'ioredis'

const LOCK_KEY = 'hnly:drain:lock'
const LOCK_TTL = 55 // seconds

export async function acquireDrainLock(redis: Redis): Promise<boolean> {
    const result = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX')
    return result === 'OK'
}

export async function releaseDrainLock(redis: Redis): Promise<void> {
    await redis.del(LOCK_KEY)
}