// aggregation/drain.ts
import { Redis } from 'ioredis'
import { Pool } from 'pg'
import { acquireDrainLock, releaseDrainLock } from './lock'
import { drainCounters } from './drainCounters'
import { drainHLL } from './drainHLL'
import { drainSessionDuration } from './drainDuration'

export async function runDrain(redis: Redis, db: Pool): Promise<void> {
    const acquired = await acquireDrainLock(redis)
    if (!acquired) {
        console.log('[drain] skipped — another instance is running')
        return
    }

    try {
        await drainCounters(redis, db)
        console.log('[drain] counters done')
    } catch (err) {
        console.error('[drain] counters failed:', err)
    } finally {
        await releaseDrainLock(redis)
    }
}

export async function runMidnightDrain(redis: Redis, db: Pool): Promise<void> {
    const acquired = await acquireDrainLock(redis)
    if (!acquired) {
        console.log('[midnight-drain] skipped — lock held')
        return
    }

    try {
        await drainHLL(redis, db)
        console.log('[midnight-drain] HLL done')

        await drainSessionDuration(db)
        console.log('[midnight-drain] session duration done')
    } catch (err) {
        console.error('[midnight-drain] failed:', err)
    } finally {
        await releaseDrainLock(redis)
    }
}