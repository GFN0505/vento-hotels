// Background jobs on pg-boss, in the same Postgres (no Redis; see ARCHITECTURE.md). Each job type has
// a zod schema for its data, its own queue and retry policy, and an idempotent handler. Stage 0 runs
// two: sending email with retries, and a heartbeat that /health watches. Night audit steps, ARI
// pushes, webhooks, messages and reports join from Stage 1.
import { PgBoss } from 'pg-boss'
import { z } from 'zod'
import { reportError } from '../observability/errors.ts'
import { logger } from '../observability/log.ts'
import type { EmailMessage, EmailProvider } from '../providers/email.ts'

const emailSchema = z.object({ to: z.string(), subject: z.string(), text: z.string() })

export const JOB_DATA = {
  'email.send': emailSchema,
  'system.heartbeat': z.object({}),
} as const

export type JobName = keyof typeof JOB_DATA
export type JobData<N extends JobName> = z.infer<(typeof JOB_DATA)[N]>

export interface JobQueue {
  send<N extends JobName>(name: N, data: JobData<N>): Promise<void>
}

// Retries back off from 10 seconds. Email bodies carry sign-in links, so finished email jobs are
// deleted after an hour rather than kept for the default 7 days.
const QUEUES: Record<JobName, Parameters<PgBoss['createQueue']>[1]> = {
  'email.send': {
    retryLimit: 6,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 60,
    deleteAfterSeconds: 60 * 60,
  },
  'system.heartbeat': { retryLimit: 0, expireInSeconds: 30, deleteAfterSeconds: 60 * 60 },
}

const HEARTBEAT_EVERY = '* * * * *'
// The heartbeat runs every minute; three missed means the workers aren't running.
const HEARTBEAT_STALE_MS = 3 * 60 * 1000

export type Jobs = {
  queue: JobQueue
  // Whether jobs are being worked: a heartbeat finished recently.
  healthy: () => { ok: true; detail: string } | { ok: false; error: string }
  stop: () => Promise<void>
}

export async function startJobs(options: {
  databaseUrl: string
  email: EmailProvider
  // A separate schema lets tests run their own pg-boss without touching anyone else's.
  schema?: string
}): Promise<Jobs> {
  const boss = new PgBoss({
    connectionString: options.databaseUrl,
    schema: options.schema ?? 'pgboss',
    application_name: 'vento-hotels-jobs',
  })
  boss.on('error', (error) => reportError(error, 'jobs'))
  await boss.start()
  for (const [name, queueOptions] of Object.entries(QUEUES)) {
    await boss.createQueue(name, queueOptions)
  }

  let lastBeat = 0
  const started = Date.now()

  await boss.work<EmailMessage>(
    'email.send',
    // Short polling: someone is waiting for their confirmation link.
    { pollingIntervalSeconds: 0.5 },
    async ([job]) => {
      if (!job) return
      const message = emailSchema.parse(job.data)
      try {
        await options.email.send(message)
      } catch (error) {
        logger.warn({ job: job.id }, 'Email not sent; it will be retried')
        throw error
      }
    },
  )
  await boss.work('system.heartbeat', async () => {
    lastBeat = Date.now()
  })
  await boss.schedule('system.heartbeat', HEARTBEAT_EVERY)

  const queue: JobQueue = {
    async send(name, data) {
      const parsed = JOB_DATA[name].parse(data)
      const id = await boss.send(name, parsed)
      if (!id) throw new Error(`The ${name} job was not queued`)
    },
  }

  return {
    queue,
    healthy: () => {
      const since = Date.now() - (lastBeat || started)
      return since < HEARTBEAT_STALE_MS
        ? { ok: true as const, detail: lastBeat ? 'heartbeat on time' : 'starting' }
        : { ok: false as const, error: `no heartbeat for ${Math.round(since / 60_000)} minutes` }
    },
    stop: () => boss.stop({ graceful: true, timeout: 10_000 }),
  }
}

// Sends email through the queue, so a provider hiccup is retried instead of losing the email.
export class QueuedEmailProvider implements EmailProvider {
  readonly queue: JobQueue

  constructor(queue: JobQueue) {
    this.queue = queue
  }

  send(message: EmailMessage): Promise<void> {
    return this.queue.send('email.send', message)
  }
}
