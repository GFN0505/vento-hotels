// `pnpm db:seed`: loads the demo group (docs/journeys/README.md) into the local database.
// Never in production. Sign in as any person with DEMO_PASSWORD (default in .env.example).
// Browser tests load their own copy with DEMO_SLUG and DEMO_EMAIL_DOMAIN, so they never collide.
import { roleLabel } from '@vento/shared'
import { createDatabase } from '../db/client.ts'
import { S3StorageProvider } from '../providers/storage.ts'
import { seedDemo } from './demo.ts'

async function main() {
  // Staging servers run production builds and may load the demo; production never does.
  const deployEnv = process.env.DEPLOY_ENV ?? 'local'
  if (
    deployEnv === 'production' ||
    (process.env.NODE_ENV === 'production' && deployEnv !== 'staging')
  ) {
    throw new Error('The demo seed never runs in production')
  }
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env, then run pnpm db:up.')
  const password = process.env.DEMO_PASSWORD
  if (!password) throw new Error('DEMO_PASSWORD is not set. Copy it from .env.example into .env.')
  const { db, close } = createDatabase(url, { max: 1 })
  try {
    const storage = await demoStorage()
    const privateStorage = await demoStorage({ private: true })
    const result = await seedDemo(db, {
      password,
      storage,
      privateStorage,
      ...(process.env.DEMO_SLUG ? { slug: process.env.DEMO_SLUG } : {}),
      ...(process.env.DEMO_EMAIL_DOMAIN ? { emailDomain: process.env.DEMO_EMAIL_DOMAIN } : {}),
    })
    if (result.status === 'exists') {
      console.log(
        '✓ Kora Hotels Group is already loaded. To start over: pnpm db:reset && pnpm db:migrate && pnpm db:seed',
      )
      return
    }
    console.log(
      `✓ Loaded Kora Hotels Group: 3 companies, 4 hotels, 382 rooms, ${result.people.length} people, 4 devices, 1 invite${storage ? '' : ' (no logo: storage settings missing or unreachable)'}\n`,
    )
    console.log(`  Sign in at http://localhost:5180 with any email below and DEMO_PASSWORD.\n`)
    for (const person of result.people) {
      console.log(
        `  ${person.name.padEnd(15)} ${roleLabel(person.role).padEnd(24)} ${person.email.padEnd(22)} PIN ${person.pin}`,
      )
    }
    if (result.tryToday.length) {
      console.log('\n  To try at Kora Victoria Island today:')
      for (const line of result.tryToday) console.log(`  · ${line}`)
    }
  } finally {
    await close()
  }
}

// The placeholder logo needs storage. Without it (no S3_* settings, or RustFS not running) the
// demo loads without a logo rather than failing.
// The demo guests' placeholder ID photos go to the private bucket (decision 0031).
async function demoStorage(
  options: { private?: boolean } = {},
): Promise<S3StorageProvider | undefined> {
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = process.env
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) return undefined
  const storage = new S3StorageProvider({
    endpoint: S3_ENDPOINT,
    region: S3_REGION ?? 'us-east-1',
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    bucket: options.private ? (process.env.S3_PRIVATE_BUCKET ?? `${S3_BUCKET}-private`) : S3_BUCKET,
  })
  const local = (process.env.DEPLOY_ENV ?? 'local') === 'local'
  try {
    if (local) await storage.prepareLocalBucket(options.private ? { cors: false } : {})
    return storage
  } catch {
    return undefined
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
