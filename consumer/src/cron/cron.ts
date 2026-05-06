import cron from 'node-cron'
import { Redis } from 'ioredis'
import { Pool } from 'pg'
import { runDrain, runMidnightDrain } from '../aggregation/drain'
import { runReconciliation } from '../aggregation/reconciliation'

export function startCronJobs(redis: Redis, db: Pool): void {
  // every minute — drain counters
  cron.schedule('* * * * *', async () => {
    await runDrain(redis, db)
  })

  // 00:00 UTC — drain HLL + session duration
  cron.schedule('0 0 * * *', async () => {
    await runMidnightDrain(redis, db)
  }, { timezone: 'UTC' })

  // 00:05 UTC — reconciliation (5 min after midnight drain finishes)
  cron.schedule('5 0 * * *', async () => {
    await runReconciliation(db)
  }, { timezone: 'UTC' })

  console.log('[cron] jobs registered')
}