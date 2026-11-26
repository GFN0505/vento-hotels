// The job queue against real Postgres, in a schema of its own: email goes through it and is
// delivered by the worker, and job data that doesn't match its schema is refused.
import { newId } from '@vento/shared'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import type { EmailMessage, EmailProvider } from '../providers/email.ts'
import { type Jobs, QueuedEmailProvider, startJobs } from './queue.ts'

const url = process.env.TEST_DATABASE_URL

class FlakyEmail implements EmailProvider {
  readonly sent: EmailMessage[] = []
  failuresLeft: number

  constructor(failures: number) {
    this.failuresLeft = failures
  }

  async send(message: EmailMessage) {
    if (this.failuresLeft > 0) {
      this.failuresLeft--
      throw new Error('provider down')
    }
    this.sent.push(message)
  }
}

describe.skipIf(!url)('job queue', () => {
  const schema = `pgboss_test_${newId().slice(-8).replace(/-/g, '')}`
  let jobs: Jobs | undefined

  afterAll(async () => {
    await jobs?.stop()
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`drop schema if exists "${schema}" cascade`)
    await client.end()
  })

  it('delivers email through the queue', async () => {
    const email = new FlakyEmail(0)
    jobs = await startJobs({ databaseUrl: url ?? '', email, schema })
    await new QueuedEmailProvider(jobs.queue).send({
      to: 'a@kora.example',
      subject: 'Hi',
      text: 'x',
    })
    await expect.poll(() => email.sent.length, { timeout: 10_000 }).toBe(1)
    expect(jobs.healthy().ok).toBe(true)
  })

  it('refuses job data that does not match its schema', async () => {
    if (!jobs) throw new Error('jobs not started')
    await expect(
      jobs.queue.send('email.send', { to: 'a@kora.example' } as unknown as EmailMessage),
    ).rejects.toThrow()
  })
})
