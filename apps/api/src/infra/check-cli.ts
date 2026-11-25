// `pnpm db:status`: tells you whether the local services from `pnpm db:up` are reachable.
import { type CheckResult, checkPostgres, checkStorage } from './checks.ts'
import { MissingSettingError, readInfraConfig } from './config.ts'

function line(name: string, result: CheckResult): string {
  return result.ok ? `✓ ${name}: ${result.detail}` : `✗ ${name}: ${result.error}`
}

async function main(): Promise<number> {
  let config: ReturnType<typeof readInfraConfig>
  try {
    config = readInfraConfig()
  } catch (error) {
    if (error instanceof MissingSettingError) {
      console.error(`✗ ${error.message}`)
      return 1
    }
    throw error
  }

  const [database, storage] = await Promise.all([
    checkPostgres(config.databaseUrl),
    checkStorage(config.s3Endpoint),
  ])
  console.log(line('Database', database))
  console.log(line('Storage', storage))

  if (!database.ok || !storage.ok) {
    console.error('Start the services with: pnpm db:up')
    return 1
  }
  return 0
}

process.exitCode = await main()
