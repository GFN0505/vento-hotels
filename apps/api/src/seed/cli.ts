// `pnpm db:seed`: loads the demo group (docs/journeys/README.md) into the local database.
// Never in production. Sign in as any person with DEMO_PASSWORD (default in .env.example).
import { roleLabel } from '@vento/shared'
import { createDatabase } from '../db/client.ts'
import { seedDemo } from './demo.ts'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The demo seed never runs in production')
  }
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env, then run pnpm db:up.')
  const password = process.env.DEMO_PASSWORD
  if (!password) throw new Error('DEMO_PASSWORD is not set. Copy it from .env.example into .env.')
  const { db, close } = createDatabase(url, { max: 1 })
  try {
    const result = await seedDemo(db, { password })
    if (result.status === 'exists') {
      console.log(
        '✓ Kora Hotels Group is already loaded. To start over: pnpm db:reset && pnpm db:migrate && pnpm db:seed',
      )
      return
    }
    console.log(
      '✓ Loaded Kora Hotels Group: Kora Hospitality Ltd, 4 hotels, 10 people, 3 devices, 1 invite\n',
    )
    console.log(`  Sign in at http://localhost:5180 with any email below and DEMO_PASSWORD.\n`)
    for (const person of result.people) {
      console.log(
        `  ${person.name.padEnd(15)} ${roleLabel(person.role).padEnd(24)} ${person.email.padEnd(22)} PIN ${person.pin}`,
      )
    }
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
