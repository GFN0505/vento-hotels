// `pnpm features`: the Vento team switches modules on or off for one hotel group (decision 0021).
//   pnpm features list <group>
//   pnpm features on|off|reset <group> <feature> --reason "Pilot from 1 Dec"
// <group> is the group's slug or id. Needs DATABASE_URL (from .env, or set for the environment).
import { createDatabase } from '../db/client.ts'
import { findGroup, listGroupFeatures, SwitchError, switchFeature } from './switches.ts'

const USAGE = `Usage:
  pnpm features list <group>
  pnpm features on|off|reset <group> <feature> --reason "why"`

function option(args: string[], name: string): string {
  const at = args.indexOf(name)
  return at >= 0 ? (args[at + 1] ?? '') : ''
}

async function main(args: string[]) {
  const [command, groupRef, feature] = args
  const url = process.env.DATABASE_URL
  if (!url) throw new SwitchError('DATABASE_URL is not set')
  if (!command || !groupRef) throw new SwitchError(USAGE)
  const { db, close } = createDatabase(url, { max: 1 })
  try {
    const group = await findGroup(db, groupRef)
    if (command !== 'list') {
      if (command !== 'on' && command !== 'off' && command !== 'reset') throw new SwitchError(USAGE)
      if (!feature) throw new SwitchError(USAGE)
      await switchFeature(db, group.id, { feature, to: command, reason: option(args, '--reason') })
      console.log(
        `✓ ${feature} ${command === 'reset' ? 'reset to the default' : `switched ${command}`} for ${group.name}`,
      )
    }
    console.log(`\n${group.name} (${group.slug})`)
    for (const state of await listGroupFeatures(db, group.id)) {
      const reason = state.reason ? ` — ${state.reason}` : ''
      console.log(`  ${state.on ? '●' : '○'} ${state.feature.padEnd(16)} ${state.why}${reason}`)
    }
  } finally {
    await close()
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
